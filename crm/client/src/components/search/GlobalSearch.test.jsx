import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocation } from 'react-router-dom';
import { searchAll } from '../../api/search.api.js';
import { renderAs } from '../../test/renderWithProviders.jsx';
import GlobalSearch from './GlobalSearch.jsx';

vi.mock('../../api/search.api.js');

const EMPTY = { companies: [], contacts: [], leads: [], opportunities: [], quotations: [], orders: [], projects: [], tickets: [], contracts: [] };
// Deliberately unusual values: what the API returns is what is shown.
const RESULTS = {
  ...EMPTY,
  companies: [{ id: 'c9', type: 'company', title: 'Heron & Wren Ltd', subtitle: 'CO-000042 · Yaoundé' }],
  leads: [{ id: 'l7', type: 'lead', title: 'Heron aviary fit-out', subtitle: 'ENQ-000007 · Heron & Wren Ltd' }],
  quotations: [{ id: 'q3', type: 'quotation', title: 'QT-000003', subtitle: 'Heron & Wren Ltd · Sent' }],
};

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}
const renderSearch = () =>
  renderAs(
    <>
      <GlobalSearch />
      <Where />
    </>,
    { permissions: [] }
  );
const box = () => screen.getByRole('combobox', { name: 'Search the CRM' });
const type = (value) => {
  fireEvent.focus(box());
  fireEvent.change(box(), { target: { value } });
};

beforeEach(() => {
  vi.clearAllMocks();
  searchAll.mockResolvedValue({ data: RESULTS });
});

afterEach(cleanup);

describe('GlobalSearch', () => {
  it('asks the API for what was typed and shows the results under their category', async () => {
    renderSearch();
    type('heron');
    const list = within(await screen.findByRole('listbox'));
    await list.findByText('Heron & Wren Ltd');
    expect(searchAll).toHaveBeenCalledTimes(1);
    expect(searchAll).toHaveBeenCalledWith({ q: 'heron', limit: undefined }, expect.anything());

    expect(list.getAllByRole('option')).toHaveLength(3);
    for (const heading of ['Companies', 'Leads', 'Quotations']) expect(list.getByText(heading)).toBeTruthy();
    // Categories with nothing found are not shown.
    expect(list.queryByText('Contacts')).toBeNull();
    expect(list.getByText('CO-000042 · Yaoundé')).toBeTruthy();
    expect(list.getByText('ENQ-000007 · Heron & Wren Ltd')).toBeTruthy();
  });

  it('choosing a result opens the record and clears the box', async () => {
    renderSearch();
    type('heron');
    fireEvent.click(await screen.findByText('Heron aviary fit-out'));
    expect(screen.getByTestId('where').textContent).toBe('/leads/l7');
    expect(box().value).toBe('');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('works from the keyboard', async () => {
    renderSearch();
    type('heron');
    await screen.findByText('QT-000003');
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'ArrowDown' });
    fireEvent.keyDown(box(), { key: 'Enter' });
    expect(screen.getByTestId('where').textContent).toBe('/quotations/q3');
  });

  it('waits for two characters, and for typing to pause', async () => {
    renderSearch();
    type('h');
    await new Promise((resolve) => setTimeout(resolve, 400));
    // One letter is not sent to the API; only the pages that match it are offered.
    expect(searchAll).not.toHaveBeenCalled();
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Dashboard']);

    type('he');
    type('her');
    type('  hero ');
    await screen.findByText('Heron & Wren Ltd');
    expect(searchAll).toHaveBeenCalledTimes(1);
    expect(searchAll.mock.calls[0][0].q).toBe('hero');
  });

  it('says so when nothing is found, and when the search fails', async () => {
    searchAll.mockResolvedValue({ data: EMPTY });
    renderSearch();
    type('zzz');
    expect(await screen.findByText('Nothing found')).toBeTruthy();

    searchAll.mockRejectedValue({ message: 'Too many requests' });
    type('yyy');
    expect(await screen.findByText('Too many requests')).toBeTruthy();
  });

  it('is also the command palette: pages the user may open and records they may create', async () => {
    renderAs(
      <>
        <GlobalSearch />
        <Where />
      </>,
      { permissions: ['leads.read', 'leads.create', 'reports.read'] }
    );
    act(() => box().focus());
    const list = within(await screen.findByRole('listbox'));
    // Empty box: everything this user may go to or create - and nothing else.
    expect(list.getAllByRole('option').map((o) => o.textContent)).toEqual(['Dashboard', 'Leads', 'Reports', 'New lead']);
    expect(list.getByText('Go to')).toBeTruthy();
    expect(list.getByText('Create')).toBeTruthy();

    type('new');
    fireEvent.click(await screen.findByText('New lead'));
    expect(screen.getByTestId('where').textContent).toBe('/leads/new');
  });

  it('Ctrl+K puts the cursor in the box', async () => {
    renderSearch();
    expect(document.activeElement).not.toBe(box());
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await waitFor(() => expect(document.activeElement).toBe(box()));
  });
});
