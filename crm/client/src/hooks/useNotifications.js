import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as notificationsApi from '../api/notifications.api.js';
import { connectNotifications } from '../realtime/notificationSocket.js';
import useNotify from './useNotify.js';

// Also fetched on a timer, so the bell stays right when the real-time
// connection is unavailable.
const REFRESH_MS = 60 * 1000;

export const notificationKeys = {
  all: ['notifications'],
  list: (params) => ['notifications', 'list', params],
};

// The signed-in user's notifications: { notifications, unreadCount, pagination }.
export function useNotificationsList(params, { poll = false } = {}) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: ({ signal }) => notificationsApi.listNotifications(params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    refetchInterval: poll ? REFRESH_MS : false,
  });
}

export function useNotificationMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  return {
    read: useMutation({ mutationFn: (id) => notificationsApi.markNotificationRead(id), onSuccess: refresh }),
    readAll: useMutation({ mutationFn: () => notificationsApi.markAllNotificationsRead(), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id) => notificationsApi.deleteNotification(id), onSuccess: refresh }),
  };
}

// Keeps the real-time connection open while mounted (once, in the layout): a
// new notification refreshes every notification list and is announced.
export function useNotificationStream() {
  const queryClient = useQueryClient();
  const notify = useNotify();

  useEffect(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    return connectNotifications({
      onNotification: ({ notification }) => {
        refresh();
        notify.info(`${notification.title}: ${notification.message}`);
      },
      // Any API request renews an expired token; the connection then retries.
      onRefused: refresh,
    });
  }, [queryClient, notify]);
}
