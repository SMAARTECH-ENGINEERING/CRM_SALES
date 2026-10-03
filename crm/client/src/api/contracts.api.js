import axiosClient from './axiosClient.js';

export function listContracts(params, { signal } = {}) {
  return axiosClient.get('/contracts', { params, signal });
}

// { byCategory: { draft, active, ... : { count, value } }, total,
//   expiringSoon: { withinDays, count, value }, pastEndDate }
export function getContractStats(params, { signal } = {}) {
  return axiosClient.get('/contracts/stats', { params, signal });
}

export function getContract(id, { signal } = {}) {
  return axiosClient.get(`/contracts/${id}`, { signal });
}

export function createContract(data) {
  return axiosClient.post('/contracts', data);
}

export function updateContract(id, data) {
  return axiosClient.put(`/contracts/${id}`, data);
}

export function deleteContract(id) {
  return axiosClient.delete(`/contracts/${id}`);
}

export function changeContractStatus(id, statusId) {
  return axiosClient.patch(`/contracts/${id}/status`, { statusId });
}

// The expiry reminders sent for one contract, newest first.
export function listContractReminders(id, { signal } = {}) {
  return axiosClient.get(`/contracts/${id}/reminders`, { signal });
}

export function getContractTimeline(id, params, { signal } = {}) {
  return axiosClient.get(`/contracts/${id}/timeline`, { params, signal });
}

// Runs the expiry check now: { expired, considered, reminded, emailed, periods }.
export function runContractReminders() {
  return axiosClient.post('/contracts/reminders/run');
}
