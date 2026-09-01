const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'score_radar.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  class TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  school TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serial_no INTEGER,
  exam_no TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  school TEXT NOT NULL DEFAULT '',
  class TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  submit_time TEXT NOT NULL DEFAULT '',
  choice REAL NOT NULL DEFAULT 0,
  spreadsheet REAL NOT NULL DEFAULT 0,
  access REAL NOT NULL DEFAULT 0,
  python REAL NOT NULL DEFAULT 0,
  composite REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_students_class ON students(class);
CREATE INDEX IF NOT EXISTS idx_students_grade ON students(grade);
CREATE INDEX IF NOT EXISTS idx_scores_exam_no ON scores(exam_no);
CREATE INDEX IF NOT EXISTS idx_scores_class ON scores(class);
CREATE INDEX IF NOT EXISTS idx_scores_submit_time ON scores(submit_time);
`);

module.exports = db;
