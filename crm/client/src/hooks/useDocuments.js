import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as documentsApi from '../api/documents.api.js';

export const documentKeys = {
  all: ['documents'],
  list: (params) => ['documents', 'list', params],
  detail: (id) => ['documents', 'detail', id],
  versions: (id) => ['documents', 'versions', id],
  file: (id, version) => ['documents', 'file', id, version ?? 'current'],
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

export function useDocument(id, { enabled = true } = {}) {
  return useQuery({
    queryKey: documentKeys.detail(id),
    queryFn: ({ signal }) => documentsApi.getDocument(id, { signal }),
    select: (response) => response.data.document,
    enabled: Boolean(id) && enabled,
  });
}

export function useDocumentVersions(id, { enabled = true } = {}) {
  return useQuery({
    queryKey: documentKeys.versions(id),
    queryFn: ({ signal }) => documentsApi.listVersions(id, { signal }),
    select: (response) => response.data.versions,
    enabled: Boolean(id) && enabled,
  });
}

// The file's bytes, for viewing and editing. Kept briefly: the same version of
// a document never changes, but there is no need to hold large files for long.
export function useDocumentFile(id, { version, enabled = true } = {}) {
  return useQuery({
    queryKey: documentKeys.file(id, version),
    queryFn: async ({ signal }) => {
      const blob = await documentsApi.downloadDocument(id, { version, signal });
      return { blob, bytes: new Uint8Array(await blob.arrayBuffer()) };
    },
    enabled: Boolean(id) && enabled,
    staleTime: 60 * 1000,
    gcTime: 2 * 60 * 1000,
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
      // Not the files: a version's bytes never change, and refetching them is costly.
      queryClient.invalidateQueries({ queryKey: documentKeys.all, predicate: (query) => query.queryKey[1] !== 'file' }),
      queryClient.invalidateQueries({ queryKey: ['companies'] }),
      queryClient.invalidateQueries({ queryKey: ['customers'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
    ]);

  return {
    upload: useMutation({
      mutationFn: ({ onProgress, ...data }) => documentsApi.uploadDocuments(data, { onProgress }),
      onSuccess: refresh,
    }),
    update: useMutation({ mutationFn: ({ id, ...data }) => documentsApi.updateDocument(id, data), onSuccess: refresh }),
    download: useMutation({ mutationFn: (id) => documentsApi.downloadDocument(typeof id === 'object' ? id.id : id, typeof id === 'object' ? id : {}) }),
    saveVersion: useMutation({
      mutationFn: ({ id, onProgress, ...data }) => documentsApi.uploadVersion(id, data, { onProgress }),
      onSuccess: refresh,
    }),
    restore: useMutation({ mutationFn: ({ id, version }) => documentsApi.restoreVersion(id, version), onSuccess: refresh }),
    remove: useMutation({ mutationFn: (id) => documentsApi.deleteDocument(id), onSuccess: refresh }),
  };
}
