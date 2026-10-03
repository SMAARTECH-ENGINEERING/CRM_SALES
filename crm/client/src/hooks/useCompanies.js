import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as companiesApi from '../api/companies.api.js';

export const companyKeys = {
  all: ['companies'],
  lists: ['companies', 'list'],
  list: (params) => ['companies', 'list', params],
  one: (id) => ['companies', 'detail', id],
  detail: (id) => ['companies', 'detail', id, 'record'],
  sections: (id) => ['companies', 'detail', id, 'sections'],
  timeline: (id, params) => ['companies', 'detail', id, 'timeline', params],
};

export function useCompaniesList(params) {
  return useQuery({
    queryKey: companyKeys.list(params),
    queryFn: ({ signal }) => companiesApi.listCompanies(params, { signal }),
    select: (response) => response.data,
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
  });
}

// Companies for a picker, searched on the server. Pass { id } to fetch one by id.
export function useCompanyOptions(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['companies', 'options', params],
    queryFn: ({ signal }) => companiesApi.listCompanyOptions(params, { signal }),
    select: (response) => response.data.companies,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
    enabled,
  });
}

export function useCompany(id) {
  return useQuery({
    queryKey: companyKeys.detail(id),
    queryFn: ({ signal }) => companiesApi.getCompany(id, { signal }),
    select: (response) => response.data.company,
    enabled: Boolean(id),
  });
}

export function useCompanySections(id) {
  return useQuery({
    queryKey: companyKeys.sections(id),
    queryFn: ({ signal }) => companiesApi.getCompanySections(id, { signal }),
    select: (response) => response.data.sections,
    enabled: Boolean(id),
  });
}

export function useCompanyTimeline(id, params) {
  return useQuery({
    queryKey: companyKeys.timeline(id, params),
    queryFn: ({ signal }) => companiesApi.getCompanyTimeline(id, params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useCompanyMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: companyKeys.all });

  return {
    create: useMutation({ mutationFn: companiesApi.createCompany, onSuccess: refresh }),
    // Also refreshes the record's sections and timeline (an update adds an event).
    update: useMutation({
      mutationFn: ({ id, data }) => companiesApi.updateCompany(id, data),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: companiesApi.deleteCompany,
      onSuccess: (response, id) => {
        // Drop everything cached for the record instead of refetching it (it would 404).
        queryClient.removeQueries({ queryKey: companyKeys.one(id) });
        return queryClient.invalidateQueries({ queryKey: companyKeys.lists });
      },
    }),
  };
}
