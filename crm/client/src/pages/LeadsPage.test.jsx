import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';
import { listLeadConfig } from '../api/leadConfig.api.js';
import { listLeads } from '../api/leads.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import LeadsPage from './LeadsPage.jsx';

vi.mock('../api/leads.api.js');
vi.mock('../api/leadConfig.api.js', async (importOriginal) => ({ ...(await importOriginal()), listLeadConfig: vi.fn() }));

const TOTAL = 45;
// The API's own paging: the rows of the page asked for, and the total.
function page({ page = 1, limit = 20 } = {}) {
  const first = (page - 1) * limit;
  const leads = Array.from({ length: Math.max(0, Math.min(limit, TOTAL - first)) }, (_, i) => {
    const n = first + i + 1;
    return { id: `l${n}`, leadNumber: `ENQ-${String(n).padStart(6, '0')}`, title: `Lead ${n}`, status: { id: 's1', name: 'New' }, createdAt: '2031-01-01T00:00:00.000Z' };
  });
  return { data: { leads, pagination: { page, limit, total: TOTAL, totalPages: Math.ceil(TOTAL / limit) } } };
}

function Where() {
  return <div data-testid="where">{useLocation().search}</div>;
}
const renderPage = (route = '/leads') =>
  renderAs(
    <>
      <Routes>
        <Route path="/leads" element={<LeadsPage />} />
      </Routes>
      <Where />
    </>,
    { route, permissions: ['leads.read'] }
  );
const lastParams = () => listLeads.mock.calls.at(-1)[0];

beforeEach(() => {
  vi.clearAllMocks();
  listLeads.mockImplementation(async (params) => page(params));
  listLeadConfig.mockResolvedValue({ data: { items: [] } });
});

afterEach(cleanup);

describe('LeadsPage paging', () => {
  it('goes to the next page and back, asking the API for each', async () => {
    renderPage();
    expect(await screen.findByText('1–20 of 45')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(await screen.findByText('21–40 of 45')).toBeTruthy();
    expect(lastParams()).toMatchObject({ page: 2, limit: 20 });
    expect(screen.getByTestId('where').textContent).toContain('page=2');

    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(await screen.findByText('41–45 of 45')).toBeTruthy();
    expect(lastParams()).toMatchObject({ page: 3 });
    // Stays there once the page has loaded.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.getByText('41–45 of 45')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Go to next page' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Go to previous page' }));
    expect(await screen.findByText('21–40 of 45')).toBeTruthy();
    await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));
  });

  it('opens on the page in the address', async () => {
    renderPage('/leads?page=3');
    expect(await screen.findByText('41–45 of 45')).toBeTruthy();
    expect(listLeads.mock.calls[0][0]).toMatchObject({ page: 3 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.getByTestId('where').textContent).toContain('page=3');
  });
});
