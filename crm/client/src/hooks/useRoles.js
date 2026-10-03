import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listPermissions } from '../api/permissions.api.js';
import * as rolesApi from '../api/roles.api.js';
import usePermission from './usePermission.js';
import { PERMISSIONS } from '../utils/permissions.js';

export const roleKeys = {
  all: ['roles'],
  list: (params) => ['roles', 'list', params],
  detail: (id) => ['roles', 'detail', id],
};

export function useRolesList(params) {
  return useQuery({
    queryKey: roleKeys.list(params),
    queryFn: ({ signal }) => rolesApi.listRoles(params, { signal }),
    select: (response) => response.data.roles,
  });
}

export function useRole(id) {
  return useQuery({
    queryKey: roleKeys.detail(id),
    queryFn: ({ signal }) => rolesApi.getRole(id, { signal }),
    select: (response) => response.data.role,
    enabled: Boolean(id),
  });
}

// The permission catalogue: every permission that exists, from the database.
export function usePermissionCatalogue() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: ({ signal }) => listPermissions(undefined, { signal }),
    select: (response) => response.data.permissions,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRoleMutations() {
  const queryClient = useQueryClient();

  // A role change can alter what users (including this one) may do and what
  // the users screen displays.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: roleKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['users'] }),
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
    ]);

  return {
    create: useMutation({ mutationFn: rolesApi.createRole, onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, data }) => rolesApi.updateRole(id, data),
      onSuccess: refresh,
    }),
    setPermissions: useMutation({
      mutationFn: ({ id, permissions }) => rolesApi.setRolePermissions(id, permissions),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: rolesApi.deleteRole,
      onSuccess: (response, id) => {
        // Drop the detail entry instead of refetching it (it would 404).
        queryClient.removeQueries({ queryKey: roleKeys.detail(id) });
        return queryClient.invalidateQueries({ queryKey: roleKeys.all });
      },
    }),
  };
}

// Which actions the signed-in user may take on `role`. Mirrors the API's rules
// so the UI does not offer something that would be refused.
export function useRoleActions() {
  const { can, covers, ownRoleId } = usePermission();

  return (role) => {
    // Nobody edits the role they hold, or one with more access than their own.
    const manageable = role.id !== ownRoleId && covers(role);
    return {
      edit: can(PERMISSIONS.ROLES_UPDATE) && manageable,
      // System roles must stay active.
      changeStatus: can(PERMISSIONS.ROLES_UPDATE) && manageable && !role.isSystem,
      // A full-access role has no editable permission list.
      assignPermissions: can(PERMISSIONS.ROLES_ASSIGN_PERMISSIONS) && manageable && !role.isSuperAdmin,
      remove: can(PERMISSIONS.ROLES_DELETE) && manageable && !role.isSystem,
    };
  };
}
