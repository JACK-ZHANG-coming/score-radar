const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const { computedPassLine } = require('../utils/paperBatch');

const router = express.Router();

/**
 * 班级名排序键：提取前导数字参与数值排序（5班 < 7班 < 16班），
 * 无数字的班级名排在末尾并按本地字符串序兜底。
 */
function classSortKey(name) {
  const m = String(name).match(/\d+/);
  return m ? { hasNum: true, num: parseInt(m[0], 10) } : { hasNum: false, num: Number.MAX_SAFE_INTEGER };
}

function compareClass(a, b) {
  const ka = classSortKey(a);
  const kb = classSortKey(b);
  if (ka.hasNum && kb.hasNum && ka.num !== kb.num) return ka.num - kb.num;
  if (ka.hasNum !== kb.hasNum) return ka.hasNum ? -1 : 1;
  return String(a).localeCompare(String(b), 'zh-Hans-CN');
}

/**
 * 班级人数统计（覆盖全部学生，含「零不及格」学生，不做任何过滤）：
 * - studentCount    该班级出现的全部学生数（按姓名去重）
 * - failStudentCount 存在不及格记录的学生数（已配置批次 total < 合格线）
 * - zeroFailCount   从未不及格的学生数 = studentCount - failStudentCount
 * 即使某班无人不及格（failStudentCount = 0），该班仍会完整返回，不遗漏。
 */
function computeClassStats(clazz) {
  const scoreRows = getScoresOfClass.all(clazz);
  const cfgMap = new Map();
  getBatchesOfClass.all(clazz).forEach((b) => cfgMap.set(b.batchNo, b));

  const allNames = new Set();
  const failNames = new Set();
  scoreRows.forEach((r) => {
    allNames.add(r.name);
    const cfg = cfgMap.get(r.batchNo);
    if (!cfg || !(cfg.totalFull > 0)) return; // 未配置批次（占位行）跳过合格判定
    if (r.total < computedPassLine(cfg.totalFull, cfg.passRatio)) failNames.add(r.name);
  });

  return {
    clazz,
    studentCount: allNames.size,
    failStudentCount: failNames.size,
    zeroFailCount: allNames.size - failNames.size,
  };
}

/** GET /api/analysis/classes  成绩数据中出现的全部班级（去重 + 排序）+ 各班人数统计
 *  返回：classes（班级名数组，供按钮组使用）、stats（各班人数/零不及格人数）
 */
router.get('/classes', authRequired, (req, res) => {
  const rows = db.prepare("SELECT DISTINCT class FROM scores WHERE class != ''").all();
  const classes = rows.map((r) => r.class).sort(compareClass);
  // 逐班统计：全部列出，不因「无不及格记录」而跳过
  const stats = classes.map((clazz) => computeClassStats(clazz));
  res.json({ code: 0, data: { classes, stats } });
});

/**
 * 取某班级涉及的考试批次（来自成绩数据，非全量批次表），按考试日期升序。
 * 排序口径：created_at（交卷日期众数派生）→ 该批次最早交卷日期 → 批号兜底。
 * 返回全部涉及批次：configured（当前判定口径的满分 > 0）用于合格判定；未配置批次单独标记。
 */
const getBatchesOfClass = db.prepare(`
  SELECT
    p.batch_no       AS batchNo,
    p.batch_name     AS batchName,
    p.total_full     AS totalFull,
    p.choice_full     AS choiceFull,
    p.spreadsheet_full AS spreadsheetFull,
    p.access_full     AS accessFull,
    p.python_full     AS pythonFull,
    p.composite_full  AS compositeFull,
    p.pass_ratio     AS passRatio,
    p.created_at     AS createdAt,
    (SELECT COUNT(*) FROM scores s WHERE s.batch_no = p.batch_no) AS studentCount,
    (SELECT MIN(substr(s.submit_time, 1, 10)) FROM scores s
       WHERE s.batch_no = p.batch_no AND s.submit_time != '') AS firstDate
  FROM paper_batches p
  WHERE p.batch_no IN (SELECT DISTINCT batch_no FROM scores WHERE class = ? AND batch_no != '')
`);

/** 取某班级全部成绩记录（含五科分数与订正分；订正分=总成绩订正 correction_total） */
const getScoresOfClass = db.prepare(`
  SELECT name, exam_no AS examNo, batch_no AS batchNo, total,
         choice, spreadsheet, access, python, composite,
         correction_total AS correctionScore, submit_time AS submitTime
  FROM scores
  WHERE class = ? AND batch_no != ''
`);

