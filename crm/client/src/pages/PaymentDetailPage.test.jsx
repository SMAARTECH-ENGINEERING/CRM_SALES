import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { listLeadConfig } from '../api/leadConfig.api.js';
import { getPayment, getPaymentStats, listPayments, updatePayment } from '../api/payments.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import PaymentDetailPage from './PaymentDetailPage.jsx';
import PaymentsPage from './PaymentsPage.jsx';

vi.mock('../api/payments.api.js');
vi.mock('../api/companies.api.js');
vi.mock('../api/orders.api.js');
vi.mock('../api/leadConfig.api.js', async (importOriginal) => ({ ...(await importOriginal()), listLeadConfig: vi.fn() }));

// Deliberately odd names: whatever the API returns is what shows.
const STATUSES = [
  { id: 's1', name: 'Owl Waiting', category: 'unpaid' },
  { id: 's2', name: 'Wren Part', category: 'partially_paid' },
  { id: 's4', name: 'Crow Void', category: 'cancelled' },
];
// Figures that do not add up on purpose: the page must show the API's, not its own sums.
const PAYMENT = {
  id: 'p1',
  invoiceNumber: 'INV-000042',
  companyId: 'c1',
  company: { id: 'c1', name: 'Acme Industries' },
  order: { id: 'o1', orderNumber: 'ORD-000007', grandTotal: 2360 },
  amount: 1000,
  paidAmount: 400,
  remainingAmount: 777,
  overpaidAmount: 0,
  isOverdue: true,
  daysOverdue: 3,
  dueDate: '2031-01-10T00:00:00.000Z',
  statusId: 's2',
  status: STATUSES[1],
  updatedAt: '2031-01-12T09:00:00.000Z',
};

function renderAt(route, permissions) {
  return renderAs(
    <Routes>
      <Route path="/payments" element={<PaymentsPage />} />
      <Route path="/payments/:id" element={<PaymentDetailPage />} />
    </Routes>,
    { route, permissions }
  );
}

beforeEach(() => {
  getPayment.mockResolvedValue({ data: { payment: PAYMENT } });
  listLeadConfig.mockResolvedValue({ data: { items: STATUSES } });
});

afterEach(cleanup);

describe('PaymentDetailPage', () => {
  it('shows the amounts exactly as the API returns them - nothing is recalculated', async () => {
    renderAt('/payments/p1', ['payments.read']);
    expect(await screen.findByRole('heading', { name: 'INV-000042' })).toBeTruthy();
    expect(screen.getByLabelText('Remaining').textContent).toContain('777');
    expect(screen.getByLabelText('Paid').textContent).toContain('400');
    expect(screen.getByText('Overdue by 3 days')).toBeTruthy();
    expect(screen.getByText('Wren Part')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Record payment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('recording money sends only what was received; the API does the sum', async () => {
    updatePayment.mockResolvedValue({ data: { payment: { ...PAYMENT, paidAmount: 650, remainingAmount: 350 } } });
    renderAt('/payments/p1', ['payments.read', 'payments.update']);
    fireEvent.click(await screen.findByRole('button', { name: 'Record payment' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByLabelText(/Amount received/), { target: { value: '250' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Record' }));
    await waitFor(() => expect(updatePayment).toHaveBeenCalled());
    const [id, data] = updatePayment.mock.calls[0];
    expect(id).toBe('p1');
    expect(data.receivedAmount).toBe(250);
    expect(data).not.toHaveProperty('paidAmount');
    expect(data).not.toHaveProperty('remainingAmount');
  });

  it('shows why the API refused an overpayment', async () => {
    updatePayment.mockRejectedValue({
      message: 'Validation failed',
      errors: [{ field: 'receivedAmount', message: 'The amount paid would be more than the amount outstanding (amount 1000.00)' }],
    });
    renderAt('/payments/p1', ['payments.read', 'payments.update']);
    fireEvent.click(await screen.findByRole('button', { name: 'Record payment' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByLabelText(/Amount received/), { target: { value: '5000' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Record' }));
    expect(await dialog.findByText(/more than the amount outstanding/)).toBeTruthy();
  });

  it('cancels with the status the API lists as "cancelled"', async () => {
    updatePayment.mockResolvedValue({ data: { payment: { ...PAYMENT, statusId: 's4', status: STATUSES[2] } } });
    renderAt('/payments/p1', ['payments.read', 'payments.update']);
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel payment' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel payment' }));
    await waitFor(() => expect(updatePayment).toHaveBeenCalledWith('p1', { statusId: 's4' }));
  });
});

describe('PaymentsPage', () => {
  const STATS = {
    byCategory: {
      unpaid: { count: 5, amount: 500, paid: 0, remaining: 500 },
      partially_paid: { count: 2, amount: 300, paid: 100, remaining: 200 },
      paid: { count: 9, amount: 900, paid: 900, remaining: 0 },
      cancelled: { count: 1, amount: 50, paid: 0, remaining: 50 },
    },
    overdue: { count: 3, remaining: 321 },
    totals: { count: 16, amount: 1700, paid: 1000, outstanding: 700 },
  };

  it('has Paid, Partially paid, Unpaid and Overdue filters with the API figures', async () => {
    getPaymentStats.mockResolvedValue({ data: STATS });
    listPayments.mockResolvedValue({ data: { payments: [PAYMENT], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    renderAt('/payments', ['payments.read']);
    expect(await screen.findByRole('link', { name: 'INV-000042' })).toBeTruthy();
    const filters = within(screen.getByRole('group', { name: 'Payment filters' }));
    for (const name of ['Paid: 9', 'Partially paid: 2', 'Unpaid: 5', 'Overdue: 3']) {
      expect(filters.getByRole('button', { name })).toBeTruthy();
    }
    for (const [name, state] of [
      ['Overdue: 3', 'overdue'],
      ['Paid: 9', 'paid'],
      ['Partially paid: 2', 'partially_paid'],
      ['Unpaid: 5', 'unpaid'],
    ]) {
      fireEvent.click(filters.getByRole('button', { name }));
      await waitFor(() => expect(listPayments).toHaveBeenLastCalledWith(expect.objectContaining({ state }), expect.anything()));
    }
    expect(screen.queryByRole('button', { name: 'New payment' })).toBeNull();
  });
});
