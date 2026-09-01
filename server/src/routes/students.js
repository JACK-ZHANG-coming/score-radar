const express = require('express');
const multer = require('multer');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const {
  STUDENT_HEADERS, buildTemplate, parseSheet, missingHeaders, toStr,
} = require('../utils/excel');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/** GET /api/students  分页查询（keyword 模糊匹配考号/姓名，另支持班级/年级精确过滤） */
router.get('/', authRequired, (req, res) => {
  const { keyword = '', clazz = '', grade = '', page = 1, pageSize = 20 } = req.query;
  const where = [];
  const params = [];
  if (keyword) {
    where.push('(exam_no LIKE ? OR name LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  if (clazz) {
    where.push('class = ?');
    params.push(clazz);
  }
  if (grade) {
    where.push('grade = ?');
    params.push(grade);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS c FROM students ${whereSql}`).get(...params).c;
  const size = Math.min(Math.max(Number(pageSize) || 20, 1), 200);
  const offset = (Math.max(Number(page) || 1, 1) - 1) * size;
  const list = db.prepare(
    `SELECT * FROM students ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`,
  ).all(...params, size, offset);
  res.json({ code: 0, data: { list, total, page: Number(page) || 1, pageSize: size } });
});

/** GET /api/students/options  班级/年级下拉选项 */
router.get('/options', authRequired, (req, res) => {
  const classes = db.prepare('SELECT DISTINCT class FROM students WHERE class != ? ORDER BY class').all('');
  const grades = db.prepare('SELECT DISTINCT grade FROM students WHERE grade != ? ORDER BY grade').all('');
  res.json({ code: 0, data: { classes: classes.map((r) => r.class), grades: grades.map((r) => r.grade) } });
});

/** GET /api/students/template  下载导入模板 */
router.get('/template', authRequired, (req, res) => {
  const buf = buildTemplate(STUDENT_HEADERS, ['66740001', '张三', '1班', '高二', 'hxzx']);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=students-template.xlsx');
  res.send(buf);
});

function validateBody(body) {
  const examNo = toStr(body.exam_no);
  const name = toStr(body.name);
  if (!examNo) return { error: '考号不能为空' };
  if (!name) return { error: '姓名不能为空' };
  return { examNo, name };
}

/** POST /api/students  新增 */
router.post('/', authRequired, (req, res) => {
  const v = validateBody(req.body || {});
  if (v.error) return res.status(400).json({ code: 400, message: v.error });
  const exists = db.prepare('SELECT id FROM students WHERE exam_no = ?').get(v.examNo);
  if (exists) return res.status(400).json({ code: 400, message: `考号 ${v.examNo} 已存在` });
  const info = db.prepare(
    'INSERT INTO students (exam_no, name, class, grade, school) VALUES (?, ?, ?, ?, ?)',
  ).run(v.examNo, v.name, toStr(req.body.class), toStr(req.body.grade), toStr(req.body.school));
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(info.lastInsertRowid);
  res.json({ code: 0, message: '新增成功', data: student });
});

/** PUT /api/students/:id  修改 */
router.put('/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  if (!student) return res.status(404).json({ code: 404, message: '学生不存在' });
  const v = validateBody({ ...student, ...req.body });
  if (v.error) return res.status(400).json({ code: 400, message: v.error });
  if (v.examNo !== student.exam_no) {
    const exists = db.prepare('SELECT id FROM students WHERE exam_no = ? AND id != ?').get(v.examNo, id);
    if (exists) return res.status(400).json({ code: 400, message: `考号 ${v.examNo} 已存在` });
  }
  db.prepare(
    "UPDATE students SET exam_no=?, name=?, class=?, grade=?, school=?, updated_at=datetime('now','localtime') WHERE id=?",
  ).run(v.examNo, v.name, toStr(req.body.class), toStr(req.body.grade), toStr(req.body.school), id);
  res.json({ code: 0, message: '修改成功', data: db.prepare('SELECT * FROM students WHERE id = ?').get(id) });
});

/** DELETE /api/students/:id  删除 */
router.delete('/:id', authRequired, (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('DELETE FROM students WHERE id = ?').run(id);
  if (!info.changes) return res.status(404).json({ code: 404, message: '学生不存在' });
  res.json({ code: 0, message: '删除成功' });
});

/** POST /api/students/import  Excel 批量导入（按考号 upsert） */
router.post('/import', authRequired, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择 Excel 文件' });
  let rows;
  try {
    rows = parseSheet(req.file.buffer);
  } catch (e) {
    return res.status(400).json({ code: 400, message: `文件解析失败：${e.message}` });
  }
  if (!rows.length) return res.status(400).json({ code: 400, message: 'Excel 中没有数据行' });
  const missing = missingHeaders(Object.keys(rows[0]), STUDENT_HEADERS);
  if (missing.length) {
    return res.status(400).json({ code: 400, message: `缺少必需列：${missing.join('、')}（模板字段：${STUDENT_HEADERS.join('、')}）` });
  }

  const insert = db.prepare('INSERT INTO students (exam_no, name, class, grade, school) VALUES (?, ?, ?, ?, ?)');
  const update = db.prepare(
    "UPDATE students SET name=?, class=?, grade=?, school=?, updated_at=datetime('now','localtime') WHERE exam_no=?",
  );
  const upsert = db.transaction((list) => {
    let inserted = 0;
    let updated = 0;
    const errors = [];
    list.forEach((row, i) => {
      const line = i + 2; // Excel 实际行号
      const examNo = toStr(row['考号']);
      const name = toStr(row['姓名']);
      if (!examNo || !name) {
        errors.push(`第 ${line} 行：考号或姓名为空，已跳过`);
        return;
      }
      const exists = db.prepare('SELECT id FROM students WHERE exam_no = ?').get(examNo);
      if (exists) {
        update.run(name, toStr(row['班级']), toStr(row['年级']), toStr(row['学校']), examNo);
        updated += 1;
      } else {
        insert.run(examNo, name, toStr(row['班级']), toStr(row['年级']), toStr(row['学校']));
        inserted += 1;
      }
    });
    return { inserted, updated, errors };
  });

  const result = upsert(rows);
  res.json({
    code: 0,
    message: `导入完成：新增 ${result.inserted} 条，更新 ${result.updated} 条${result.errors.length ? `，跳过 ${result.errors.length} 条` : ''}`,
    data: result,
  });
});

module.exports = router;
