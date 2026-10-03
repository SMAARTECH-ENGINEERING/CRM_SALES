import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ordersApi from '../api/orders.api.js';

export const orderKeys = {
  all: ['orders'],
  lists: ['orders', 'list'],
  list: (params) => ['orders', 'list', params],
  one: (id) => ['orders', 'detail', id],
  detail: (id) => ['orders', 'detail', id, 'record'],
  timeline: (id, params) => ['orders', 'detail', id, 'timeline', params],
};

export function useOrdersList(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: orderKeys.list(params),
    queryFn: ({ signal }) => ordersApi.listOrders(params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useOrder(id) {
  return useQuery({
    queryKey: orderKeys.detail(id),
    queryFn: ({ signal }) => ordersApi.getOrder(id, { signal }),
    select: (response) => response.data.order,
    enabled: Boolean(id),
  });
}

export function useOrderTimeline(id, params) {
  return useQuery({
    queryKey: orderKeys.timeline(id, params),
    queryFn: ({ signal }) => ordersApi.getOrderTimeline(id, params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useOrderMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: orderKeys.all });
  // Creating or deleting an order also changes its quotation and the company's counts.
  const refreshEverything = () =>
    Promise.all([
      refresh(),
      queryClient.invalidateQueries({ queryKey: ['quotations'] }),
      queryClient.invalidateQueries({ queryKey: ['companies'] }),
    ]);

  return {
    fromQuotation: useMutation({
      mutationFn: ({ quotationId, data }) => ordersApi.createOrderFromQuotation(quotationId, data),
      onSuccess: refreshEverything,
    }),
    update: useMutation({ mutationFn: ({ id, data }) => ordersApi.updateOrder(id, data), onSuccess: refresh }),
    changeStatus: useMutation({
      mutationFn: ({ id, statusId }) => ordersApi.changeOrderStatus(id, statusId),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id) => ordersApi.deleteOrder(id),
      onSuccess: (response, id) => {
        // Drop everything cached for the record instead of refetching it (it would 404).
        queryClient.removeQueries({ queryKey: orderKeys.one(id) });
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: orderKeys.lists }),
          queryClient.invalidateQueries({ queryKey: ['quotations'] }),
          queryClient.invalidateQueries({ queryKey: ['companies'] }),
        ]);
      },
    }),
  };
}
