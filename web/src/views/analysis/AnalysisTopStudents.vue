<template>
  <div>
    <el-card class="page-card" shadow="never">
      <!-- 标题 + 判定条件 + 班级按钮组 -->
      <div class="header-row">
        <div class="page-title">
          <el-icon><Medal /></el-icon>
          <span>优生管理</span>
        </div>
        <div class="filter-group">
          <el-select v-model="subject" class="filter-select" @change="handleFilterChange">
            <el-option
              v-for="s in SUBJECT_OPTIONS"
              :key="s.value"
              :label="`优秀类别：${s.label}`"
              :value="s.value"
            />
          </el-select>
          <el-select v-model="ratio" class="filter-select filter-ratio" @change="handleFilterChange">
            <el-option
              v-for="r in RATIO_OPTIONS"
              :key="r.value"
              :label="`比例：${r.label}`"
              :value="r.value"
            />
          </el-select>
        </div>
        <el-radio-group
          v-if="classes.length"
          v-model="currentClass"
          class="class-group"
          @change="handleClassChange"
        >
          <el-radio-button v-for="c in classes" :key="c" :value="c">
            {{ c }}
          </el-radio-button>
        </el-radio-group>
      </div>

      <!-- 主体：左 = 优生名单矩阵（列=场次），右 = 姓名/优秀次数汇总 -->
      <div v-if="!loading && batches.length" class="board-wrap">
        <div class="matrix-panel">
          <el-table
            :data="matrixRows"
            border
            max-height="600"
            style="width: 100%"
            :cell-style="cellStyle"
          >
            <el-table-column width="80" align="center">
              <!-- 与批次列行数严格一致（含可选日期行），保证各行横向对齐 -->
              <template #header>
                <div class="th-row">&nbsp;</div>
                <div v-if="hasDateRow" class="th-row">&nbsp;</div>
                <div class="th-row">&nbsp;</div>
                <div class="th-row">序号</div>
              </template>
              <template #default="{ row }">{{ row.idx + 1 }}</template>
            </el-table-column>

            <!-- 试卷批次列：固定宽度 110px（不随内容/容器伸缩）；
                 class-name 用于精准压缩该列 .cell 的默认左右内边距，扩大内容可用宽度 -->
            <el-table-column
              v-for="(b, i) in batches"
              :key="b.batchNo"
              width="110"
              align="center"
              class-name="batch-col"
            >
              <!-- 四行表头：批次名 /（时间：x.x.x）/ 优秀率（满分）/ 场次编号 -->
              <template #header>
                <div class="th-row" :title="b.batchName">{{ b.batchName }}</div>
                <div v-if="hasDateRow" class="th-row" :title="dateLabel(b)">{{ dateLabel(b) }}</div>
                <div class="th-row" :title="rateLabel(b)">{{ rateLabel(b) }}</div>
                <div class="th-row">{{ i + 1 }}</div>
              </template>
              <template #default="{ row }">
                <!-- 该批次无优生：仅首行显示占位文案 -->
                <span v-if="!b.students.length && row.idx === 0" class="cell-placeholder">
                  暂无优秀学生
                </span>
                <!-- 单行紧凑展示：姓名 +（小字）分数与状态箭头，完整信息由 title 承载 -->
                <div
                  v-else-if="b.students[row.idx]"
                  class="stu-cell"
                  :title="cellTitle(b, b.students[row.idx])"
                >
                  <span class="stu-name">{{ b.students[row.idx].name }}</span>
                  <span class="stu-meta">
                    {{ b.students[row.idx].score }} 分<span
                      v-if="cellMarkText(b.students[row.idx])"
                      :class="['stu-arrow', cellMarkClass(b.students[row.idx])]"
                    >{{ cellMarkArrow(b.students[row.idx]) }}</span>
                  </span>
                </div>
                <span v-else class="cell-empty">—</span>
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 右侧：当前班级学生名单（含零达优学生，按优秀次数降序） -->
        <div class="summary-panel">
          <div class="summary-title">
            {{ currentClass }}（共{{ summary.classStudentCount }}人）
          </div>
          <el-table :data="rankRows" border max-height="600" size="small">
            <el-table-column prop="name" label="姓名" min-width="100" align="center" />
            <el-table-column label="优秀次数" width="96" align="center">
              <template #default="{ row }">
                <el-tag :type="excellentCountTagType(row.excellentCount)" size="small">
                  {{ row.excellentCount }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <!-- 图例 -->
      <div v-if="!loading && hasExcellentData" class="legend">
        <span class="legend-item"><i class="dot dot-stable" />持续优秀</span>
        <span class="legend-item"><i class="dot dot-new" />本次新进优秀</span>
        <span class="legend-item"><i class="dot dot-dropped" />后续掉出优秀</span>
      </div>

      <!-- 空状态：仅在无班级数据或无考试批次时出现（无人达优也正常展示全量名单） -->
      <el-empty
        v-if="!loading && (!classes.length || !batches.length)"
        :description="emptyText"
        style="padding: 40px 0"
      />
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Medal } from '@element-plus/icons-vue';
import { getAnalysisClasses, getTopStudentMatrix } from '../../api/analysis';

