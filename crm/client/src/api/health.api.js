import axiosClient from './axiosClient.js';

export function getHealth({ signal } = {}) {
  return axiosClient.get('/health', { signal });
}
