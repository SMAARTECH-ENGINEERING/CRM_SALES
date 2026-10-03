import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { renderAs } from '../test/renderWithProviders.jsx';
import PermissionGate from './PermissionGate.jsx';
import RequirePermission from './RequirePermission.jsx';

afterEach(cleanup);

const gate = (props) => (
  <PermissionGate {...props}>
    <button>Create</button>
  </PermissionGate>
);

describe('PermissionGate', () => {
  it('hides its children when the user lacks the permission', () => {
    renderAs(gate({ permission: 'leads.create' }), { permissions: ['leads.read'] });
    expect(screen.queryByRole('button', { name: 'Create' })).toBeNull();
  });

  it('shows its children when the user holds the permission', () => {
    renderAs(gate({ permission: 'leads.create' }), { permissions: ['leads.create'] });
    expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
  });

  it('requires every permission in a list', () => {
    const props = { permission: ['leads.read', 'leads.export'] };

    renderAs(gate(props), { permissions: ['leads.read'] });
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();

    renderAs(gate(props), { permissions: ['leads.read', 'leads.export'] });
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('anyOf needs only one of the permissions', () => {
    const props = { anyOf: ['roles.read', 'permissions.read'] };

    renderAs(gate(props), { permissions: ['permissions.read'] });
    expect(screen.getByRole('button')).toBeTruthy();
    cleanup();

    renderAs(gate(props), { permissions: ['users.read'] });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders the fallback instead when one is given', () => {
    renderAs(gate({ permission: 'leads.delete', fallback: <span>Not allowed</span> }), { permissions: [] });
    expect(screen.getByText('Not allowed')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows nothing gated when there is no permission list at all', () => {
    renderAs(gate({ permission: 'leads.create' }), { user: { id: 'u', fullName: 'No Role' } });
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('RequirePermission', () => {
  const routes = (
    <Routes>
      <Route element={<RequirePermission permission="roles.read" />}>
        <Route path="/roles" element={<h1>Roles page</h1>} />
      </Route>
    </Routes>
  );

  it('blocks the route and explains why', () => {
    renderAs(routes, { permissions: ['users.read'], route: '/roles' });
    expect(screen.queryByText('Roles page')).toBeNull();
    expect(screen.getByText(/do not have permission/i)).toBeTruthy();
  });

  it('renders the route for a permitted user', () => {
    renderAs(routes, { permissions: ['roles.read'], route: '/roles' });
    expect(screen.getByText('Roles page')).toBeTruthy();
  });
});
