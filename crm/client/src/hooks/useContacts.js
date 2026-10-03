import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as contactsApi from '../api/contacts.api.js';
import { companyKeys } from './useCompanies.js';

export const contactKeys = {
  all: ['contacts'],
  lists: ['contacts', 'list'],
  list: (params) => ['contacts', 'list', params],
  detail: (id) => ['contacts', 'detail', id],
};

export function useContactsList(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: contactKeys.list(params),
    queryFn: ({ signal }) => contactsApi.listContacts(params, { signal }),
    select: (response) => response.data,
    // Keep the current page on screen while the next one loads.
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useContact(id) {
  return useQuery({
    queryKey: contactKeys.detail(id),
    queryFn: ({ signal }) => contactsApi.getContact(id, { signal }),
    select: (response) => response.data.contact,
    enabled: Boolean(id),
  });
}

export function useContactMutations() {
  const queryClient = useQueryClient();

  // Contact changes also alter the counts shown on company pages.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: contactKeys.all }),
      queryClient.invalidateQueries({ queryKey: companyKeys.all }),
    ]);

  return {
    create: useMutation({ mutationFn: contactsApi.createContact, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, data }) => contactsApi.updateContact(id, data),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: contactsApi.deleteContact,
      onSuccess: (response, id) => {
        // Drop the detail entry instead of refetching it (it would 404).
        queryClient.removeQueries({ queryKey: contactKeys.detail(id) });
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: contactKeys.lists }),
          queryClient.invalidateQueries({ queryKey: companyKeys.all }),
        ]);
      },
    }),
  };
}
