import { Outlet } from 'react-router-dom';
import PermissionGate from './PermissionGate.jsx';
import ErrorPage from './ui/ErrorPage.jsx';

// Layout route: renders its child routes only when the user holds the
// permission(s). Takes the same `permission` / `anyOf` props as PermissionGate.
export default function RequirePermission({ permission, anyOf }) {
  return (
    <PermissionGate
      permission={permission}
      anyOf={anyOf}
      fallback={<ErrorPage status={403} />}
    >
      <Outlet />
    </PermissionGate>
  );
}
