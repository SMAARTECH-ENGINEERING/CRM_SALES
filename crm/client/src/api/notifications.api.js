import axiosClient from './axiosClient.js';

// The signed-in user's notifications, newest first:
// { notifications, unreadCount, pagination }. `isRead: false` for unread only.
export function listNotifications(params, { signal } = {}) {
  return axiosClient.get('/notifications', { params, signal });
}

export function markNotificationRead(id) {
  return axiosClient.patch(`/notifications/${id}/read`);
}

export function markAllNotificationsRead() {
  return axiosClient.patch('/notifications/read-all');
}

export function deleteNotification(id) {
  return axiosClient.delete(`/notifications/${id}`);
}
