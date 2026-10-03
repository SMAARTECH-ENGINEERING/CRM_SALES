import axiosClient from './axiosClient.js';

// `params` may filter by any related record: { companyId } | { contactId } |
// { leadId } | { opportunityId }, plus typeId, status, priority, assignedTo, ...
export function listActivities(params, { signal } = {}) {
  return axiosClient.get('/activities', { params, signal });
}

export function createActivity(data) {
  return axiosClient.post('/activities', data);
}

export function updateActivity(id, data) {
  return axiosClient.put(`/activities/${id}`, data);
}

export function deleteActivity(id) {
  return axiosClient.delete(`/activities/${id}`);
}
