<template>
  <div>
    <!-- 多条件搜索区 -->
    <el-card class="page-card" shadow="never">
      <el-form :model="query" inline label-width="80px" @submit.prevent>
        <el-form-item label="学生姓名">
          <el-input
            v-model="query.name"
            placeholder="支持模糊搜索"
            clearable
            style="width: 180px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="试卷批号">
          <el-select
            v-model="query.batchNo"
            placeholder="全部批号"
            clearable
            filterable
            style="width: 200px"
            :no-data-text="query.clazz ? '该班级下暂无试卷批号' : '暂无试卷批号'"
          >
            <el-option
              v-for="b in batchNos"
              :key="b.batchNo"
              :label="b.batchName ? `${b.batchNo}（${b.batchName}）` : b.batchNo"
              :value="b.batchNo"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="班级">
          <el-select
            v-model="query.clazz"
            placeholder="全部班级"
            clearable
            filterable
            style="width: 140px"
          >
            <el-option v-for="c in options.classes" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="考试状态">
          <el-select v-model="query.status" placeholder="全部状态" clearable style="width: 130px">
            <el-option v-for="s in options.statuses" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="考试时间">
          <el-date-picker
            v-model="timeRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            value-format="YYYY-MM-DD HH:mm"
            style="width: 340px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 列表区 -->
    <el-card shadow="never">
      <div class="toolbar">
        <div>
          <el-button type="primary" :icon="Plus" @click="openDialog()">新增成绩</el-button>
          <el-button type="success" :icon="Upload" @click="importVisible = true">Excel 导入</el-button>
          <el-button :icon="Download" @click="handleDownloadTemplate">下载导入模板</el-button>
          <el-button type="warning" :icon="RefreshRight" :loading="syncing" @click="handleSyncStudents">同步学生信息</el-button>
          <el-button type="danger" :icon="Delete" :loading="batchDeleting" :disabled="!selectedRows.length" @click="handleBatchDelete">
            批量删除{{ selectedRows.length ? `(${selectedRows.length})` : '' }}
          </el-button>
        </div>
        <div class="toolbar-actions">
          <el-button :icon="Setting" @click="openColumnDialog">列设置</el-button>
          <el-tag type="info">共 {{ total }} 条记录</el-tag>
        </div>
      </div>

      <el-table
        ref="tableRef"
        :data="list"
        v-loading="loading"
        border
        stripe
        style="width: 100%; margin-top: 12px"
        @sort-change="handleSortChange"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="50" align="center" fixed="left" />
        <el-table-column label="序号" width="70" align="center">
          <template #default="{ $index }">
            {{ (pagination.page - 1) * pagination.pageSize + $index + 1 }}
          </template>
        </el-table-column>
        <el-table-column
          v-for="col in visibleColumns"
          :key="col.key"
          :prop="col.key"
          :label="getColDef(col.key).label"
          :width="getColDef(col.key).width"
          :min-width="getColDef(col.key).minWidth"
          :align="getColDef(col.key).align || 'center'"
          :sortable="getColDef(col.key).sortable ? 'custom' : false"
        >
          <template #default="{ row }">
            <template v-if="col.key === 'status'">
              <el-tag :type="row.status === '已交卷' ? 'success' : 'danger'" size="small">
                {{ row.status }}
              </el-tag>
            </template>
            <template v-else-if="col.key === 'pass_status'">
              <el-tag v-if="!currentBatchConfig.configured" type="info" size="small">—</el-tag>
              <el-tag v-else :type="row.total >= currentBatchConfig.passLine ? 'success' : 'danger'" size="small">
                {{ row.total >= currentBatchConfig.passLine ? '合格' : '不合格' }}
              </el-tag>
            </template>
            <template v-else-if="col.key === 'total'">
              <span :style="{ fontWeight: 600, color: (row.total || 0) >= passLineOf(row) ? '#67c23a' : '#f56c6c' }">
                {{ row.total }}
              </span>
            </template>
            <template v-else-if="col.key === 'correction_score'">
              <span v-if="row.correction_score === null || row.correction_score === undefined || row.correction_score === ''">—</span>
              <span v-else>{{ row.correction_score }}</span>
            </template>
            <template v-else-if="col.key === 'remark'">
              <el-tooltip
                v-if="row.remark"
                :content="row.remark"
                placement="top"
                :show-after="300"
              >
                <span class="remark-cell">{{ row.remark }}</span>
              </el-tooltip>
              <span v-else>—</span>
            </template>
            <template v-else>{{ row[col.key] }}</template>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" :icon="Edit" @click="openDialog(row)">编辑</el-button>
            <el-button link type="danger" :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-bar">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="total"
          :page-sizes="[10, 25, 50, 100, 500]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="fetchList"
        />
      </div>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑成绩' : '新增成绩'"
      width="640px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="序号" prop="serial_no">
              <el-input-number v-model="form.serial_no" :min="1" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="考号" prop="exam_no">
              <el-input v-model="form.exam_no" placeholder="如 66745852" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="姓名" prop="name">
              <el-input v-model="form.name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="试卷批号" prop="batch_no">
              <el-input v-model="form.batch_no" placeholder="如 2026春模拟一" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="学校" prop="school">
              <el-input v-model="form.school" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="班级" prop="class">
              <el-input v-model="form.class" placeholder="如 17班" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="考试状态" prop="status">
              <el-select v-model="form.status" style="width: 100%">
                <el-option label="已交卷" value="已交卷" />
                <el-option label="未登录" value="未登录" />
                <el-option label="缺考" value="缺考" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="交卷时间" prop="submit_time">
              <el-date-picker
                v-model="form.submit_time"
                type="datetime"
                value-format="YYYY-MM-DD HH:mm"
                placeholder="选择交卷时间"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="选择题" prop="choice">
              <el-input-number v-model="form.choice" :min="0" :max="100" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="电子表格" prop="spreadsheet">
              <el-input-number v-model="form.spreadsheet" :min="0" :max="100" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Access" prop="access">
              <el-input-number v-model="form.access" :min="0" :max="100" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Python" prop="python">
              <el-input-number v-model="form.python" :min="0" :max="100" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="综合题" prop="composite">
              <el-input-number v-model="form.composite" :min="0" :max="100" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="总成绩" prop="total">
              <el-input-number v-model="form.total" :min="0" :max="600" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="二次订正分" prop="correction_score">
              <el-input-number
                v-model="form.correction_score"
                :min="0"
                :max="600"
                controls-position="right"
                placeholder="未订正"
                style="width: 100%"
              />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注" prop="remark">
              <el-input
                v-model="form.remark"
                type="textarea"
                :rows="2"
                maxlength="500"
                show-word-limit
                placeholder="教师反馈或补充说明（选填）"
              />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- Excel 导入弹窗 -->
    <el-dialog v-model="importVisible" title="Excel 批量导入成绩" width="520px" destroy-on-close>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="导入字段须与模板一致：序号、考号、姓名、学校、班级、考试状态、交卷时间、选择题、电子表格、Access、Python、综合题、总成绩"
        style="margin-bottom: 16px"
      />
      <el-form label-width="90px" style="margin-bottom: 14px">
        <el-form-item label="试卷批号" prop="importBatchNo">
          <el-input
            v-model="importBatchNo"
            placeholder="默认取文件名，可手动修改为统一批号"
            clearable
          />
        </el-form-item>
      </el-form>
      <el-upload
        ref="uploadRef"
        drag
        action=""
        :auto-upload="false"
        :limit="1"
        accept=".xlsx,.xls"
        :on-change="handleFileChange"
        :on-remove="() => (importFile = null)"
      >
        <el-icon :size="40" color="#c0c4cc"><UploadFilled /></el-icon>
        <div>将 Excel 文件拖到此处，或点击选择</div>
        <template #tip>
          <div style="color: #909399; font-size: 12px">
            同一「试卷批号 + 姓名」视为重复：确认后覆盖，否则新增
          </div>
        </template>
      </el-upload>
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="success" :loading="importing" :disabled="!importFile" @click="handleImport">
          开始导入
        </el-button>
      </template>
    </el-dialog>

    <!-- 列设置弹窗 -->
    <el-dialog v-model="columnDialogVisible" title="列设置" width="420px" destroy-on-close>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="勾选控制显示/隐藏，上移/下移调整排列顺序；选择/序号/操作列固定显示"
        style="margin-bottom: 12px"
      />
      <div class="col-manage">
        <div v-for="(col, idx) in draftColumns" :key="col.key" class="col-item">
          <el-checkbox v-model="col.visible">{{ getColDef(col.key).label }}</el-checkbox>
          <div class="col-move">
            <el-button :icon="Top" size="small" circle :disabled="idx === 0" title="上移" @click="moveColumn(idx, -1)" />
            <el-button
              :icon="Bottom"
              size="small"
              circle
              :disabled="idx === draftColumns.length - 1"
              title="下移"
              @click="moveColumn(idx, 1)"
            />
          </div>
        </div>
        <div class="col-item col-locked">
          <el-checkbox :model-value="true" disabled>选择</el-checkbox>
          <span class="col-locked-tip">固定显示</span>
        </div>
        <div class="col-item col-locked">
          <el-checkbox :model-value="true" disabled>序号</el-checkbox>
          <span class="col-locked-tip">固定显示</span>
        </div>
        <div class="col-item col-locked">
          <el-checkbox :model-value="true" disabled>操作</el-checkbox>
          <span class="col-locked-tip">固定显示</span>
        </div>
      </div>
      <template #footer>
        <el-button @click="columnDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="applyColumnConfig">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Refresh, Plus, Upload, Download, Edit, Delete, UploadFilled, RefreshRight, Setting, Top, Bottom } from '@element-plus/icons-vue';
