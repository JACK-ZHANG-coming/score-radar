import request from './request';

export const getScores = (params) => request.get('/scores', { params });
export const getScoreOptions = () => request.get('/scores/options');
export const getScoreBatchNos = (params) => request.get('/scores/batch-nos', { params });
export const createScore = (data) => request.post('/scores', data);
export const updateScore = (id, data) => request.put(`/scores/${id}`, data);
export const deleteScore = (id) => request.delete(`/scores/${id}`);
export const deleteScoresBatch = (ids) => request.delete('/scores/batch', { data: { ids } });
export const importScores = (formData) =>
  request.post('/scores/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
// 多文件导入：每个文件各自携带一个试卷批号（batchNos 为 JSON 数组字符串）
export const importScoresMulti = (formData) =>
  request.post('/scores/import-multi', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
export const syncStudents = () => request.post('/scores/sync-students');
export const downloadScoreTemplate = () =>
  request.get('/scores/template', { responseType: 'blob' });