/**
 * 不及格判定口径（页面「不及格类别」下拉）：
 * scoreCol = scores 成绩列；fullCol = paper_batches 满分列。
 * 单科口径下批次「已配置」= 该科满分 > 0（其余科目的配置不参与）。
 */
const SUBJECTS = {
  total:       { label: '总成绩',   scoreKey: 'total',      fullKey: 'totalFull' },
  choice:      { label: '选择题',   scoreKey: 'choice',     fullKey: 'choiceFull' },
  spreadsheet: { label: '电子表格', scoreKey: 'spreadsheet', fullKey: 'spreadsheetFull' },
  access:      { label: 'Access',   scoreKey: 'access',     fullKey: 'accessFull' },
  python:      { label: 'Python',   scoreKey: 'python',     fullKey: 'pythonFull' },
  composite:   { label: '综合题',   scoreKey: 'composite',  fullKey: 'compositeFull' },
};

/**
 * GET /api/analysis/failures  某班级的「不及格追踪矩阵」
 * query: class（必填）、subject（不及格类别：total/choice/spreadsheet/access/python/composite，默认 total）
 *        ratio（不及格比例判定：页面下拉 60/70/80，后端宽容接收 0<x<=100 的数，非法回退 60）
 * 行 = 学生，列 = 考试批次（按时间先后升序），单元格 = 不及格记录
 * 判定口径：所选科目得分 < ROUND(该科目满分 × ratio / 100, 2)；该科满分 = 0（未配置）跳过判定。
 * 单元格状态：
 *   corrected  已二次订正通过（仅总成绩口径判定：correction_score >= 合格线）
 *   laterPass  该生在后续批次中该科目已及格
 *   fail       仍未处理
 */
