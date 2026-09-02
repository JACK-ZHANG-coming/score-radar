const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const {
  SCORE_HEADERS, buildTemplate, parseSheet, missingHeaders, normalizeTime, toNum, toStr,
} = require('../utils/excel');

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
};

/** GET /api/scores  多条件搜索 + 排序 + 分页
 *  query: name(姓名模糊), clazz(班级), status(考试状态), startTime/endTime(交卷时间范围),
 *         sortField(排序字段), sortOrder(asc/desc), page, pageSize
 */
router.get('/', authRequired, (req, res) => {
  const { name = '', clazz = '', status = '', startTime = '', endTime = '', sortField = '', sortOrder = 'asc' } = req.query;
  const where = [];
  const params = [];
  if (name) {
    where.push('name LIKE ?');
    params.push(`%${name}%`);
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

function rowToScore(body) {
  return {
    serial_no: body.serial_no === '' || body.serial_no === undefined || body.serial_no === null
      ? null : Number(body.serial_no),
    exam_no: toStr(body.exam_no),
    name: toStr(body.name),
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
  };
}

/** POST /api/scores  新增成绩 */
router.post('/', authRequired, (req, res) => {
  const s = rowToScore(req.body || {});
  if (!s.exam_no) return res.status(400).json({ code: 400, message: '考号不能为空' });
  if (!s.name) return res.status(400).json({ code: 400, message: '姓名不能为空' });
  const info = db.prepare(`
    INSERT INTO scores (serial_no, exam_no, name, school, class, status, submit_time,
      choice, spreadsheet, access, python, composite, total)
    VALUES (@serial_no, @exam_no, @name, @school, @class, @status, @submit_time,
      @choice, @spreadsheet, @access, @python, @composite, @total)
  `).run(s);
  res.json({ code: 0, message: '新增成功', data: db.prepare('SELECT * FROM scores WHERE id = ?').get(info.lastInsertRowid) });
});

/** PUT /api/scores/:id  修改成绩 */
router.put('/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM scores WHERE id = ?').get(id);
  if (!old) return res.status(404).json({ code: 404, message: '成绩记录不存在' });
  const s = rowToScore({ ...old, ...req.body });
  db.prepare(`
    UPDATE scores SET serial_no=@serial_no, exam_no=@exam_no, name=@name, school=@school,
      class=@class, status=@status, submit_time=@submit_time, choice=@choice, spreadsheet=@spreadsheet,
      access=@access, python=@python, composite=@composite, total=@total,
      updated_at=datetime('now','localtime')
    WHERE id=@id
  `).run({ ...s, id });
  res.json({ code: 0, message: '修改成功', data: db.prepare('SELECT * FROM scores WHERE id = ?').get(id) });
});

/** DELETE /api/scores/:id  删除成绩 */
router.delete('/:id', authRequired, (req, res) => {
  const info = db.prepare('DELETE FROM scores WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) return res.status(404).json({ code: 404, message: '成绩记录不存在' });
  res.json({ code: 0, message: '删除成功' });
});

/** POST /api/scores/import  Excel 批量导入（同考号存在则更新，否则新增） */
router.post('/import', authRequired, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择 Excel 文件' });
  let rows;
  try {
    rows = parseSheet(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ code: 400, message: `文件解析失败：${e.message}` });
  }
  if (!rows.length) return res.status(400).json({ code: 400, message: 'Excel 中没有数据行' });
  const missing = missingHeaders(Object.keys(rows[0]), SCORE_HEADERS);
  if (missing.length) {
    return res.status(400).json({ code: 400, message: `缺少必需列：${missing.join('、')}（模板字段：${SCORE_HEADERS.join('、')}）` });
  }

  const insert = db.prepare(`
    INSERT INTO scores (serial_no, exam_no, name, school, class, status, submit_time,
      choice, spreadsheet, access, python, composite, total)
    VALUES (@serial_no, @exam_no, @name, @school, @class, @status, @submit_time,
      @choice, @spreadsheet, @access, @python, @composite, @total)
  `);
  const update = db.prepare(`
    UPDATE scores SET serial_no=@serial_no, name=@name, school=@school, class=@class, status=@status,
      submit_time=@submit_time, choice=@choice, spreadsheet=@spreadsheet, access=@access, python=@python,
      composite=@composite, total=@total, updated_at=datetime('now','localtime')
    WHERE exam_no=@exam_no
  `);

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
      const s = {
        serial_no: toNum(row['序号']) || null,
        exam_no: examNo,
        name,
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
      };
      const exists = db.prepare('SELECT id FROM scores WHERE exam_no = ?').get(examNo);
      if (exists) {
        update.run(s);
        updated += 1;
      } else {
        insert.run(s);
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
