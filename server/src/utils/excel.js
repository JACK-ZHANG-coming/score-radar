const XLSX = require('xlsx');

/** 修复 GBK 双重编码乱码：如 "ÐòºÅ" → "序号"（仅处理含 Latin-1 高位字符的字符串） */
const gbkDecoder = new TextDecoder('gbk');
function fixEncoding(value) {
  if (typeof value !== 'string') return value;
  if (!/[\u0080-\u00ff]/.test(value)) return value;
  try {
    const fixed = gbkDecoder.decode(Buffer.from(value, 'latin1'));
    if (!fixed.includes('\uFFFD')) return fixed;
  } catch { /* ignore */ }
  return value;
}

/** 考生名单模板字段（与用户上传的 考生名单.xlsx 一致） */
const STUDENT_HEADERS = ['考号', '姓名', '班级', '年级', '学校'];

/** 学生成绩记录模板字段（与用户上传的 学生成绩记录.xlsx 一致） */
const SCORE_HEADERS = [
  '序号', '考号', '姓名', '学校', '班级', '考试状态', '交卷时间',
  '选择题', '电子表格', 'Access', 'Python', '综合题', '总成绩',
];

/** 试卷批次模板字段（13 列，含只读列「计算得出合格线」「创建时间」，导入时忽略这两列） */
const PAPER_BATCH_HEADERS = [
  '序号', '试卷批号', '试卷批次名称', '选择题满分', '电子表格满分', 'Access满分', 'Python满分',
  '综合题满分', '试卷总满分', '默认合格占比(%)', '计算得出合格线', '备注', '创建时间',
];

/** 生成 Excel 模板 Buffer（首个工作表 + 表头 + 一行示例） */
function buildTemplate(headers, sampleRow) {
  const wb = XLSX.utils.book_new();
  const data = [headers, sampleRow].filter(Boolean);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(10, String(h).length * 2 + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/** 解析上传的 Excel（.xlsx/.xls）首个工作表为对象数组，key 为表头文本（自动修复 GBK 乱码） */
function parseSheet(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const first = wb.SheetNames[0];
  if (!first) throw new Error('Excel 中没有工作表');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[first], { defval: '' });
  return rows.map((row) => {
    const fixed = {};
    for (const [k, v] of Object.entries(row)) {
      fixed[fixEncoding(k)] = typeof v === 'string' ? fixEncoding(v) : v;
    }
    return fixed;
  });
}

/** 检查必需表头是否齐全，返回缺失列表 */
function missingHeaders(headers, required) {
  const set = new Set(headers.map((h) => String(h).trim()));
  return required.filter((r) => !set.has(r));
}

/**
 * 规范化时间为 YYYY-MM-DD HH:mm（空值返回 ''，解析失败原样返回字符串，绝不伪造日期）：
 * - 数字（Excel 序列号）走 SSF.parse_date_code；
 * - 字符串支持 YYYY[-/.年]M[月]D[日]、可选中文星期中缀（星期一~星期日/周一~周日/礼拜一~礼拜日）、
 *   日期与时间以任意空白或 T 分隔、时间 HH:mm(:ss) 秒丢弃、无时间部分补 00:00；
 * - 月/日/时/分越界视为无效，原样返回。示例：2026/9/16 星期三 11:34:37 → 2026-09-16 11:34
 */
function normalizeTime(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  const p = (n) => String(n).padStart(2, '0');
  // Excel 序列号时间戳
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) {
      return `${d.y}-${p(d.m)}-${p(d.d)} ${p(d.H)}:${p(d.M)}`;
    }
  }
  // 剥掉可选中文星期中缀，支持 YYYY[-/.年]M[-/.月]D[日]，日期与时间以空白/T 分隔（示例：2026/9/16 星期三 11:34:37）
  const m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:\s*(?:星期|周|礼拜)[一二三四五六日天]?\s*)?(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = m[4] === undefined ? 0 : Number(m[4]);
    const minute = m[5] === undefined ? 0 : Number(m[5]);
    // 越界视为无效，原样返回（不伪造日期）
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const daysInMonth = [31, isLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const valid = month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]
      && hour <= 23 && minute <= 59;
    if (!valid) return s;
    const hm = m[4] ? ` ${p(hour)}:${p(minute)}` : ' 00:00';
    return `${m[1]}-${p(month)}-${p(day)}${hm}`;
  }
  return s;
}

function toNum(value) {
  const n = Number(String(value ?? '').trim());
  return Number.isFinite(n) ? n : 0;
}

function toStr(value) {
  return String(value ?? '').trim();
}

module.exports = {
  STUDENT_HEADERS,
  SCORE_HEADERS,
  PAPER_BATCH_HEADERS,
  buildTemplate,
  parseSheet,
  missingHeaders,
  normalizeTime,
  toNum,
  toStr,
};
