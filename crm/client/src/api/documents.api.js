import axiosClient from './axiosClient.js';

// `entityType` + `entityId` for the documents of one record; neither for
// everything the signed-in user may see.
export function listDocuments(params, { signal } = {}) {
  return axiosClient.get('/documents', { params, signal });
}

// The upload rules: { field, maxFileBytes, maxFiles, allowedTypes, entityTypes }.
export function getDocumentConfig({ signal } = {}) {
  return axiosClient.get('/documents/config', { signal });
}

// Sends the files as multipart/form-data. `onProgress(0..100)` is optional.
export function uploadDocuments({ entityType, entityId, files, field = 'files' }, { onProgress } = {}) {
  const form = new FormData();
  form.append('entityType', entityType);
  form.append('entityId', entityId);
  for (const file of files) form.append(field, file);
  return axiosClient.post('/documents', form, {
    onUploadProgress: onProgress
      ? (event) => onProgress(event.total ? Math.round((event.loaded / event.total) * 100) : 0)
      : undefined,
  });
}

// Resolves to the file as a Blob. Downloads go through the API (never a
// storage address) so every one is checked against the signed-in user.
export function downloadDocument(id) {
  return axiosClient.get(`/documents/${id}/download`, { responseType: 'blob' });
}

export function deleteDocument(id) {
  return axiosClient.delete(`/documents/${id}`);
}
