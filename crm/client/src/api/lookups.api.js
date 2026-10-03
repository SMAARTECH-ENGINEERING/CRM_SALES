import axiosClient from './axiosClient.js';

export function listDepartments({ signal } = {}) {
  return axiosClient.get('/departments', { signal });
}
