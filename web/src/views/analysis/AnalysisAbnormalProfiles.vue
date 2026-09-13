<template>
  <div>
    <el-card shadow="never" class="page-card">
      <template #header>
        <div class="card-header">
          <el-icon><WarnTriangleFilled /></el-icon>
          <span>异常学生画像</span>
        </div>
      </template>
      <el-empty description="异常学生画像（开发中）">
        <p class="placeholder-text">
          此页面将提供成绩异常学生的画像识别与查看，敬请期待。
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
