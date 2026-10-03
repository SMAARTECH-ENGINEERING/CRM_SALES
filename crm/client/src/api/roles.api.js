import axiosClient from './axiosClient.js';

export function listRoles(params, { signal } = {}) {
  return axiosClient.get('/roles', { params, signal });
}

export function getRole(id, { signal } = {}) {
  return axiosClient.get(`/roles/${id}`, { signal });
}

export function createRole(data) {
  return axiosClient.post('/roles', data);
}

export function updateRole(id, data) {
  return axiosClient.put(`/roles/${id}`, data);
}

// `permissions` is the complete list of permission keys the role should hold.
export function setRolePermissions(id, permissions) {
  return axiosClient.put(`/roles/${id}/permissions`, { permissions });
}

export function deleteRole(id) {
  return axiosClient.delete(`/roles/${id}`);
}
