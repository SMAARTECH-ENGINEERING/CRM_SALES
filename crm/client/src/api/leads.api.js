import axiosClient from './axiosClient.js';

export function listLeads(params, { signal } = {}) {
  return axiosClient.get('/leads', { params, signal });
}

export function getLead(id, { signal } = {}) {
  return axiosClient.get(`/leads/${id}`, { signal });
}

export function createLead(data) {
  return axiosClient.post('/leads', data);
}

export function updateLead(id, data) {
  return axiosClient.put(`/leads/${id}`, data);
}

export function deleteLead(id) {
  return axiosClient.delete(`/leads/${id}`);
}

// `assignedTo`: a user id, or null to unassign.
export function assignLead(id, assignedTo) {
  return axiosClient.patch(`/leads/${id}/assign`, { assignedTo });
}

export function changeLeadStatus(id, statusId) {
  return axiosClient.patch(`/leads/${id}/status`, { statusId });
}

// With { dryRun: true } nothing is changed: the response says what would happen.
export function convertLead(id, data) {
  return axiosClient.post(`/leads/${id}/convert`, data);
}

export function getLeadTimeline(id, params, { signal } = {}) {
  return axiosClient.get(`/leads/${id}/timeline`, { params, signal });
}
