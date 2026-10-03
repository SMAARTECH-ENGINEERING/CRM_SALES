import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { listCompanyOptions } from '../api/companies.api.js';
import { createContact } from '../api/contacts.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import ContactNewPage from './ContactNewPage.jsx';

vi.mock('../api/companies.api.js');
vi.mock('../api/contacts.api.js');

const COMPANIES = [
  { id: 'c1', companyCode: 'COMP-000001', name: 'Acme Industries', status: 'active' },
  { id: 'c2', companyCode: 'COMP-000002', name: 'Bolt Traders', status: 'active' },
];

// Behaves like GET /companies/options: by id, or filtered by search.
function serveCompanies(params = {}) {
  const term = (params.search ?? '').toLowerCase();
  const companies = params.id
    ? COMPANIES.filter((c) => c.id === params.id)
    : COMPANIES.filter((c) => c.name.toLowerCase().includes(term));
  return Promise.resolve({ data: { companies } });
}

function renderPage(route = '/contacts/new') {
  return renderAs(
    <Routes>
      <Route path="/contacts/new" element={<ContactNewPage />} />
      <Route path="/contacts/:id" element={<h1>Contact page</h1>} />
    </Routes>,
    { route, permissions: ['contacts.read', 'contacts.create'] }
  );
}

const companyBox = () => screen.getByRole('combobox', { name: /Company/ });
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Create contact' }));

beforeEach(() => {
  listCompanyOptions.mockImplementation(serveCompanies);
  createContact.mockResolvedValue({ data: { contact: { id: 'new-1' } } });
});

afterEach(cleanup);

describe('ContactNewPage', () => {
  it('loads the company options from the API', async () => {
    renderPage();
    await waitFor(() => expect(listCompanyOptions).toHaveBeenCalledWith({ search: '', limit: 20 }, expect.anything()));

    fireEvent.mouseDown(companyBox());
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Acme IndustriesCOMP-000001', 'Bolt TradersCOMP-000002']);
  });

  it('shows whatever the API returns - nothing is built into the page', async () => {
    listCompanyOptions.mockResolvedValue({ data: { companies: [] } });
    renderPage();

    fireEvent.mouseDown(companyBox());
    expect(await screen.findByText('No companies yet')).toBeTruthy();
    expect(screen.queryAllByRole('option')).toEqual([]);
  });

  it('searches on the server as the user types', async () => {
    renderPage();
    // As a user would: focus the box, then type.
    companyBox().focus();
    fireEvent.change(companyBox(), { target: { value: 'bolt' } });

    await waitFor(() => expect(listCompanyOptions).toHaveBeenCalledWith({ search: 'bolt', limit: 20 }, expect.anything()));
    const options = await screen.findAllByRole('option');
    await waitFor(() => expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Bolt TradersCOMP-000002']));
    expect(options.length).toBeGreaterThan(0);
  });

  it('will not submit without a company', async () => {
    renderPage();
    type(/First name/, 'Priya');
    type(/Last name/, 'Nair');
    submit();

    expect(await screen.findByText('Select a company')).toBeTruthy();
    expect(createContact).not.toHaveBeenCalled();
  });

  it('sends the chosen company id', async () => {
    renderPage();
    type(/First name/, 'Priya');
    type(/Last name/, 'Nair');
    fireEvent.mouseDown(companyBox());
    fireEvent.click(await screen.findByRole('option', { name: /Bolt Traders/ }));
    submit();

    await waitFor(() => expect(createContact).toHaveBeenCalled());
    expect(createContact.mock.calls[0][0]).toMatchObject({ firstName: 'Priya', lastName: 'Nair', companyId: 'c2' });
    expect(await screen.findByText('Contact page')).toBeTruthy();
  });

  it('preselects the company from ?companyId= by looking it up', async () => {
    renderPage('/contacts/new?companyId=c2');

    await waitFor(() => expect(companyBox().value).toBe('Bolt Traders (COMP-000002)'));
    expect(listCompanyOptions).toHaveBeenCalledWith({ id: 'c2' }, expect.anything());
  });

  it('shows the API error on the company field when the id is rejected', async () => {
    createContact.mockRejectedValue(
      Object.assign(new Error('Company not found'), {
        status: 400,
        errors: [{ field: 'companyId', message: 'Company not found' }],
      })
    );
    renderPage('/contacts/new?companyId=c1');
    await waitFor(() => expect(companyBox().value).toBe('Acme Industries (COMP-000001)'));
    type(/First name/, 'Priya');
    type(/Last name/, 'Nair');
    submit();

    expect(await screen.findByText('Company not found')).toBeTruthy();
    expect(screen.queryByText('Contact page')).toBeNull();
  });
});
