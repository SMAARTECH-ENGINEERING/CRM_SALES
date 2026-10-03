import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAuditFilters, getAuditLog, listAuditLogs } from '../api/audit.api.js';
import { listUserOptions } from '../api/users.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import AuditLogsPage from './AuditLogsPage.jsx';

vi.mock('../api/audit.api.js');
vi.mock('../api/users.api.js');

const UPDATE = {
  id: 'a1',
  userId: 'u1',
  user: { id: 'u1', fullName: 'Ada Admin', email: 'ada@example.com' },
  action: 'UPDATE',
  entityType: 'company',
  entityId: 'c1',
  ipAddress: '203.0.113.7',
  userAgent: 'Mozilla/5.0',
  method: 'PUT',
  path: '/api/v1/companies/c1',
  statusCode: 200,
  success: true,
  timestamp: '2031-05-14T10:30:00.000Z',
};
const FAILED_LOGIN = { id: 'a2', action: 'LOGIN', entityType: 'user', ipAddress: '198.51.100.9', method: 'POST', path: '/api/v1/auth/login', statusCode: 401, success: false, timestamp: '2031-05-14T09:00:00.000Z' };
const page = (auditLogs) => ({ data: { auditLogs, pagination: { page: 1, limit: 20, total: auditLogs.length, totalPages: 1 } } });
const lastParams = () => listAuditLogs.mock.calls.at(-1)[0];

beforeEach(() => {
  vi.clearAllMocks();
  listAuditLogs.mockResolvedValue(page([UPDATE, FAILED_LOGIN]));
  // Whatever the API reports is what the filters offer.
  getAuditFilters.mockResolvedValue({ data: { actions: ['UPDATE', 'LOGIN', 'PERMISSION_CHANGE'], entityTypes: ['company', 'heronry'] } });
  listUserOptions.mockResolvedValue({ data: { users: [{ id: 'u1', fullName: 'Ada Admin', email: 'ada@example.com' }] } });
});

afterEach(cleanup);

describe('AuditLogsPage', () => {
  it('lists the entries as the API returns them', async () => {
    renderAs(<AuditLogsPage />, { permissions: ['audit.read'] });
    expect(await screen.findByText('Ada Admin')).toBeTruthy();
    expect(screen.getByText('PUT /api/v1/companies/c1')).toBeTruthy();
    expect(screen.getByText('203.0.113.7')).toBeTruthy();
    // A refused attempt stands out, and has nobody against it.
    expect(screen.getByText('login - refused')).toBeTruthy();
    expect(screen.getByText('Not signed in')).toBeTruthy();
    expect(lastParams()).toEqual({ page: 1, limit: 20, sortOrder: 'desc' });
    // Read-only: nothing to edit or delete.
    expect(screen.queryByRole('button', { name: /delete|edit/i })).toBeNull();
  });

  it('filters by action, record, date range and search - through the API', async () => {
    renderAs(<AuditLogsPage />, { permissions: ['audit.read'] });
    await screen.findByText('Ada Admin');

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Action/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'permission change' }));
    await waitFor(() => expect(lastParams().action).toBe('PERMISSION_CHANGE'));

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Record/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'heronry' }));
    await waitFor(() => expect(lastParams().entityType).toBe('heronry'));

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2031-05-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2031-05-31' } });
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: '203.0' } });
    await waitFor(() =>
      expect(lastParams()).toEqual({ action: 'PERMISSION_CHANGE', entityType: 'heronry', from: '2031-05-01', to: '2031-05-31', search: '203.0', page: 1, limit: 20, sortOrder: 'desc' })
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(lastParams()).toEqual({ page: 1, limit: 20, sortOrder: 'desc' }));
  });

  it('opens one entry with the before and after of each changed field', async () => {
    getAuditLog.mockResolvedValue({ data: { auditLog: { ...UPDATE, oldData: { city: 'Pune' }, newData: { city: 'Mumbai', phone: '+91 22 5550 0100' } } } });
    renderAs(<AuditLogsPage />, { permissions: ['audit.read'] });
    await screen.findByText('Ada Admin');
    fireEvent.click(screen.getAllByRole('button', { name: /^View entry/ })[0]);
    const dialog = within(await screen.findByRole('dialog'));
    expect(getAuditLog).toHaveBeenCalledWith('a1', expect.anything());
    const changes = within(await dialog.findByRole('table', { name: 'Changes' }));
    expect(within(changes.getByRole('row', { name: /city/ })).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Pune', 'Mumbai']);
    // A field that was added has nothing before.
    expect(within(changes.getByRole('row', { name: /phone/ })).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['—', '+91 22 5550 0100']);
    expect(dialog.getByText('Ada Admin (ada@example.com)')).toBeTruthy();
    expect(dialog.getByText('PUT /api/v1/companies/c1 → 200')).toBeTruthy();
    expect(dialog.getByRole('link', { name: 'open' }).getAttribute('href')).toBe('/companies/c1');
  });
});
