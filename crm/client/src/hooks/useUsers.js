import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as usersApi from '../api/users.api.js';

export const userKeys = {
  all: ['users'],
  lists: ['users', 'list'],
  list: (params) => ['users', 'list', params],
  detail: (id) => ['users', 'detail', id],
};

export function useUsersList(params) {
  return useQuery({
    queryKey: userKeys.list(params),
    queryFn: ({ signal }) => usersApi.listUsers(params, { signal }),
    select: (response) => response.data,
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
}

export function useUser(id) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: ({ signal }) => usersApi.getUser(id, { signal }),
    select: (response) => response.data.user,
    enabled: Boolean(id),
  });
}

export function useUserMutations() {
  const queryClient = useQueryClient();
  const refreshUsers = () => queryClient.invalidateQueries({ queryKey: userKeys.all });

  return {
    create: useMutation({ mutationFn: usersApi.createUser, onSuccess: refreshUsers }),
    update: useMutation({
      mutationFn: ({ id, data }) => usersApi.updateUser(id, data),
      onSuccess: () => {
        // The edited user may be the signed-in one (name shown in the app bar).
        queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
        return refreshUsers();
      },
    }),
    setStatus: useMutation({
      mutationFn: ({ id, status }) => usersApi.setUserStatus(id, status),
      onSuccess: refreshUsers,
    }),
    resetPassword: useMutation({
      mutationFn: ({ id, newPassword }) => usersApi.resetUserPassword(id, newPassword),
    }),
    remove: useMutation({
      mutationFn: usersApi.deleteUser,
      onSuccess: (response, id) => {
        // Drop the detail entry instead of refetching it (it would 404).
        queryClient.removeQueries({ queryKey: userKeys.detail(id) });
        return queryClient.invalidateQueries({ queryKey: userKeys.lists });
      },
    }),
  };
}
