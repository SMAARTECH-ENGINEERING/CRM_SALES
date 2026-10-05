import axiosClient from './axiosClient.js';

// `entityType` + `entityId` for the documents of one record; neither for
// everything the signed-in user may see. Other filters: search, kind,
// documentTypeId, statusId, companyId, uploadedBy, from, to.
export function listDocuments(params, { signal } = {}) {
  return axiosClient.get('/documents', { params, signal });
}

export function getDocument(id, { signal } = {}) {
  return axiosClient.get(`/documents/${id}`, { signal });
}

// The upload rules: { field, maxFileBytes, maxFiles, allowedTypes, entityTypes }.
export function getDocumentConfig({ signal } = {}) {
  return axiosClient.get('/documents/config', { signal });
}

const progressOf = (onProgress) =>
  onProgress ? (event) => onProgress(event.total ? Math.round((event.loaded / event.total) * 100) : 0) : undefined;

// Sends the files as multipart/form-data. `onProgress(0..100)` is optional.
export function uploadDocuments({ entityType, entityId, files, field = 'files', documentTypeId, statusId }, { onProgress } = {}) {
  const form = new FormData();
  form.append('entityType', entityType);
  form.append('entityId', entityId);
  if (documentTypeId) form.append('documentTypeId', documentTypeId);
  if (statusId) form.append('statusId', statusId);
  for (const file of files) form.append(field, file);
  return axiosClient.post('/documents', form, { onUploadProgress: progressOf(onProgress) });
}

// Rename, or set the type or status: only what is passed changes.
export function updateDocument(id, data) {
  return axiosClient.patch(`/documents/${id}`, data);
}

// Resolves to the file as a Blob - the current version, or `version`.
// Downloads go through the API (never a storage address) so every one is
// checked against the signed-in user.
export function downloadDocument(id, { version, signal } = {}) {
  return axiosClient.get(`/documents/${id}/download`, { responseType: 'blob', params: version ? { version } : undefined, signal });
}

export function listVersions(id, { signal } = {}) {
  return axiosClient.get(`/documents/${id}/versions`, { signal });
}

// A new file for the same document (an edited PDF, an updated sheet); the one
// it replaces is kept as the previous version.
export function uploadVersion(id, { file, fileName, note }, { onProgress } = {}) {
  const form = new FormData();
  form.append('file', file, fileName || file.name);
  if (note) form.append('note', note);
  if (fileName) form.append('fileName', fileName);
  return axiosClient.post(`/documents/${id}/versions`, form, { onUploadProgress: progressOf(onProgress) });
}

export function restoreVersion(id, version) {
  return axiosClient.post(`/documents/${id}/versions/${version}/restore`);
}

export function deleteDocument(id) {
  return axiosClient.delete(`/documents/${id}`);
}
