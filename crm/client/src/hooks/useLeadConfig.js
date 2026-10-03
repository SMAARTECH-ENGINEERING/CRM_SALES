import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as leadConfigApi from '../api/leadConfig.api.js';

const key = (resource) => ['lead-config', resource];

// Values of one lead configuration list, from the API.
//   useLeadConfig(LEAD_CONFIG.STATUSES.resource, { activeOnly: true })   for lead forms
//   useLeadConfig(LEAD_CONFIG.STATUSES.resource)                         everything (settings)
export function useLeadConfig(resource, { activeOnly = false } = {}) {
  const params = activeOnly ? { isActive: true } : undefined;
  return useQuery({
    queryKey: [...key(resource), params ?? 'all'],
    queryFn: ({ signal }) => leadConfigApi.listLeadConfig(resource, params, { signal }),
    select: (response) => response.data.items,
    staleTime: 60 * 1000,
  });
}

export function useLeadConfigMutations(resource) {
  const queryClient = useQueryClient();
  // Covers both the full list and the active-only list of this resource.
  const refresh = () => queryClient.invalidateQueries({ queryKey: key(resource) });

  return {
    create: useMutation({
      mutationFn: (data) => leadConfigApi.createLeadConfig(resource, data),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, data }) => leadConfigApi.updateLeadConfig(resource, id, data),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id) => leadConfigApi.deleteLeadConfig(resource, id),
      onSuccess: refresh,
    }),
  };
}
