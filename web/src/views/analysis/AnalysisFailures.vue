<template>
  <div>
    <el-card shadow="never" class="page-card">
      <template #header>
        <div class="card-header">
          <el-icon><WarningFilled /></el-icon>
          <span>不及格管理</span>
        </div>
      </template>
      <el-empty description="不及格管理（开发中）">
        <p class="placeholder-text">
          此页面将提供不及格学生的筛选、跟踪与干预记录管理，敬请期待。
        </p>
      </el-empty>
    </el-card>
  </div>
</template>

<style scoped>
.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.placeholder-text {
  margin: 0;
  color: #909399;
  font-size: 13px;
}
</style>
