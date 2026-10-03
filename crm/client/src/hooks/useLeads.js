import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as leadsApi from '../api/leads.api.js';

export const leadKeys = {
  all: ['leads'],
  lists: ['leads', 'list'],
  list: (params) => ['leads', 'list', params],
  one: (id) => ['leads', 'detail', id],
  detail: (id) => ['leads', 'detail', id, 'record'],
  timeline: (id, params) => ['leads', 'detail', id, 'timeline', params],
};

export function useLeadsList(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: leadKeys.list(params),
    queryFn: ({ signal }) => leadsApi.listLeads(params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useLead(id) {
  return useQuery({
    queryKey: leadKeys.detail(id),
    queryFn: ({ signal }) => leadsApi.getLead(id, { signal }),
    select: (response) => response.data.lead,
    enabled: Boolean(id),
  });
}

export function useLeadTimeline(id, params) {
  return useQuery({
    queryKey: leadKeys.timeline(id, params),
    queryFn: ({ signal }) => leadsApi.getLeadTimeline(id, params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useLeadMutations() {
  const queryClient = useQueryClient();
  // Lists, the record, and its timeline (most changes add an event).
  const refresh = () => queryClient.invalidateQueries({ queryKey: leadKeys.all });
  // Conversion also creates or links companies and contacts, and an opportunity.
  const refreshEverything = () =>
    Promise.all([
      refresh(),
      queryClient.invalidateQueries({ queryKey: ['companies'] }),
      queryClient.invalidateQueries({ queryKey: ['contacts'] }),
      queryClient.invalidateQueries({ queryKey: ['opportunities'] }),
    ]);

  return {
    create: useMutation({ mutationFn: leadsApi.createLead, onSuccess: refreshEverything }),
    update: useMutation({
      mutationFn: ({ id, data }) => leadsApi.updateLead(id, data),
      onSuccess: refreshEverything,
    }),
    assign: useMutation({
      mutationFn: ({ id, assignedTo }) => leadsApi.assignLead(id, assignedTo),
      onSuccess: refresh,
    }),
    changeStatus: useMutation({
      mutationFn: ({ id, statusId }) => leadsApi.changeLeadStatus(id, statusId),
      onSuccess: refresh,
    }),
    // A dry run changes nothing, so there is nothing to refresh.
    preview: useMutation({ mutationFn: ({ id, data }) => leadsApi.convertLead(id, { ...data, dryRun: true }) }),
    convert: useMutation({
      mutationFn: ({ id, data }) => leadsApi.convertLead(id, data),
      onSuccess: refreshEverything,
    }),
    remove: useMutation({
      mutationFn: leadsApi.deleteLead,
      onSuccess: (response, id) => {
        // Drop everything cached for the record instead of refetching it (it would 404).
        queryClient.removeQueries({ queryKey: leadKeys.one(id) });
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: leadKeys.lists }),
          queryClient.invalidateQueries({ queryKey: ['companies'] }),
        ]);
      },
    }),
  };
}
