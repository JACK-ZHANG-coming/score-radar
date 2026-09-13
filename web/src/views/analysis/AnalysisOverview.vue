<template>
  <div>
    <el-card shadow="never" class="page-card">
      <template #header>
        <div class="card-header">
          <el-icon><TrendCharts /></el-icon>
          <span>成绩分析总览</span>
        </div>
      </template>
      <el-empty description="成绩分析总览（开发中）">
        <p class="placeholder-text">
          此页面将提供各班级、各学科的整体成绩分析总览，敬请期待。
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
