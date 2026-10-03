import axiosClient from './axiosClient.js';

// The reports the signed-in user can run, each with its columns, date fields
// and filters (with their options) - the screen is built from this.
export function listReports({ signal } = {}) {
  return axiosClient.get('/reports', { signal });
}

// One page of a report. `params`: from, to, dateField, search, sortBy,
// sortOrder, page, limit and the report's own filters. Everything - filtering,
// sorting, paging, totals - is done by the API.
export function runReport(key, params, { signal } = {}) {
  return axiosClient.get(`/reports/${key}`, { params, signal });
}

// The same report as a file (csv | xlsx | pdf), built by the API. Resolves to a Blob.
export function exportReport(key, params, format) {
  return axiosClient.get(`/reports/${key}/export`, {
    params: { ...params, format },
    responseType: 'blob',
    // A large export takes longer than an ordinary request.
    timeout: 120000,
  });
}
