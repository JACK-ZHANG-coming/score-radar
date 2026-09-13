<template>
  <div>
    <el-card shadow="never" class="page-card">
      <template #header>
        <div class="card-header">
          <el-icon><Medal /></el-icon>
          <span>优生管理</span>
        </div>
      </template>
      <el-empty description="优生管理（开发中）">
        <p class="placeholder-text">
          此页面将提供优生名单的筛选与培养跟踪管理，敬请期待。
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
