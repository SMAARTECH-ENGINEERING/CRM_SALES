import axiosClient from './axiosClient.js';

export function login(credentials) {
  return axiosClient.post('/auth/login', credentials, { skipAuth: true });
}

export function logout() {
  return axiosClient.post('/auth/logout');
}

export function getMe({ signal } = {}) {
  return axiosClient.get('/auth/me', { signal });
}

export function changePassword(payload) {
  return axiosClient.post('/auth/change-password', payload);
}
