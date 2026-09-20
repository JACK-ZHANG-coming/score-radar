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

/** 自动更新试卷批号（execute=false 预览差异；execute=true 执行同步） */
export const syncPaperBatches = (execute) =>
  request.post('/paper-batches/sync', { execute });

/** 一键修改合格占比：按当前筛选条件批量覆盖（body: { passRatio, name, batchNo }） */
export const updatePassRatioBatch = (data) =>
  request.post('/paper-batches/batch-pass-ratio', data);

/** 班级下拉选项（批次派生班级 ∪ 成绩表班级，去重升序） */
export const getClassOptions = () =>
  request.get('/paper-batches/class-options');

/** 一键设置总满分·预览：仅返回总满分为 0（未配置）的批次及各自五科/总分的最高分 */
export const getTotalFullPreview = () =>
  request.get('/paper-batches/total-full-preview');

/** 一键设置总满分·执行
 *  body: { updates: [{id, choiceFull, spreadsheetFull, accessFull, pythonFull, compositeFull}] }
 *  五科满分以用户输入为准（默认带出各科最高分），服务端求和写入 total_full，仅补 0 值批次 */
export const applyTotalFull = (updates) =>
  request.post('/paper-batches/total-full-apply', { updates });
