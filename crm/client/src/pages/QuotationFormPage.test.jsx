import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { listCompanyOptions } from '../api/companies.api.js';
import { listContactOptions } from '../api/contacts.api.js';
import { listLeadConfig } from '../api/leadConfig.api.js';
import { listOpportunityOptions } from '../api/opportunities.api.js';
import { listProductOptions } from '../api/products.api.js';
import { calculateQuotation, createQuotation, getQuotation, updateQuotation } from '../api/quotations.api.js';
import { getCompanyProfile } from '../api/settings.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import QuotationFormPage from './QuotationFormPage.jsx';

vi.mock('../api/companies.api.js');
vi.mock('../api/contacts.api.js');
vi.mock('../api/opportunities.api.js');
vi.mock('../api/products.api.js');
vi.mock('../api/quotations.api.js');
vi.mock('../api/settings.api.js');
vi.mock('../api/leadConfig.api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listLeadConfig: vi.fn(),
}));

const COMPANY = { id: 'c1', companyCode: 'COMP-000001', name: 'Acme Industries' };
const CHAIR = { id: 'p1', sku: 'PRD-000001', name: 'Ergonomic Chair', basePrice: 1000, unit: null, tax: { rate: 18 } };
const STATUSES = [{ id: 'st1', name: 'Kestrel Draft', category: 'draft', isDefault: true }];

// What the server answers for one chair at the given quantity: its numbers,
// deliberately not what the browser could work out on its own.
const priced = (quantity) => ({
  data: {
    items: [{ productId: 'p1', name: 'Ergonomic Chair', taxName: 'Server Tax', taxRate: 18, discount: 0, tax: 777, total: 1111 * quantity }],
    subtotal: 1111 * quantity,
    discountPercent: 0,
    discount: 0,
    tax: 777,
    grandTotal: 9999 + quantity,
  },
});

const PERMS = ['quotations.read', 'quotations.create', 'quotations.update'];

function renderNew(route = '/quotations/new?companyId=c1') {
  return renderAs(
    <Routes>
      <Route path="/quotations/new" element={<QuotationFormPage />} />
      <Route path="/quotations/:id/edit" element={<QuotationFormPage />} />
      <Route path="/quotations/:id" element={<p>Saved page</p>} />
    </Routes>,
    { route, permissions: PERMS }
  );
}

async function pickChair() {
  const line = screen.getByRole('group', { name: 'Line 1' });
  const input = within(line).getByRole('combobox', { name: /Product/ });
  input.focus();
  fireEvent.change(input, { target: { value: 'chair' } });
  fireEvent.click(await screen.findByRole('option', { name: /Ergonomic Chair/ }));
  return line;
}

beforeEach(() => {
  listCompanyOptions.mockResolvedValue({ data: { companies: [COMPANY] } });
  listContactOptions.mockResolvedValue({ data: { contacts: [] } });
  listOpportunityOptions.mockResolvedValue({ data: { opportunities: [] } });
  listProductOptions.mockResolvedValue({ data: { products: [CHAIR] } });
  listLeadConfig.mockResolvedValue({ data: { items: STATUSES } });
  getCompanyProfile.mockResolvedValue({ data: { profile: { quotationValidityDays: 30, quotationTerms: 'Heron terms apply.' } } });
  calculateQuotation.mockImplementation((data) => Promise.resolve(priced(data.items[0].quantity)));
  createQuotation.mockResolvedValue({ data: { quotation: { id: 'q1', quotationNumber: 'QUO-000001' } } });
});

afterEach(cleanup);

