import axios from 'axios';
import { ElMessage } from 'element-plus';
import router from '../router';

const request = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// 请求拦截：附带 Token
request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 响应拦截：统一错误处理
request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const resp = error.response;
    if (resp) {
      if (resp.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        ElMessage.error(resp.data?.message || '登录已过期，请重新登录');
        if (router.currentRoute.value.path !== '/login') {
          router.push('/login');
        }
      } else {
        // 重复冲突（试卷批号+姓名）由调用方弹确认框处理，不在此弹错误提示
        const isDuplicate = resp.status === 409 && resp.data?.data?.duplicate;
        if (!isDuplicate) {
          ElMessage.error(resp.data?.message || `请求失败（${resp.status}）`);
        }
      }
    } else {
      ElMessage.error('网络异常，请检查服务是否启动');
    }
    return Promise.reject(error);
  },
);

export default request;
