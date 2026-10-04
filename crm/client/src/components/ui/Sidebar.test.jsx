import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { renderAs } from '../../test/renderWithProviders.jsx';
import Sidebar from './Sidebar.jsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

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

  it('each group is a drop-down: the group of the current page is open, others open on demand and stay so', () => {
    const view = () => renderAs(<Sidebar />, { permissions: ['leads.read', 'users.read'], route: '/leads/abc' });
    const { unmount } = view();
    const group = (name) => screen.getByRole('button', { name });
    expect(group('Sales').getAttribute('aria-expanded')).toBe('true');
    expect(group('Administration').getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(group('Administration'));
    fireEvent.click(group('Sales'));
    expect(group('Administration').getAttribute('aria-expanded')).toBe('true');
    expect(group('Sales').getAttribute('aria-expanded')).toBe('false');

    // Remembered the next time the sidebar is shown.
    unmount();
    view();
    expect(group('Administration').getAttribute('aria-expanded')).toBe('true');
    expect(group('Sales').getAttribute('aria-expanded')).toBe('false');
  });

  it('collapsed: icons only, each still named for assistive technology', () => {
    renderAs(<Sidebar collapsed />, { permissions: ['leads.read'] });
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['', '']);
    expect(links()).toEqual(['Dashboard', 'Leads']);
    expect(headings()).toEqual([]);
  });
});