describe('QuotationFormPage (builder)', () => {
  it('shows the totals the server calculates, and re-asks when a line changes', async () => {
    renderNew();
    const line = await pickChair();

    await waitFor(() => expect(calculateQuotation).toHaveBeenCalled());
    expect(calculateQuotation).toHaveBeenLastCalledWith(
      { items: [{ productId: 'p1', quantity: 1, unitPrice: 1000 }], discountPercent: 0 },
      expect.anything()
    );
    expect(await screen.findByLabelText('Grand total')).toHaveProperty('textContent', '10,000');
    expect(within(line).getByText(/Server Tax · 18%/)).toBeTruthy();
    expect(within(line).getByLabelText('Line 1 amount').textContent).toBe('Amount: 1,111');

    fireEvent.change(within(line).getByLabelText(/Quantity/), { target: { value: '3' } });
    await waitFor(() => expect(screen.getByLabelText('Grand total').textContent).toBe('10,002'));
    expect(screen.getByLabelText('Subtotal').textContent).toBe('3,333');
  });

  it('creates the quotation with the lines only - no totals, taxes or product facts', async () => {
    renderNew();
    const line = await pickChair();
    fireEvent.change(within(line).getByLabelText(/Quantity/), { target: { value: '2' } });
    fireEvent.change(within(line).getByLabelText(/Discount %/), { target: { value: '5' } });
    await waitFor(() => expect(screen.getByLabelText('Grand total').textContent).toBe('10,001'));
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Status/ }).textContent).toContain('Kestrel Draft'));

    fireEvent.click(screen.getByRole('button', { name: 'Create quotation' }));

    await waitFor(() => expect(createQuotation).toHaveBeenCalledTimes(1));
    const [body] = createQuotation.mock.calls[0];
    expect(body).toEqual({
      companyId: 'c1',
      contactId: null,
      opportunityId: null,
      items: [{ productId: 'p1', quantity: 2, unitPrice: 1000, discountPercent: 5 }],
      discountPercent: 0,
      notes: '',
      termsAndConditions: 'Heron terms apply.',
      statusId: 'st1',
    });
    for (const key of ['subtotal', 'tax', 'grandTotal', 'discount']) expect(body).not.toHaveProperty(key);
    expect(await screen.findByText('Saved page')).toBeTruthy();
  });

  it('will not save without a customer or a product', async () => {
    renderNew('/quotations/new');
    await screen.findByRole('group', { name: 'Line 1' });
    fireEvent.click(screen.getByRole('button', { name: 'Create quotation' }));

    expect(await screen.findByText('Customer is required')).toBeTruthy();
    expect(screen.getByText('Choose a product')).toBeTruthy();
    expect(createQuotation).not.toHaveBeenCalled();
    expect(calculateQuotation).not.toHaveBeenCalled();
  });

  it('shows a refused line on that line', async () => {
    createQuotation.mockRejectedValue(
      Object.assign(new Error('This product is inactive'), {
        errors: [{ field: 'items.0.productId', message: 'This product is inactive' }],
      })
    );
    renderNew();
    const line = await pickChair();
    await waitFor(() => expect(screen.getByLabelText('Grand total').textContent).toBe('10,000'));
    await waitFor(() => expect(screen.getByRole('combobox', { name: /Status/ }).textContent).toContain('Kestrel Draft'));
    fireEvent.click(screen.getByRole('button', { name: 'Create quotation' }));

    expect(await within(line).findByText('This product is inactive')).toBeTruthy();
  });

  it('edits an existing quotation: loads its lines and sends only the fields the API accepts', async () => {
    getQuotation.mockResolvedValue({
      data: {
        quotation: {
          id: 'q7',
          quotationNumber: 'QUO-000007',
          companyId: 'c1',
          company: COMPANY,
          quotationDate: '2030-01-10T00:00:00.000Z',
          validUntil: '2030-02-09T00:00:00.000Z',
          status: { name: 'Kestrel Draft', category: 'draft' },
          items: [{ productId: 'p1', name: 'Ergonomic Chair', sku: 'PRD-000001', quantity: 4, unitPrice: 900, discountPercent: 0 }],
          discountPercent: 10,
          notes: 'Old note',
        },
      },
    });
    updateQuotation.mockResolvedValue({ data: { quotation: { id: 'q7', quotationNumber: 'QUO-000007' } } });
    renderNew('/quotations/q7/edit');

    expect(await screen.findByText('QUO-000007')).toBeTruthy();
    await waitFor(() =>
      expect(calculateQuotation).toHaveBeenLastCalledWith(
        { items: [{ productId: 'p1', quantity: 4, unitPrice: 900 }], discountPercent: 10, quotationId: 'q7' },
        expect.anything()
      )
    );
    expect(screen.queryByRole('combobox', { name: /Status/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateQuotation).toHaveBeenCalledTimes(1));
    const [id, body] = updateQuotation.mock.calls[0];
    expect(id).toBe('q7');
    expect(body).toMatchObject({ quotationDate: '2030-01-10', validUntil: '2030-02-09', discountPercent: 10 });
    expect(body).not.toHaveProperty('statusId');
    expect(body).not.toHaveProperty('grandTotal');
  });

  it('refuses to open the editor for an accepted quotation', async () => {
    getQuotation.mockResolvedValue({
      data: { quotation: { id: 'q8', quotationNumber: 'QUO-000008', items: [], status: { name: 'Won Over', category: 'accepted' } } },
    });
    renderNew('/quotations/q8/edit');
    expect(await screen.findByText(/won over and cannot be edited/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
  });
});
