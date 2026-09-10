<template>
  <div>
    <!-- 区1 搜索筛选区 -->
    <el-card class="page-card" shadow="never">
      <el-form :model="query" inline label-width="90px" @submit.prevent>
        <el-form-item label="试卷批次名称">
          <el-input v-model="query.name" placeholder="名称模糊搜索" clearable style="width: 200px" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item label="试卷批号">
          <el-select
            v-model="query.batchNo"
            placeholder="全部批号"
            clearable
            filterable
            style="width: 200px"
            :no-data-text="'暂无试卷批号'"
          >
            <el-option
              v-for="b in batchNoOptions"
              :key="b.batchNo"
              :label="b.batchName ? `${b.batchNo}（${b.batchName}）` : b.batchNo"
              :value="b.batchNo"
            />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="handleSearch">查询</el-button>
          <el-button :icon="Refresh" @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 区2 操作按钮栏 -->
    <el-card shadow="never">
      <div class="toolbar">
        <div>
          <el-button type="primary" :icon="Plus" @click="openDialog()">新增试卷批次</el-button>
          <el-button type="success" :icon="Upload" @click="importVisible = true">Excel 导入</el-button>
          <el-button :icon="Download" @click="handleDownloadTemplate">下载导入模板</el-button>
          <el-button
            type="danger"
            :icon="Delete"
            :loading="batchDeleting"
            :disabled="!selectedRows.length"
            @click="handleBatchDelete"
          >
            批量删除{{ selectedRows.length ? `(${selectedRows.length})` : '' }}
          </el-button>
          <el-button :icon="Document" @click="exportList">导出</el-button>
        </div>
        <div class="toolbar-actions">
          <el-button :icon="Setting" @click="openColumnDialog">列设置</el-button>
          <el-tag type="info">共 {{ total }} 条记录</el-tag>
        </div>
      </div>

      <!-- 区3 表格数据列表 -->
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
            <template v-if="col.key === 'pass_line'">
              <el-tag type="warning" size="small">{{ row.pass_line }}</el-tag>
            </template>
            <template v-else-if="col.key === 'remark'">
              <el-tooltip v-if="row.remark" :content="row.remark" placement="top" :show-after="300">
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
      :title="editingId ? '编辑试卷批次' : '新增试卷批次'"
      width="680px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="试卷批号" prop="batch_no">
              <el-input v-model="form.batch_no" placeholder="如 20260901160700" :disabled="!!editingId" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="试卷批次名称" prop="batch_name">
              <el-input v-model="form.batch_name" placeholder="如 2026春模拟考" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="选择题满分" prop="choice_full">
              <el-input-number v-model="form.choice_full" :min="0" :max="1000" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="电子表格满分" prop="spreadsheet_full">
              <el-input-number v-model="form.spreadsheet_full" :min="0" :max="1000" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Access满分" prop="access_full">
              <el-input-number v-model="form.access_full" :min="0" :max="1000" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="Python满分" prop="python_full">
              <el-input-number v-model="form.python_full" :min="0" :max="1000" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="综合题满分" prop="composite_full">
              <el-input-number v-model="form.composite_full" :min="0" :max="1000" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="试卷总满分" prop="total_full">
              <el-input-number v-model="form.total_full" :min="0" :max="5000" controls-position="right" style="width: 100%" @input="onTotalInput" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="默认合格占比(%)" prop="pass_ratio">
              <el-input-number v-model="form.pass_ratio" :min="0" :max="100" controls-position="right" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="计算得出合格线">
              <el-input :model-value="computedPassLine" disabled />
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
                placeholder="适用年级/考试说明（选填）"
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
    <el-dialog v-model="importVisible" title="Excel 批量导入试卷批次" width="520px" destroy-on-close>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="导入字段须与模板一致：序号、试卷批号、试卷批次名称、选择题满分、电子表格满分、Access满分、Python满分、综合题满分、试卷总满分、默认合格占比(%)、计算得出合格线、备注、创建时间"
        style="margin-bottom: 16px"
      />
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
          <div style="color: #909399; font-size: 12px">同一试卷批号视为重复：确认后覆盖，否则新增</div>
        </template>
      </el-upload>
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="success" :loading="importing" :disabled="!importFile" @click="handleImport">开始导入</el-button>
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
            <el-button :icon="Bottom" size="small" circle :disabled="idx === draftColumns.length - 1" title="下移" @click="moveColumn(idx, 1)" />
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
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Search, Refresh, Plus, Upload, Download, Edit, Delete, UploadFilled, Setting, Top, Bottom, Document,
} from '@element-plus/icons-vue';
import {
  getPaperBatches, createPaperBatch, updatePaperBatch, deletePaperBatch,
  deletePaperBatchesBatch, importPaperBatches, downloadPaperBatchTemplate, exportPaperBatches,
  getPaperBatchMaxScores,
} from '../api/paper-batches';
import { getScoreBatchNos } from '../api/scores';

