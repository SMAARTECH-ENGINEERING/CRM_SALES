import usePermission from '../hooks/usePermission.js';

// Renders its children only when the signed-in user is allowed to see them.
//
//   <PermissionGate permission="leads.create"><Button>New lead</Button></PermissionGate>
//   <PermissionGate permission={['leads.read', 'leads.export']}>...</PermissionGate>   all required
//   <PermissionGate anyOf={['roles.read', 'permissions.read']}>...</PermissionGate>     one is enough
//   <PermissionGate permission="leads.delete" fallback={<Hint />}>...</PermissionGate>
//
// This only keeps the screen tidy. The API checks the permission again on every
// request, so hiding a button is never what protects the action.
export default function PermissionGate({ permission, anyOf, fallback = null, children }) {
  const { can, canAny } = usePermission();

  const required = permission == null ? [] : [].concat(permission);
  const allowed = required.every(can) && (!anyOf || canAny(anyOf));

  return allowed ? children : fallback;
}