import {
  getScores, getScoreOptions, createScore, updateScore, deleteScore,
  deleteScoresBatch, importScores, downloadScoreTemplate, syncStudents,
  getScoreBatchNos,
} from '../api/scores';

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const timeRange = ref(null);
const options = reactive({ classes: [], statuses: [] });
// 试卷批号下拉选项（跟随班级级联）
const batchNos = ref([]);
// 当前选中批号的配置（用于合格线着色与合格状态判定）；未选中/未配置时回退默认 60
const currentBatchConfig = reactive({ passLine: 60, totalFull: 0, configured: false });

/** 返回某行成绩应使用的合格线：选中且已配置批号取配置合格线，否则回退 60 */
function passLineOf(row) {
  return currentBatchConfig.configured ? currentBatchConfig.passLine : 60;
}

/** 根据当前选中批号同步配置（供合格状态/着色使用） */
function syncCurrentBatchConfig() {
  const found = batchNos.value.find((b) => b.batchNo === query.batchNo);
  if (found) {
    currentBatchConfig.passLine = found.passLine;
    currentBatchConfig.totalFull = found.totalFull;
    currentBatchConfig.configured = found.configured;
  } else {
    currentBatchConfig.passLine = 60;
    currentBatchConfig.totalFull = 0;
    currentBatchConfig.configured = false;
  }
}
// 多选删除
const tableRef = ref(null);
const selectedRows = ref([]);
const batchDeleting = ref(false);
function handleSelectionChange(rows) {
  selectedRows.value = rows;
}

