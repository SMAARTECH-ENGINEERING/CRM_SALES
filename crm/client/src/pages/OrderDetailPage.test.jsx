import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { listLeadConfig } from '../api/leadConfig.api.js';
import { changeOrderStatus, createOrderFromQuotation, getOrder, getOrderTimeline, listOrders, updateOrder } from '../api/orders.api.js';
import { getQuotation, getQuotationTimeline } from '../api/quotations.api.js';
import { listUserOptions } from '../api/users.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import OrderDetailPage from './OrderDetailPage.jsx';
import OrdersPage from './OrdersPage.jsx';
import QuotationDetailPage from './QuotationDetailPage.jsx';

vi.mock('../api/orders.api.js');
vi.mock('../api/quotations.api.js');
vi.mock('../api/users.api.js');
vi.mock('../api/contacts.api.js');
vi.mock('../api/companies.api.js');
vi.mock('../api/leadConfig.api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listLeadConfig: vi.fn(),
}));

// Names unlike anything a CRM ships with: whatever the API returns is shown.
const ORDER_STATUSES = [
  { id: 'os1', name: 'Wren Received', category: 'open', isDefault: true },
  { id: 'os2', name: 'Heron Done', category: 'completed' },
];
const QUOTE_STATUSES = [{ id: 'qs3', name: 'Osprey Signed', category: 'accepted' }];
const LINE = { productId: 'p1', name: 'Ergonomic Chair', sku: 'PRD-000001', quantity: 2, unitPrice: 1000, discountPercent: 0, taxRate: 18, tax: 360, total: 2000 };
const ORDER = {
  id: 'o1',
  orderNumber: 'ORD-000001',
  statusId: 'os1',
  status: ORDER_STATUSES[0],
  companyId: 'c1',
  company: { id: 'c1', name: 'Acme Industries' },
  quotationId: 'q1',
  quotation: { id: 'q1', quotationNumber: 'QUO-000001' },
  orderDate: '2031-01-10T00:00:00.000Z',
  items: [LINE],
  subtotal: 2000,
  discountPercent: 0,
  discount: 0,
  tax: 360,
  grandTotal: 2360,
};
const EMPTY_PAGE = { page: 1, limit: 20, total: 0, totalPages: 0 };

function renderAt(route, permissions) {
  return renderAs(
    <Routes>
      <Route path="/orders" element={<OrdersPage />} />
      <Route path="/orders/:id" element={<OrderDetailPage />} />
      <Route path="/quotations/:id" element={<QuotationDetailPage />} />
    </Routes>,
    { route, permissions }
  );
}

beforeEach(() => {
  getOrder.mockResolvedValue({ data: { order: ORDER } });
  getOrderTimeline.mockResolvedValue({ data: { events: [], pagination: EMPTY_PAGE } });
  getQuotationTimeline.mockResolvedValue({ data: { events: [], pagination: EMPTY_PAGE } });
  listUserOptions.mockResolvedValue({ data: { users: [] } });
  listLeadConfig.mockImplementation((resource) =>
    Promise.resolve({ data: { items: resource === 'order-statuses' ? ORDER_STATUSES : QUOTE_STATUSES } })
  );
});

afterEach(cleanup);

describe('OrderDetailPage', () => {
  it('shows the stored lines, totals and the quotation it came from', async () => {
    renderAt('/orders/o1', ['orders.read', 'quotations.read']);
    expect(await screen.findByRole('heading', { name: 'ORD-000001' })).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Order lines' })).getByText('Ergonomic Chair')).toBeTruthy();
    expect(screen.getByLabelText('Grand total').textContent).toBe('2,360');
    expect(screen.getByRole('link', { name: 'QUO-000001' }).getAttribute('href')).toBe('/quotations/q1');
    // A reader cannot change anything.
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /Status/ })).toBeNull();
  });

  it('changes the status through its own endpoint and edits scheduling details', async () => {
    changeOrderStatus.mockResolvedValue({ data: { order: { ...ORDER, statusId: 'os2', status: ORDER_STATUSES[1] } } });
    updateOrder.mockResolvedValue({ data: { order: ORDER } });
    renderAt('/orders/o1', ['orders.read', 'orders.update']);
    await screen.findByRole('heading', { name: 'ORD-000001' });

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Status/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Heron Done/ }));
    await waitFor(() => expect(changeOrderStatus).toHaveBeenCalledWith('o1', 'os2'));

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Delivery date'), { target: { value: '2031-02-01' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(updateOrder).toHaveBeenCalledWith('o1', {
        orderDate: '2031-01-10',
        deliveryDate: '2031-02-01',
        contactId: null,
        assignedTo: null,
        notes: '',
      })
    );
  });

  it('a completed order cannot be edited', async () => {
    getOrder.mockResolvedValue({ data: { order: { ...ORDER, statusId: 'os2', status: ORDER_STATUSES[1] } } });
    renderAt('/orders/o1', ['orders.read', 'orders.update']);
    await screen.findByRole('heading', { name: 'ORD-000001' });
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.getByText(/heron done, so it cannot be edited/)).toBeTruthy();
  });
});

