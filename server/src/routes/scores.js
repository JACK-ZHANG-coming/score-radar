const express = require('express');
const multer = require('multer');
const path = require('path');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const {
  SCORE_HEADERS, buildTemplate, parseSheet, missingHeaders, normalizeTime, toNum, toStr,
} = require('../utils/excel');
const { ensurePaperBatch, computedPassLine } = require('../utils/paperBatch');

// 试卷批号配置查询（供下拉合并、分数校验使用）
const getPbConfig = db.prepare(
  'SELECT batch_no, batch_name, total_full, pass_ratio, choice_full, spreadsheet_full, access_full, python_full, composite_full FROM paper_batches WHERE batch_no = ?',
);

/**
 * 按试卷批号配置校验单条成绩分数合法性（仅「已配置」批号生效，即 total_full > 0）。
 * 放宽语义：分项满分为 0 视为该科不限制（允许学生该科得分 > 0）——适配「一键设置总满分」后
 * 批次已配置总分但部分分项满分仍为 0 的场景；总分校验（s.total > cfg.total_full）保留。
 * 返回错误信息字符串或 null（通过）。未配置（占位行）则跳过校验。
 */
function validateScoreByConfig(batchNo, s) {
  if (!batchNo) return null;
  const cfg = getPbConfig.get(batchNo);
  if (!cfg || !(cfg.total_full > 0)) return null;
  if (cfg.choice_full > 0 && s.choice > cfg.choice_full) return '选择题得分超出试卷满分配置';
  if (cfg.spreadsheet_full > 0 && s.spreadsheet > cfg.spreadsheet_full) return '电子表格得分超出试卷满分配置';
  if (cfg.access_full > 0 && s.access > cfg.access_full) return 'Access得分超出试卷满分配置';
  if (cfg.python_full > 0 && s.python > cfg.python_full) return 'Python得分超出试卷满分配置';
  if (cfg.composite_full > 0 && s.composite > cfg.composite_full) return '综合题得分超出试卷满分配置';
  if (s.total > cfg.total_full) return '总分超出试卷满分配置';
  return null;
}

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/** 允许排序的字段（列名 → SQL 列） */
const SORTABLE = {
  serialNo: 'serial_no',
  examNo: 'exam_no',
  name: 'name',
  class: 'class',
  submitTime: 'submit_time',
  choice: 'choice',
  spreadsheet: 'spreadsheet',
  access: 'access',
  python: 'python',
  composite: 'composite',
  total: 'total',
  batchNo: 'batch_no',
  correctionChoice: 'correction_choice',
  correctionSpreadsheet: 'correction_spreadsheet',
  correctionAccess: 'correction_access',
  correctionPython: 'correction_python',
  correctionComposite: 'correction_composite',
  correctionTotal: 'correction_total',
};

/** GET /api/scores  多条件搜索 + 排序 + 分页
 *  query: name(姓名模糊), clazz(班级), status(考试状态), startTime/endTime(交卷时间范围),
 *         sortField(排序字段), sortOrder(asc/desc), page, pageSize
 */