const loading = ref(false);
const list = ref([]);
const total = ref(0);

const query = reactive({ name: '', batchNo: '' });
const pagination = reactive({ page: 1, pageSize: 25 });
const sort = reactive({ sortField: '', sortOrder: '' });

// 试卷批号下拉选项（全量，不传班级）
const batchNoOptions = ref([]);
async function fetchBatchNoOptions() {
  try {
    const res = await getScoreBatchNos({ class: '' });
    batchNoOptions.value = res.data.batchNos || [];
  } catch {
    batchNoOptions.value = [];
  }
}

// 多选删除
const tableRef = ref(null);
const selectedRows = ref([]);
const batchDeleting = ref(false);
function handleSelectionChange(rows) {
  selectedRows.value = rows;
}

// ---- 列设置：列元数据以代码为准，顺序与可见性持久化到 localStorage ----
const STORAGE_KEY = 'paper-batch-list-columns';

const COLUMN_DEFS = [
  { key: 'batch_no', label: '试卷批号', minWidth: 130, align: 'center', sortable: true },
  { key: 'batch_name', label: '试卷批次名称', minWidth: 140, align: 'center', sortable: true },
  { key: 'choice_full', label: '选择题满分', width: 100, align: 'center', sortable: true },
  { key: 'spreadsheet_full', label: '电子表格满分', width: 110, align: 'center', sortable: true },
  { key: 'access_full', label: 'Access满分', width: 100, align: 'center', sortable: true },
  { key: 'python_full', label: 'Python满分', width: 100, align: 'center', sortable: true },
  { key: 'composite_full', label: '综合题满分', width: 100, align: 'center', sortable: true },
  { key: 'total_full', label: '试卷总满分', width: 100, align: 'center', sortable: true },
  { key: 'pass_ratio', label: '默认合格占比(%)', width: 120, align: 'center', sortable: true },
  { key: 'pass_line', label: '计算得出合格线', width: 120, align: 'center', sortable: false },
  { key: 'remark', label: '备注', minWidth: 160, align: 'left', sortable: false },
  { key: 'created_at', label: '创建时间', width: 120, align: 'center', sortable: true },
];

function getColDef(key) {
  return COLUMN_DEFS.find((d) => d.key === key) || { key, label: key, align: 'center' };
}

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
    const res = await getPaperBatches({ ...query, ...pagination, ...sort });
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
  pagination.page = 1;
  sort.sortField = '';
  sort.sortOrder = '';
  fetchList();
}

function handleSizeChange(size) {
  const maxPage = Math.max(1, Math.ceil(total.value / size));
  if (pagination.page > maxPage) pagination.page = maxPage;
  fetchList();
}

// ---- 远程排序：点击表头触发 ----
const SORT_FIELDS = {
  batch_no: 'batchNo',
  batch_name: 'batchName',
  choice_full: 'choiceFull',
  spreadsheet_full: 'spreadsheetFull',
  access_full: 'accessFull',
  python_full: 'pythonFull',
  composite_full: 'compositeFull',
  total_full: 'totalFull',
  pass_ratio: 'passRatio',
  created_at: 'createdAt',
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
  batch_no: '', batch_name: '', total_full: 0,
  choice_full: 0, spreadsheet_full: 0, access_full: 0, python_full: 0, composite_full: 0,
  pass_ratio: 60, remark: '',
});

const form = reactive(emptyForm());
// 手改总满分后停止联动预填（直到下次打开弹窗重置）
const manualTotal = ref(false);

// 编辑弹窗预填请求竞态保护：每次 openDialog 自增，异步回来比对，旧弹窗/已关闭直接丢弃
let prefillTokenSeq = 0;

const sumOfItems = computed(() =>
  Number(form.choice_full) + Number(form.spreadsheet_full) + Number(form.access_full)
  + Number(form.python_full) + Number(form.composite_full));

// 联动预填：未手改总满分时，总满分自动跟随五项分项之和
watch(sumOfItems, (v) => {
  if (!manualTotal.value) form.total_full = v;
});

