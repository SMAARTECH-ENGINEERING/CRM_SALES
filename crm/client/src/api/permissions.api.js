import axiosClient from './axiosClient.js';

export function listPermissions(params, { signal } = {}) {
  return axiosClient.get('/permissions', { params, signal });
}
