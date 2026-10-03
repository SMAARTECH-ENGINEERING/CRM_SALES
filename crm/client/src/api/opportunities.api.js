import axiosClient from './axiosClient.js';

export function listOpportunities(params, { signal } = {}) {
  return axiosClient.get('/opportunities', { params, signal });
}

// One pipeline as columns: { pipeline, columns: [{ stage, total, totalValue, opportunities }] }.
// Without a pipelineId the API uses the default pipeline.
export function getBoard(params, { signal } = {}) {
  return axiosClient.get('/opportunities/board', { params, signal });
}

// For pickers: { search, companyId, limit }, or { id } for one opportunity.
export function listOpportunityOptions(params, { signal } = {}) {
  return axiosClient.get('/opportunities/options', { params, signal });
}

export function getOpportunity(id, { signal } = {}) {
  return axiosClient.get(`/opportunities/${id}`, { signal });
}

export function createOpportunity(data) {
  return axiosClient.post('/opportunities', data);
}

export function updateOpportunity(id, data) {
  return axiosClient.put(`/opportunities/${id}`, data);
}

export function deleteOpportunity(id) {
  return axiosClient.delete(`/opportunities/${id}`);
}

// The API checks that the stage is active and belongs to the pipeline of the opportunity.
export function moveOpportunity(id, stageId) {
  return axiosClient.patch(`/opportunities/${id}/stage`, { stageId });
}

// `assignedTo`: a user id, or null to unassign.
export function assignOpportunity(id, assignedTo) {
  return axiosClient.patch(`/opportunities/${id}/assign`, { assignedTo });
}

export function getOpportunityTimeline(id, params, { signal } = {}) {
  return axiosClient.get(`/opportunities/${id}/timeline`, { params, signal });
}