// 只读合格线：ROUND(总满分*占比/100, 2)
const computedPassLine = computed(() =>
  Math.round(Number(form.total_full) * Number(form.pass_ratio) / 100 * 100) / 100);

function onTotalInput() {
  manualTotal.value = true;
}

// 数值字段通用：必填且非负
function numRule(label) {
  return [
    { required: true, message: `请输入${label}`, trigger: 'blur' },
    { validator: (rule, value, cb) => (Number(value) < 0 ? cb(new Error('分数不能为负数')) : cb()), trigger: 'blur' },
  ];
}

const rules = {
  batch_no: [{ required: true, message: '请输入试卷批号', trigger: 'blur' }],
  batch_name: [{ required: true, message: '请输入试卷批次名称', trigger: 'blur' }],
  choice_full: numRule('选择题满分'),
  spreadsheet_full: numRule('电子表格满分'),
  access_full: numRule('Access满分'),
  python_full: numRule('Python满分'),
  composite_full: numRule('综合题满分'),
  total_full: [
    { required: true, message: '请输入试卷总满分', trigger: 'blur' },
    { validator: (rule, value, cb) =>
        Math.abs(Number(value) - sumOfItems.value) < 1e-9 ? cb() : cb(new Error('分项分数总和和总满分不一致，请核对！')),
      trigger: 'blur' },
  ],
  pass_ratio: [
    { required: true, message: '请输入默认合格占比', trigger: 'blur' },
    { validator: (rule, value, cb) =>
        (Number(value) >= 0 && Number(value) <= 100) ? cb() : cb(new Error('合格占比需在 0~100 之间')),
      trigger: 'blur' },
  ],
};

function openDialog(row) {
  editingId.value = row?.id || null;
  Object.assign(form, emptyForm(), row || {});
  manualTotal.value = !!row?.id; // 编辑态默认保留已填总满分；新增态随分项联动
  dialogVisible.value = true;

  // ---- 编辑分支：0 分项按同批号学生最高分预填（仅影响表单默认显示，不写库）----
  if (editingId.value && row?.batch_no) {
    // 五项分项字段：[表单字段, 接口返回键]
    const FIELDS = [
      ['choice_full', 'choice'],
      ['spreadsheet_full', 'spreadsheet'],
      ['access_full', 'access'],
      ['python_full', 'python'],
      ['composite_full', 'composite'],
    ];
    // 仅当五项中任一 === 0（数值判 0）且批号非空才发起请求；全部非 0 不请求
    const zeroFields = FIELDS.filter(([f]) => Number(form[f]) === 0);
    if (zeroFields.length) {
      const token = ++prefillTokenSeq; // 竞态保护 a)：记录本次弹窗 token
      getPaperBatchMaxScores(row.batch_no)
        .then((res) => {
          // 竞态保护 a)：token 不一致（旧弹窗串台）或弹窗已关闭 → 直接丢弃
          if (token !== prefillTokenSeq || !dialogVisible.value) return;
          const data = res.data || {};
          const count = Number(data.count) || 0;
          // count=0（批号下无成绩）→ 正常业务态，info 提示后保持 0
          if (count === 0) {
            ElMessage.info('该试卷批号下暂无学生成绩，0 分项保持 0');
            return;
          }
          const filled = [];
          zeroFields.forEach(([f, key]) => {
            // 竞态保护 b)：回填前再判一次表单当前值 === 0（请求期间用户手改过则跳过该字段）
            if (Number(form[f]) !== 0) return;
            const max = Number(data[key]);
            // max > 0 → 填入；max = 0 / null 且接口成功 → 保持 0（不处理）
            if (max > 0) {
              form[f] = max;
              filled.push(f);
            }
          });
          // 填充完成后，若 total_full 仍 === 0 → 自动填五项之和，使「分项之和=总满分」校验天然通过；
          // total_full 非 0 保持原值（后续仍由现有第三方校验拦截，由用户处理）。
          // manualTotal 保持 true 不变，不动原「手改总满分停止联动」机制。
          if (Number(form.total_full) === 0) {
            form.total_full = sumOfItems.value;
          }
          // 提示规则：有填充 → success；接口成功但 0 项都没填（全部 max=0）→ info
          if (filled.length > 0) {
            ElMessage.success(`已按该批次学生最高分预填 ${filled.length} 项 0 分项`);
          } else {
            ElMessage.info('该批次下暂无有效分数，0 分项保持 0');
          }
        })
        .catch(() => {
          // 竞态保护 a)：失败亦先核对 token；已关闭弹窗静默丢弃
          if (token !== prefillTokenSeq || !dialogVisible.value) return;
          ElMessage.warning('最高分查询失败，0 分项保持原值');
        });
    }
  }
}

