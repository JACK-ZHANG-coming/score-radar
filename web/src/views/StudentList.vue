<template>
  <div>
    <!-- 搜索区 -->
    <el-card class="page-card" shadow="never">
      <el-form :model="query" inline label-width="70px" @submit.prevent>
        <el-form-item label="关键词">
          <el-input
            v-model="query.keyword"
            placeholder="考号 / 姓名模糊搜索"
            clearable
            style="width: 200px"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item label="班级">
          <el-select v-model="query.clazz" placeholder="全部班级" clearable filterable style="width: 140px">
            <el-option v-for="c in options.classes" :key="c" :label="c" :value="c" />
          </el-select>
        </el-form-item>
        <el-form-item label="年级">
          <el-select v-model="query.grade" placeholder="全部年级" clearable style="width: 120px">
            <el-option v-for="g in options.grades" :key="g" :label="g" :value="g" />
          </el-select>
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
          <el-button type="primary" :icon="Plus" @click="openDialog()">新增学生</el-button>
          <el-button type="success" :icon="Upload" @click="importVisible = true">Excel 导入</el-button>
          <el-button :icon="Download" @click="handleDownloadTemplate">下载导入模板</el-button>
        </div>
        <el-tag type="info">共 {{ total }} 条记录</el-tag>
      </div>

      <el-table :data="list" v-loading="loading" border stripe style="width: 100%; margin-top: 12px">
        <el-table-column prop="id" label="ID" width="70" align="center" />
        <el-table-column prop="exam_no" label="考号" width="130" align="center" sortable />
        <el-table-column prop="name" label="姓名" min-width="100" sortable />
        <el-table-column prop="class" label="班级" width="100" align="center" sortable />
        <el-table-column prop="grade" label="年级" width="100" align="center" sortable />
        <el-table-column prop="school" label="学校" width="110" align="center" />
        <el-table-column prop="created_at" label="创建时间" width="170" align="center" />
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
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="fetchList"
          @current-change="fetchList"
        />
      </div>
    </el-card>

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑学生' : '新增学生'"
      width="520px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="考号" prop="exam_no">
          <el-input v-model="form.exam_no" placeholder="如 66745852" :disabled="!!editingId" />
        </el-form-item>
        <el-form-item label="姓名" prop="name">
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="班级" prop="class">
          <el-input v-model="form.class" placeholder="如 1班" />
        </el-form-item>
        <el-form-item label="年级" prop="grade">
          <el-input v-model="form.grade" placeholder="如 高二" />
        </el-form-item>
        <el-form-item label="学校" prop="school">
          <el-input v-model="form.school" placeholder="如 hxzx" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- Excel 导入弹窗 -->
    <el-dialog v-model="importVisible" title="Excel 批量导入学生" width="520px" destroy-on-close>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="导入字段须与模板一致：考号、姓名、班级、年级、学校"
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
          <div style="color: #909399; font-size: 12px">同考号学生将执行更新，首次出现的考号执行新增</div>
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
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Refresh, Plus, Upload, Download, Edit, Delete, UploadFilled } from '@element-plus/icons-vue';
import {
  getStudents, getStudentOptions, createStudent, updateStudent, deleteStudent,
  importStudents, downloadStudentTemplate,
} from '../api/students';

const loading = ref(false);
const list = ref([]);
const total = ref(0);
const options = reactive({ classes: [], grades: [] });

const query = reactive({ keyword: '', clazz: '', grade: '' });
const pagination = reactive({ page: 1, pageSize: 20 });

async function fetchList() {
  loading.value = true;
  try {
    const res = await getStudents({ ...query, ...pagination });
    list.value = res.data.list;
    total.value = res.data.total;
  } finally {
    loading.value = false;
  }
}

async function fetchOptions() {
  const res = await getStudentOptions();
  options.classes = res.data.classes;
  options.grades = res.data.grades;
}

function handleSearch() {
  pagination.page = 1;
  fetchList();
}

function handleReset() {
  query.keyword = '';
  query.clazz = '';
  query.grade = '';
  pagination.page = 1;
  fetchList();
}

// ---- 新增 / 编辑 ----
const dialogVisible = ref(false);
const saving = ref(false);
const editingId = ref(null);
const formRef = ref(null);

const emptyForm = () => ({ exam_no: '', name: '', class: '', grade: '', school: '' });
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
      await updateStudent(editingId.value, form);
      ElMessage.success('修改成功');
    } else {
      await createStudent(form);
      ElMessage.success('新增成功');
    }
    dialogVisible.value = false;
    fetchList();
    fetchOptions();
  } finally {
    saving.value = false;
  }
}

async function handleDelete(row) {
  await ElMessageBox.confirm(`确定删除学生「${row.name}（${row.exam_no}）」吗？删除后不可恢复。`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
  });
  await deleteStudent(row.id);
  ElMessage.success('删除成功');
  fetchList();
  fetchOptions();
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
    const res = await importStudents(fd);
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
  const res = await downloadStudentTemplate();
  const url = URL.createObjectURL(new Blob([res], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = '考生名单-导入模板.xlsx';
  a.click();
  URL.revokeObjectURL(url);
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
