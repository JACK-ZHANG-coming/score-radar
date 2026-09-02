import request from './request';

export const getScores = (params) => request.get('/scores', { params });
export const getScoreOptions = () => request.get('/scores/options');
export const createScore = (data) => request.post('/scores', data);
export const updateScore = (id, data) => request.put(`/scores/${id}`, data);
export const deleteScore = (id) => request.delete(`/scores/${id}`);
export const importScores = (formData) =>
  request.post('/scores/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const syncStudents = () => request.post('/scores/sync-students');
export const downloadScoreTemplate = () =>
  request.get('/scores/template', { responseType: 'blob' });
