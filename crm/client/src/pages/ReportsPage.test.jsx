import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { exportReport, listReports, runReport } from '../api/reports.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import ReportsPage from './ReportsPage.jsx';

vi.mock('../api/reports.api.js');
vi.mock('../api/users.api.js');
vi.mock('../api/companies.api.js');

// A catalogue with made-up reports: the page knows none by name, so whatever
// the API describes is what it must build.
const CATALOG = {
  exportFormats: ['csv', 'xlsx', 'pdf'],
  exportMaxRows: 100,
  reports: [
    {
      key: 'herons',
      title: 'Herons',
      description: 'Every heron on the lake.',
      columns: [
        { key: 'ring', label: 'Ring', type: 'text' },
        { key: 'weight', label: 'Weight', type: 'money' },
        { key: 'seen', label: 'Seen', type: 'date' },
      ],
      dateFields: [
        { key: 'seen', label: 'Seen' },
        { key: 'ringed', label: 'Ringed' },
      ],
      filters: [{ key: 'plumage', label: 'Plumage', type: 'option', required: false, default: null, options: [{ value: 'grey', label: 'Grey' }, { value: 'white', label: 'White' }] }],
      totals: ['weight'],
      sort: { by: 'seen', order: 'desc' },
    },
    {
      key: 'reeds',
      title: 'Reeds',
      description: 'Reeds by bank.',
      columns: [{ key: 'bank', label: 'Bank', type: 'text' }, { key: 'count', label: 'Count', type: 'number' }],
      dateFields: [{ key: 'cut', label: 'Cut' }],
      filters: [{ key: 'groupBy', label: 'Group by', type: 'option', required: true, default: 'bank', options: [{ value: 'bank', label: 'Bank' }, { value: 'month', label: 'Month' }] }],
      totals: ['count'],
      sort: { by: 'bank', order: 'asc' },
    },
  ],
};
const result = (report, rows, totals, total = rows.length) => ({
  data: { report, applied: {}, scope: { type: 'all', organization: null, organizations: [] }, rows, totals, pagination: { page: 1, limit: 20, total, totalPages: 1 }, generatedAt: '2031-01-01T00:00:00.000Z' },
});
// Totals that the rows do not add up to: the page must show the API's.
const HERONS = result(CATALOG.reports[0], [{ id: 'h1', ring: 'GB-17', weight: 1500, seen: '2031-05-02T00:00:00.000Z' }, { id: 'h2', ring: 'GB-21', weight: 2000, seen: null }], { weight: 99999 }, 412);
const REEDS = result(CATALOG.reports[1], [{ id: 'east', bank: 'East', count: 7 }], { count: 7 });

function renderAt(route, permissions = ['reports.read', 'reports.export']) {
  return renderAs(
    <Routes>
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/reports/:key" element={<ReportsPage />} />
    </Routes>,
    { route, permissions }
  );
}
const lastParams = () => runReport.mock.calls.at(-1)[1];

beforeEach(() => {
  vi.clearAllMocks();
  listReports.mockResolvedValue({ data: CATALOG });
  runReport.mockImplementation((key) => Promise.resolve(key === 'reeds' ? REEDS : HERONS));
});

afterEach(cleanup);

describe('ReportsPage', () => {
  it('builds each report from the catalogue: tabs, columns, filters and totals from the API', async () => {
    renderAt('/reports');
    expect((await screen.findAllByRole('tab')).map((tab) => tab.textContent)).toEqual(['Herons', 'Reeds']);
    expect(await screen.findByText('GB-17')).toBeTruthy();
    expect(screen.getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Ring', 'Weight', 'Seen']);
    expect(runReport).toHaveBeenLastCalledWith('herons', { dateField: 'seen', page: 1, limit: 20 }, expect.anything());

    const totals = within(screen.getByLabelText('Report totals'));
    expect(totals.getByText('Rows: 412')).toBeTruthy();
    expect(totals.getByText('Weight: 99,999')).toBeTruthy();
    expect(screen.getByLabelText('Plumage')).toBeTruthy();
    expect(screen.getByLabelText('Date')).toBeTruthy();
  });

  it('sends the date range, date field, search and filters to the API - and nothing it was not asked', async () => {
    renderAt('/reports/herons');
    await screen.findByText('GB-17');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2031-05-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2031-05-31' } });
    await waitFor(() => expect(lastParams()).toMatchObject({ from: '2031-05-01', to: '2031-05-31' }));

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Plumage/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'White' }));
    await waitFor(() => expect(lastParams().plumage).toBe('white'));

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'gb' } });
    await waitFor(() => expect(lastParams().search).toBe('gb'));
    expect(lastParams()).toEqual({ dateField: 'seen', from: '2031-05-01', to: '2031-05-31', search: 'gb', plumage: 'white', page: 1, limit: 20 });

    // A range that runs backwards is not sent.
    const calls = runReport.mock.calls.length;
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2031-04-01' } });
    expect(await screen.findByText('Must not be before the start')).toBeTruthy();
    expect(runReport.mock.calls.length).toBe(calls);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(lastParams()).toEqual({ dateField: 'seen', page: 1, limit: 20 }));
  });

  it('sorting is asked of the API', async () => {
    renderAt('/reports/herons');
    await screen.findByText('GB-17');
    fireEvent.click(screen.getByRole('columnheader', { name: 'Weight' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ sortBy: 'weight', sortOrder: 'asc' }));
  });

  it('another report starts clean, with its own defaults', async () => {
    renderAt('/reports/herons');
    await screen.findByText('GB-17');
    fireEvent.click(screen.getByRole('tab', { name: 'Reeds' }));
    expect(await screen.findByText('East')).toBeTruthy();
    expect(runReport).toHaveBeenLastCalledWith('reeds', { dateField: 'cut', groupBy: 'bank', page: 1, limit: 20 }, expect.anything());
    // One date field: no selector, the range fields name it.
    expect(screen.queryByLabelText('Date')).toBeNull();
    expect(screen.getByLabelText('Cut: From')).toBeTruthy();
  });

  it('exports through the API with the same criteria, and says when the file is cut short', async () => {
    exportReport.mockResolvedValue(new Blob(['x']));
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    renderAt('/reports/herons');
    await screen.findByText('GB-17');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Plumage/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Grey' }));
    await waitFor(() => expect(lastParams().plumage).toBe('grey'));

    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    await waitFor(() => expect(exportReport).toHaveBeenCalledWith('herons', { dateField: 'seen', plumage: 'grey' }, 'xlsx'));
    // 412 rows match, the API exports at most 100.
    expect(await screen.findByText(/first 100 of 412 rows/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'CSV' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'PDF' })).toBeTruthy();
  });

  it('without reports.export there are no export buttons', async () => {
    renderAt('/reports/herons', ['reports.read']);
    await screen.findByText('GB-17');
    expect(screen.queryByRole('button', { name: 'CSV' })).toBeNull();
  });
});
