import request from './request';

// 成绩分析：班级列表（去重 + 排序，来自真实成绩数据）
export const getAnalysisClasses = () => request.get('/analysis/classes');
// 成绩分析：某班级不及格追踪矩阵（行=学生，列=考试批次）
// subject：不及格类别（total/choice/spreadsheet/access/python/composite，默认 total）
// ratio：不及格比例判定（60/70/80，默认 60；后端宽容接收 0<x<=100）
export const getFailureMatrix = (clazz, subject = 'total', ratio = 60) =>
  request.get('/analysis/failures', { params: { class: clazz, subject, ratio } });