const query = reactive({ name: '', batchNo: '', clazz: '', status: '' });
const pagination = reactive({ page: 1, pageSize: 25 });
// 排序状态（由表格表头点击触发）
const sort = reactive({ sortField: '', sortOrder: '' });

// ---- 列设置：列元数据以代码为准，顺序与可见性持久化到 localStorage ----
const STORAGE_KEY = 'score-list-columns';

const COLUMN_DEFS = [
  { key: 'exam_no', label: '考号', width: 110, align: 'center', sortable: true },
  { key: 'name', label: '姓名', minWidth: 90, align: 'center', sortable: true },
  { key: 'batch_no', label: '试卷批号', minWidth: 130, align: 'center', sortable: true },
  { key: 'school', label: '学校', width: 90, align: 'center' },
  { key: 'class', label: '班级', width: 90, align: 'center', sortable: true },
  { key: 'status', label: '考试状态', width: 95, align: 'center' },
  { key: 'submit_time', label: '交卷时间', width: 160, align: 'center', sortable: true },
  { key: 'choice', label: '选择题', width: 90, align: 'center', sortable: true },
  { key: 'spreadsheet', label: '电子表格', width: 95, align: 'center', sortable: true },
  { key: 'access', label: 'Access', width: 90, align: 'center', sortable: true },
  { key: 'python', label: 'Python', width: 90, align: 'center', sortable: true },
  { key: 'composite', label: '综合题', width: 90, align: 'center', sortable: true },
  { key: 'pass_status', label: '合格状态', width: 100, align: 'center', sortable: false },
  { key: 'total', label: '总成绩', width: 90, align: 'center', sortable: true },
  { key: 'correction_score', label: '二次订正分', width: 100, align: 'center', sortable: true },
  { key: 'remark', label: '备注', minWidth: 160, align: 'left', sortable: false },
];

