import axiosClient from './axiosClient.js';

// `params`: { relatedType, relatedId } for one record's follow-ups, plus
// assignedTo, status, priority, overdue, ...
export function listFollowUps(params, { signal } = {}) {
  return axiosClient.get('/followups', { params, signal });
}

export function createFollowUp(data) {
  return axiosClient.post('/followups', data);
}

export function updateFollowUp(id, data) {
  return axiosClient.put(`/followups/${id}`, data);
}

export function completeFollowUp(id) {
  return axiosClient.patch(`/followups/${id}/complete`);
}

// `data`: { dueDate, reminderDate? }
export function rescheduleFollowUp(id, data) {
  return axiosClient.patch(`/followups/${id}/reschedule`, data);
}
