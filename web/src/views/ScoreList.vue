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
        </div>
        <el-tag type="info">共 {{ total }} 条记录</el-tag>
      </div>

      <el-table
        :data="list"
        v-loading="loading"
        border
        stripe
        style="width: 100%; margin-top: 12px"
        @sort-change="handleSortChange"
      >
        <el-table-column prop="serial_no" label="序号" width="70" align="center" sortable="custom" />
        <el-table-column prop="exam_no" label="考号" width="110" align="center" sortable="custom" />
        <el-table-column prop="name" label="姓名" min-width="90" sortable="custom" />
        <el-table-column prop="school" label="学校" width="90" align="center" />
        <el-table-column prop="class" label="班级" width="90" align="center" sortable="custom" />
        <el-table-column prop="status" label="考试状态" width="95" align="center">
          <template #default="{ row }">
            <el-tag :type="row.status === '已交卷' ? 'success' : 'danger'" size="small">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="submit_time" label="交卷时间" width="160" align="center" sortable="custom" />
        <el-table-column prop="choice" label="选择题" width="90" align="center" sortable="custom" />
        <el-table-column prop="spreadsheet" label="电子表格" width="95" align="center" sortable="custom" />
        <el-table-column prop="access" label="Access" width="90" align="center" sortable="custom" />
        <el-table-column prop="python" label="Python" width="90" align="center" sortable="custom" />
        <el-table-column prop="composite" label="综合题" width="90" align="center" sortable="custom" />
        <el-table-column prop="total" label="总成绩" width="90" align="center" sortable="custom">
          <template #default="{ row }">
            <span :style="{ fontWeight: 600, color: (row.total || 0) >= 60 ? '#67c23a' : '#f56c6c' }">
              {{ row.total }}
            </span>
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
            同考号记录将执行更新，首次出现的考号执行新增
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
  </div>
</template>

<script setup>
import { h, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Refresh, Plus, Upload, Download, Edit, Delete, UploadFilled, RefreshRight } from '@element-plus/icons-vue';
import {
  getScores, getScoreOptions, createScore, updateScore, deleteScore,
  importScores, downloadScoreTemplate, syncStudents,
} from '../api/scores';

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const timeRange = ref(null);
const options = reactive({ classes: [], statuses: [] });

const query = reactive({ name: '', clazz: '', status: '' });
const pagination = reactive({ page: 1, pageSize: 25 });
// 排序状态（由表格表头点击触发）
const sort = reactive({ sortField: '', sortOrder: '' });

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
  query.clazz = '';
  query.status = '';
  timeRange.value = null;
  sort.sortField = '';
  sort.sortOrder = '';
  pagination.page = 1;
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
  serial_no: 'serialNo',
  exam_no: 'examNo',
  name: 'name',
  class: 'class',
  submit_time: 'submitTime',
  choice: 'choice',
  spreadsheet: 'spreadsheet',
  access: 'access',
  python: 'python',
  composite: 'composite',
  total: 'total',
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
  serial_no: 1, exam_no: '', name: '', school: 'hxzx', class: '', status: '已交卷',
  submit_time: '', choice: 0, spreadsheet: 0, access: 0, python: 0, composite: 0, total: 0,
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
      await updateScore(editingId.value, form);
      ElMessage.success('修改成功');
    } else {
      await createScore(form);
      ElMessage.success('新增成功');
    }
    dialogVisible.value = false;
    fetchList();
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
    const res = await importScores(fd);
    ElMessage.success(res.message);
    importVisible.value = false;
    importFile.value = null;
    uploadRef.value?.clearFiles();
    fetchList();
    fetchOptions();
  } finally {
    importing.value = false;
  }
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

onMounted(() => {
  fetchList();
  fetchOptions();
});
</script>

<style scoped>
:deep(.el-form--inline .el-form-item) {
  margin-right: 16px;
  margin-bottom: 8px;
}
</style>