function getColDef(key) {
  return COLUMN_DEFS.find((d) => d.key === key) || { key, label: key, align: 'center' };
}

// 读取本地存储：有则按存储顺序+可见性重建，并兼容代码中新增/移除的列
function loadColumnConfig() {
  const defs = COLUMN_DEFS.map((d) => ({ key: d.key, visible: true }));
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    saved = null;
  }
  if (!Array.isArray(saved)) return defs;
  const validKeys = new Set(COLUMN_DEFS.map((d) => d.key));
  const savedValid = saved.filter((s) => validKeys.has(s.key));
  const savedMap = new Map(savedValid.map((s) => [s.key, !!s.visible]));
  const savedKeySet = new Set(savedValid.map((s) => s.key));
  const orderedKeys = [
    ...savedValid.map((s) => s.key),
    ...COLUMN_DEFS.map((d) => d.key).filter((k) => !savedKeySet.has(k)),
  ];
  return orderedKeys.map((k) => ({ key: k, visible: savedMap.has(k) ? savedMap.get(k) : true }));
}

const columnConfig = ref(loadColumnConfig());
const visibleColumns = computed(() => columnConfig.value.filter((c) => c.visible));

const columnDialogVisible = ref(false);
const draftColumns = ref([]);

function openColumnDialog() {
  draftColumns.value = columnConfig.value.map((c) => ({ ...c }));
  columnDialogVisible.value = true;
}

function moveColumn(idx, dir) {
  const target = idx + dir;
  if (target < 0 || target >= draftColumns.value.length) return;
  const arr = draftColumns.value;
  const tmp = arr[idx];
  arr[idx] = arr[target];
  arr[target] = tmp;
}