router.get('/', authRequired, (req, res) => {
  const { name = '', batchNo = '', clazz = '', status = '', startTime = '', endTime = '', sortField = '', sortOrder = 'asc' } = req.query;
  const where = [];
  const params = [];
  if (name) {
    where.push('name LIKE ?');
    params.push(`%${name}%`);
  }
  if (batchNo) {
    where.push('batch_no LIKE ?');
    params.push(`%${batchNo}%`);
  }
  if (clazz) {
    where.push('class = ?');
    params.push(clazz);
  }
  if (status) {
    where.push('status = ?');
    params.push(status);
  }
  if (startTime) {
    where.push('submit_time >= ?');
    params.push(`${startTime} 00:00`);
  }
  if (endTime) {
    where.push('submit_time <= ?');
    params.push(`${endTime} 23:59`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  let orderSql = 'ORDER BY id ASC';
  if (sortField && SORTABLE[sortField]) {
    const dir = String(sortOrder).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    orderSql = `ORDER BY ${SORTABLE[sortField]} ${dir}, id ASC`;
  }

  const total = db.prepare(`SELECT COUNT(*) AS c FROM scores ${whereSql}`).get(...params).c;
  const size = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 500);
  // 页码防御：切换到更大每页条数时，越界页码自动收敛到最后一页
  const totalPages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(Number(req.query.page) || 1, 1), totalPages);
  const list = db.prepare(
    `SELECT * FROM scores ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
  ).all(...params, size, (page - 1) * size);
  res.json({ code: 0, data: { list, total, page, pageSize: size, totalPages } });
});

/** GET /api/scores/options  班级/考试状态选项 */
router.get('/options', authRequired, (req, res) => {
  const classes = db.prepare('SELECT DISTINCT class FROM scores WHERE class != ? ORDER BY class').all('');
  const statuses = db.prepare('SELECT DISTINCT status FROM scores WHERE status != ?').all('');
  res.json({ code: 0, data: { classes: classes.map((r) => r.class), statuses: statuses.map((r) => r.status) } });
});

/** GET /api/scores/batch-nos  试卷批号下拉选项
 *  query: class(可选) —— 传班级时只返回该班级关联的批号；不传返回全部
 */
router.get('/batch-nos', authRequired, (req, res) => {
  const clazz = toStr(req.query.class);
  // 1) 来自 scores（按 class 过滤）
  let scoreRows;
  if (clazz) {
    scoreRows = db.prepare(
      "SELECT DISTINCT batch_no FROM scores WHERE batch_no != '' AND class = ?",
    ).all(clazz);
  } else {
    scoreRows = db.prepare("SELECT DISTINCT batch_no FROM scores WHERE batch_no != ''").all();
  }
  // 2) 来自 paper_batches（全量，不受 class 过滤）
  const pbRows = db.prepare("SELECT DISTINCT batch_no FROM paper_batches WHERE batch_no != ''").all();
  // 3) 合并去重，构造响应项（camelCase，供成绩页下拉/着色/校验共用）
  const map = new Map();
  const add = (bn) => {
    if (!bn || map.has(bn)) return;
    const cfg = getPbConfig.get(bn);
    map.set(bn, {
      batchNo: bn,
      batchName: cfg ? cfg.batch_name : '',
      totalFull: cfg ? cfg.total_full : 0,
      passLine: cfg ? computedPassLine(cfg.total_full, cfg.pass_ratio) : 0,
      configured: !!(cfg && cfg.total_full > 0),
    });
  };
  scoreRows.forEach((r) => add(r.batch_no));
  pbRows.forEach((r) => add(r.batch_no));
  const list = [...map.values()].sort((a, b) => a.batchNo.localeCompare(b.batchNo));
  res.json({ code: 0, data: { batchNos: list } });
});

/** GET /api/scores/template  下载导入模板 */
router.get('/template', authRequired, (req, res) => {
  const buf = buildTemplate(
    SCORE_HEADERS,
    [1, '66740001', '张三', 'hxzx', '1班', '已交卷', '2026-09-01 15:38', 10, 10, 10, 10, 20, 60],
  );
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=scores-template.xlsx');
  res.send(buf);
});

/** 六科订正分公共转换：null/''/undefined → NULL（未订正），可转数字 → 数值，否则 NULL */
function nullableNum(v) {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 订正导入合并键：六科订正分，与新导入值逐科「取最高」；库值/新值任一为空且新值空白 → 保持库值 */
const CORRECTION_COLS = ['correction_choice', 'correction_spreadsheet', 'correction_access', 'correction_python', 'correction_composite', 'correction_total'];

function rowToScore(body) {
  return {
    serial_no: body.serial_no === '' || body.serial_no === undefined || body.serial_no === null
      ? null : Number(body.serial_no),
    exam_no: toStr(body.exam_no),
    name: toStr(body.name),
    batch_no: toStr(body.batch_no),
    school: toStr(body.school),
    class: toStr(body.class),
    status: toStr(body.status),
    submit_time: normalizeTime(body.submit_time),
    choice: toNum(body.choice),
    spreadsheet: toNum(body.spreadsheet),
    access: toNum(body.access),
    python: toNum(body.python),
    composite: toNum(body.composite),
    total: toNum(body.total),
    // 六科订正分：null/''/undefined → NULL（未订正），可转数字 → 数值
    correction_choice: nullableNum(body.correction_choice),
    correction_spreadsheet: nullableNum(body.correction_spreadsheet),
    correction_access: nullableNum(body.correction_access),
    correction_python: nullableNum(body.correction_python),
    correction_composite: nullableNum(body.correction_composite),
    correction_total: nullableNum(body.correction_total),
    // 备注：POST/PUT 的 INSERT/UPDATE 语句均绑定 @remark，缺失会导致 better-sqlite3 RangeError
    remark: toStr(body.remark),
  };
}

/** POST /api/scores  新增成绩
 *  重复校验键：(batch_no 试卷批号, name 姓名)
 *  - 若目标「试卷批号+姓名」已存在且未携带 overwrite 标记 → 返回 409（duplicate），由前端弹确认框
 *  - 若用户确认覆盖（overwrite=true） → 用新数据更新已存在的那条记录（不新增行）
 */
router.post('/', authRequired, (req, res) => {
  const s = rowToScore(req.body || {});
  if (!s.exam_no) return res.status(400).json({ code: 400, message: '考号不能为空' });
  if (!s.name) return res.status(400).json({ code: 400, message: '姓名不能为空' });

  const dup = db.prepare('SELECT id, name FROM scores WHERE batch_no = ? AND name = ?').get(s.batch_no, s.name);
  if (dup && !req.body.overwrite) {
    return res.status(409).json({
      code: 409,
      message: `试卷批号「${s.batch_no || '(空)'}」下已存在同名记录（姓名：${s.name}），如需覆盖请确认`,
      data: { duplicate: true, conflictId: dup.id },
    });
  }

  // 按所选试卷批号配置校验分数合法性（仅已配置批号生效，否则跳过）
  const cfgErr = validateScoreByConfig(s.batch_no, s);
  if (cfgErr) return res.status(400).json({ code: 400, message: cfgErr });

  const COLS = `serial_no, exam_no, name, batch_no, school, class, status, submit_time,
      choice, spreadsheet, access, python, composite, total,
      correction_choice, correction_spreadsheet, correction_access, correction_python, correction_composite, correction_total,
      remark`;
  const VALS = `@serial_no, @exam_no, @name, @batch_no, @school, @class, @status, @submit_time,
      @choice, @spreadsheet, @access, @python, @composite, @total,
      @correction_choice, @correction_spreadsheet, @correction_access, @correction_python, @correction_composite, @correction_total,
      @remark`;

  if (dup && req.body.overwrite) {
    db.prepare(`
      UPDATE scores SET serial_no=@serial_no, exam_no=@exam_no, name=@name, batch_no=@batch_no,
        school=@school, class=@class, status=@status, submit_time=@submit_time, choice=@choice,
        spreadsheet=@spreadsheet, access=@access, python=@python, composite=@composite, total=@total,
        correction_choice=@correction_choice, correction_spreadsheet=@correction_spreadsheet,
        correction_access=@correction_access, correction_python=@correction_python,
        correction_composite=@correction_composite, correction_total=@correction_total, remark=@remark,
        updated_at=datetime('now','localtime')
      WHERE id=@id
    `).run({ ...s, id: dup.id });
    ensurePaperBatch(s.batch_no); // 静默补占位行（幂等）
    return res.json({ code: 0, message: '已覆盖保存', data: db.prepare('SELECT * FROM scores WHERE id = ?').get(dup.id) });
  }

  const info = db.prepare(`
    INSERT INTO scores (${COLS}) VALUES (${VALS})
  `).run(s);
  ensurePaperBatch(s.batch_no); // 静默补占位行（幂等）
  res.json({ code: 0, message: '新增成功', data: db.prepare('SELECT * FROM scores WHERE id = ?').get(info.lastInsertRowid) });
});

/** PUT /api/scores/:id  修改成绩
 *  重复校验键同样为 (batch_no, name)，但需排除记录自身；
 *  若与其它记录冲突且用户确认覆盖 → 用新数据更新冲突记录，并删除当前正在编辑的记录（保证唯一）
 */
router.put('/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM scores WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ code: 404, message: '成绩记录不存在' });
  const s = rowToScore({ ...old, ...req.body });

  // 按所选试卷批号配置校验分数合法性（仅已配置批号生效，否则跳过）
  const cfgErr = validateScoreByConfig(s.batch_no, s);
  if (cfgErr) return res.status(400).json({ code: 400, message: cfgErr });

  const dup = db.prepare('SELECT id, name FROM scores WHERE batch_no = ? AND name = ? AND id != ?').get(s.batch_no, s.name, id);
  if (dup && !req.body.overwrite) {
    return res.status(409).json({
      code: 409,
      message: `试卷批号「${s.batch_no || '(空)'}」下已存在同名记录（姓名：${s.name}），如需覆盖请确认`,
      data: { duplicate: true, conflictId: dup.id },
    });
  }

  if (dup && req.body.overwrite) {
    // 用新数据覆盖冲突记录，并删除当前编辑记录，维持「试卷批号+姓名」唯一
    db.transaction(() => {
      db.prepare(`
        UPDATE scores SET serial_no=@serial_no, exam_no=@exam_no, name=@name, batch_no=@batch_no,
          school=@school, class=@class, status=@status, submit_time=@submit_time, choice=@choice,
          spreadsheet=@spreadsheet, access=@access, python=@python, composite=@composite, total=@total,
          correction_choice=@correction_choice, correction_spreadsheet=@correction_spreadsheet,
          correction_access=@correction_access, correction_python=@correction_python,
          correction_composite=@correction_composite, correction_total=@correction_total, remark=@remark,
          updated_at=datetime('now','localtime')
        WHERE id=@id
      `).run({ ...s, id: dup.id });
      db.prepare('DELETE FROM scores WHERE id = ?').run(id);
    })();
    return res.json({ code: 0, message: '已覆盖保存', data: db.prepare('SELECT * FROM scores WHERE id = ?').get(dup.id) });
  }

  db.prepare(`
    UPDATE scores SET serial_no=@serial_no, exam_no=@exam_no, name=@name, batch_no=@batch_no,
      school=@school, class=@class, status=@status, submit_time=@submit_time, choice=@choice,
      spreadsheet=@spreadsheet, access=@access, python=@python, composite=@composite, total=@total,
      correction_choice=@correction_choice, correction_spreadsheet=@correction_spreadsheet,
      correction_access=@correction_access, correction_python=@correction_python,
      correction_composite=@correction_composite, correction_total=@correction_total, remark=@remark,
      updated_at=datetime('now','localtime')
    WHERE id=@id
  `).run({ ...s, id });
  res.json({ code: 0, message: '修改成功', data: db.prepare('SELECT * FROM scores WHERE id = ?').get(id) });
});

/** DELETE /api/scores/batch  批量删除成绩（body: { ids: number[] }） */
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
  const info = db.prepare(`DELETE FROM scores WHERE id IN (${placeholders})`).run(...idList);
  res.json({ code: 0, message: `已删除 ${info.changes} 条记录`, data: { deleted: info.changes } });
});

/** DELETE /api/scores/:id  删除成绩 */
router.delete('/:id', authRequired, (req, res) => {
  const info = db.prepare('DELETE FROM scores WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ code: 404, message: '成绩记录不存在' });
  res.json({ code: 0, message: '删除成功' });
});

/** 导入用写入语句（模块级预编译，多文件导入复用） */
const importInsert = db.prepare(`
  INSERT INTO scores (serial_no, exam_no, name, batch_no, school, class, status, submit_time,
    choice, spreadsheet, access, python, composite, total,
    correction_choice, correction_spreadsheet, correction_access, correction_python, correction_composite, correction_total,
    remark)
  VALUES (@serial_no, @exam_no, @name, @batch_no, @school, @class, @status, @submit_time,
    @choice, @spreadsheet, @access, @python, @composite, @total,
    @correction_choice, @correction_spreadsheet, @correction_access, @correction_python, @correction_composite, @correction_total,
    @remark)
`);
const importUpdate = db.prepare(`
  UPDATE scores SET serial_no=@serial_no, exam_no=@exam_no, name=@name, batch_no=@batch_no, school=@school,
    class=@class, status=@status, submit_time=@submit_time, choice=@choice, spreadsheet=@spreadsheet,
    access=@access, python=@python, composite=@composite, total=@total,
    correction_choice=@correction_choice, correction_spreadsheet=@correction_spreadsheet,
    correction_access=@correction_access, correction_python=@correction_python,
    correction_composite=@correction_composite, correction_total=@correction_total, remark=@remark,
    updated_at=datetime('now','localtime')
  WHERE id=@id
`);
const findByBatchName = db.prepare(`
  SELECT id, correction_choice, correction_spreadsheet, correction_access, correction_python,
    correction_composite, correction_total, remark
  FROM scores WHERE batch_no = ? AND name = ?
`);
/** 订正导入专用：仅更新六科订正分列，其余字段（首次分数/备注等）一律不动 */
const updateCorrections = db.prepare(`
  UPDATE scores SET
    correction_choice=@correction_choice,
    correction_spreadsheet=@correction_spreadsheet,
    correction_access=@correction_access,
    correction_python=@correction_python,
    correction_composite=@correction_composite,
    correction_total=@correction_total,
    updated_at=datetime('now','localtime')
  WHERE id=@id
`);

/**
 * 从文件名解析订正标记：形如「5-电子表格1-2_1_订正2」 → isCorrection=true，batchNoFromName=「5-电子表格1-2_1」；
 * 无订正标记（不含「订正」二字）或标记后无剩余部分 → 判定为首次分数导入，batchNoFromName=全名。
 * 识别口径：文件名（去扩展名）末尾存在（_?-?订正N?）片段；紧邻标记前的「_」「-」分隔符一并剥离。
 */
const CORRECTION_MARK_RE = /(_?-?订正\d*)$/;

/**
 * 修复 multipart 上传文件名的中文乱码（mojibake）。
 * 现状链路：浏览器把 filename 按原始 UTF-8 字节写入报文 → busboy 1.x 未设
 * defParamCharset 时对头部按 latin1 单字节切分 → req.file.originalname 对中文文件名
 * 呈「每字节一字」乱码（如「订正」→ è®¢æ­£）。把该字符串按 latin1 还原字节序列再转
 * UTF-8 即可无损修复；无法还原（出现 U+FFFD）或本就不含高位字节（ASCII/已正确）时
 * 保持原值。极少数双重编码（修复一轮后仍含高位字节）最多再修两轮，直至稳定。
 */
function fixUploadName(name) {
  let s = String(name || '');
  for (let i = 0; i < 3; i += 1) {
    if (!s || !/[\u0080-\u00ff]/.test(s)) return s;
    const repaired = Buffer.from(s, 'latin1').toString('utf8');
    if (repaired === s || repaired.includes('\uFFFD')) return s;
    s = repaired;
  }
  return s;
}

/** 判定导入模式：返回 { isCorrection: boolean, batchNoFromName: string } */
function detectImportKind(fileName) {
  const base = path.parse(fileName || '').name;
  const m = base.match(CORRECTION_MARK_RE);
  if (!m || !m[0]) return { isCorrection: false, batchNoFromName: base };
  // 去除末尾「订正N」标记后剩余部分即目标批次号；标记前紧邻的「_」「-」一并剥离
  const stripped = base.slice(0, base.length - m[0].length).replace(/[-_]$/, '');
  if (!stripped) return { isCorrection: false, batchNoFromName: base };
  return { isCorrection: true, batchNoFromName: stripped };
}

/**
 * 订正合并：新导入值与库中既有订正值逐科取最高，库值/新值均为 NULL/空白单元格时保持不动。
 * 规则（空白即「本行未提供订正值」）：
 *   - 新值空 → 保持库值（包括库值也为空的情形）
 *   - 新值非空 → max(库值 || 0, 新值)
 * 返回 null（未提供任何订正数据时视为空括号语义）或六个字段的对象。
 */
function mergeCorrections(existing, row) {
  const incoming = {
    correction_choice: nullableNum(row['选择题']),
    correction_spreadsheet: nullableNum(row['电子表格']),
    correction_access: nullableNum(row['Access']),
    correction_python: nullableNum(row['Python']),
    correction_composite: nullableNum(row['综合题']),
    correction_total: nullableNum(row['总成绩']),
  };
  const merged = {};
  let hasIncoming = false;
  CORRECTION_COLS.forEach((col) => {
    const dbVal = existing ? existing[col] : null;
    const inVal = incoming[col];
    if (inVal !== null) hasIncoming = true;
    merged[col] = inVal === null ? dbVal : Math.max(Number(dbVal) || 0, inVal);
  });
  return { merged, hasIncoming };
}

/**
 * 导入单个 Excel 文件（解析 → 表头校验 → 重复预扫描 → 事务写入）。
 * 复用原单文件导入的全部校验与写入口径，多文件导入时逐文件调用、各自独立事务。
 * 导入模式由文件名自动判定（detectImportKind）：
 *   - 首次分数导入：走原有全量写入逻辑（同批号+姓名存在时覆盖/新增，校验满分配置）；
 *   - 订正导入：仅把导入分数合并进六科订正分（逐科与库值取最高），不动首次分数六列，
 *     不存在的学生跳过，不校验满分配置（订正分可能低——「未订正到满分」不是非法值）。
 * @param {{buffer: Buffer, originalname: string}} file 上传文件
 * @param {string} batchNo 该文件关联的试卷批号（路由层已剥离订正标记）
 * @param {boolean} overwrite 是否覆盖同「批号+姓名」的既有记录
 * @returns {{ok:boolean, inserted:number, updated:number, errors:string[], message:string, conflictCount?:number, conflict?:boolean}}
 */
function importOneFile(file, batchNo, overwrite) {
  const { isCorrection } = detectImportKind(fixUploadName(file.originalname || ''));
  let rows;
  try {
    rows = parseSheet(file.buffer);
  } catch (e) {
    return { ok: false, inserted: 0, updated: 0, errors: [`文件解析失败：${e.message}`], message: `文件解析失败：${e.message}` };
  }
  if (!rows.length) {
    return { ok: false, inserted: 0, updated: 0, errors: ['Excel 中没有数据行'], message: 'Excel 中没有数据行' };
  }
  const missing = missingHeaders(Object.keys(rows[0]), SCORE_HEADERS);
  if (missing.length) {
    const msg = `缺少必需列：${missing.join('、')}`;
    return { ok: false, inserted: 0, updated: 0, errors: [msg], message: msg };
  }

  // ── 订正导入分支：仅合并订正分，不走首次导入的冲突预扫描/满分校验/单条写入流程 ──
  if (isCorrection) {
    const errors = [];
    let updated = 0;
    let skipped = 0;
    const tx = db.transaction(() => {
      rows.forEach((row, i) => {
        const line = i + 2;
        const name = toStr(row['姓名']);
        if (!name) {
          skipped += 1;
          errors.push(`第 ${line} 行：姓名为空，已跳过`);
          return;
        }
        const exists = findByBatchName.get(batchNo, name);
        if (!exists) {
          skipped += 1;
          if (errors.length < 100) errors.push(`第 ${line} 行：批次「${batchNo}」下不存在学生「${name}」，已跳过（订正导入不新增记录）`);
          return;
        }
        const { merged, hasIncoming } = mergeCorrections(exists, row);
        // 本行六科全部空：没有携带任何订正数值 → 保持不动
        if (!hasIncoming) {
          skipped += 1;
          if (errors.length < 100) errors.push(`第 ${line} 行：「${name}」本行无订正数值，保持不动`);
          return;
        }
        // 逐科取最高后与库值完全一致（本次订正值均不高于已保存订正分）→ 保持不动
        const changed = CORRECTION_COLS.some((c) => merged[c] !== exists[c]);
        if (!changed) {
          skipped += 1;
          if (errors.length < 100) errors.push(`第 ${line} 行：「${name}」本次订正值不高于已保存订正分，保持不动`);
          return;
        }
        updateCorrections.run({ ...merged, id: exists.id });
        updated += 1;
      });
    });
    tx();
    return {
      ok: true,
      inserted: 0,
      updated,
      errors,
      message: `订正导入：更新 ${updated} 条${skipped ? `，跳过 ${skipped} 条` : ''}${errors.length ? `，明细 ${errors.length} 条` : ''}`,
    };
  }

  // 预扫描：统计会与「试卷批号+姓名」冲突的行（现有库记录或文件内重复）
  let conflictCount = 0;
  const seen = new Set();
  rows.forEach((row) => {
    const name = toStr(row['姓名']);
    if (!name) return; // 空姓名本就会被跳过
    const key = `${batchNo}||${name}`;
    if (findByBatchName.get(batchNo, name) || seen.has(key)) conflictCount += 1;
    seen.add(key);
  });
  if (conflictCount > 0 && !overwrite) {
    return {
      ok: false,
      inserted: 0,
      updated: 0,
      errors: [`存在 ${conflictCount} 条与现有「试卷批号+姓名」重复的记录，需确认覆盖后重试`],
      message: `存在 ${conflictCount} 条重复记录，需确认覆盖`,
      conflict: true,
      conflictCount,
    };
  }

  const batchCfg = getPbConfig.get(batchNo);
  const doImport = db.transaction((list) => {
    let inserted = 0;
    let updated = 0;
    const errors = [];
    list.forEach((row, i) => {
      const line = i + 2;
      const examNo = toStr(row['考号']);
      const name = toStr(row['姓名']);
      if (!examNo || !name) {
        errors.push(`第 ${line} 行：考号或姓名为空，已跳过`);
        return;
      }
      const exists = findByBatchName.get(batchNo, name);
      const s = {
        serial_no: toNum(row['序号']) || null,
        exam_no: examNo,
        name,
        batch_no: batchNo,
        school: toStr(row['学校']),
        class: toStr(row['班级']),
        status: toStr(row['考试状态']),
        submit_time: normalizeTime(row['交卷时间']),
        choice: toNum(row['选择题']),
        spreadsheet: toNum(row['电子表格']),
        access: toNum(row['Access']),
        python: toNum(row['Python']),
        composite: toNum(row['综合题']),
        total: toNum(row['总成绩']),
        // 模板不含备注/六科订正分：覆盖已有行时保留库中原值，新行用默认（NULL / ''）
        correction_choice: exists ? exists.correction_choice : null,
        correction_spreadsheet: exists ? exists.correction_spreadsheet : null,
        correction_access: exists ? exists.correction_access : null,
        correction_python: exists ? exists.correction_python : null,
        correction_composite: exists ? exists.correction_composite : null,
        correction_total: exists ? exists.correction_total : null,
        remark: exists ? exists.remark : '',
      };
      // 按所选试卷批号配置校验分数合法性（仅已配置批号生效，否则跳过）
      if (batchCfg && batchCfg.total_full > 0) {
        if (s.choice > batchCfg.choice_full || s.spreadsheet > batchCfg.spreadsheet_full ||
            s.access > batchCfg.access_full || s.python > batchCfg.python_full ||
            s.composite > batchCfg.composite_full || s.total > batchCfg.total_full) {
          errors.push(`第 ${line} 行分数非法（超出试卷满分配置）`);
          return;
        }
      }
      if (exists) {
        importUpdate.run({ ...s, id: exists.id });
        updated += 1;
      } else {
        importInsert.run(s);
        inserted += 1;
      }
      ensurePaperBatch(batchNo); // 静默补占位行（事务内幂等）
    });
    return { inserted, updated, errors };
  });

  const result = doImport(rows);
  return {
    ok: true,
    inserted: result.inserted,
    updated: result.updated,
    errors: result.errors,
    message: `新增 ${result.inserted} 条，更新 ${result.updated} 条${result.errors.length ? `，跳过 ${result.errors.length} 条` : ''}`,
  };
}

/** POST /api/scores/import  Excel 批量导入
 *  试卷批号来源：前端手动输入（batchNo 字段）优先，否则取上传文件名（去扩展名）；
 *  重复校验键：(batch_no, name) —— 同一试卷批号下不允许同名；
 *  - 预扫描发现重复且未携带 overwrite → 返回 409（duplicate + conflictCount），由前端一次性确认
 *  - 确认覆盖（overwrite=true）或本就无重复 → 按 (batch_no, name) 去重：存在则覆盖，否则新增
 */
router.post('/import', authRequired, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择 Excel 文件' });
  // 试卷批号：手动输入优先，否则取文件名（去扩展名）；订正文件名（含「订正N」结尾标记）
  // 的回退批号需剥掉末尾订正标记，取剩余部分为目标批次号（如 5-电子表格1-2_1_订正2 → 5-电子表格1-2_1）
  const fallback = detectImportKind(fixUploadName(req.file.originalname)).batchNoFromName;
  const batchNo = toStr(req.body.batchNo) || fallback;
  const overwrite = String(req.body.overwrite || '') === 'true';

  const r = importOneFile(req.file, batchNo, overwrite);
  if (!r.ok && r.conflict) {
    return res.status(409).json({
      code: 409,
      message: `导入数据中发现 ${r.conflictCount} 条与现有「试卷批号+姓名」重复的记录`,
      data: { duplicate: true, conflictCount: r.conflictCount },
    });
  }
  if (!r.ok) return res.status(400).json({ code: 400, message: r.message, data: { errors: r.errors } });

  res.json({
    code: 0,
    message: `导入完成：${r.message}`,
    data: { inserted: r.inserted, updated: r.updated, errors: r.errors },
  });
});

/** POST /api/scores/import-multi  多文件批量导入（每个文件各自关联一个试卷批号）
 *  form-data：
 *    files[]   —— 多个 Excel 文件（顺序即列表顺序）
 *    batchNos  —— JSON 数组字符串，与 files 顺序一一对应（空则回退为各自文件名去扩展名）
 *    overwrite —— 'true' 表示覆盖同「试卷批号+姓名」的既有记录
 *  处理策略：逐文件独立事务，单文件解析/校验/重复冲突失败时仅该文件失败，
 *           不影响后续文件（已成功写入的其他文件保持入库，不整体回滚）。
 */
router.post('/import-multi', authRequired, upload.array('files', 20), (req, res) => {
  const files = req.files || [];
  if (!files.length) return res.status(400).json({ code: 400, message: '请选择至少一个 Excel 文件' });

  let batchNos = [];
  try {
    const parsed = JSON.parse(req.body.batchNos || '[]');
    if (Array.isArray(parsed)) batchNos = parsed;
  } catch (e) {
    batchNos = []; // 解析失败则全部回退为文件名
  }
  const overwrite = String(req.body.overwrite || '') === 'true';

  const details = [];
  let successFiles = 0;
  let failedFiles = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  files.forEach((file, idx) => {
    // 文件名先修复 multipart 编码乱码，再用于回退批号推导与响应明细（前端可见正确中文）
    const fileName = fixUploadName(file.originalname || '');
    // 订正文件名的回退批号需剥掉末尾「订正N」标记（与 /import 单文件口径一致）
    const fallback = detectImportKind(fileName).batchNoFromName;
    const batchNo = toStr(batchNos[idx]) || fallback;
    const r = importOneFile(file, batchNo, overwrite);
    if (r.ok) {
      successFiles += 1;
      inserted += r.inserted;
      updated += r.updated;
      skipped += r.errors.length;
    } else {
      failedFiles += 1;
    }
    details.push({
      fileName,
      batchNo,
      ok: r.ok,
      inserted: r.inserted || 0,
      updated: r.updated || 0,
      skipped: (r.errors || []).length,
      message: r.message,
      conflict: !!r.conflict,
      errors: (r.errors || []).slice(0, 10), // 最多返回前 10 条失败原因，避免响应过大
    });
  });

  res.json({
    code: 0,
    message: `导入完成：成功 ${successFiles} 个文件，失败 ${failedFiles} 个文件（新增 ${inserted} 条，更新 ${updated} 条，跳过 ${skipped} 条）`,
    data: {
      summary: { totalFiles: files.length, successFiles, failedFiles, inserted, updated, skipped },
      details,
    },
  });
});


/** POST /api/scores/sync-students
 *  以考号为唯一主键，将学生信息管理模块中的最新姓名/班级同步到成绩记录：
 *  - 考号匹配且姓名或班级有变化 → 更新成绩记录的姓名、班级
 *  - 考号未匹配到学生 → 保持原数据不变
 */
router.post('/sync-students', authRequired, (req, res) => {
  const scores = db.prepare('SELECT id, exam_no, name, class FROM scores').all();
  const getStudent = db.prepare('SELECT name, class FROM students WHERE exam_no = ?');
  const updateScore = db.prepare(
    "UPDATE scores SET name = ?, class = ?, updated_at = datetime('now','localtime') WHERE id = ?",
  );

  let updated = 0;
  let unmatched = 0;
  const details = [];

  const sync = db.transaction((list) => {
    list.forEach((s) => {
      const stu = getStudent.get(s.exam_no);
      if (!stu) {
        unmatched += 1;
        return;
      }
      if (stu.name !== s.name || stu.class !== s.class) {
        updateScore.run(stu.name, stu.class, s.id);
        updated += 1;
        if (details.length < 100) {
          details.push({
            exam_no: s.exam_no,
            old_name: s.name,
            new_name: stu.name,
            old_class: s.class,
            new_class: stu.class,
          });
        }
      }
    });
  });
  sync(scores);

  const unchanged = scores.length - updated;
  res.json({
    code: 0,
    message: `同步完成：共扫描 ${scores.length} 条成绩记录，更新 ${updated} 条，保持不变 ${unchanged} 条（其中 ${unmatched} 条未匹配到学生信息）`,
    data: { total: scores.length, updated, unchanged, unmatched, details },
  });
});

module.exports = router;
