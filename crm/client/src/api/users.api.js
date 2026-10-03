import axiosClient from './axiosClient.js';

export function listUsers(params, { signal } = {}) {
  return axiosClient.get('/users', { params, signal });
}

// Names of active users, for "assign to" pickers.
export function listUserOptions(params, { signal } = {}) {
  return axiosClient.get('/users/options', { params, signal });
}

export function getUser(id, { signal } = {}) {
  return axiosClient.get(`/users/${id}`, { signal });
}

export function createUser(data) {
  return axiosClient.post('/users', data);
}

export function updateUser(id, data) {
  return axiosClient.put(`/users/${id}`, data);
}

export function setUserStatus(id, status) {
  return axiosClient.patch(`/users/${id}/status`, { status });
}

export function resetUserPassword(id, newPassword) {
  return axiosClient.patch(`/users/${id}/reset-password`, { newPassword });
}

export function deleteUser(id) {
  return axiosClient.delete(`/users/${id}`);
}
