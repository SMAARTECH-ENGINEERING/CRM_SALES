import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as productsApi from '../api/products.api.js';

export const productKeys = {
  all: ['products'],
  lists: ['products', 'list'],
  list: (params) => ['products', 'list', params],
  detail: (id) => ['products', 'detail', id],
  options: (params) => ['products', 'options', params],
};

export function useProductsList(params) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: ({ signal }) => productsApi.listProducts(params, { signal }),
    select: (response) => response.data,
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id) {
  return useQuery({
    queryKey: productKeys.detail(id),
    queryFn: ({ signal }) => productsApi.getProduct(id, { signal }),
    select: (response) => response.data.product,
    enabled: Boolean(id),
  });
}

// Products for a picker, searched on the server. Pass { id } to fetch one by id.
export function useProductOptions(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: productKeys.options(params),
    queryFn: ({ signal }) => productsApi.listProductOptions(params, { signal }),
    select: (response) => response.data.products,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    enabled,
  });
}

export function useProductMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: productKeys.all });

  return {
    create: useMutation({ mutationFn: (data) => productsApi.createProduct(data), onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, data }) => productsApi.updateProduct(id, data),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id) => productsApi.deleteProduct(id),
      onSuccess: (response, id) => {
        // Drop the detail entry instead of refetching it (it would 404).
        queryClient.removeQueries({ queryKey: productKeys.detail(id) });
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: productKeys.lists }),
          queryClient.invalidateQueries({ queryKey: ['products', 'options'] }),
        ]);
      },
    }),
  };
}
