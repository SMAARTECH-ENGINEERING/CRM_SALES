import axiosClient from './axiosClient.js';

// `params`: { status: 'active' } for what forms offer; nothing for everything.
export function listPipelines(params, { signal } = {}) {
  return axiosClient.get('/pipelines', { params, signal });
}

// The pipeline and its stages, in board order.
export function getPipeline(id, { signal } = {}) {
  return axiosClient.get(`/pipelines/${id}`, { signal });
}

export function createPipeline(data) {
  return axiosClient.post('/pipelines', data);
}

export function updatePipeline(id, data) {
  return axiosClient.put(`/pipelines/${id}`, data);
}

export function deletePipeline(id) {
  return axiosClient.delete(`/pipelines/${id}`);
}

// `params`: { pipelineId, status }.
export function listStages(params, { signal } = {}) {
  return axiosClient.get('/pipeline-stages', { params, signal });
}

export function createStage(data) {
  return axiosClient.post('/pipeline-stages', data);
}

export function updateStage(id, data) {
  return axiosClient.put(`/pipeline-stages/${id}`, data);
}

export function deleteStage(id) {
  return axiosClient.delete(`/pipeline-stages/${id}`);
}

// `stageIds`: every stage of the pipeline, in the new order.
export function reorderStages(pipelineId, stageIds) {
  return axiosClient.patch('/pipeline-stages/reorder', { pipelineId, stageIds });
}
