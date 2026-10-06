import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '../api/scraper.api.js';

export const scraperKeys = {
  all: ['scraper'],
  stats: ['scraper', 'stats'],
  jobs: (params) => ['scraper', 'jobs', params],
  job: (id) => ['scraper', 'job', id],
  records: (params) => ['scraper', 'records', params],
  record: (id) => ['scraper', 'record', id],
  pages: (params) => ['scraper', 'pages', params],
};

// While a job is queued or running its page is refreshed every two seconds.
const ACTIVE = ['queued', 'running'];

export function useScraperStats() {
  return useQuery({ queryKey: scraperKeys.stats, queryFn: ({ signal }) => api.getScraperStats({ signal }), select: (r) => r.data, refetchInterval: (query) => (query.state.data?.data?.running ? 3000 : false) });
}

export function useScrapeJobs(params) {
  return useQuery({
    queryKey: scraperKeys.jobs(params),
    queryFn: ({ signal }) => api.listScrapeJobs(params, { signal }),
    select: (r) => r.data,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => (query.state.data?.data?.jobs?.some((j) => ACTIVE.includes(j.status)) ? 3000 : false),
  });
}

export function useScrapeJob(id) {
  return useQuery({
    queryKey: scraperKeys.job(id),
    queryFn: ({ signal }) => api.getScrapeJob(id, { signal }),
    select: (r) => r.data.job,
    enabled: Boolean(id),
    refetchInterval: (query) => (ACTIVE.includes(query.state.data?.data?.job?.status) ? 2000 : false),
  });
}

export function useScrapedRecords(params, { enabled = true, live = false } = {}) {
  return useQuery({
    queryKey: scraperKeys.records(params),
    queryFn: ({ signal }) => api.listScrapedRecords(params, { signal }),
    select: (r) => r.data,
    placeholderData: keepPreviousData,
    enabled,
    refetchInterval: live ? 3000 : false,
  });
}

export function useScrapedRecord(id) {
  return useQuery({ queryKey: scraperKeys.record(id), queryFn: ({ signal }) => api.getScrapedRecord(id, { signal }), select: (r) => r.data.record, enabled: Boolean(id) });
}

export function useScrapePages(params, { enabled = true, live = false } = {}) {
  return useQuery({ queryKey: scraperKeys.pages(params), queryFn: ({ signal }) => api.listScrapePages(params, { signal }), select: (r) => r.data, placeholderData: keepPreviousData, enabled, refetchInterval: live ? 3000 : false });
}

export function useScraperMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: scraperKeys.all });
  // An import creates companies, contacts and leads.
  const refreshCrm = () => Promise.all([refresh(), ...['companies', 'contacts', 'leads'].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))]);
  return {
    create: useMutation({ mutationFn: api.createScrapeJob, onSuccess: refresh }),
    cancel: useMutation({ mutationFn: api.cancelScrapeJob, onSuccess: refresh }),
    rerun: useMutation({ mutationFn: api.rerunScrapeJob, onSuccess: refresh }),
    remove: useMutation({ mutationFn: api.deleteScrapeJob, onSuccess: refresh }),
    updateRecord: useMutation({ mutationFn: ({ id, ...data }) => api.updateScrapedRecord(id, data), onSuccess: refresh }),
    recheck: useMutation({ mutationFn: (ids) => api.recheckScrapedRecords(ids), onSuccess: refresh }),
    preview: useMutation({ mutationFn: (data) => api.previewScrapeImport(data) }),
    // Not refreshed per batch: the import dialog refreshes once at the end.
    importBatch: useMutation({ mutationFn: (data) => api.runScrapeImport(data) }),
    refreshAfterImport: refreshCrm,
  };
}
