const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const {
  PAPER_BATCH_HEADERS, buildTemplate, parseSheet, missingHeaders, toNum, toStr,
} = require('../utils/excel');
const { computedPassLine, deriveCreatedAt, ensurePaperBatch } = require('../utils/paperBatch');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/** 允许排序的字段（前端字段 → SQL 列），与 scores.js 范式一致 */
const SORTABLE = {
  batchNo: 'batch_no',
  batchName: 'batch_name',
  choiceFull: 'choice_full',
  spreadsheetFull: 'spreadsheet_full',
  accessFull: 'access_full',
  pythonFull: 'python_full',
  compositeFull: 'composite_full',
  totalFull: 'total_full',
  passRatio: 'pass_ratio',
  createdAt: 'created_at',
};

/** 解析批号派生班级：取第一个 '-' 之前的部分；无 '-'、前段为空或批号为空 → null（前端显示 —） */
function deriveClass(batchNo) {
  const no = String(batchNo ?? '');
  if (!no) return null;
  const idx = no.indexOf('-');
  const head = idx >= 0 ? no.slice(0, idx) : '';
  return head ? `${head}班` : null;
}

/** 列表/by-no 查询返回行时，统一补全派生字段：created_at（众数派生）、pass_line（运行时计算）与 class（批号首段派生班级） */
function attachDerived(row) {
  return {
    ...row,
    created_at: deriveCreatedAt(row.batch_no),
    pass_line: computedPassLine(row.total_full, row.pass_ratio),
    class: deriveClass(row.batch_no),
  };
}

