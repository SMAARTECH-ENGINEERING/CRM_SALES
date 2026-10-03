import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import {
  createLeadConfig,
  deleteLeadConfig,
  listLeadConfig,
  updateLeadConfig,
} from '../api/leadConfig.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import LeadSettingsPage from './LeadSettingsPage.jsx';

vi.mock('../api/leadConfig.api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listLeadConfig: vi.fn(),
  createLeadConfig: vi.fn(),
  updateLeadConfig: vi.fn(),
  deleteLeadConfig: vi.fn(),
}));

const DATA = {
  'lead-sources': [
    { id: 'a', name: 'Aardvark Source', isActive: true },
    { id: 'b', name: 'Badger Source', isActive: false, description: 'Rarely used' },
  ],
  'lead-statuses': [
    { id: 'n', name: 'Narwhal Stage', category: 'open', color: '#112233', isDefault: true, isActive: true },
    { id: 'o', name: 'Ocelot Stage', category: 'won', isDefault: false, isActive: true },
  ],
  'lead-priorities': [{ id: 'p', name: 'Puffin Priority', level: 7, isDefault: true, isActive: true }],
};

function renderPage(route = '/lead-settings') {
  return renderAs(
    <Routes>
      <Route path="/lead-settings" element={<LeadSettingsPage />} />
    </Routes>,
    { route, permissions: ['leadConfig.manage'] }
  );
}

const row = (name) => screen.getByText(name).closest('tr');

beforeEach(() => {
  listLeadConfig.mockImplementation((resource) => Promise.resolve({ data: { items: DATA[resource] } }));
  updateLeadConfig.mockResolvedValue({ data: { item: {} } });
  createLeadConfig.mockResolvedValue({ data: { item: {} } });
  deleteLeadConfig.mockResolvedValue({ data: null });
});

afterEach(cleanup);

describe('LeadSettingsPage', () => {
  it('lists the values the API returns, including inactive ones', async () => {
    renderPage();
    expect(await screen.findByText('Aardvark Source')).toBeTruthy();
    expect(screen.getByText('Badger Source')).toBeTruthy();
    // The settings screen asks for everything, not just active values.
    expect(listLeadConfig).toHaveBeenCalledWith('lead-sources', undefined, expect.anything());
  });

  it('each tab loads its own list from its own endpoint', async () => {
    renderPage();
    await screen.findByText('Aardvark Source');

    fireEvent.click(screen.getByRole('tab', { name: 'Lead statuses' }));
    expect(await screen.findByText('Narwhal Stage')).toBeTruthy();
    expect(screen.queryByText('Aardvark Source')).toBeNull();
    expect(within(row('Ocelot Stage')).getByText('Won')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'Lead priorities' }));
    expect(await screen.findByText('Puffin Priority')).toBeTruthy();
    expect(within(row('Puffin Priority')).getByText('7')).toBeTruthy();
    expect(listLeadConfig).toHaveBeenCalledWith('lead-priorities', undefined, expect.anything());
  });

  it('says so when a list is empty rather than showing sample rows', async () => {
    listLeadConfig.mockResolvedValue({ data: { items: [] } });
    renderPage();
    expect(await screen.findByText(/No lead sources yet/)).toBeTruthy();
    expect(screen.queryAllByRole('row')).toEqual([]);
  });

  it('the default cannot be deactivated or deleted; others can be made the default', async () => {
    renderPage('/lead-settings?tab=lead-statuses');
    await screen.findByText('Narwhal Stage');

    const isDefault = within(row('Narwhal Stage'));
    expect(isDefault.getByText('Default')).toBeTruthy();
    expect(isDefault.getByRole('switch').disabled).toBe(true);
    expect(isDefault.getByRole('button', { name: 'Delete Narwhal Stage' }).disabled).toBe(true);

    fireEvent.click(within(row('Ocelot Stage')).getByRole('button', { name: 'Make default' }));
    await waitFor(() => expect(updateLeadConfig).toHaveBeenCalledWith('lead-statuses', 'o', { isDefault: true }));
  });

  it('the switch activates and deactivates through the API', async () => {
    renderPage();
    await screen.findByText('Badger Source');

    fireEvent.click(within(row('Badger Source')).getByRole('switch'));
    await waitFor(() => expect(updateLeadConfig).toHaveBeenCalledWith('lead-sources', 'b', { isActive: true }));
  });

  it('adds a value through the API, sending only the fields of that list', async () => {
    renderPage();
    await screen.findByText('Aardvark Source');

    fireEvent.click(screen.getByRole('button', { name: 'Add source' }));
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Capybara Source' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(createLeadConfig).toHaveBeenCalled());
    expect(createLeadConfig).toHaveBeenCalledWith('lead-sources', {
      name: 'Capybara Source',
      description: '',
      isActive: true,
    });
  });

  it('sends a position only when one is entered', async () => {
    renderPage('/lead-settings?tab=lead-priorities');
    await screen.findByText('Puffin Priority');

    fireEvent.click(screen.getByRole('button', { name: 'Add priority' }));
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Tapir Priority' } });
    fireEvent.change(screen.getByLabelText(/Level/), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/Position/), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() => expect(createLeadConfig).toHaveBeenCalled());
    expect(createLeadConfig).toHaveBeenCalledWith('lead-priorities', {
      name: 'Tapir Priority',
      description: '',
      isActive: true,
      sortOrder: 15,
      level: 3,
      color: '',
      isDefault: false,
    });
  });

  it('deletes after confirmation', async () => {
    renderPage();
    await screen.findByText('Aardvark Source');

    fireEvent.click(screen.getByRole('button', { name: 'Delete Aardvark Source' }));
    expect(deleteLeadConfig).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteLeadConfig).toHaveBeenCalledWith('lead-sources', 'a'));
  });
});
