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

-- 试卷批次配置表（全新表，一次性建全字段）
CREATE TABLE IF NOT EXISTS paper_batches (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_no        TEXT NOT NULL UNIQUE,            -- 试卷批号，唯一标识，关联 scores.batch_no
  batch_name      TEXT NOT NULL DEFAULT '',        -- 试卷批次名称
  choice_full     REAL NOT NULL DEFAULT 0,         -- 选择题满分 ≥0
  spreadsheet_full REAL NOT NULL DEFAULT 0,        -- 电子表格满分 ≥0
  access_full     REAL NOT NULL DEFAULT 0,         -- Access 满分 ≥0
  python_full     REAL NOT NULL DEFAULT 0,         -- Python 满分 ≥0
  composite_full  REAL NOT NULL DEFAULT 0,         -- 综合题满分 ≥0
  total_full      REAL NOT NULL DEFAULT 0,         -- 试卷总满分 ≥0，= 五项分项之和
  pass_ratio      REAL NOT NULL DEFAULT 60,        -- 默认合格占比 0~100
  remark          TEXT NOT NULL DEFAULT '',        -- 备注
  created_at      TEXT NOT NULL DEFAULT '',        -- YYYY-MM-DD，列表/by-no 派生，不随表单写入
  updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_batches_batch_no ON paper_batches(batch_no);
CREATE INDEX IF NOT EXISTS idx_paper_batches_name ON paper_batches(batch_name);
`);

// 已存在的 scores 表补充 batch_no（试卷批号）字段：表建好后通过 ALTER 追加，避免重建
const hasBatchNo = db.prepare(
  "SELECT COUNT(*) AS c FROM pragma_table_info('scores') WHERE name = 'batch_no'",
).get().c;
if (!hasBatchNo) {
  db.exec("ALTER TABLE scores ADD COLUMN batch_no TEXT NOT NULL DEFAULT ''");
  console.log('[db] scores 表已新增 batch_no（试卷批号）字段');
}
// 试卷批号 + 姓名 唯一性辅助索引（列已确保存在后再创建）
db.exec('CREATE INDEX IF NOT EXISTS idx_scores_batch_name ON scores(batch_no, name)');

// scores 表补充 remark（备注）与 correction_score（二次订正分）字段
// remark：教师反馈/补充说明，空字符串表示无备注
// correction_score：二次订正后成绩，REAL 可空，NULL 表示未订正
const scoreCols = db.prepare(
  "SELECT COUNT(*) AS c FROM pragma_table_info('scores') WHERE name = ?",
);
if (!scoreCols.get('remark').c) {
  db.exec("ALTER TABLE scores ADD COLUMN remark TEXT NOT NULL DEFAULT ''");
  console.log('[db] scores 表已新增 remark（备注）字段');
}
if (!scoreCols.get('correction_score').c) {
  db.exec('ALTER TABLE scores ADD COLUMN correction_score REAL');
  console.log('[db] scores 表已新增 correction_score（二次订正分）字段');
}

// 存量试卷批号冷启动：为 scores 中已存在的批号补占位行（分项0/总0/占比60，batch_name 以批号兜底）
// 幂等：仅在该批号在 paper_batches 不存在时插入；多次启动 N 递减为 0，不再打印。
// 说明：此处直接内联 SQL，避免 db.js 在文件末尾 require paperBatch 造成的循环依赖。
const backfillBatchStmt = db.prepare(`
  INSERT INTO paper_batches (batch_no, batch_name, choice_full, spreadsheet_full,
    access_full, python_full, composite_full, total_full, pass_ratio, remark, created_at, updated_at)
  SELECT
    @batch_no, @batch_no, 0, 0, 0, 0, 0, 0, 60, '',
    COALESCE(
      (SELECT substr(submit_time,1,10) FROM scores WHERE batch_no = @batch_no AND submit_time != ''
       GROUP BY substr(submit_time,1,10) ORDER BY COUNT(*) DESC, substr(submit_time,1,10) ASC LIMIT 1),
      date('now','localtime')
    ),
    datetime('now','localtime')
  WHERE NOT EXISTS (SELECT 1 FROM paper_batches WHERE batch_no = @batch_no)
`);
const existingBatchNos = db.prepare("SELECT DISTINCT batch_no FROM scores WHERE batch_no != '' ORDER BY batch_no").all();
let backfilledCount = 0;
existingBatchNos.forEach(({ batch_no }) => {
  const before = db.prepare('SELECT COUNT(*) AS c FROM paper_batches WHERE batch_no = ?').get(batch_no).c;
  backfillBatchStmt.run({ batch_no });
  const after = db.prepare('SELECT COUNT(*) AS c FROM paper_batches WHERE batch_no = ?').get(batch_no).c;
  if (after > before) backfilledCount += 1;
});
if (backfilledCount > 0) console.log(`[db] 已回填 ${backfilledCount} 个存量批号占位行`);

module.exports = db;
