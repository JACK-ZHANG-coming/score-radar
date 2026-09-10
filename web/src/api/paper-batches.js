import request from './request';

// 试卷批次管理接口封装（与后端 /api/paper-batches 对齐）

/** 分页查询列表（支持 name/batchNo 模糊、排序、分页） */
export const getPaperBatches = (params) => request.get('/paper-batches', { params });

/** 新增试卷批次 */
export const createPaperBatch = (data) => request.post('/paper-batches', data);

/** 编辑试卷批次 */
export const updatePaperBatch = (id, data) => request.put(`/paper-batches/${id}`, data);

/** 删除单条 */
export const deletePaperBatch = (id) => request.delete(`/paper-batches/${id}`);

/** 批量删除（body: { ids: number[] }） */
export const deletePaperBatchesBatch = (ids) =>
  request.delete('/paper-batches/batch', { data: { ids } });

/** Excel 批量导入（formData 含 file，可选 overwrite） */
export const importPaperBatches = (formData) =>
  request.post('/paper-batches/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

/** 下载导入模板（blob） */
export const downloadPaperBatchTemplate = () =>
  request.get('/paper-batches/template', { responseType: 'blob' });

/** 导出当前筛选全集（blob） */
export const exportPaperBatches = (params) =>
  request.get('/paper-batches/export', { params, responseType: 'blob' });

/** 成绩页联动取配置（by-no） */
export const getPaperBatchByNo = (batchNo) =>
  request.get(`/paper-batches/by-no/${encodeURIComponent(batchNo)}`);

/** 编辑弹窗 0 分项预填：取该批次学生成绩五项最高分（max-scores） */
export const getPaperBatchMaxScores = (batchNo) =>
  request.get(`/paper-batches/max-scores/${encodeURIComponent(batchNo)}`);
