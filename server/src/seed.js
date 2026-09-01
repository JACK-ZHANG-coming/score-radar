/**
 * 初始化种子数据：
 * 1. 首次启动创建默认管理员 admin / admin123
 * 2. 若 students / scores 表为空，则从 seed/*.csv 导入模板数据
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { normalizeTime } = require('./utils/excel');

const SEED_DIR = path.join(__dirname, '..', 'seed');

/** 简易 CSV 解析（支持双引号转义） */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell.trim());
    if (row.some((c) => c !== '')) rows.push(row);
  }
  return rows;
}

function seed() {
  // 管理员
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    db.prepare('INSERT INTO users (username, password, nickname) VALUES (?, ?, ?)').run(
      'admin', bcrypt.hashSync('admin123', 10), '管理员',
    );
    console.log('[seed] 已创建默认管理员 admin / admin123');
  }

  // 学生名单
  const studentsCsv = path.join(SEED_DIR, 'students.csv');
  if (fs.existsSync(studentsCsv) && db.prepare('SELECT COUNT(*) AS c FROM students').get().c === 0) {
    const rows = parseCsv(fs.readFileSync(studentsCsv, 'utf-8'));
    const headers = rows.shift();
    const idx = (h) => headers.indexOf(h);
    const insert = db.prepare('INSERT INTO students (exam_no, name, class, grade, school) VALUES (?, ?, ?, ?, ?)');
    const run = db.transaction((list) => {
      list.forEach((r) => {
        if (!r[idx('考号')] || !r[idx('姓名')]) return;
        insert.run(r[idx('考号')], r[idx('姓名')], r[idx('班级')] || '', r[idx('年级')] || '', r[idx('学校')] || '');
      });
    });
    run(rows);
    console.log(`[seed] 已导入学生名单 ${rows.length} 行`);
  }

  // 成绩记录
  const scoresCsv = path.join(SEED_DIR, 'scores.csv');
  if (fs.existsSync(scoresCsv) && db.prepare('SELECT COUNT(*) AS c FROM scores').get().c === 0) {
    const rows = parseCsv(fs.readFileSync(scoresCsv, 'utf-8'));
    const headers = rows.shift();
    const idx = (h) => headers.indexOf(h);
    const num = (v) => (v === '' || v === undefined ? 0 : Number(v) || 0);
    const insert = db.prepare(`
      INSERT INTO scores (serial_no, exam_no, name, school, class, status, submit_time,
        choice, spreadsheet, access, python, composite, total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const run = db.transaction((list) => {
      list.forEach((r) => {
        if (!r[idx('考号')] || !r[idx('姓名')]) return;
        insert.run(
          num(r[idx('序号')]) || null,
          r[idx('考号')], r[idx('姓名')], r[idx('学校')] || '', r[idx('班级')] || '',
          r[idx('考试状态')] || '', normalizeTime(r[idx('交卷时间')]),
          num(r[idx('选择题')]), num(r[idx('电子表格')]), num(r[idx('Access')]),
          num(r[idx('Python')]), num(r[idx('综合题')]), num(r[idx('总成绩')]),
        );
      });
    });
    run(rows);
    console.log(`[seed] 已导入成绩记录 ${rows.length} 行`);
  }
}

module.exports = seed;
if (require.main === module) {
  seed();
  console.log('[seed] 完成');
}
