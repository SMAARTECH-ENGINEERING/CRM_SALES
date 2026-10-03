import axiosClient from './axiosClient.js';

// The audit log, newest first. Filters: userId, action, entityType, entityId,
// from, to (both days included), success, search (IP address or path).
export function listAuditLogs(params, { signal } = {}) {
  return axiosClient.get('/audit-logs', { params, signal });
}

// One entry in full, with oldData and newData.
export function getAuditLog(id, { signal } = {}) {
  return axiosClient.get(`/audit-logs/${id}`, { signal });
}

// What the filters can take: { actions, entityTypes }.
export function getAuditFilters({ signal } = {}) {
  return axiosClient.get('/audit-logs/filters', { signal });
}
