import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as paymentsApi from '../api/payments.api.js';

export const paymentKeys = {
  all: ['payments'],
  lists: ['payments', 'list'],
  list: (params) => ['payments', 'list', params],
  stats: (params) => ['payments', 'stats', params],
  one: (id) => ['payments', 'detail', id],
  timeline: (id, params) => ['payments', 'detail', id, 'timeline', params],
};

export function usePaymentsList(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: paymentKeys.list(params),
    queryFn: ({ signal }) => paymentsApi.listPayments(params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePaymentStats(params = {}, { enabled = true } = {}) {
  return useQuery({
    queryKey: paymentKeys.stats(params),
    queryFn: ({ signal }) => paymentsApi.getPaymentStats(params, { signal }),
    select: (response) => response.data,
    enabled,
  });
}

export function usePayment(id) {
  return useQuery({
    queryKey: paymentKeys.one(id),
    queryFn: ({ signal }) => paymentsApi.getPayment(id, { signal }),
    select: (response) => response.data.payment,
    enabled: Boolean(id),
  });
}

export function usePaymentTimeline(id, params) {
  return useQuery({
    queryKey: paymentKeys.timeline(id, params),
    queryFn: ({ signal }) => paymentsApi.getPaymentTimeline(id, params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled: Boolean(id),
  });
}

export function usePaymentMutations() {
  const queryClient = useQueryClient();
  // Payments show on company, customer and order pages.
  const refreshEverything = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: paymentKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['companies'] }),
      queryClient.invalidateQueries({ queryKey: ['customers'] }),
    ]);

  return {
    create: useMutation({ mutationFn: (data) => paymentsApi.createPayment(data), onSuccess: refreshEverything }),
    update: useMutation({ mutationFn: ({ id, data }) => paymentsApi.updatePayment(id, data), onSuccess: refreshEverything }),
    remove: useMutation({
      mutationFn: (id) => paymentsApi.deletePayment(id),
      onSuccess: (response, id) => {
        queryClient.removeQueries({ queryKey: paymentKeys.one(id) });
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: paymentKeys.lists }),
          queryClient.invalidateQueries({ queryKey: ['payments', 'stats'] }),
          queryClient.invalidateQueries({ queryKey: ['companies'] }),
          queryClient.invalidateQueries({ queryKey: ['customers'] }),
        ]);
      },
    }),
  };
}