const classes = ref([]);
const currentClass = ref('');
const batches = ref([]);
const rows = ref([]);
const summary = ref({
  batchCount: 0, excellentStudentCount: 0, zeroExcellentCount: 0,
  totalExcellentRecords: 0, classStudentCount: 0,
});
const loading = ref(false);

// ---- 判定条件双下拉：类别 + 比例（与标题同行，切换即刷新矩阵）----
const SUBJECT_OPTIONS = [
  { value: 'total', label: '总成绩' },
  { value: 'choice', label: '选择题' },
  { value: 'spreadsheet', label: '电子表格' },
  { value: 'access', label: 'Access' },
  { value: 'python', label: 'Python' },
  { value: 'composite', label: '综合题' },
];
const RATIO_OPTIONS = [
  { value: 80, label: '80%' },
  { value: 85, label: '85%' },
  { value: 90, label: '90%' },
  { value: 100, label: '100%' },
];
const subject = ref('total'); // 默认总成绩
const ratio = ref(80);        // 默认 80%

/** 当前类别中文名（弹层内提示等展示用） */
const subjectLabel = computed(() => {
  const hit = SUBJECT_OPTIONS.find((s) => s.value === subject.value);
  return hit ? hit.label : '总成绩';
});

function handleFilterChange() {
  fetchMatrix(); // 切换类别/比例 → 按当前班级 + 新判定口径即时重取矩阵
}

// 是否存在优秀数据（决定图例显隐）
const hasExcellentData = computed(() => batches.value.some((b) => b.students && b.students.length));

// 行驱动：行数 = 各批次优生名单的最大长度（每列自上而下列出该批次达优学生）
const matrixRows = computed(() => {
  const max = batches.value.reduce(
    (m, b) => Math.max(m, (b.students && b.students.length) || 0),
    0,
  );
  return Array.from({ length: Math.max(max, 1) }, (_, i) => ({ idx: i }));
});

const emptyText = computed(() => {
  if (!classes.value.length) return '暂无成绩数据，请先在「学生成绩记录」中导入成绩';
  if (!batches.value.length) return `「${currentClass.value}」暂无考试批次数据`;
  return `「${currentClass.value}」暂无优秀记录`;
});

/**
 * 日期简写：2026-09-02 → 26.9.2（年取两位、月日去前导零）
 * 空值或格式不符返回空串，由调用方决定是否拼接。
 */
function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const m = String(dateStr).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return `${y.slice(-2)}.${Number(mo)}.${Number(d)}`;
}

/** 日期行：（时间：26.9.3）；日期缺失返回空串（行由 hasDateRow 统一控制显隐） */
function dateLabel(b) {
  const d = formatShortDate(b.examDate);
  return d ? `（时间：${d}）` : '';
}

/** 优秀率行：25.81%（100）；当前口径满分缺失或为 0（该科未配置批次）则省略括号部分
 *  括号内为「当前判定口径」的满分：总成绩口径=总满分，单科口径=该科满分 */
function rateLabel(b) {
  const full = Number(b.subjectFull);
  if (!b.subjectFull || !Number.isFinite(full) || full <= 0) return `${b.excellentRate}%`;
  return `${b.excellentRate}%（${full}）`;
}

// 是否存在任一批次带日期：决定「时间」行是否渲染（保证各列行数一致、不错位）
const hasDateRow = computed(() => batches.value.some((b) => !!formatShortDate(b.examDate)));

/** 三态文案（悬浮展示）：dropped 时补全被收敛掉的次要状态 */
function cellMarkText(cell) {
  const base = { stable: '持续优秀 ✓', new: '本次新进 ↗', dropped: '后续掉出 ↓' }[cell.status] || '';
  if (cell.status === 'dropped') {
    return cell.prevExcellent ? `${base}（此前已持续优秀）` : `${base}（首次达优）`;
  }
  return base;
}

/** 状态箭头（单行紧凑展示用）：持续优秀 ✓ / 本次新进 ↗ / 后续掉出 ↓ */
function cellMarkArrow(cell) {
  if (cell.status === 'stable') return '✓';
  if (cell.status === 'new') return '↗';
  if (cell.status === 'dropped') return '↓';
  return '';
}

function cellMarkClass(cell) {
  return {
    'mark-stable': cell.status === 'stable',
    'mark-new': cell.status === 'new',
    'mark-dropped': cell.status === 'dropped',
  };
}

/**
 * 单元格完整信息（悬浮展示）：姓名 + 分数 + 满分/优秀线 + 状态文案，
 * 保证单行紧凑后状态语义不丢失。
 */
function cellTitle(b, cell) {
  const parts = [cell.name, `${cell.score} 分`];
  // 满分/优秀线按当前判定口径展示（subjectFull=当前口径满分，未配置则省略）
  if (b && b.subjectFull > 0) parts.push(`（满分 ${b.subjectFull}，优秀 ${b.excellentLine}）`);
  const mark = cellMarkText(cell);
  if (mark) parts.push(mark);
  return parts.join(' ');
}

