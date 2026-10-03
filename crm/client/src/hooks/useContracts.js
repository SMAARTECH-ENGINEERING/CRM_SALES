import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as contractsApi from '../api/contracts.api.js';

export const contractKeys = {
  all: ['contracts'],
  lists: ['contracts', 'list'],
  list: (params) => ['contracts', 'list', params],
  stats: (params) => ['contracts', 'stats', params],
  one: (id) => ['contracts', 'detail', id],
  reminders: (id) => ['contracts', 'detail', id, 'reminders'],
  timeline: (id, params) => ['contracts', 'detail', id, 'timeline', params],
};

export function useContractsList(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: contractKeys.list(params),
    queryFn: ({ signal }) => contractsApi.listContracts(params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useContractStats(params = {}) {
  return useQuery({
    queryKey: contractKeys.stats(params),
    queryFn: ({ signal }) => contractsApi.getContractStats(params, { signal }),
    select: (response) => response.data,
  });
}

export function useContract(id) {
  return useQuery({
    queryKey: contractKeys.one(id),
    queryFn: ({ signal }) => contractsApi.getContract(id, { signal }),
    select: (response) => response.data.contract,
    enabled: Boolean(id),
  });
}

export function useContractReminders(id) {
  return useQuery({
    queryKey: contractKeys.reminders(id),
    queryFn: ({ signal }) => contractsApi.listContractReminders(id, { signal }),
    select: (response) => response.data.reminders,
    enabled: Boolean(id),
  });
}

export function useContractTimeline(id, params) {
  return useQuery({
    queryKey: contractKeys.timeline(id, params),
    queryFn: ({ signal }) => contractsApi.getContractTimeline(id, params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled: Boolean(id),
  });
}

export function useContractMutations() {
  const queryClient = useQueryClient();
  // Contracts show on company and customer pages, and reminders are follow-ups.
  const refreshEverything = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: contractKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['companies'] }),
      queryClient.invalidateQueries({ queryKey: ['customers'] }),
      queryClient.invalidateQueries({ queryKey: ['followups'] }),
    ]);

  return {
    create: useMutation({ mutationFn: (data) => contractsApi.createContract(data), onSuccess: refreshEverything }),
    update: useMutation({ mutationFn: ({ id, data }) => contractsApi.updateContract(id, data), onSuccess: refreshEverything }),
    changeStatus: useMutation({
      mutationFn: ({ id, statusId }) => contractsApi.changeContractStatus(id, statusId),
      onSuccess: refreshEverything,
    }),
    runReminders: useMutation({ mutationFn: () => contractsApi.runContractReminders(), onSuccess: refreshEverything }),
    remove: useMutation({
      mutationFn: (id) => contractsApi.deleteContract(id),
      onSuccess: (response, id) => {
        queryClient.removeQueries({ queryKey: contractKeys.one(id) });
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: contractKeys.lists }),
          queryClient.invalidateQueries({ queryKey: ['contracts', 'stats'] }),
          queryClient.invalidateQueries({ queryKey: ['companies'] }),
          queryClient.invalidateQueries({ queryKey: ['customers'] }),
          queryClient.invalidateQueries({ queryKey: ['followups'] }),
        ]);
      },
    }),
  };
}
