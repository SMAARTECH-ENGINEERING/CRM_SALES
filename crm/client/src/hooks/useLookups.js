import { useQuery } from '@tanstack/react-query';
import { listDepartments } from '../api/lookups.api.js';
import { listRoles } from '../api/roles.api.js';
import { roleKeys } from './useRoles.js';

const STALE_TIME = 5 * 60 * 1000;
// The API's maximum page size; dropdowns show a single page of options.
const OPTIONS_LIMIT = 100;

// Roles for dropdowns and filters.
export function useRoleOptions() {
  return useQuery({
    // Under the roles key so that editing a role refreshes the options too.
    queryKey: [...roleKeys.all, 'options'],
    queryFn: ({ signal }) => listRoles({ limit: OPTIONS_LIMIT, sortBy: 'name', sortOrder: 'asc' }, { signal }),
    select: (response) => response.data.roles,
    staleTime: STALE_TIME,
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: ({ signal }) => listDepartments({ signal }),
    select: (response) => response.data.departments,
    staleTime: STALE_TIME,
  });
}
