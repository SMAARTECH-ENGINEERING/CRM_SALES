import { useCallback, useMemo } from 'react';
import useAuth from './useAuth.js';

const NONE = [];

// Permission checks for the signed-in user. `user.permissions` is the list of
// keys the API resolved from the user's role in the database.
export default function usePermission() {
  const { user } = useAuth();
  const permissions = user?.permissions ?? NONE;
  const fullAccess = Boolean(user?.role?.isSuperAdmin) && user?.role?.status === 'active';
  const ownRoleId = user?.roleId;

  const held = useMemo(() => new Set(permissions), [permissions]);

  const can = useCallback((key) => held.has(key), [held]);
  const canAny = useCallback((keys) => keys.some((key) => held.has(key)), [held]);

  // Whether `role` carries no more access than the signed-in user has - the
  // condition the API applies before letting someone assign or manage it.
  const covers = useCallback(
    (role) => {
      if (fullAccess || !role) return true;
      if (role.isSuperAdmin) return false;
      return (role.permissions ?? []).every((permission) => held.has(permission.key));
    },
    [fullAccess, held]
  );

  return useMemo(
    () => ({ can, canAny, covers, ownRoleId }),
    [can, canAny, covers, ownRoleId]
  );
}
