import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { listLeadConfig } from '../api/leadConfig.api.js';
import {
  changeContractStatus,
  getContract,
  getContractStats,
  listContractReminders,
  listContracts,
  runContractReminders,
} from '../api/contracts.api.js';
import { listUserOptions } from '../api/users.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import ContractDetailPage from './ContractDetailPage.jsx';
import ContractsPage from './ContractsPage.jsx';

vi.mock('../api/contracts.api.js');
vi.mock('../api/users.api.js');
vi.mock('../api/companies.api.js');
vi.mock('../api/leadConfig.api.js', async (importOriginal) => ({ ...(await importOriginal()), listLeadConfig: vi.fn() }));

// Deliberately odd names: whatever the API returns is what shows.
const STATUSES = [
  { id: 's1', name: 'Heron Running', category: 'active', isDefault: true },
  { id: 's2', name: 'Gannet Stopped', category: 'cancelled' },
];
const CONTRACT = {
  id: 'k1',
  contractNumber: 'CON-000042',
  companyId: 'c1',
  company: { id: 'c1', name: 'Acme Industries' },
  contractType: { id: 't1', name: 'Kestrel Care Plan' },
  statusId: 's1',
  status: STATUSES[0],
  startDate: '2031-01-01T00:00:00.000Z',
  endDate: '2031-12-31T00:00:00.000Z',
  amount: 125000,
  billingCycle: { id: 'b1', name: 'Quarterly' },
  assignedToUser: { id: 'u1', fullName: 'Mona Manager' },
  daysToEnd: 12,
  description: 'Twenty printers',
  createdAt: '2031-01-01T09:00:00.000Z',
};

function renderAt(route, permissions) {
  return renderAs(
    <Routes>
      <Route path="/contracts" element={<ContractsPage />} />
      <Route path="/contracts/:id" element={<ContractDetailPage />} />
    </Routes>,
    { route, permissions }
  );
}

beforeEach(() => {
  getContract.mockResolvedValue({ data: { contract: CONTRACT } });
  listUserOptions.mockResolvedValue({ data: { users: [] } });
  listLeadConfig.mockResolvedValue({ data: { items: STATUSES } });
});

afterEach(cleanup);

describe('ContractDetailPage', () => {
  it('shows the contract as the API returns it, including the days left', async () => {
    renderAt('/contracts/k1', ['contracts.read']);
    expect(await screen.findByRole('heading', { name: 'CON-000042' })).toBeTruthy();
    expect(screen.getByText('Ends in 12 days')).toBeTruthy();
    expect(screen.getByText('Kestrel Care Plan', { selector: 'div' })).toBeTruthy();
    expect(screen.getByText('Twenty printers')).toBeTruthy();
    // A reader can neither edit nor change the status.
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByLabelText('Status')).toBeNull();
  });

  it('changes the status through the API', async () => {
    changeContractStatus.mockResolvedValue({ data: { contract: { ...CONTRACT, statusId: 's2', status: STATUSES[1] } } });
    renderAt('/contracts/k1', ['contracts.read', 'contracts.update']);
    await screen.findByRole('heading', { name: 'CON-000042' });
    fireEvent.mouseDown(await screen.findByRole('combobox', { name: /Status/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Gannet Stopped' }));
    await waitFor(() => expect(changeContractStatus).toHaveBeenCalledWith('k1', 's2'));
  });

  it('lists the reminders that were sent', async () => {
    listContractReminders.mockResolvedValue({
      data: {
        reminders: [
          {
            id: 'r1',
            daysBefore: 42,
            daysLeft: 20,
            endDate: '2031-12-31T00:00:00.000Z',
            recipient: { fullName: 'Mona Manager' },
            emailError: 'Email is not configured',
            followUp: { status: 'pending' },
            createdAt: '2031-12-11T09:00:00.000Z',
          },
        ],
      },
    });
    renderAt('/contracts/k1?tab=reminders', ['contracts.read']);
    const table = within(await screen.findByRole('table', { name: 'Reminders sent' }));
    expect(table.getByText('42 days before')).toBeTruthy();
    expect(table.getByText('Mona Manager')).toBeTruthy();
    expect(table.getByText('Email is not configured')).toBeTruthy();
  });
});

describe('ContractsPage', () => {
  const STATS = {
    byCategory: {
      draft: { count: 1, value: 10 },
      active: { count: 7, value: 700 },
      expired: { count: 2, value: 20 },
      renewed: { count: 0, value: 0 },
      cancelled: { count: 0, value: 0 },
    },
    total: 10,
    expiringSoon: { withinDays: 45, count: 3, value: 300 },
    pastEndDate: 0,
  };

  it('shows the API counts; "expiring" filters by the API reminder window', async () => {
    getContractStats.mockResolvedValue({ data: STATS });
    listContracts.mockResolvedValue({ data: { contracts: [CONTRACT], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    renderAt('/contracts', ['contracts.read']);
    expect(await screen.findByRole('link', { name: 'CON-000042' })).toBeTruthy();
    const counts = within(screen.getByLabelText('Contract counts'));
    expect(counts.getByText('Active: 7')).toBeTruthy();
    fireEvent.click(await counts.findByText(/Expiring within 45 days: 3/));
    await waitFor(() => expect(listContracts).toHaveBeenLastCalledWith(expect.objectContaining({ expiringWithin: 45 }), expect.anything()));
    expect(screen.queryByRole('button', { name: 'New contract' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run reminder check' })).toBeNull();
  });

  it('an administrator can run the reminder check now', async () => {
    getContractStats.mockResolvedValue({ data: STATS });
    listContracts.mockResolvedValue({ data: { contracts: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
    runContractReminders.mockResolvedValue({ data: { reminded: 2, emailed: 1, expired: 1, considered: 3, periods: [7, 30] } });
    renderAt('/contracts', ['contracts.read', 'contracts.manageSettings']);
    fireEvent.click(await screen.findByRole('button', { name: 'Run reminder check' }));
    expect(await screen.findByText(/2 reminder\(s\) sent \(1 by email\), 1 contract\(s\) marked expired/)).toBeTruthy();
  });
});