/** 解析数值：空/非法 → undefined（用于必填校验）；返回有效数字 */
function numOrUndef(v) {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** 通用校验 ①②③④，返回错误信息字符串或 null（通过） */
function validatePaperBatch(body) {
  const batchNo = toStr(body.batch_no);
  const batchName = toStr(body.batch_name);
  const choice = numOrUndef(body.choice_full);
  const spreadsheet = numOrUndef(body.spreadsheet_full);
  const access = numOrUndef(body.access_full);
  const python = numOrUndef(body.python_full);
  const composite = numOrUndef(body.composite_full);
  const total = numOrUndef(body.total_full);
  const ratio = numOrUndef(body.pass_ratio);

  // ① 必填：批号/名称非空，五项分项与总满分/占比均为有效数字
  if (!batchNo || !batchName) return '必填项不能为空';
  if ([choice, spreadsheet, access, python, composite, total, ratio].some((n) => n === undefined)) {
    return '必填项不能为空';
  }
  // ② 非负
  if ([choice, spreadsheet, access, python, composite, total, ratio].some((n) => n < 0)) {
    return '分数不能为负数';
  }
  // ③ 分项之和 = 总满分（浮点容差 1e-9）
  const sum = choice + spreadsheet + access + python + composite;
  if (Math.abs(sum - total) >= 1e-9) return '分项分数总和和总满分不一致，请核对！';
  // ④ 合格占比 0~100
  if (ratio < 0 || ratio > 100) return '合格占比需在 0~100 之间';
  return null;
}

/** 接口 1：GET /api/paper-batches（查询 + 分页 + 排序 + 筛选） */
router.get('/', authRequired, (req, res) => {
  const { name = '', batchNo = '', sortField = '', sortOrder = 'asc' } = req.query;
  const where = [];
  const params = [];
  if (name) {
    where.push('batch_name LIKE ?');
    params.push(`%${name}%`);
  }
  if (batchNo) {
    where.push('batch_no LIKE ?');
    params.push(`%${batchNo}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  let orderSql = 'ORDER BY id ASC';
  if (sortField && SORTABLE[sortField]) {
    const dir = String(sortOrder).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    orderSql = `ORDER BY ${SORTABLE[sortField]} ${dir}, id ASC`;
  }

  const total = db.prepare(`SELECT COUNT(*) AS c FROM paper_batches ${whereSql}`).get(...params).c;
  const raw = Number(req.query.pageSize);
  const size = Math.min(Math.max(raw > 0 ? raw : 25, 1), 500);
  // 页码防御：切换到更大每页条数时，越界页码自动收敛到最后一页
  const totalPages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(Number(req.query.page) || 1, 1), totalPages);
  const rows = db.prepare(
    `SELECT * FROM paper_batches ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
  ).all(...params, size, (page - 1) * size);

  const list = rows.map(attachDerived);
  res.json({ code: 0, data: { list, total, page, pageSize: size, totalPages } });
});

/** 接口 2：POST /api/paper-batches（新增；overwrite=true 且批号已存在时改为更新） */
router.post('/', authRequired, (req, res) => {
  const body = req.body || {};
  const err = validatePaperBatch(body);
  if (err) return res.status(400).json({ code: 400, message: err });

  // ⑤ 批号唯一（新增）；携带 overwrite 则覆盖更新已有批号
  const dup = db.prepare('SELECT id FROM paper_batches WHERE batch_no = ?').get(toStr(body.batch_no));
  if (dup && !req.body.overwrite) {
    return res.status(409).json({
      code: 409,
      message: '试卷批号已存在',
      data: { duplicate: true },
    });
  }

  const payload = {
    id: dup ? dup.id : undefined,
    batch_no: toStr(body.batch_no),
    batch_name: toStr(body.batch_name),
    choice_full: toNum(body.choice_full),
    spreadsheet_full: toNum(body.spreadsheet_full),
    access_full: toNum(body.access_full),
    python_full: toNum(body.python_full),
    composite_full: toNum(body.composite_full),
    total_full: toNum(body.total_full),
    pass_ratio: toNum(body.pass_ratio),
    remark: toStr(body.remark),
    created_at: deriveCreatedAt(toStr(body.batch_no)),
  };

  let row;
  if (dup && req.body.overwrite) {
    db.prepare(`
      UPDATE paper_batches SET batch_name=@batch_name, choice_full=@choice_full, spreadsheet_full=@spreadsheet_full,
        access_full=@access_full, python_full=@python_full, composite_full=@composite_full,
        total_full=@total_full, pass_ratio=@pass_ratio, remark=@remark,
        updated_at=datetime('now','localtime')
      WHERE id=@id
    `).run(payload);
    row = db.prepare('SELECT * FROM paper_batches WHERE id = ?').get(dup.id);
    return res.json({ code: 0, message: '已覆盖保存', data: attachDerived(row) });
  }

  const info = db.prepare(`
    INSERT INTO paper_batches (batch_no, batch_name, choice_full, spreadsheet_full, access_full,
      python_full, composite_full, total_full, pass_ratio, remark, created_at, updated_at)
    VALUES (@batch_no, @batch_name, @choice_full, @spreadsheet_full, @access_full,
      @python_full, @composite_full, @total_full, @pass_ratio, @remark,
      @created_at, datetime('now','localtime'))
  `).run(payload);
  row = db.prepare('SELECT * FROM paper_batches WHERE id = ?').get(info.lastInsertRowid);
  res.json({ code: 0, message: '新增成功', data: attachDerived(row) });
});

/** 接口 6：POST /api/paper-batches/import（Excel 批量导入） */
router.post('/import', authRequired, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择 Excel 文件' });
  let rows;
  try {
    rows = parseSheet(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ code: 400, message: `文件解析失败：${e.message}` });
  }
  if (!rows.length) return res.status(400).json({ code: 400, message: 'Excel 中没有数据行' });
  const missing = missingHeaders(Object.keys(rows[0]), PAPER_BATCH_HEADERS);
  if (missing.length) {
    return res.status(400).json({ code: 400, message: `缺少必需列：${missing.join('、')}（模板字段：${PAPER_BATCH_HEADERS.join('、')}）` });
  }

  const overwrite = String(req.body.overwrite || '') === 'true';

  // 预扫描：统计会与现有批号重复 / 文件内重复的行
  let conflictCount = 0;
  const seen = new Set();
  rows.forEach((row) => {
    const bn = toStr(row['试卷批号']);
    if (!bn) return;
    const existing = db.prepare('SELECT id FROM paper_batches WHERE batch_no = ?').get(bn);
    if (existing || seen.has(bn)) conflictCount += 1;
    seen.add(bn);
  });
  if (conflictCount > 0 && !overwrite) {
    return res.status(409).json({
      code: 409,
      message: `导入数据中发现 ${conflictCount} 条与现有试卷批号重复的记录`,
      data: { duplicate: true, conflictCount },
    });
  }

  const selByNo = db.prepare('SELECT id FROM paper_batches WHERE batch_no = ?');
  const insert = db.prepare(`
    INSERT INTO paper_batches (batch_no, batch_name, choice_full, spreadsheet_full, access_full,
      python_full, composite_full, total_full, pass_ratio, remark, created_at, updated_at)
    VALUES (@batch_no, @batch_name, @choice_full, @spreadsheet_full, @access_full,
      @python_full, @composite_full, @total_full, @pass_ratio, @remark,
      @created_at, datetime('now','localtime'))
  `);
  const update = db.prepare(`
    UPDATE paper_batches SET batch_name=@batch_name, choice_full=@choice_full, spreadsheet_full=@spreadsheet_full,
      access_full=@access_full, python_full=@python_full, composite_full=@composite_full,
      total_full=@total_full, pass_ratio=@pass_ratio, remark=@remark,
      updated_at=datetime('now','localtime')
    WHERE batch_no=@batch_no
  `);

  const doImport = db.transaction((list) => {
    let inserted = 0;
    let updated = 0;
    const errors = [];
    list.forEach((row, i) => {
      const line = i + 2; // Excel 实际行号（首行为表头）
      const batchNo = toStr(row['试卷批号']);
      if (!batchNo) {
        errors.push(`第 ${line} 行：试卷批号为空，已跳过`);
        return;
      }
      const parsed = {
        batch_no: batchNo,
        batch_name: toStr(row['试卷批次名称']),
        choice_full: toNum(row['选择题满分']),
        spreadsheet_full: toNum(row['电子表格满分']),
        access_full: toNum(row['Access满分']),
        python_full: toNum(row['Python满分']),
        composite_full: toNum(row['综合题满分']),
        total_full: toNum(row['试卷总满分']),
        pass_ratio: (row['默认合格占比(%)'] === '' || row['默认合格占比(%)'] === null || row['默认合格占比(%)'] === undefined) ? 60 : toNum(row['默认合格占比(%)']),
        remark: toStr(row['备注']),
      };
      // 忽略「计算得出合格线」「创建时间」两列，服务端重算/派生
      const verr = validatePaperBatch(parsed);
      if (verr) {
        errors.push(`第 ${line} 行：${verr}`); // 含「分项分数总和和总满分不一致，请核对！」
        return;
      }
      const exists = selByNo.get(batchNo);
      if (exists) {
        update.run({ ...parsed, created_at: '' });
        updated += 1;
      } else {
        insert.run({ ...parsed, created_at: deriveCreatedAt(batchNo) });
        inserted += 1;
      }
    });
    return { inserted, updated, errors };
  });

  const result = doImport(rows);
  res.json({
    code: 0,
    message: `导入完成：新增 ${result.inserted} 条，更新 ${result.updated} 条${result.errors.length ? `，跳过 ${result.errors.length} 条` : ''}`,
    data: result,
  });
});

