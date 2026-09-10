const db = require('../db');

/**
 * 计算合格线（运行时，不落库）：ROUND(totalFull * passRatio / 100, 2)
 * 保留两位小数，避免浮点误差。
 */
function computedPassLine(totalFull, passRatio) {
  const t = Number(totalFull) || 0;
  const r = Number(passRatio) || 0;
  return Math.round((t * r) / 100 * 100) / 100;
}

/**
 * 派生 created_at：取该批号下 scores.submit_time 出现最多的日期（众数），格式 YYYY-MM-DD；
 * 若无任何成绩记录，取当天 date('now','localtime')。
 */
const getCreatedAtMode = db.prepare(`
  SELECT substr(submit_time, 1, 10) AS d, COUNT(*) AS c
  FROM scores
  WHERE batch_no = ? AND submit_time != ''
  GROUP BY d
  ORDER BY c DESC, d ASC
  LIMIT 1
`);
const getToday = db.prepare("SELECT date('now', 'localtime') AS d");

function deriveCreatedAt(batchNo) {
  if (!batchNo) return '';
  const row = getCreatedAtMode.get(batchNo);
  if (row && row.d) return row.d;
  return getToday.get().d;
}

/**
 * 确保某试卷批号在 paper_batches 中存在占位行（幂等）。
 * 仅当该批号不存在时插入一条占位行：分项满分0/总满分0/占比默认60/batch_name 以批号兜底。
 * created_at 走派生口径（有成绩取众数，无则当天）。
 * 空批号（''/null/undefined）不补占位。多次调用因 NOT EXISTS 幂等，零副作用。
 */
const ensureStmt = db.prepare(`
  INSERT INTO paper_batches (batch_no, batch_name, choice_full, spreadsheet_full,
    access_full, python_full, composite_full, total_full, pass_ratio, remark, created_at, updated_at)
  SELECT
    @batch_no, @batch_no, 0, 0, 0, 0, 0, 0, 60, '',
    COALESCE(
      (SELECT substr(submit_time, 1, 10) FROM scores WHERE batch_no = @batch_no AND submit_time != ''
       GROUP BY substr(submit_time, 1, 10) ORDER BY COUNT(*) DESC, substr(submit_time, 1, 10) ASC LIMIT 1),
      date('now', 'localtime')
    ),
    datetime('now', 'localtime')
  WHERE NOT EXISTS (SELECT 1 FROM paper_batches WHERE batch_no = @batch_no)
`);

function ensurePaperBatch(batchNo) {
  if (batchNo === null || batchNo === undefined) return;
  const bn = String(batchNo).trim();
  if (!bn) return;
  ensureStmt.run({ batch_no: bn });
}

module.exports = { ensurePaperBatch, computedPassLine, deriveCreatedAt };
