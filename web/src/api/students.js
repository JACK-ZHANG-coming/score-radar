import request from './request';

export const getStudents = (params) => request.get('/students', { params });
export const getStudentOptions = () => request.get('/students/options');
export const createStudent = (data) => request.post('/students', data);
export const updateStudent = (id, data) => request.put(`/students/${id}`, data);
export const deleteStudent = (id) => request.delete(`/students/${id}`);
export const clearStudents = () => request.delete('/students/clear');
export const importStudents = (formData) =>
  request.post('/students/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
export const downloadStudentTemplate = () =>
  request.get('/students/template', { responseType: 'blob' });
