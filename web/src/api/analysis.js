import request from './request';

// 成绩分析：班级列表（去重 + 排序，来自真实成绩数据）
export const getAnalysisClasses = () => request.get('/analysis/classes');
// 成绩分析：某班级不及格追踪矩阵（行=学生，列=考试批次）
export const getFailureMatrix = (clazz) =>
  request.get('/analysis/failures', { params: { class: clazz } });
