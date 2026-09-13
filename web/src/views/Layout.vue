<template>
  <el-container class="layout">
    <!-- 左侧菜单 -->
    <el-aside :width="isCollapse ? '64px' : '220px'" class="aside">
      <div class="logo">
        <el-icon :size="26" color="#fff"><DataAnalysis /></el-icon>
        <span v-show="!isCollapse" class="logo-text">成绩管理后台</span>
      </div>
      <el-menu :default-active="activeMenu" :collapse="isCollapse" :collapse-transition="false" router background-color="#1f2d3d" text-color="#c0c4cc" active-text-color="#409eff" class="menu">
        <template v-for="item in menus" :key="item.path">
          <!-- 带二级菜单的一级项。@click 挂在 #title 插槽内层包裹元素上：仅一级标题区域触发导航，
               二级菜单项（el-popover/ul 子列表）的点击不经过此挂载点，不会冒泡劫持。不 stop、
               不 prevent，el-sub-menu 原生展开/收起行为完整保留 -->
          <el-sub-menu v-if="item.children" :index="item.path">
            <template #title>
              <div class="sub-menu-title">
                <el-icon><component :is="item.icon" /></el-icon>
                <span>{{ item.title }}</span>
              </div>
            </template>
            <el-menu-item v-for="child in item.children" :key="child.path" :index="child.path">
              {{ child.title }}
            </el-menu-item>
          </el-sub-menu>
          <!-- 普通一级项 -->
          <el-menu-item v-else :index="item.path">
            <el-icon><component :is="item.icon" /></el-icon>
            <template #title>{{ item.title }}</template>
          </el-menu-item>
        </template>
      </el-menu>
    </el-aside>

    <el-container>
      <!-- 顶栏 -->
      <el-header class="header">
        <div class="header-left">
          <el-icon class="collapse-btn" :size="20" @click="isCollapse = !isCollapse">
            <Expand v-if="isCollapse" />
            <Fold v-else />
          </el-icon>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item>首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="groupTitle">{{ groupTitle }}</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              <el-avatar :size="32" icon="UserFilled" />
              <span class="username">{{ authStore.displayName }}</span>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><Setting /></el-icon>个人中心
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <!-- 内容区 -->
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useAuthStore } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const isCollapse = ref(false)

const menus = [
  {
    path: '/analysis',
    title: '学生成绩分析',
    icon: 'TrendCharts',
    children: [
      { path: '/analysis/overview', title: '成绩分析总览' },
      { path: '/analysis/failures', title: '不及格管理' },
      { path: '/analysis/top-students', title: '优生管理' },
      { path: '/analysis/abnormal-profiles', title: '异常学生画像' },
      { path: '/analysis/progress-profiles', title: '进步学生画像' }
    ]
  },
  { path: '/scores', title: '学生成绩记录', icon: 'DataAnalysis' },
  { path: '/paperBatch', title: '试卷批次管理', icon: 'Files' },
  { path: '/students', title: '学生信息管理', icon: 'User' },
  { path: '/profile', title: '个人中心', icon: 'Setting' }
]

// 当前激活的菜单项：访问 /analysis/xxx 时高亮对应二级项；redirect 保证不会停留在 /analysis
const activeMenu = computed(() => route.path)
const currentTitle = computed(() => route.meta.title || '')
// 所属一级菜单标题（仅「学生成绩分析」存在分组，用于面包屑第三级展示）
const groupTitle = computed(() => (route.path.startsWith('/analysis/') ? '学生成绩分析' : ''))

async function handleCommand(command) {
  if (command === 'profile') {
    router.push('/profile')
    return
  }
  if (command === 'logout') {
    await ElMessageBox.confirm('确定要退出登录吗？', '提示', { type: 'warning' })
    authStore.logout()
    ElMessage.success('已退出登录')
    router.push('/login')
  }
}
</script>

<style scoped>
.layout {
  height: 100%;
}

.aside {
  background: #1f2d3d;
  transition: width 0.2s;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #fff;
}

.logo-text {
  font-size: 17px;
  font-weight: 600;
  white-space: nowrap;
}

.menu {
  border-right: none;
  flex: 1;
}

/* 一级分组标题插槽包裹层：铺满 .el-sub-menu__title 宽度，保证点击区域覆盖整个标题行；
   flex 布局保持图标与文字的原有排列（Element Plus 的 .el-icon 外边距规则为后代选择器，
   包裹层不破坏其生效） */
.sub-menu-title {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
}

/* 折叠态：隐藏一级分组标题文字，对齐 Element Plus 原生折叠行为。EP 原生规则
   .el-menu--collapse > .el-sub-menu > .el-sub-menu__title > span 仅匹配 title 的
   直接子 span，被 div.sub-menu-title 包裹后失配，此处补齐。仅折叠态
   （.el-menu--collapse 存在时）生效，展开态零影响 */
.el-menu--collapse .sub-menu-title span {
  visibility: hidden;
  width: 0;
  height: 0;
  overflow: hidden;
}

.header {
  height: 60px;
  background: #fff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.collapse-btn {
  cursor: pointer;
  color: #606266;
}

.collapse-btn:hover {
  color: #409eff;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.username {
  color: #303133;
}

.main {
  background: #f0f2f5;
  padding: 16px;
  overflow-y: auto;
}
</style>