router.get('/failures', authRequired, (req, res) => {
  const clazz = String(req.query.class || '').trim();
  if (!clazz) return res.status(400).json({ code: 400, message: '班级参数不能为空' });

  // 判定口径参数（非法值回退默认，不报错：等效于「总成绩 + 60%」）
  const subjectKeyRaw = String(req.query.subject || 'total');
  const subj = SUBJECTS[subjectKeyRaw] || SUBJECTS.total;
  const subjectKey = subj === SUBJECTS[subjectKeyRaw] ? subjectKeyRaw : 'total'; // 解析后的实际口径（回显用）
  const ratioRaw = Number(req.query.ratio);
  const ratio = (Number.isFinite(ratioRaw) && ratioRaw > 0 && ratioRaw <= 100) ? ratioRaw : 60;

  // 1) 批次：按考试日期升序（严格时间先后）
  const batchRows = getBatchesOfClass.all(clazz);
  const batches = batchRows
    .map((b) => {
      // 当前口径的满分/及格线：单科口径取该科满分，总成绩口径取总满分
      const subjectFull = Number(b[subj.fullKey]) || 0;
      const passLine = computedPassLine(subjectFull, ratio);
      return {
        batchNo: b.batchNo,
        batchName: b.batchName || b.batchNo,
        totalFull: b.totalFull,
        subjectFull, // 当前判定口径的满分（单元格悬浮与表头展示用）
        passLine,    // 当前判定口径的及格线
        configured: subjectFull > 0,
        examDate: b.createdAt || b.firstDate || '',
        studentCount: b.studentCount,
        // 排序键：日期优先，日期缺失排最后，同日期按批号
        _sortDate: b.createdAt || b.firstDate || '9999-12-31',
      };
    })
    .sort((a, b) => (a._sortDate === b._sortDate
      ? a.batchNo.localeCompare(b.batchNo)
      : a._sortDate.localeCompare(b._sortDate)));

  // 批次序号映射（用于「后续批次」判定，严格遵循时间序）
  const orderOf = new Map();
  batches.forEach((b, i) => orderOf.set(b.batchNo, i));
  const batchMap = new Map(batches.map((b) => [b.batchNo, b]));

  // 2) 成绩：按学生归集
  const scoreRows = getScoresOfClass.all(clazz);
  const byStudent = new Map();
  scoreRows.forEach((r) => {
    const idx = orderOf.get(r.batchNo);
    if (idx === undefined) return; // 该批次不在本班级批次列表中（理论上不会）
    if (!byStudent.has(r.name)) byStudent.set(r.name, { name: r.name, examNo: r.examNo, records: [] });
    const stu = byStudent.get(r.name);
    if (r.examNo && !stu.examNo) stu.examNo = r.examNo;
    const cfg = batchMap.get(r.batchNo);
    const score = Number(r[subj.scoreKey]) || 0; // 当前口径的得分
    const passLine = cfg ? cfg.passLine : 0;
    stu.records.push({
      order: idx,
      batchNo: r.batchNo,
      score, // 当前口径得分（单元格展示）
      passLine,
      configured: cfg ? cfg.configured : false,
      correctionScore: subjectKey === 'total' && r.correctionScore !== undefined
        ? r.correctionScore : null, // 订正分语义为总成绩订正，单科口径不参与判定
      passed: cfg && cfg.configured ? score >= passLine : null,
      submitTime: r.submitTime,
    });
  });

  // 3) 组装名单行：包含该班全部学生（含零不及格学生，failCount = 0），不做过滤
  const rows = [];
  byStudent.forEach((stu) => {
    const failRecords = stu.records.filter((r) => r.configured && r.passed === false);

    const cells = {};
    let correctedCount = 0;
    let laterPassCount = 0;
    failRecords.forEach((r) => {
      // 订正通过：存在订正分且达到合格线
      const corrected = r.correctionScore !== null && r.correctionScore !== undefined
        && r.correctionScore !== '' && Number(r.correctionScore) >= r.passLine;
      // 后续及格：该生在更晚的批次中存在及格记录
      const laterPass = !corrected && stu.records.some(
        (o) => o.order > r.order && o.passed === true,
      );
      if (corrected) correctedCount += 1;
      else if (laterPass) laterPassCount += 1;
      cells[r.batchNo] = {
        score: r.score,
        passLine: r.passLine,
        correctionScore: corrected ? Number(r.correctionScore) : null,
        status: corrected ? 'corrected' : (laterPass ? 'laterPass' : 'fail'),
      };
    });

    rows.push({
      name: stu.name,
      examNo: stu.examNo || '',
      failCount: failRecords.length,
      correctedCount,
      laterPassCount,
      pendingCount: failRecords.length - correctedCount - laterPassCount,
      // 该生全部不及格成绩（按批次时间序），供姓名后小字展示
      failScores: failRecords
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((r) => ({ batchNo: r.batchNo, score: r.score })),
      cells,
    });
  });

  // 排序：不及格次数降序（次数最多的在前，0 次排在最后），同次数按姓名升序
  rows.sort((a, b) => (b.failCount - a.failCount) || a.name.localeCompare(b.name, 'zh-Hans-CN'));

  // 4) 汇总信息 + 按批次聚合不及格学生名单
  //    关联关系：scores.class + scores.batch_no → paper_batches（取当前判定口径科目的满分）
  //    及格线判定：passLine = ROUND(科目满分 × ratio / 100, 2)，不及格 = 科目得分 < passLine
  //    （仅对该科满分 > 0 的批次生效；该科未配置的批次跳过判定）
  // rows 已含零不及格学生，故「不及格人数」需按 failCount > 0 单独统计
  const failStudentCount = rows.filter((r) => r.failCount > 0).length;
  const zeroFailCount = rows.length - failStudentCount;
  const totalFailRecords = rows.reduce((sum, r) => sum + r.failCount, 0);
  batches.forEach((b) => {
    // 该批次下全部不及格学生：从矩阵行中按 cell 反查，分数升序（低的更需要关注）、同分按姓名
    const students = [];
    rows.forEach((r) => {
      const cell = r.cells[b.batchNo];
      if (!cell) return;
      students.push({
        name: r.name,
        examNo: r.examNo || '',
        score: cell.score,
        status: cell.status,
        correctionScore: cell.correctionScore,
      });
    });
    students.sort((x, y) => (x.score - y.score) || x.name.localeCompare(y.name, 'zh-Hans-CN'));
    b.students = students;
    b.failCount = students.length;
    b.failRate = b.studentCount > 0
      ? Math.round((b.failCount / b.studentCount) * 10000) / 100
      : 0;
    delete b._sortDate;
  });

  res.json({
    code: 0,
    data: {
      clazz,
      subject: subjectKey,   // 回显当前判定口径（前端下拉同步用）
      subjectLabel: subj.label,
      ratio,                 // 回显当前比例（%）
      batches,
      rows,
      summary: {
        batchCount: batches.length,
        failStudentCount,
        zeroFailCount,
        totalFailRecords,
        classStudentCount: new Set(scoreRows.map((r) => r.name)).size,
      },
    },
  });
});

module.exports = router;
