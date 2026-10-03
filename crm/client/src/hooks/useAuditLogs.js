import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as auditApi from '../api/audit.api.js';

export function useAuditLogs(params) {
  return useQuery({
    queryKey: ['audit-logs', 'list', params],
    queryFn: ({ signal }) => auditApi.listAuditLogs(params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useAuditLog(id) {
  return useQuery({
    queryKey: ['audit-logs', 'detail', id],
    queryFn: ({ signal }) => auditApi.getAuditLog(id, { signal }),
    select: (response) => response.data.auditLog,
    enabled: Boolean(id),
    // An entry never changes.
    staleTime: Infinity,
  });
}

export function useAuditFilters() {
  return useQuery({
    queryKey: ['audit-logs', 'filters'],
    queryFn: ({ signal }) => auditApi.getAuditFilters({ signal }),
    select: (response) => response.data,
    staleTime: 60 * 1000,
  });
}
