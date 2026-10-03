import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import * as reportsApi from '../api/reports.api.js';

// What can be run: { reports, exportFormats, exportMaxRows }.
export function useReportCatalog() {
  return useQuery({
    queryKey: ['reports', 'catalog'],
    queryFn: ({ signal }) => reportsApi.listReports({ signal }),
    select: (response) => response.data,
    staleTime: 60 * 1000,
  });
}

// One page of one report for the given parameters.
export function useReport(key, params, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['reports', 'run', key, params],
    queryFn: ({ signal }) => reportsApi.runReport(key, params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled: Boolean(key) && enabled,
  });
}

export function useReportExport() {
  return useMutation({ mutationFn: ({ key, params, format }) => reportsApi.exportReport(key, params, format) });
}
