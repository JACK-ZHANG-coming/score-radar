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

/** 规范化时间：2026-9-1 15:38 → 2026-09-01 15:38（空值返回 ''） */
function normalizeTime(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  // Excel 序列号时间戳
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) {
      const p = (n) => String(n).padStart(2, '0');
      return `${d.y}-${p(d.m)}-${p(d.d)} ${p(d.H)}:${p(d.M)}`;
    }
  }
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (m) {
    const p = (n) => String(n).padStart(2, '0');
    const hm = m[4] ? ` ${p(m[4])}:${p(m[5])}` : ' 00:00';
    return `${m[1]}-${p(m[2])}-${p(m[3])}${hm}`;
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
  buildTemplate,
  parseSheet,
  missingHeaders,
  normalizeTime,
  toNum,
  toStr,
};
