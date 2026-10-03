import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREFERENCES_STORAGE_KEY } from '../../context/PreferencesContext.jsx';
import { renderAs } from '../../test/renderWithProviders.jsx';
import AdvancedDataTable from './AdvancedDataTable.jsx';
import EmptyState from './EmptyState.jsx';
import { FilterBar } from './FilterDrawer.jsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const COLUMNS = [
  { field: 'code', headerName: 'Code', width: 120 },
  { field: 'name', headerName: 'Name', width: 200 },
  { field: 'city', headerName: 'City', width: 140 },
];
const ROWS = [
  { id: 'a', code: 'QX-1', name: 'Heron & Wren', city: 'Yaoundé' },
  { id: 'b', code: 'QX-2', name: 'Kestrel Works', city: 'Tromsø' },
];
const stored = () => JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY));
const headers = () => screen.getAllByRole('columnheader').map((header) => header.textContent);
const table = (props, options) => renderAs(<AdvancedDataTable tableId="birds" columns={COLUMNS} rows={ROWS} {...props} />, options);

describe('AdvancedDataTable', () => {
  it('shows the rows, and remembers which columns are hidden and their order', async () => {
    table();
    expect(headers()).toEqual(['Code', 'Name', 'City']);

    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    const panel = within(await screen.findByLabelText('Choose and order columns'));
    fireEvent.click(panel.getByRole('checkbox', { name: 'City' }));
    expect(headers()).toEqual(['Code', 'Name']);
    fireEvent.click(panel.getByRole('button', { name: 'Move Name up' }));
    expect(headers()).toEqual(['Name', 'Code']);
    expect(stored().tableColumns.birds).toMatchObject({ visibility: { city: false }, order: ['name', 'code', 'city'] });

    fireEvent.click(panel.getByRole('button', { name: 'Reset columns' }));
    expect(headers()).toEqual(['Code', 'Name', 'City']);
  });

  it('opens with the arrangement the user saved', () => {
    table({}, { preferences: { tableDensity: 'compact', tableColumns: { birds: { visibility: { code: false }, order: ['city', 'name', 'code'], widths: { name: 333 } } } } });
    expect(headers()).toEqual(['City', 'Name']);
    expect(screen.getByRole('columnheader', { name: 'Name' }).style.width).toBe('333px');
    expect(document.querySelector('.MuiDataGrid-root--densityCompact')).toBeTruthy();
  });

  it('density is the user\'s choice and is remembered', async () => {
    table();
    fireEvent.click(screen.getByRole('button', { name: 'Density' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Comfortable' }));
    expect(stored().tableDensity).toBe('comfortable');
  });

  it('goes full screen and back, also with Escape', () => {
    table();
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    const exit = screen.getByRole('button', { name: 'Exit full screen' });
    expect(exit.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Full screen' })).toBeTruthy();
  });

  it('selecting rows offers the bulk actions for exactly those rows', () => {
    const run = vi.fn();
    table({ bulkActions: ({ ids, clear }) => <button onClick={() => (run(ids), clear())}>Archive</button> });
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    fireEvent.click(within(screen.getByRole('row', { name: /Kestrel Works/ })).getByRole('checkbox'));
    expect(screen.getByText('1 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
    expect(run).toHaveBeenCalledWith(['b']);
    // Cleared: the ordinary toolbar is back.
    expect(screen.queryByText('1 selected')).toBeNull();
    expect(screen.getByRole('button', { name: 'Columns' })).toBeTruthy();
  });

  it('without bulk actions there is nothing to select', () => {
    table();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('says so when there is nothing, and differently when a filter found nothing', () => {
    const { unmount } = table({ rows: [] });
    expect(screen.getByText('Nothing here yet')).toBeTruthy();
    unmount();
    table({ rows: [], emptyState: <EmptyState dense filtered /> });
    expect(screen.getByText('No results found')).toBeTruthy();
    expect(screen.getByText('Try changing your search or filters.')).toBeTruthy();
  });
});

describe('FilterBar', () => {
  it('keeps the search on the page and puts the filters in a drawer, with the number in use', async () => {
    const clear = vi.fn();
    renderAs(
      <FilterBar activeCount={2}>
        <div>
          <input aria-label="Search" />
          <select aria-label="Status" />
          <select aria-label="City" />
          <button onClick={clear}>Clear</button>
        </div>
      </FilterBar>
    );
    expect(screen.getByLabelText('Search')).toBeTruthy();
    expect(screen.queryByLabelText('Status')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filters: 2 filters' }));
    const drawer = within(await screen.findByLabelText('Filters'));
    expect(drawer.getByLabelText('Status')).toBeTruthy();
    expect(drawer.getByLabelText('City')).toBeTruthy();
    fireEvent.click(drawer.getByRole('button', { name: 'Clear' }));
    expect(clear).toHaveBeenCalledTimes(1);
  });
});
