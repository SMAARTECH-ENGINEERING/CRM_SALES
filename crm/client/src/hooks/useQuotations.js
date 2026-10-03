import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as quotationsApi from '../api/quotations.api.js';
import * as settingsApi from '../api/settings.api.js';

export const quotationKeys = {
  all: ['quotations'],
  lists: ['quotations', 'list'],
  list: (params) => ['quotations', 'list', params],
  one: (id) => ['quotations', 'detail', id],
  detail: (id) => ['quotations', 'detail', id, 'record'],
  timeline: (id, params) => ['quotations', 'detail', id, 'timeline', params],
  calculation: (data) => ['quotations', 'calculate', data],
};

export function useQuotationsList(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: quotationKeys.list(params),
    queryFn: ({ signal }) => quotationsApi.listQuotations(params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useQuotation(id) {
  return useQuery({
    queryKey: quotationKeys.detail(id),
    queryFn: ({ signal }) => quotationsApi.getQuotation(id, { signal }),
    select: (response) => response.data.quotation,
    enabled: Boolean(id),
  });
}

export function useQuotationTimeline(id, params) {
  return useQuery({
    queryKey: quotationKeys.timeline(id, params),
    queryFn: ({ signal }) => quotationsApi.getQuotationTimeline(id, params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

// The server's pricing of what is on the builder right now. `data` is null
// while there is nothing complete enough to price.
export function useQuotationCalculation(data) {
  return useQuery({
    queryKey: quotationKeys.calculation(data),
    queryFn: ({ signal }) => quotationsApi.calculateQuotation(data, { signal }),
    select: (response) => response.data,
    // Keep the last totals on screen while the next ones are worked out.
    placeholderData: keepPreviousData,
    enabled: Boolean(data),
    staleTime: 30 * 1000,
    retry: false,
  });
}

export function useQuotationMutations() {
  const queryClient = useQueryClient();
  // Lists, the record, and its timeline (most changes add an event).
  const refresh = () => queryClient.invalidateQueries({ queryKey: quotationKeys.all });
  // Company pages count their quotations.
  const refreshEverything = () =>
    Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['companies'] })]);

  return {
    create: useMutation({ mutationFn: (data) => quotationsApi.createQuotation(data), onSuccess: refreshEverything }),
    update: useMutation({
      mutationFn: ({ id, data }) => quotationsApi.updateQuotation(id, data),
      onSuccess: refreshEverything,
    }),
    changeStatus: useMutation({
      mutationFn: ({ id, statusId }) => quotationsApi.changeQuotationStatus(id, statusId),
      onSuccess: refresh,
    }),
    send: useMutation({
      mutationFn: ({ id, data }) => quotationsApi.sendQuotation(id, data),
      onSuccess: refresh,
    }),
    pdf: useMutation({ mutationFn: (id) => quotationsApi.getQuotationPdf(id) }),
    remove: useMutation({
      mutationFn: (id) => quotationsApi.deleteQuotation(id),
      onSuccess: (response, id) => {
        // Drop everything cached for the record instead of refetching it (it would 404).
        queryClient.removeQueries({ queryKey: quotationKeys.one(id) });
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: quotationKeys.lists }),
          queryClient.invalidateQueries({ queryKey: ['companies'] }),
        ]);
      },
    }),
  };
}

const PROFILE_KEY = ['settings', 'company'];

// Our own company details (name, address, default terms, ...), from the API.
export function useCompanyProfile({ enabled = true } = {}) {
  return useQuery({
    queryKey: PROFILE_KEY,
    queryFn: ({ signal }) => settingsApi.getCompanyProfile({ signal }),
    select: (response) => response.data.profile,
    staleTime: 60 * 1000,
    enabled,
  });
}

export function useUpdateCompanyProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => settingsApi.updateCompanyProfile(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROFILE_KEY }),
  });
}

// Hands a Blob to the browser as a file download.
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
