import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as documentsApi from '../api/documents.api.js';

export const documentKeys = {
  all: ['documents'],
  list: (params) => ['documents', 'list', params],
  config: ['documents', 'config'],
};

export function useDocumentsList(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: documentKeys.list(params),
    queryFn: ({ signal }) => documentsApi.listDocuments(params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

// Size, count and type limits, from the API - upload forms have none of their own.
export function useDocumentConfig({ enabled = true } = {}) {
  return useQuery({
    queryKey: documentKeys.config,
    queryFn: ({ signal }) => documentsApi.getDocumentConfig({ signal }),
    select: (response) => response.data,
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

export function useDocumentMutations() {
  const queryClient = useQueryClient();
  // Section counts on company, customer and project pages include documents.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['documents', 'list'] }),
      queryClient.invalidateQueries({ queryKey: ['companies'] }),
      queryClient.invalidateQueries({ queryKey: ['customers'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
    ]);

  return {
    upload: useMutation({
      mutationFn: ({ onProgress, ...data }) => documentsApi.uploadDocuments(data, { onProgress }),
      onSuccess: refresh,
    }),
    download: useMutation({ mutationFn: (id) => documentsApi.downloadDocument(id) }),
    remove: useMutation({ mutationFn: (id) => documentsApi.deleteDocument(id), onSuccess: refresh }),
  };
}
