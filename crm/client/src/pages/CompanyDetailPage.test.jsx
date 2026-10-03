import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { getCompany, getCompanySections, getCompanyTimeline } from '../api/companies.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import CompanyDetailPage from './CompanyDetailPage.jsx';

vi.mock('../api/companies.api.js');

const COMPANY = {
  id: 'c1',
  companyCode: 'COMP-000042',
  name: 'Acme Industries',
  status: 'active',
  city: 'Pune',
  industry: { id: 'i1', name: 'Manufacturing' },
};

// As the API reports it today: only the timeline has data behind it.
const SECTIONS = [
  { key: 'contacts', label: 'Contacts', available: false, count: null },
  { key: 'leads', label: 'Leads', available: false, count: null },
  { key: 'timeline', label: 'Timeline', available: true, count: 3 },
];

function renderPage(options) {
  return renderAs(
    <Routes>
      <Route path="/companies/:id" element={<CompanyDetailPage />} />
    </Routes>,
    { route: '/companies/c1', permissions: ['companies.read'], ...options }
  );
}

const tab = (name) => screen.getByRole('tab', { name });

beforeEach(() => {
  getCompany.mockResolvedValue({ data: { company: COMPANY } });
  getCompanySections.mockResolvedValue({ data: { sections: SECTIONS } });
  getCompanyTimeline.mockResolvedValue({
    data: {
      events: [
        {
          id: 'e1',
          action: 'updated',
          createdAt: '2026-01-02T10:00:00.000Z',
          actor: { fullName: 'Eddie Editor' },
          changes: [{ field: 'city', label: 'City', from: 'Pune', to: 'Nashik' }],
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    },
  });
});

afterEach(cleanup);

describe('CompanyDetailPage', () => {
  it('builds its tabs from the sections the API returns', async () => {
    renderPage();
    await screen.findByRole('tab', { name: /Timeline/ });

    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Overview',
      'Contacts',
      'Leads',
      'Timeline3',
    ]);
    expect(getCompanySections).toHaveBeenCalledWith('c1', expect.anything());
  });

  it('shows a count only where the API supplies one - never an invented number', async () => {
    renderPage();
    await screen.findByRole('tab', { name: /Timeline/ });

    expect(within(tab(/Timeline/)).getByText('3')).toBeTruthy();
    for (const name of ['Contacts', 'Leads']) {
      expect(tab(name).textContent).toBe(name);
      expect(tab(name).textContent).not.toMatch(/\d/);
    }
  });

  it('says so when a section has no module behind it, and requests nothing for it', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: 'Contacts' }));

    expect(await screen.findByText(/Contacts is not available yet/)).toBeTruthy();
    expect(getCompanyTimeline).not.toHaveBeenCalled();
  });

  it('loads an available section from its API when opened', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Timeline/ }));

    expect(await screen.findByText(/Eddie Editor/)).toBeTruthy();
    expect(screen.getByText(/Pune → Nashik/)).toBeTruthy();
    expect(getCompanyTimeline).toHaveBeenCalledWith('c1', { page: 1, limit: 20 }, expect.anything());
  });

  it('still shows the overview when the sections request fails', async () => {
    getCompanySections.mockRejectedValue(Object.assign(new Error('Sections unavailable'), { status: 500 }));
    renderPage();

    expect(await screen.findByText(/Could not load the other sections/)).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Overview']);
    expect(screen.getAllByText('COMP-000042').length).toBeGreaterThan(0);
  });

  it('hides Edit and Delete without the permissions, shows them with', async () => {
    renderPage();
    await screen.findAllByText('Acme Industries');
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    cleanup();

    renderPage({ permissions: ['companies.read', 'companies.update', 'companies.delete'] });
    await screen.findAllByText('Acme Industries');
    expect(screen.getByRole('link', { name: 'Edit' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
  });
});