async function handleSave() {
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  try {
    if (editingId.value) {
      const res = await updatePaperBatch(editingId.value, form);
      ElMessage.success(res.message || '修改成功');
    } else {
      const res = await createPaperBatch(form);
      ElMessage.success(res.message || '新增成功');
    }
    dialogVisible.value = false;
    fetchList();
  } catch (err) {
    const d = err.response?.data;
    // 批号唯一 ⑤：后端返回 409 duplicate，前端确认后覆盖保存
    if (err.response?.status === 409 && d?.data?.duplicate) {
      const ok = await ElMessageBox.confirm(
        `试卷批号「${form.batch_no}」已存在，是否用当前信息覆盖该批次配置？`,
        '重复批号确认',
        { type: 'warning', confirmButtonText: '覆盖保存', cancelButtonText: '取消' },
      ).catch(() => false);
      if (ok) {
        try {
          const res2 = await createPaperBatch({ ...form, overwrite: true });
          ElMessage.success(res2.message || '已覆盖保存');
          dialogVisible.value = false;
          fetchList();
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
  await ElMessageBox.confirm(`确定删除试卷批次「${row.batch_name || row.batch_no}」吗？删除后不可恢复。`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
  });
  await deletePaperBatch(row.id);
  ElMessage.success('删除成功');
  fetchList();
}

async function handleBatchDelete() {
  if (!selectedRows.value.length) return;
  const ids = selectedRows.value.map((r) => r.id);
  await ElMessageBox.confirm(
    `确定删除选中的 ${ids.length} 条试卷批次吗？删除后不可恢复。`,
    '批量删除确认',
    { type: 'warning', confirmButtonText: '删除', confirmButtonClass: 'el-button--danger' },
  ).catch(() => false);
  batchDeleting.value = true;
  try {
    const res = await deletePaperBatchesBatch(ids);
    ElMessage.success(res.message);
    selectedRows.value = [];
    tableRef.value?.clearSelection();
    fetchList();
  } catch (err) {
    // 批删整体关联拒绝：列出被阻断的批号
    const d = err.response?.data;
    if (err.response?.status === 409 && Array.isArray(d?.data?.blocked) && d.data.blocked.length) {
      const list = d.data.blocked.map((b) => `· ${b}`).join('\n');
      await ElMessageBox.alert(
        `以下试卷批次下存在学生成绩，无法删除，请先删除关联成绩数据！\n\n${list}`,
        '删除被拒绝',
        { type: 'error', confirmButtonText: '知道了' },
      );
    }
  } finally {
    batchDeleting.value = false;
  }
}

// ---- Excel 导入 ----
const importVisible = ref(false);
const importing = ref(false);
const importFile = ref(null);
const uploadRef = ref(null);

function handleFileChange(file) {
  importFile.value = file.raw || null;
}

async function handleImport() {
  if (!importFile.value) return;
  importing.value = true;
  try {
    const fd = new FormData();
    fd.append('file', importFile.value);
    const res = await importPaperBatches(fd);
    ElMessage.success(res.message);
    finishImport();
  } catch (err) {
    const d = err.response?.data;
    if (err.response?.status === 409 && d?.data?.duplicate) {
      const n = d.data.conflictCount || 0;
      const ok = await ElMessageBox.confirm(
        `导入数据中发现 ${n} 条与现有试卷批号重复的记录，是否用新数据覆盖这些批次？`,
        '重复记录确认',
        { type: 'warning', confirmButtonText: '覆盖导入', cancelButtonText: '取消' },
      ).catch(() => false);
      if (ok) {
        const fd2 = new FormData();
        fd2.append('file', importFile.value);
        fd2.append('overwrite', 'true');
        const res2 = await importPaperBatches(fd2);
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
  uploadRef.value?.clearFiles();
  fetchList();
}

async function handleDownloadTemplate() {
  const res = await downloadPaperBatchTemplate();
  const url = URL.createObjectURL(new Blob([res]));
  const a = document.createElement('a');
  a.href = url;
  a.download = '试卷批次-导入模板.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

async function exportList() {
  const res = await exportPaperBatches({ name: query.name, batchNo: query.batchNo });
  const url = URL.createObjectURL(new Blob([res]));
  const a = document.createElement('a');
  a.href = url;
  a.download = '试卷批次管理-导出.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}

onMounted(() => {
  fetchList();
  fetchBatchNoOptions();
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
</style>
