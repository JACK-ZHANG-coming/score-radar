<template>
  <el-row justify="center">
    <el-col :xs="24" :sm="20" :md="14" :lg="10">
      <!-- 账号信息 -->
      <el-card shadow="never" class="page-card">
        <template #header>
          <div class="card-header">
            <el-icon><User /></el-icon>
            <span>账号信息</span>
          </div>
        </template>
        <el-descriptions :column="1" border>
          <el-descriptions-item label="账号">{{ authStore.user?.username }}</el-descriptions-item>
          <el-descriptions-item label="昵称">{{ authStore.user?.nickname || '—' }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <!-- 修改密码 -->
      <el-card shadow="never">
        <template #header>
          <div class="card-header">
            <el-icon><Lock /></el-icon>
            <span>修改密码</span>
          </div>
        </template>
        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-width="100px"
          style="max-width: 460px"
        >
          <el-form-item label="旧密码" prop="oldPassword">
            <el-input v-model="form.oldPassword" type="password" show-password placeholder="请输入当前密码" />
          </el-form-item>
          <el-form-item label="新密码" prop="newPassword">
            <el-input v-model="form.newPassword" type="password" show-password placeholder="不少于 6 位" />
          </el-form-item>
          <el-form-item label="确认新密码" prop="confirmPassword">
            <el-input v-model="form.confirmPassword" type="password" show-password placeholder="再次输入新密码" />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" :loading="saving" @click="handleSubmit">确认修改</el-button>
            <el-button @click="handleReset">重置</el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </el-col>
  </el-row>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { changePassword } from '../api/auth';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const formRef = ref(null);
const saving = ref(false);
const form = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });

const rules = {
  oldPassword: [{ required: true, message: '请输入旧密码', trigger: 'blur' }],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '新密码长度不能少于 6 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== form.newPassword) callback(new Error('两次输入的密码不一致'));
        else callback();
      },
      trigger: 'blur',
    },
  ],
};

async function handleSubmit() {
  const valid = await formRef.value.validate().catch(() => false);
  if (!valid) return;
  saving.value = true;
  try {
    await changePassword(form);
    ElMessage.success('密码修改成功，请使用新密码重新登录');
    authStore.logout();
    router.push('/login');
  } finally {
    saving.value = false;
  }
}

function handleReset() {
  formRef.value.resetFields();
}
</script>

<style scoped>
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
</style>