/** 接口 7：GET /api/paper-batches/export（导出当前筛选全集，不含分页） */
router.get('/export', authRequired, (req, res) => {
  const { name = '', batchNo = '' } = req.query;
  const where = [];
  const params = [];
  if (name) {
    where.push('batch_name LIKE ?');
    params.push(`%${name}%`);
  }
  if (batchNo) {
    where.push('batch_no LIKE ?');
    params.push(`%${batchNo}%`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM paper_batches ${whereSql} ORDER BY id ASC`).all(...params);

  // 导出表头：在「试卷批号」之后插入派生列「班级」（纯展示，导入模板仍为 13 列不含此列）
  const exportHeaders = ['序号', '试卷批号', '班级', ...PAPER_BATCH_HEADERS.slice(2)];
  const dataRows = rows.map((r, idx) => [
    idx + 1, // 序号
    r.batch_no,
    deriveClass(r.batch_no), // 班级（批号首段派生，无则 null → 单元格空）
    r.batch_name,
    r.choice_full,
    r.spreadsheet_full,
    r.access_full,
    r.python_full,
    r.composite_full,
    r.total_full,
    r.pass_ratio,
    computedPassLine(r.total_full, r.pass_ratio), // 计算得出合格线
    r.remark,
    deriveCreatedAt(r.batch_no), // 创建时间
  ]);

  const XLSX = require('xlsx');
  const wb = XLSX.utils.book_new();
  // 表头与数据行同源：均含「班级」列（数据行 index 2 为派生班级，无则为空单元格）
  const ws = XLSX.utils.aoa_to_sheet([exportHeaders, ...dataRows]);
  ws['!cols'] = exportHeaders.map((h) => ({ wch: Math.max(10, String(h).length * 2 + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=paper-batches-export.xlsx');
  res.send(buf);
});

/** 接口 5：DELETE /api/paper-batches/batch（批量删除，注册在 /:id 之前；整体关联则整体 409 拒绝） */
router.delete('/batch', authRequired, (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ code: 400, message: '请先选择要删除的记录' });
  }
  const idList = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (idList.length === 0) {
    return res.status(400).json({ code: 400, message: '无效的记录 ID' });
  }
  const placeholders = idList.map(() => '?').join(',');

  // 整体关联检查：任一待删批号已关联成绩 → 整体拒绝，不执行删除
  const blocked = db.prepare(`
    SELECT DISTINCT pb.batch_no AS batch_no
    FROM paper_batches pb
    JOIN scores s ON s.batch_no = pb.batch_no
    WHERE pb.id IN (${placeholders})
  `).all(...idList).map((r) => r.batch_no);
  if (blocked.length) {
    return res.status(409).json({
      code: 409,
      message: '存在关联学生成绩的试卷批次，无法批量删除',
      data: { blocked },
    });
  }

  const info = db.transaction(() => {
    return db.prepare(`DELETE FROM paper_batches WHERE id IN (${placeholders})`).run(...idList);
  })();
  res.json({ code: 0, message: `已删除 ${info.changes} 条记录`, data: { deleted: info.changes } });
});

/** 防御：空批号（max-scores/ 末尾无段）。非严格路由下 /max-scores/ → /max-scores，
 *  此处返回 400（参数错误）而非落到默认 404；必须注册在 /max-scores/:batchNo 之前。 */
router.get('/max-scores', authRequired, (req, res) => {
  return res.status(400).json({ code: 400, message: '试卷批号不能为空' });
});

/** 新增接口：GET /api/paper-batches/max-scores/:batchNo（编辑弹窗 0 分项预填最高分）
 *  单条 SQL 取该批号下全部学生成绩五项最高分；MAX 空集为 NULL → 序列化为 null；count=0 表示无成绩。
 *  注册在 /by-no/:batchNo 附近、/:id 之前，静态段在前、动态段在后，避免被 PUT/DELETE /:id 吞掉。 */
router.get('/max-scores/:batchNo', authRequired, (req, res) => {
  const bn = toStr(req.params.batchNo);
  if (!bn || bn.length === 0) {
    return res.status(400).json({ code: 400, message: '试卷批号不能为空' });
  }
  const row = db.prepare(`
    SELECT COUNT(*) AS n, MAX(choice) AS choice, MAX(spreadsheet) AS spreadsheet,
      MAX(access) AS access, MAX(python) AS python, MAX(composite) AS composite
    FROM scores WHERE batch_no = ?
  `).get(bn);
  res.json({
    code: 0,
    data: {
      count: row.n,
      choice: row.choice,
      spreadsheet: row.spreadsheet,
      access: row.access,
      python: row.python,
      composite: row.composite,
    },
  });
});

/** 接口 8：GET /api/paper-batches/by-no/:batchNo（成绩页联动取配置） */
router.get('/by-no/:batchNo', authRequired, (req, res) => {
  const bn = toStr(req.params.batchNo);
  const row = db.prepare('SELECT * FROM paper_batches WHERE batch_no = ?').get(bn);
  if (!row) {
    return res.status(404).json({ code: 404, message: '未找到该试卷批号配置' });
  }
  const totalFull = row.total_full;
  res.json({
    code: 0,
    data: {
      batchNo: row.batch_no,
      totalFull,
      choiceFull: row.choice_full,
      spreadsheetFull: row.spreadsheet_full,
      accessFull: row.access_full,
      pythonFull: row.python_full,
      compositeFull: row.composite_full,
      passRatio: row.pass_ratio,
      passLine: computedPassLine(totalFull, row.pass_ratio),
      configured: totalFull > 0, // Q2 生效标志
    },
  });
});

/** 模板下载：GET /api/paper-batches/template */
router.get('/template', authRequired, (req, res) => {
  const today = db.prepare("SELECT date('now','localtime') AS d").get().d;
  const buf = buildTemplate(PAPER_BATCH_HEADERS, [
    1, '20260901160700', '2026春模拟考', 20, 20, 20, 15, 25, 100, 60, 60, '示例数据', today,
  ]);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=paper-batches-template.xlsx');
  res.send(buf);
});

/** 接口 9：POST /api/paper-batches/sync（批次表与成绩记录批号自动同步）
 *  body: { execute: boolean }
 *  - execute=false：仅计算差异计划，不落库
 *  - execute=true ：服务端重算差异后，在单个事务中执行全部新增+删除，任一步异常整体回滚
 *  差异口径：scores 中非空批号集合 vs paper_batches 全表批号集合 */
router.post('/sync', authRequired, (req, res) => {
  const execute = req.body?.execute === true;
  // 差异计算：成绩表非空批号（去重） 与 批次表全表
  const scoreRows = db.prepare(`
    SELECT DISTINCT batch_no FROM scores WHERE batch_no IS NOT NULL AND batch_no != ''
  `).all();
  const batchRows = db.prepare(`
    SELECT id, batch_no, batch_name, total_full FROM paper_batches
  `).all();

  const scoreSet = new Set(scoreRows.map((r) => r.batch_no));
  const batchMap = new Map(batchRows.map((r) => [r.batch_no, r]));

  // 成绩有、批次表无 → 待新增（新行内容与 ensurePaperBatch 占位产物一致）
  const toCreate = scoreRows
    .map((r) => r.batch_no)
    .filter((bn) => !batchMap.has(bn))
    .map((bn) => ({ batchNo: bn, createdAt: deriveCreatedAt(bn) }));
  // 批次表有、成绩中已不存在 → 待删除（configured=已配置满分；手填名称即 batch_name !== batch_no 视为高危）
  const toDelete = batchRows
    .filter((r) => !scoreSet.has(r.batch_no))
    .map((r) => ({
      id: r.id,
      batchNo: r.batch_no,
      batchName: r.batch_name,
      configured: Number(r.total_full) > 0,
      totalFull: r.total_full,
    }));

  if (!execute) {
    return res.json({
      code: 0,
      data: {
        toCreate,
        toDelete,
        stat: { createCount: toCreate.length, deleteCount: toDelete.length },
      },
    });
  }

  // execute=true：服务端重算差异（不信任预览阶段结果），单事务执行，任一步异常整体回滚
  let created = 0;
  let deleted = 0;
  try {
    db.transaction(() => {
      toCreate.forEach(({ batchNo }) => {
        // 复用 utils 的占位插入（幂等：批次已存在时不插入）
        ensurePaperBatch(batchNo);
        created += 1;
      });
      if (toDelete.length) {
        const placeholders = toDelete.map(() => '?').join(',');
        const info = db.prepare(`DELETE FROM paper_batches WHERE id IN (${placeholders})`)
          .run(...toDelete.map((d) => d.id));
        deleted = info.changes;
      }
    })();
  } catch (e) {
    // 事务已整体回滚，数据保持原状
    return res.status(500).json({
      code: 500,
      message: `同步执行失败，已整体回滚：${e.message}`,
    });
  }

  const total = db.prepare('SELECT COUNT(*) AS c FROM paper_batches').get().c;
  res.json({
    code: 0,
    message: `同步完成：新增 ${created} 条，删除 ${deleted} 条`,
    data: { created, deleted, total },
  });
});

/** 接口 3：PUT /api/paper-batches/:id（编辑） */
router.put('/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM paper_batches WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ code: 404, message: '试卷批次不存在' });

  const err = validatePaperBatch(req.body || {});
  if (err) return res.status(400).json({ code: 400, message: err });

  // ⑤ 批号唯一（编辑时排除自身）
  const dup = db.prepare('SELECT id FROM paper_batches WHERE batch_no = ? AND id != ?').get(toStr(req.body.batch_no), id);
  if (dup) {
    return res.status(409).json({
      code: 409,
      message: '试卷批号已存在',
      data: { duplicate: true },
    });
  }

  db.prepare(`
    UPDATE paper_batches SET batch_no=@batch_no, batch_name=@batch_name, choice_full=@choice_full,
      spreadsheet_full=@spreadsheet_full, access_full=@access_full, python_full=@python_full,
      composite_full=@composite_full, total_full=@total_full, pass_ratio=@pass_ratio, remark=@remark,
      updated_at=datetime('now','localtime')
    WHERE id=@id
  `).run({
    id,
    batch_no: toStr(req.body.batch_no),
    batch_name: toStr(req.body.batch_name),
    choice_full: toNum(req.body.choice_full),
    spreadsheet_full: toNum(req.body.spreadsheet_full),
    access_full: toNum(req.body.access_full),
    python_full: toNum(req.body.python_full),
    composite_full: toNum(req.body.composite_full),
    total_full: toNum(req.body.total_full),
    pass_ratio: toNum(req.body.pass_ratio),
    remark: toStr(req.body.remark),
  });
  const row = db.prepare('SELECT * FROM paper_batches WHERE id = ?').get(id);
  res.json({ code: 0, message: '修改成功', data: attachDerived(row) });
});

/** 接口 4：DELETE /api/paper-batches/:id（单删，关联成绩则 409 拒绝） */
router.delete('/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT batch_no FROM paper_batches WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ code: 404, message: '试卷批次不存在' });

  const cnt = db.prepare('SELECT COUNT(*) AS c FROM scores WHERE batch_no = ?').get(row.batch_no).c;
  if (cnt > 0) {
    return res.status(409).json({
      code: 409,
      message: '该试卷批次下存在学生成绩，无法删除，请先删除关联成绩数据！',
      data: { blocked: [row.batch_no] },
    });
  }
  const info = db.prepare('DELETE FROM paper_batches WHERE id = ?').run(id);
  if (!info.changes) return res.status(404).json({ code: 404, message: '试卷批次不存在' });
  res.json({ code: 0, message: '删除成功' });
});

module.exports = router;
