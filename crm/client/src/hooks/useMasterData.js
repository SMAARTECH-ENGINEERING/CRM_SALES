import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createMasterData, listMasterData } from '../api/masterData.api.js';
import { listUserOptions } from '../api/users.api.js';

const STALE_TIME = 5 * 60 * 1000;

const masterDataKey = (resource) => ['master-data', resource];

// Active entries of a list (see MASTER_DATA in api/masterData.api.js).
export function useMasterData(resource, { enabled = true } = {}) {
  return useQuery({
    queryKey: masterDataKey(resource),
    queryFn: ({ signal }) => listMasterData(resource, { signal }),
    select: (response) => response.data.items,
    staleTime: STALE_TIME,
    enabled,
  });
}

export function useCreateMasterData(resource) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => createMasterData(resource, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: masterDataKey(resource) }),
  });
}

// Active users for "assign to" pickers.
export function useUserOptions({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['users', 'options'],
    queryFn: ({ signal }) => listUserOptions(undefined, { signal }),
    select: (response) => response.data.users,
    staleTime: STALE_TIME,
    enabled,
  });
}
