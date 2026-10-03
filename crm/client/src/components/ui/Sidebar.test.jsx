import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderAs } from '../../test/renderWithProviders.jsx';
import Sidebar from './Sidebar.jsx';

afterEach(cleanup);

const links = () => screen.getAllByRole('link').map((link) => link.textContent || link.getAttribute('aria-label'));
const headings = () => screen.queryAllByRole('heading').map((heading) => heading.textContent);

describe('Sidebar', () => {
  it('shows only ungated entries to a user with no permissions', () => {
    renderAs(<Sidebar />, { permissions: [] });
    expect(links()).toEqual(['Dashboard']);
    // A group with nothing the user may see is not shown at all.
    expect(headings()).toEqual([]);
  });

  it('adds an entry for each permission the user holds, under its group', () => {
    renderAs(<Sidebar />, { permissions: ['users.read'] });
    expect(links()).toEqual(['Dashboard', 'Users']);
    expect(headings()).toEqual(['Administration']);
    cleanup();

    renderAs(<Sidebar />, { permissions: ['leads.read', 'orders.read', 'companies.read', 'payments.read', 'roles.read', 'permissions.read'] });
    expect(links()).toEqual(['Dashboard', 'Leads', 'Orders', 'Companies', 'Payments', 'Roles', 'Permissions']);
    expect(headings()).toEqual(['Sales', 'Customers', 'Finance', 'Administration']);
  });

  it('is driven by the permission list, not by the role', () => {
    // A full-access role name or flag alone does not reveal anything: only the
    // keys the API resolved for the user do.
    const user = {
      id: 'u',
      fullName: 'Flagged',
      role: { id: 'r', name: 'Administrator', status: 'active', isSuperAdmin: true },
      permissions: ['users.read'],
    };
    renderAs(<Sidebar />, { user });
    expect(links()).toEqual(['Dashboard', 'Users']);
  });

  it('collapsed: icons only, each still named for assistive technology', () => {
    renderAs(<Sidebar collapsed />, { permissions: ['leads.read'] });
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['', '']);
    expect(links()).toEqual(['Dashboard', 'Leads']);
    expect(headings()).toEqual([]);
  });
});
