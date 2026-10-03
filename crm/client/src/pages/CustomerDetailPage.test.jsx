import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { listContacts } from '../api/contacts.api.js';
import { getCustomerSummary, getCustomerTimeline, listCustomers } from '../api/customers.api.js';
import { listMasterData } from '../api/masterData.api.js';
import { listOrders } from '../api/orders.api.js';
import { listUserOptions } from '../api/users.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import CustomerDetailPage from './CustomerDetailPage.jsx';
import CustomersPage from './CustomersPage.jsx';

vi.mock('../api/customers.api.js');
vi.mock('../api/contacts.api.js');
vi.mock('../api/orders.api.js');
vi.mock('../api/masterData.api.js', async (importOriginal) => ({ ...(await importOriginal()), listMasterData: vi.fn() }));
vi.mock('../api/users.api.js');
vi.mock('../api/companies.api.js');

const CUSTOMER = {
  id: 'cu1',
  customerNumber: 'CUST-000007',
  companyId: 'c1',
  company: { id: 'c1', name: 'Quillfeather Ltd', companyCode: 'COMP-000001', city: 'Pune' },
  status: 'active',
  customerSince: '2030-05-01T00:00:00.000Z',
  accountManager: { id: 'u1', fullName: 'Mira Manager' },
  firstOrder: { id: 'o1', orderNumber: 'ORD-000004' },
};

// Numbers no browser could have worked out: they can only be the API's.
const SUMMARY = {
  customer: CUSTOMER,
  sections: [
    { key: 'contacts', label: 'Contacts', available: true, count: 13 },
    { key: 'activities', label: 'Activities', available: true, count: 27 },
    { key: 'opportunities', label: 'Opportunities', available: true, count: 4 },
    { key: 'quotations', label: 'Quotations', available: true, count: 9 },
    { key: 'orders', label: 'Orders', available: true, count: 6 },
    { key: 'projects', label: 'Projects', available: false, count: null },
    { key: 'tickets', label: 'Tickets', available: false, count: null },
    { key: 'payments', label: 'Payments', available: false, count: null },
    { key: 'contracts', label: 'Contracts', available: false, count: null },
    { key: 'documents', label: 'Documents', available: false, count: null },
    { key: 'timeline', label: 'Timeline', available: true, count: 31 },
  ],
  metrics: {
    orders: { orderCount: 5, orderValue: 123456.78, lastOrderDate: '2031-01-10T00:00:00.000Z', byCategory: {} },
    quotations: { byCategory: {}, openValue: 4321 },
    opportunities: { open: { count: 3, value: 90000 }, won: { count: 2, value: 40000 }, lost: { count: 0, value: 0 } },
    activities: { total: 27, pending: 5, overdue: 2 },
  },
};
const PAGE = (items, key) => ({ data: { [key]: items, pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 } } });

function renderAt(route, permissions = ['customers.read']) {
  return renderAs(
    <Routes>
      <Route path="/customers" element={<CustomersPage />} />
      <Route path="/customers/:id" element={<CustomerDetailPage />} />
    </Routes>,
    { route, permissions }
  );
}
const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent);

beforeEach(() => {
  getCustomerSummary.mockResolvedValue({ data: SUMMARY });
  getCustomerTimeline.mockResolvedValue(PAGE([], 'events'));
  listContacts.mockResolvedValue(PAGE([], 'contacts'));
  listOrders.mockResolvedValue(PAGE([], 'orders'));
  listMasterData.mockResolvedValue({ data: { items: [] } });
  listUserOptions.mockResolvedValue({ data: { users: [] } });
});

afterEach(cleanup);

describe('CustomerDetailPage (360-degree view)', () => {
  it('shows every section in order, with the counts the API returned and none it did not', async () => {
    renderAt('/customers/cu1');
    expect(await screen.findByRole('heading', { name: 'Quillfeather Ltd' })).toBeTruthy();
    expect(tabNames()).toEqual([
      'Overview',
      'Contacts13',
      'Activities27',
      'Opportunities4',
      'Quotations9',
      'Orders6',
      'Projects',
      'Tickets',
      'Payments',
      'Contracts',
      'Documents',
      'Timeline31',
    ]);
  });

  it('the overview figures are the API metrics', async () => {
    renderAt('/customers/cu1');
    await screen.findByRole('heading', { name: 'Quillfeather Ltd' });
    expect(screen.getByLabelText('Order value').textContent).toBe('123,456.78');
    expect(screen.getByText('5 order(s), cancelled excluded')).toBeTruthy();
    expect(screen.getByLabelText('Open opportunities').textContent).toBe('3');
    expect(screen.getByLabelText('Quotations awaiting answer').textContent).toBe('4,321');
    expect(screen.getByText('5 pending, 2 overdue')).toBeTruthy();
  });

  it("each tab loads its records from that module's API, filtered by the customer's company", async () => {
    renderAt('/customers/cu1', ['customers.read', 'contacts.read', 'orders.read']);
    await screen.findByRole('heading', { name: 'Quillfeather Ltd' });

    fireEvent.click(screen.getByRole('tab', { name: /Contacts/ }));
    await waitFor(() => expect(listContacts).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'c1' }), expect.anything()));
    fireEvent.click(screen.getByRole('tab', { name: /Orders/ }));
    await waitFor(() => expect(listOrders).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'c1' }), expect.anything()));
    fireEvent.click(screen.getByRole('tab', { name: /Timeline/ }));
    await waitFor(() => expect(getCustomerTimeline).toHaveBeenCalledWith('cu1', expect.anything(), expect.anything()));
  });

  it('a module that is not built says so instead of showing anything', async () => {
    renderAt('/customers/cu1');
    await screen.findByRole('heading', { name: 'Quillfeather Ltd' });
    fireEvent.click(screen.getByRole('tab', { name: 'Payments' }));
    expect(await screen.findByText(/Payments is not available yet/)).toBeTruthy();
  });

  it('edit and remove follow the permissions', async () => {
    renderAt('/customers/cu1');
    await screen.findByRole('heading', { name: 'Quillfeather Ltd' });
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    cleanup();
    renderAt('/customers/cu1', ['customers.read', 'customers.update', 'customers.delete']);
    await screen.findByRole('heading', { name: 'Quillfeather Ltd' });
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
  });
});

describe('CustomersPage', () => {
  it('lists customers with the figures from the API, and sends search and filters to it', async () => {
    listCustomers.mockResolvedValue({
      data: {
        customers: [{ ...CUSTOMER, stats: { orderCount: 5, orderValue: 123456.78, lastOrderDate: '2031-01-10T00:00:00.000Z', openOpportunities: 3 } }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      },
    });
    renderAt('/customers');
    expect(await screen.findByRole('link', { name: 'Quillfeather Ltd' })).toBeTruthy();
    const row = screen.getByRole('link', { name: 'Quillfeather Ltd' }).closest('[role="row"]');
    expect(within(row).getByText('123,456.78')).toBeTruthy();
    expect(within(row).getByText('5')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'quill' } });
    await waitFor(() =>
      expect(listCustomers).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'quill' }), expect.anything())
    );
  });
});