function persistColumnConfig() {
  const data = columnConfig.value.map((c) => ({ key: c.key, visible: c.visible }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function applyColumnConfig() {
  columnConfig.value = draftColumns.value.map((c) => ({ ...c }));
  persistColumnConfig();
  columnDialogVisible.value = false;
}

// ---- 列表 ----
async function fetchList() {
  loading.value = true;
  try {
    const [start, end] = timeRange.value || [];
    const res = await getScores({
      ...query,
      startTime: start ? start.slice(0, 10) : '',
      endTime: end ? end.slice(0, 10) : '',
      ...pagination,
      ...sort,
    });
    list.value = res.data.list;
    total.value = res.data.total;
  } finally {
    loading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  fetchList();
}

function handleReset() {
  query.name = '';
  query.batchNo = '';
  query.clazz = '';
  query.status = '';
  timeRange.value = null;
  sort.sortField = '';
  sort.sortOrder = '';
  pagination.page = 1;
  fetchBatchNos();
  fetchList();
}

/** 切换每页条数：先把页码钳制到合法范围，避免从大页码切到 500 时先请求到空页 */
function handleSizeChange(size) {
  const maxPage = Math.max(1, Math.ceil(total.value / size));
  if (pagination.page > maxPage) pagination.page = maxPage;
  fetchList();
}

// ---- 远程排序：点击表头触发 ----
const SORT_FIELDS = {
  exam_no: 'examNo',
  name: 'name',
  batch_no: 'batchNo',
  class: 'class',
  submit_time: 'submitTime',
  choice: 'choice',
  spreadsheet: 'spreadsheet',
  access: 'access',
  python: 'python',
  composite: 'composite',
  total: 'total',
  correction_score: 'correctionScore',
};

function handleSortChange({ prop, order }) {
  if (!order) {
    sort.sortField = '';
    sort.sortOrder = '';
  } else {
    sort.sortField = SORT_FIELDS[prop] || '';
    sort.sortOrder = order === 'descending' ? 'desc' : 'asc';
  }
  pagination.page = 1;
  fetchList();
}

// ---- 新增 / 编辑 ----
const dialogVisible = ref(false);
const saving = ref(false);
const editingId = ref(null);
const formRef = ref(null);

const emptyForm = () => ({
  serial_no: 1, exam_no: '', name: '', batch_no: '', school: 'hxzx', class: '', status: '已交卷',
  submit_time: '', choice: 0, spreadsheet: 0, access: 0, python: 0, composite: 0, total: 0,
  correction_score: null, remark: '',
});
const form = reactive(emptyForm());

const rules = {
  exam_no: [{ required: true, message: '请输入考号', trigger: 'blur' }],
  name: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
};

function openDialog(row) {
  editingId.value = row?.id || null;
  Object.assign(form, emptyForm(), row || {});
  dialogVisible.value = true;
}

async function handleSave() {
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  try {
    if (editingId.value) {
      const res = await updateScore(editingId.value, form);
      ElMessage.success(res.message || '修改成功');
    } else {
      const res = await createScore(form);
      ElMessage.success(res.message || '新增成功');
    }
    dialogVisible.value = false;
    fetchList();
    fetchBatchNos();
  } catch (err) {
    const d = err.response?.data;
    if (err.response?.status === 409 && d?.data?.duplicate) {
      const ok = await ElMessageBox.confirm(
        `试卷批号「${form.batch_no || '(空)'}」下已存在同名记录（姓名：${form.name}）。是否用当前信息覆盖该记录？`,
        '重复记录确认',
        { type: 'warning', confirmButtonText: '覆盖保存', cancelButtonText: '取消' },
      ).catch(() => false);
      if (ok) {
        try {
          if (editingId.value) {
            const res2 = await updateScore(editingId.value, { ...form, overwrite: true });
            ElMessage.success(res2.message || '已覆盖保存');
          } else {
            const res2 = await createScore({ ...form, overwrite: true });
            ElMessage.success(res2.message || '已覆盖保存');
          }
          dialogVisible.value = false;
          fetchList();
          fetchBatchNos();
        } finally {
          saving.value = false;
        }
      }
      return;
    }
    // 其它错误已由拦截器提示
  } finally {
    saving.value = false;
  }
}

async function handleDelete(row) {
  await ElMessageBox.confirm(`确定删除「${row.name}（${row.exam_no}）」的成绩记录吗？删除后不可恢复。`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
    confirmButtonClass: 'el-button--danger',
  });
  await deleteScore(row.id);
  ElMessage.success('删除成功');
  fetchList();
}

/** 批量删除：多选后一次性删除，二次确认 */
async function handleBatchDelete() {
  if (!selectedRows.value.length) return;
  const ids = selectedRows.value.map((r) => r.id);
  await ElMessageBox.confirm(
    `确定删除选中的 ${ids.length} 条成绩记录吗？删除后不可恢复。`,
    '批量删除确认',
    { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' },
  ).catch(() => false);
  batchDeleting.value = true;
  try {
    const res = await deleteScoresBatch(ids);
    ElMessage.success(res.message);
    selectedRows.value = [];
    tableRef.value?.clearSelection();
    fetchList();
  } finally {
    batchDeleting.value = false;
  }
}

// ---- Excel 导入 ----
const importVisible = ref(false);
const importing = ref(false);
const importFile = ref(null);
const importBatchNo = ref('');
const uploadRef = ref(null);

function handleFileChange(file) {
  importFile.value = file.raw || null;
  // 试卷批号默认取文件名（去扩展名），可手动修改
  importBatchNo.value = (file.name || '').replace(/\.[^.]+$/, '');
}

async function handleImport() {
  if (!importFile.value) return;
  importing.value = true;
  try {
    const fd = new FormData();
    fd.append('file', importFile.value);
    fd.append('batchNo', importBatchNo.value || '');
    const res = await importScores(fd);
    ElMessage.success(res.message);
    finishImport();
  } catch (err) {
    const d = err.response?.data;
    if (err.response?.status === 409 && d?.data?.duplicate) {
      const n = d.data.conflictCount || 0;
      const ok = await ElMessageBox.confirm(
        `导入数据中发现 ${n} 条与现有「试卷批号+姓名」重复的记录，是否用新数据覆盖这些记录？`,
        '重复记录确认',
        { type: 'warning', confirmButtonText: '覆盖导入', cancelButtonText: '取消' },
      ).catch(() => false);
      if (ok) {
        const fd2 = new FormData();
        fd2.append('file', importFile.value);
        fd2.append('batchNo', importBatchNo.value || '');
        fd2.append('overwrite', 'true');
        const res2 = await importScores(fd2);
        ElMessage.success(res2.message);
        finishImport();
      }
    }
    // 其余错误已由拦截器提示
  } finally {
    importing.value = false;
  }
}

function finishImport() {
  importVisible.value = false;
  importFile.value = null;
  importBatchNo.value = '';
  uploadRef.value?.clearFiles();
  fetchList();
  fetchOptions();
  fetchBatchNos();
}

async function handleDownloadTemplate() {
  const res = await downloadScoreTemplate();
  const url = URL.createObjectURL(new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = '学生成绩记录-导入模板.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

// ---- 同步学生信息：以考号为唯一主键，把学生信息管理中的最新姓名/班级同步到成绩记录 ----
const syncing = ref(false);

async function handleSyncStudents() {
  const ok = await ElMessageBox.confirm(
    '将以「考号」为唯一主键，把学生信息管理中的最新姓名、班级同步到学生成绩记录；未匹配到学生信息的成绩记录将保持不变。是否继续？',
    '同步学生信息',
    { type: 'info', confirmButtonText: '开始同步', cancelButtonText: '取消' },
  ).catch(() => false);
  if (!ok) return;
  syncing.value = true;
  try {
    const res = await syncStudents();
    const d = res.data;
    fetchList();
    if (d.updated > 0) {
      const td = 'border: 1px solid #ebeef5; padding: 6px 8px; text-align: center;';
      const th = `${td} background: #f5f7fa; font-weight: 600;`;
      ElMessageBox.alert(
        h('div', null, [
          h('p', { style: 'margin: 0 0 12px; line-height: 1.8;' },
            `共扫描 ${d.total} 条成绩记录，成功更新 ${d.updated} 条，保持不变 ${d.unchanged} 条（其中 ${d.unmatched} 条未匹配到学生信息）。`),
          h('p', { style: 'margin: 0 0 8px; font-weight: 600;' }, '变更明细：'),
          h('div', { style: 'max-height: 320px; overflow: auto;' }, [
            h('table', { style: 'width: 100%; border-collapse: collapse; font-size: 12px;' }, [
              h('thead', null, h('tr', null,
                ['考号', '姓名变化', '班级变化'].map((t) => h('th', { style: th }, t)))),
              h('tbody', null, d.details.map((r) => h('tr', null, [
                h('td', { style: td }, r.exam_no),
                h('td', { style: td }, `${r.old_name} → ${r.new_name}`),
                h('td', { style: td }, `${r.old_class} → ${r.new_class}`),
              ]))),
            ]),
          ]),
        ]),
        { title: '同步完成', confirmButtonText: '知道了' },
      );
    } else {
      ElMessage.success(res.message);
    }
  } finally {
    syncing.value = false;
  }
}

async function fetchOptions() {
  const res = await getScoreOptions();
  options.classes = res.data.classes;
  options.statuses = res.data.statuses;
}

/** 拉取试卷批号下拉选项：已选班级时只取该班级的批号，否则取全部 */
async function fetchBatchNos() {
  try {
    const res = await getScoreBatchNos({ class: query.clazz || '' });
    // 合并数据源返回对象数组：{ batchNo, batchName, passLine, totalFull, configured }
    batchNos.value = res.data.batchNos || [];
    // 级联清理：当前选中的批号不在新列表里时清空，避免脏筛选
    if (query.batchNo && !batchNos.value.some((b) => b.batchNo === query.batchNo)) {
      query.batchNo = '';
    }
    syncCurrentBatchConfig();
  } catch {
    batchNos.value = [];
  }
}

// 班级变化时实时级联刷新试卷批号选项
watch(() => query.clazz, () => fetchBatchNos());
// 选中批号变化时同步当前配置（合格线/着色/合格状态）
watch(() => query.batchNo, syncCurrentBatchConfig);

onMounted(() => {
  fetchList();
  fetchOptions();
  fetchBatchNos();
});
</script>

<style scoped>
:deep(.el-form--inline .el-form-item) {
  margin-right: 16px;
  margin-bottom: 8px;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.col-manage {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 50vh;
  overflow-y: auto;
}
.col-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background: var(--el-fill-color-blank);
}
.col-move {
  display: flex;
  gap: 6px;
}
.col-locked {
  background: var(--el-fill-color-light);
  color: var(--el-text-color-secondary);
}
.col-locked-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
/* 备注：单行截断，悬浮提示展示完整内容 */
.remark-cell {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
/* 移动端小屏：备注列适度收窄，确保横向滚动更平顺 */
@media (max-width: 768px) {
  :deep(.el-table .remark-cell) {
    max-width: 120px;
  }
}
</style>
