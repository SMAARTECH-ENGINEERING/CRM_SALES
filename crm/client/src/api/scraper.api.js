import axiosClient from './axiosClient.js';

// The web data scraper: jobs, their results, the pages they visited, and the
// import of reviewed results into companies, contacts and leads.

export const getScraperStats = ({ signal } = {}) => axiosClient.get('/scraper/stats', { signal });

export const listScrapeJobs = (params, { signal } = {}) => axiosClient.get('/scraper/jobs', { params, signal });
export const getScrapeJob = (id, { signal } = {}) => axiosClient.get(`/scraper/jobs/${id}`, { signal });
export const createScrapeJob = (data) => axiosClient.post('/scraper/jobs', data);
export const cancelScrapeJob = (id) => axiosClient.post(`/scraper/jobs/${id}/cancel`);
export const rerunScrapeJob = (id) => axiosClient.post(`/scraper/jobs/${id}/rerun`);
export const deleteScrapeJob = (id) => axiosClient.delete(`/scraper/jobs/${id}`);

// Filters: jobId, type, match, importStatus, duplicates, hasEmail, hasPhone,
// location, industry, minQuality, search, from, to.
export const listScrapedRecords = (params, { signal } = {}) => axiosClient.get('/scraper/records', { params, signal });
// Every id matching the filters (for "select all").
export const listScrapedRecordIds = (params) => axiosClient.get('/scraper/records/ids', { params });
export const getScrapedRecord = (id, { signal } = {}) => axiosClient.get(`/scraper/records/${id}`, { signal });
export const updateScrapedRecord = (id, data) => axiosClient.patch(`/scraper/records/${id}`, data);
export const recheckScrapedRecords = (recordIds) => axiosClient.post('/scraper/records/recheck', { recordIds });
// Resolves to the file as a Blob.
export const exportScrapedRecords = (params) => axiosClient.get('/scraper/records/export', { params, responseType: 'blob' });

export const listScrapePages = (params, { signal } = {}) => axiosClient.get('/scraper/pages', { params, signal });

export const previewScrapeImport = (data) => axiosClient.post('/scraper/import/preview', data);
export const runScrapeImport = (data) => axiosClient.post('/scraper/import', data);
