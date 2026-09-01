import { createRouter, createWebHistory } from 'vue-router';
import { ElMessage } from 'element-plus';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { title: '登录' },
  },
  {
    path: '/',
    component: () => import('../views/Layout.vue'),
    redirect: '/scores',
    children: [
      {
        path: 'scores',
        name: 'Scores',
        component: () => import('../views/ScoreList.vue'),
        meta: { title: '学生成绩记录', icon: 'DataAnalysis' },
      },
      {
        path: 'students',
        name: 'Students',
        component: () => import('../views/StudentList.vue'),
        meta: { title: '学生信息管理', icon: 'User' },
      },
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('../views/Profile.vue'),
        meta: { title: '个人中心', icon: 'Setting' },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

// 全局路由守卫：未登录禁止访问
router.beforeEach((to) => {
  const token = localStorage.getItem('token');
  if (to.path !== '/login' && !token) {
    ElMessage.warning('请先登录');
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (to.path === '/login' && token) {
    return { path: '/' };
  }
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} - 成绩管理后台系统` : '成绩管理后台系统';
});

export default router;
