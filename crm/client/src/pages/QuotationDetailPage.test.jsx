import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { listLeadConfig } from '../api/leadConfig.api.js';
import { getQuotation, getQuotationPdf, getQuotationTimeline, sendQuotation } from '../api/quotations.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import QuotationDetailPage from './QuotationDetailPage.jsx';

vi.mock('../api/quotations.api.js');
vi.mock('../api/leadConfig.api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listLeadConfig: vi.fn(),
}));

const STATUSES = [
  { id: 'st1', name: 'Kestrel Draft', category: 'draft', isDefault: true },
  { id: 'st2', name: 'Osprey Signed', category: 'accepted' },
];
const QUOTATION = {
  id: 'q1',
  quotationNumber: 'QUO-000001',
  statusId: 'st1',
  status: STATUSES[0],
  company: { id: 'c1', name: 'Acme Industries', email: 'accounts@acme.example' },
  contact: { id: 'k1', fullName: 'Priya Nair', email: 'priya@acme.example' },
  quotationDate: '2030-01-10T00:00:00.000Z',
  items: [{ productId: 'p1', name: 'Ergonomic Chair', sku: 'PRD-000001', quantity: 2, unitPrice: 1000, discountPercent: 0, taxRate: 18, tax: 360, total: 2000 }],
  subtotal: 2000,
  discountPercent: 0,
  discount: 0,
  tax: 360,
  grandTotal: 2360,
};

const ALL = ['quotations.read', 'quotations.update', 'quotations.send', 'quotations.delete'];

function renderPage(permissions = ALL) {
  return renderAs(
    <Routes>
      <Route path="/quotations/:id" element={<QuotationDetailPage />} />
    </Routes>,
    { route: '/quotations/q1', permissions }
  );
}
const loaded = () => screen.findByRole('heading', { name: 'QUO-000001' });

beforeEach(() => {
  getQuotation.mockResolvedValue({ data: { quotation: QUOTATION } });
  listLeadConfig.mockResolvedValue({ data: { items: STATUSES } });
  getQuotationTimeline.mockResolvedValue({ data: { events: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } } });
});

afterEach(cleanup);

describe('QuotationDetailPage', () => {
  it('shows the lines and the totals stored by the server', async () => {
    renderPage();
    await loaded();
    const lines = within(screen.getByRole('table', { name: 'Quotation lines' }));
    expect(lines.getByText('Ergonomic Chair')).toBeTruthy();
    expect(screen.getByLabelText('Grand total').textContent).toBe('2,360');
    expect(screen.getByRole('link', { name: 'Edit' })).toBeTruthy();
  });

  it('a reader sees no Edit, Send, Delete or status control, but can download the PDF', async () => {
    getQuotationPdf.mockResolvedValue(new Blob(['%PDF-'], { type: 'application/pdf' }));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    renderPage(['quotations.read']);
    await loaded();

    for (const name of ['Send', 'Delete']) expect(screen.queryByRole('button', { name })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /Status/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    await waitFor(() => expect(getQuotationPdf).toHaveBeenCalledWith('q1'));
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('an accepted quotation cannot be edited', async () => {
    getQuotation.mockResolvedValue({ data: { quotation: { ...QUOTATION, statusId: 'st2', status: STATUSES[1] } } });
    renderPage();
    await loaded();
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
    expect(screen.getByText(/osprey signed, so it cannot be edited/)).toBeTruthy();
  });

  it('sending reports when email is not configured', async () => {
    sendQuotation.mockResolvedValue({
      message: 'Quotation marked as sent. Email is not configured, so nothing was emailed.',
      data: { quotation: QUOTATION, email: { delivered: false, to: 'priya@acme.example' } },
    });
    renderPage();
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByLabelText('To').value).toBe('priya@acme.example');
    fireEvent.click(dialog.getByRole('button', { name: 'Send' }));

    await waitFor(() =>
      expect(sendQuotation).toHaveBeenCalledWith('q1', { to: 'priya@acme.example', subject: null, message: null })
    );
    expect(await screen.findByText(/Email is not configured/)).toBeTruthy();
  });
});