describe('OrdersPage', () => {
  it('lists orders from the API in a data grid', async () => {
    listOrders.mockResolvedValue({ data: { orders: [ORDER], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    renderAt('/orders', ['orders.read']);
    expect(await screen.findByRole('link', { name: 'ORD-000001' })).toBeTruthy();
    expect(screen.getByText('Acme Industries')).toBeTruthy();
    expect(screen.getByText('Wren Received')).toBeTruthy();
  });
});

describe('Creating an order from a quotation', () => {
  const QUOTATION = {
    id: 'q1',
    quotationNumber: 'QUO-000001',
    statusId: 'qs3',
    status: QUOTE_STATUSES[0],
    orderId: null,
    company: { id: 'c1', name: 'Acme Industries' },
    items: [LINE],
    subtotal: 2000,
    discountPercent: 0,
    discount: 0,
    tax: 360,
    grandTotal: 2360,
  };

  it('an accepted quotation offers "Create order", which sends only scheduling details', async () => {
    getQuotation.mockResolvedValue({ data: { quotation: QUOTATION } });
    createOrderFromQuotation.mockResolvedValue({ data: { order: { id: 'o9', orderNumber: 'ORD-000009' } } });
    renderAt('/quotations/q1', ['quotations.read', 'orders.create', 'orders.read']);
    await screen.findByRole('heading', { name: 'QUO-000001' });

    fireEvent.click(screen.getByRole('button', { name: 'Create order' }));
    const dialog = within(await screen.findByRole('dialog'));
    await waitFor(() => expect(dialog.getByRole('combobox', { name: /Status/ }).textContent).toContain('Wren Received'));
    fireEvent.change(dialog.getByLabelText('Delivery date'), { target: { value: '2099-05-01' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Create order' }));

    await waitFor(() => expect(createOrderFromQuotation).toHaveBeenCalledTimes(1));
    const [quotationId, data] = createOrderFromQuotation.mock.calls[0];
    expect(quotationId).toBe('q1');
    expect(data).toMatchObject({ deliveryDate: '2099-05-01', statusId: 'os1' });
    for (const key of ['items', 'grandTotal', 'companyId']) expect(data).not.toHaveProperty(key);
    expect(await screen.findByRole('heading', { name: 'ORD-000001' })).toBeTruthy();
  });

  it('shows the API refusal, e.g. an order already generated', async () => {
    getQuotation.mockResolvedValue({ data: { quotation: QUOTATION } });
    createOrderFromQuotation.mockRejectedValue(new Error('An order has already been created from this quotation'));
    renderAt('/quotations/q1', ['quotations.read', 'orders.create']);
    await screen.findByRole('heading', { name: 'QUO-000001' });
    fireEvent.click(screen.getByRole('button', { name: 'Create order' }));
    const dialog = within(await screen.findByRole('dialog'));
    await waitFor(() => expect(dialog.getByRole('combobox', { name: /Status/ }).textContent).toContain('Wren Received'));
    fireEvent.click(dialog.getByRole('button', { name: 'Create order' }));
    expect(await dialog.findByText('An order has already been created from this quotation')).toBeTruthy();
  });

  it('a quotation that already has an order links to it instead', async () => {
    getQuotation.mockResolvedValue({ data: { quotation: { ...QUOTATION, orderId: 'o1', order: { id: 'o1', orderNumber: 'ORD-000001' } } } });
    renderAt('/quotations/q1', ['quotations.read', 'orders.create', 'orders.read']);
    await screen.findByRole('heading', { name: 'QUO-000001' });
    expect(screen.queryByRole('button', { name: 'Create order' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Order ORD-000001' }).getAttribute('href')).toBe('/orders/o1');
  });

  it('a quotation that is not accepted offers no order', async () => {
    getQuotation.mockResolvedValue({ data: { quotation: { ...QUOTATION, status: { id: 'qs1', name: 'Draft', category: 'draft' } } } });
    renderAt('/quotations/q1', ['quotations.read', 'orders.create']);
    await screen.findByRole('heading', { name: 'QUO-000001' });
    expect(screen.queryByRole('button', { name: 'Create order' })).toBeNull();
  });
});
