import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { listPermissions } from '../api/permissions.api.js';
import { getRole } from '../api/roles.api.js';
import { makeUser, renderAs } from '../test/renderWithProviders.jsx';
import RoleDetailPage from './RoleDetailPage.jsx';

vi.mock('../api/roles.api.js');
vi.mock('../api/permissions.api.js');

const permission = (key) => {
  const [module, action] = key.split('.');
  return { id: key, key, module, action, description: `Can ${action} ${module}` };
};

const CATALOGUE = ['leads.create', 'leads.read', 'users.delete'].map(permission);

const role = (overrides = {}) => ({
  id: 'role-1',
  name: 'Sales Rep',
  status: 'active',
  isSystem: false,
  isSuperAdmin: false,
  isDefault: false,
  userCount: 0,
  permissions: [permission('leads.read')],
  ...overrides,
});

function renderPage(options) {
  return renderAs(
    <Routes>
      <Route path="/roles/:id" element={<RoleDetailPage />} />
    </Routes>,
    { route: '/roles/role-1', ...options }
  );
}

const checkbox = (key) => screen.getByRole('checkbox', { name: key });
const button = (name) => screen.queryByRole('button', { name });

beforeEach(() => {
  listPermissions.mockResolvedValue({ data: { permissions: CATALOGUE } });
  getRole.mockResolvedValue({ data: { role: role() } });
});

afterEach(cleanup);

describe('RoleDetailPage', () => {
  it('read-only user: sees the permissions but no way to change anything', async () => {
    renderPage({ permissions: ['roles.read'] });
    await screen.findByText('Sales Rep');
    await screen.findByText('leads.read');

    expect(checkbox('leads.read').checked).toBe(true);
    expect(checkbox('leads.create').checked).toBe(false);
    for (const item of CATALOGUE) expect(checkbox(item.key).disabled).toBe(true);
    expect(button('Edit')).toBeNull();
    expect(button('Delete')).toBeNull();
    expect(button('Save permissions')).toBeNull();
  });

  it('each button follows its own permission', async () => {
    renderPage({ permissions: ['roles.read', 'roles.update', 'leads.read'] });
    await screen.findByText('leads.read');

    expect(button('Edit')).toBeTruthy();
    expect(button('Delete')).toBeNull();
    expect(button('Save permissions')).toBeNull();
  });

  it('a permitted user can edit, delete and assign - but only permissions they hold', async () => {
    renderPage({
      permissions: ['roles.read', 'roles.update', 'roles.delete', 'roles.assignPermissions', 'leads.read', 'leads.create'],
    });
    await screen.findByText('leads.read');

    expect(button('Edit')).toBeTruthy();
    expect(button('Delete')).toBeTruthy();
    expect(button('Save permissions')).toBeTruthy();
    expect(checkbox('leads.read').disabled).toBe(false);
    expect(checkbox('leads.create').disabled).toBe(false);
    expect(checkbox('users.delete').disabled).toBe(true);
  });

  it('offers nothing on a role with more access than the user has', async () => {
    getRole.mockResolvedValue({ data: { role: role({ permissions: [permission('users.delete')] }) } });
    renderPage({ permissions: ['roles.read', 'roles.update', 'roles.delete', 'roles.assignPermissions'] });
    await screen.findByText('users.delete');

    expect(button('Edit')).toBeNull();
    expect(button('Delete')).toBeNull();
    expect(button('Save permissions')).toBeNull();
  });

  it('offers nothing on the role the user holds themselves', async () => {
    const permissions = ['roles.read', 'roles.update', 'roles.delete', 'roles.assignPermissions', 'leads.read'];
    renderPage({ user: makeUser(permissions, { roleId: 'role-1' }) });
    await screen.findByText('leads.read');

    expect(button('Edit')).toBeNull();
    expect(button('Delete')).toBeNull();
    expect(button('Save permissions')).toBeNull();
  });

  it('system and full-access roles cannot be deleted or have permissions edited', async () => {
    getRole.mockResolvedValue({
      data: { role: role({ isSystem: true, isSuperAdmin: true, permissions: [] }) },
    });
    const everything = [...CATALOGUE.map((p) => p.key), 'roles.read', 'roles.update', 'roles.delete', 'roles.assignPermissions'];
    renderPage({
      user: makeUser(everything, { role: { id: 'own-role', status: 'active', isSuperAdmin: true } }),
    });
    await screen.findByText(/full access/i);
    await screen.findByText('leads.read');

    expect(button('Delete')).toBeNull();
    expect(button('Save permissions')).toBeNull();
    for (const item of CATALOGUE) {
      expect(checkbox(item.key).checked).toBe(true);
      expect(checkbox(item.key).disabled).toBe(true);
    }
  });
});