// 参考图为白底黑字名单，状态通过文字标记而非整格底色区分
function cellStyle() {
  return { background: '#ffffff' };
}

// 右侧名单：全部学生（含零达优），后端已按优秀次数降序、同次数按姓名升序排好
const rankRows = computed(() => rows.value);

// 次数标签配色：≥2 绿（稳定优生）、1 橙、0 灰
function excellentCountTagType(n) {
  if (n >= 2) return 'success';
  if (n === 1) return 'warning';
  return 'info';
}

async function fetchClasses() {
  try {
    const res = await getAnalysisClasses();
    classes.value = res.data?.classes || [];
    if (classes.value.length) {
      currentClass.value = classes.value[0]; // 默认选中第一个班级
      fetchMatrix();
    }
  } catch (e) {
    ElMessage.error('班级列表加载失败');
  }
}

async function fetchMatrix() {
  if (!currentClass.value) return;
  loading.value = true;
  try {
    const res = await getTopStudentMatrix(currentClass.value, subject.value, ratio.value);
    const data = res.data || {};
    batches.value = data.batches || [];
    rows.value = data.rows || [];
    summary.value = data.summary || {
      batchCount: 0, excellentStudentCount: 0, zeroExcellentCount: 0,
      totalExcellentRecords: 0, classStudentCount: 0,
    };
  } catch (e) {
    ElMessage.error('优生数据加载失败');
    batches.value = [];
    rows.value = [];
  } finally {
    loading.value = false;
  }
}

function handleClassChange() {
  fetchMatrix(); // 切换班级时数据同步刷新
}

onMounted(fetchClasses);
</script>

<style scoped>
.header-row {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 16px;
}

/* 判定条件双下拉：与标题同行、紧凑间距（两个下拉框协调并排，风格与页面一致） */
.filter-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-select {
  width: 185px;
}

.filter-ratio {
  width: 175px;
}

.class-group {
  margin-left: 4px;
}

/* 表头各行统一表现：同一类名、无背景、统一字号与粗细；
   允许换行（长批次名折行显示，不截断），靠 break-word 在连字符/词边界断行 */
.th-row {
  font-size: 12px;
  font-weight: 400;
  color: #606266;
  line-height: 1.5;
  text-align: center;
  white-space: normal;
  overflow-wrap: break-word;
  word-break: break-word;
  background: transparent;
}

/* 左矩阵 + 右汇总 并排 */
.board-wrap {
  display: flex;
  gap: 16px;
  margin-top: 12px;
  align-items: flex-start;
}

.matrix-panel {
  flex: 1;
  min-width: 0;
}

.summary-panel {
  width: 240px;
  flex-shrink: 0;
}

.summary-title {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
  margin-bottom: 8px;
  text-align: center;
}

/* 仅压缩「试卷批次」列：Element Plus 单元格内容层 .cell 默认左右各 12px 内边距，
   与列内 padding 叠加后可用宽度过窄导致姓名被省略号截断。
   这里通过列级 class-name 精准覆盖（不影响序号列与其他表格），
   表头与数据单元格同时生效，保证上下对齐一致。 */
.matrix-panel :deep(.batch-col .cell) {
  padding-left: 2px;
  padding-right: 2px;
}

/* 单元格：单行紧凑（姓名 + 小字分数/状态箭头），行高与内边距已压缩 */
.stu-cell {
  display: flex;
  flex-direction: row;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  padding: 2px 2px;
  line-height: 1.3;
  background: #ffffff;
  width: 100%;
  overflow: hidden;
}

.stu-name {
  font-size: 13px;
  color: #303133;
  font-weight: 600;
  line-height: 1.3;
  white-space: nowrap;
  /* 极端长姓名时可收缩并省略，保证分数与箭头不被挤掉 */
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 次要信息：分数 + 状态箭头，字号明显小于姓名且不参与收缩 */
.stu-meta {
  flex: 0 0 auto;
  white-space: nowrap;
  font-size: 11px;
  color: #909399;
  line-height: 1.3;
}

.stu-arrow {
  margin-left: 1px;
  font-size: 11px;
}

/* 状态箭头配色：绿色=持续优秀，蓝色=本次新进，橙色=后续掉出（语义与图例一致） */
.mark-stable {
  color: #529b2e;
}

.mark-new {
  color: #409eff;
}

.mark-dropped {
  color: #b88230;
}

.cell-placeholder {
  color: #c0c4cc;
  font-size: 12px;
}

.cell-empty {
  color: #c0c4cc;
}

.legend {
  margin-top: 12px;
  display: flex;
  gap: 14px;
  font-size: 12px;
  color: #606266;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  display: inline-block;
}

.dot-stable {
  background: #e1f3d8;
  border: 1px solid #67c23a;
}

.dot-new {
  background: #d9ecff;
  border: 1px solid #409eff;
}

.dot-dropped {
  background: #fdf6ec;
  border: 1px solid #e6a23c;
}
</style>
