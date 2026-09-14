<template>
  <div>
    <el-card class="page-card" shadow="never">
      <!-- 标题 + 班级按钮组 -->
      <div class="header-row">
        <div class="page-title">
          <el-icon><WarningFilled /></el-icon>
          <span>不及格管理</span>
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

      <!-- 主体：左 = 不及格名单矩阵（列=场次），右 = 姓名/不及格次数汇总 -->
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
              <!-- 四行表头：批次名 /（时间：x.x.x）/ 不及格率（总分）/ 场次编号 -->
              <template #header>
                <div class="th-row" :title="b.batchName">{{ b.batchName }}</div>
                <div v-if="hasDateRow" class="th-row" :title="dateLabel(b)">{{ dateLabel(b) }}</div>
                <div class="th-row" :title="rateLabel(b)">{{ rateLabel(b) }}</div>
                <div class="th-row">{{ i + 1 }}</div>
              </template>
              <template #default="{ row }">
                <!-- 该批次无不及格学生：仅首行显示占位文案 -->
                <span v-if="!b.students.length && row.idx === 0" class="cell-placeholder">
                  暂无不及格学生
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

        <!-- 右侧：当前班级学生名单（含零不及格学生，按不及格次数降序） -->
        <div class="summary-panel">
          <div class="summary-title">
            {{ currentClass }}（共{{ summary.classStudentCount }}人）
          </div>
          <el-table :data="rankRows" border max-height="600" size="small">
            <el-table-column prop="name" label="姓名" min-width="100" align="center" />
            <el-table-column label="不及格次数" width="96" align="center">
              <template #default="{ row }">
                <el-tag :type="failCountTagType(row.failCount)" size="small">
                  {{ row.failCount }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>

      <!-- 图例 -->
      <div v-if="!loading && hasFailData" class="legend">
        <span class="legend-item"><i class="dot dot-fail" />未处理</span>
        <span class="legend-item"><i class="dot dot-corrected" />已订正通过</span>
        <span class="legend-item"><i class="dot dot-later" />后续已及格</span>
      </div>

      <!-- 空状态：仅在无班级数据或无考试批次时出现（无人不及格也正常展示全量名单） -->
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
import { WarningFilled } from '@element-plus/icons-vue';
import { getAnalysisClasses, getFailureMatrix } from '../../api/analysis';

const classes = ref([]);
const currentClass = ref('');
const batches = ref([]);
const rows = ref([]);
const summary = ref({ batchCount: 0, failStudentCount: 0, totalFailRecords: 0, classStudentCount: 0 });
const loading = ref(false);

// 是否存在不及格数据（决定空状态）
const hasFailData = computed(() => batches.value.some((b) => b.students && b.students.length));

// 行驱动：行数 = 各批次不及格名单的最大长度（每列自上而下列出该批次不及格学生）
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
  return `「${currentClass.value}」暂无不及格记录`;
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

/** 不及格率行：66.13%（20）；总分缺失或为 0（未配置批次）则省略括号部分 */
function rateLabel(b) {
  const full = Number(b.totalFull);
  if (!b.totalFull || !Number.isFinite(full) || full <= 0) return `${b.failRate}%`;
  return `${b.failRate}%（${full}）`;
}

// 是否存在任一批次带日期：决定「时间」行是否渲染（保证各列行数一致、不错位）
const hasDateRow = computed(() => batches.value.some((b) => !!formatShortDate(b.examDate)));

function cellClass(cell) {
  return {
    'is-fail': cell.status === 'fail',
    'is-corrected': cell.status === 'corrected',
    'is-later': cell.status === 'laterPass',
  };
}

function cellMarkText(cell) {
  if (cell.status === 'corrected') return `订正 ${cell.correctionScore} ✓`;
  if (cell.status === 'laterPass') return '后及格 ↗';
  return '';
}

/** 状态箭头（单行紧凑展示用）：后续已及格 ↗ / 已订正通过 ✓ */
function cellMarkArrow(cell) {
  if (cell.status === 'corrected') return '✓';
  if (cell.status === 'laterPass') return '↗';
  return '';
}

/**
 * 单元格完整信息（悬浮展示）：姓名 + 分数 + 满分/及格线 + 状态文案，
 * 保证单行紧凑后状态语义不丢失。
 */
function cellTitle(b, cell) {
  const parts = [cell.name, `${cell.score} 分`];
  if (b && b.totalFull > 0) parts.push(`（满分 ${b.totalFull}，及格 ${b.passLine}）`);
  const mark = cellMarkText(cell);
  if (mark) parts.push(mark);
  return parts.join(' ');
}

function cellMarkClass(cell) {
  return {
    'mark-corrected': cell.status === 'corrected',
    'mark-later': cell.status === 'laterPass',
  };
}

// 参考图为白底黑字名单，状态通过文字标记而非整格底色区分
function cellStyle() {
  return { background: '#ffffff' };
}

// 右侧名单：全部学生（含零不及格），后端已按不及格次数降序、同次数按姓名升序排好
const rankRows = computed(() => rows.value);

// 次数标签配色：≥2 红、1 橙、0 灰
function failCountTagType(n) {
  if (n >= 2) return 'danger';
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
    const res = await getFailureMatrix(currentClass.value);
    const data = res.data || {};
    batches.value = data.batches || [];
    rows.value = data.rows || [];
    summary.value = data.summary || {
      batchCount: 0, failStudentCount: 0, zeroFailCount: 0, totalFailRecords: 0, classStudentCount: 0,
    };
  } catch (e) {
    ElMessage.error('不及格数据加载失败');
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

/* 状态箭头配色：绿色=已订正通过，橙色=后续已及格（语义与图例一致） */
.mark-corrected {
  color: #529b2e;
}

.mark-later {
  color: #b88230;
}

.mark-corrected {
  color: #529b2e;
}

.mark-later {
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

.dot-fail {
  background: #fde2e2;
  border: 1px solid #f56c6c;
}

.dot-corrected {
  background: #e1f3d8;
  border: 1px solid #67c23a;
}

.dot-later {
  background: #fdf6ec;
  border: 1px solid #e6a23c;
}
</style>
