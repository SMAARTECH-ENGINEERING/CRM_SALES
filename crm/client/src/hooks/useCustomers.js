import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as customersApi from '../api/customers.api.js';

export const customerKeys = {
  all: ['customers'],
  lists: ['customers', 'list'],
  list: (params) => ['customers', 'list', params],
  one: (id) => ['customers', 'detail', id],
  detail: (id) => ['customers', 'detail', id, 'record'],
  summary: (id) => ['customers', 'detail', id, 'summary'],
  timeline: (id, params) => ['customers', 'detail', id, 'timeline', params],
};

export function useCustomersList(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: customerKeys.list(params),
    queryFn: ({ signal }) => customersApi.listCustomers(params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

// The 360-degree view: the customer, its sections with real counts, and figures.
export function useCustomerSummary(id) {
  return useQuery({
    queryKey: customerKeys.summary(id),
    queryFn: ({ signal }) => customersApi.getCustomerSummary(id, { signal }),
    select: (response) => response.data,
    enabled: Boolean(id),
  });
}

export function useCustomerTimeline(id, params) {
  return useQuery({
    queryKey: customerKeys.timeline(id, params),
    queryFn: ({ signal }) => customersApi.getCustomerTimeline(id, params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useCustomerMutations() {
  const queryClient = useQueryClient();
  // Company pages show whether a company is a customer.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: customerKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['companies'] }),
    ]);

  return {
    create: useMutation({ mutationFn: (data) => customersApi.createCustomer(data), onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, data }) => customersApi.updateCustomer(id, data), onSuccess: refresh }),
    remove: useMutation({
      mutationFn: (id) => customersApi.deleteCustomer(id),
      onSuccess: (response, id) => {
        queryClient.removeQueries({ queryKey: customerKeys.one(id) });
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: customerKeys.lists }),
          queryClient.invalidateQueries({ queryKey: ['companies'] }),
        ]);
      },
    }),
  };
}
