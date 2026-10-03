import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDashboardActivities,
  getDashboardLeads,
  getDashboardOpportunities,
  getDashboardSales,
  getDashboardSummary,
} from '../api/dashboard.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import DashboardPage from './DashboardPage.jsx';

vi.mock('../api/dashboard.api.js');
// The chart library draws to SVG and measures the page; here it is replaced
// by a list of what it was given, so the test can read the plotted rows.
vi.mock('@mui/x-charts/BarChart', () => ({
  BarChart: ({ dataset, series }) => (
    <ul data-testid="chart" data-series={series[0].label}>
      {dataset.map((row) => (
        <li key={row.key ?? row.label}>
          {row.label}={row.value}
        </li>
      ))}
    </ul>
  ),
}));

const HEADER = {
  period: { key: 'month', from: '2031-05-01', to: '2031-05-31' },
  scope: { type: 'all', organization: null, organizations: [{ id: 'o1', name: 'North Region' }, { id: 'o2', name: 'South Region' }] },
  generatedAt: '2031-05-14T10:30:00.000Z',
};
const off = { available: false };
// Odd numbers on purpose: whatever the API returns is what shows.
const SUMMARY = {
  ...HEADER,
  metrics: {
    totalLeads: { available: true, value: 137 },
    newLeads: { available: true, value: 21 },
    qualifiedLeads: { available: true, value: 9 },
    openOpportunities: { available: true, value: 17 },
    pipelineValue: { available: true, value: 6000 },
    wonValue: { available: true, value: 400, count: 3 },
    lostValue: { available: true, value: 300, count: 1 },
    customers: { available: true, value: 44, new: 2 },
    pendingFollowUps: { available: true, value: 13, overdue: 5 },
    openTickets: { available: true, value: 8, unassigned: 4 },
    pendingPayments: { available: true, value: 6, amount: 800, overdue: 2, overdueAmount: 350 },
  },
};
const LEADS = {
  ...HEADER,
  totals: { created: 21, qualified: 9, won: 1, lost: 2, conversionRate: 4.76 },
  bySource: [{ id: 's1', name: 'Heron Fair', count: 12 }, { id: null, name: 'No source', count: 9 }],
  byStatus: [{ id: 'a', name: 'Wren New', count: 15, category: 'open' }, { id: 'b', name: 'Owl Ready', count: 6, category: 'open' }],
};
const OPPORTUNITIES = {
  ...HEADER,
  pipeline: { id: 'p1', name: 'Kestrel Sales' },
  pipelines: [{ id: 'p1', name: 'Kestrel Sales', isDefault: true }],
  totals: { open: { count: 2, value: 6000, weightedValue: 1000 }, won: { count: 3, value: 400 }, lost: { count: 1, value: 300 }, winRate: 75 },
  stages: [{ id: 'st1', name: 'Discovery', order: 1, count: 2, value: 6000, weightedValue: 1000 }, { id: 'st2', name: 'Proposal', order: 2, count: 0, value: 0, weightedValue: 0 }],
};
const SALES = {
  ...HEADER,
  totals: { orderCount: 2, orderValue: 3068, averageOrderValue: 1534 },
  monthlySales: [{ month: '2031-04', orderCount: 0, value: 0 }, { month: '2031-05', orderCount: 2, value: 3068 }],
  salespeople: [{ user: { id: 'u1', fullName: 'Norah North' }, orderCount: 1, orderValue: 2360, wonCount: 1, wonValue: 400 }, { user: null, orderCount: 1, orderValue: 708, wonCount: 0, wonValue: 0 }],
  products: [{ productId: 'pr1', name: 'Desk', sku: 'D-1', quantity: 2, revenue: 2000, orderCount: 1 }],
};
const ACTIVITIES = {
  ...HEADER,
  totals: { total: 3, pending: 2, completed: 1, cancelled: 0, overdue: 0 },
  byType: [{ id: 't1', name: 'Call', count: 2 }],
  byUser: [{ user: { id: 'u1', fullName: 'Norah North' }, count: 2, completed: 1 }],
  followUps: { available: true, pending: 2, overdue: 1, dueToday: 0, completedInPeriod: 0 },
};
const ALL = ['dashboard.read', 'leads.read', 'opportunities.read', 'orders.read', 'activities.read'];
const chartOf = (title) => within(screen.getByRole('heading', { name: title }).closest('.MuiCard-root'));

beforeEach(() => {
  vi.clearAllMocks();
  getDashboardSummary.mockResolvedValue({ data: SUMMARY });
  getDashboardLeads.mockResolvedValue({ data: LEADS });
  getDashboardOpportunities.mockResolvedValue({ data: OPPORTUNITIES });
  getDashboardSales.mockResolvedValue({ data: SALES });
  getDashboardActivities.mockResolvedValue({ data: ACTIVITIES });
});

afterEach(cleanup);

describe('DashboardPage', () => {
  it('shows every metric exactly as the API returns it', async () => {
    renderAs(<DashboardPage />, { permissions: ALL });
    const figures = within(await screen.findByRole('group', { name: 'Key figures' }));
    const expected = {
      'Total leads': '137',
      'New leads': '21',
      'Qualified leads': '9',
      'Open opportunities': '17',
      'Pipeline value': '6K',
      'Won value': '400',
      'Lost value': '300',
      Customers: '44',
      'Pending follow-ups': '13',
      'Open tickets': '8',
      'Pending payments': '800',
    };
    for (const [label, value] of Object.entries(expected)) expect(figures.getByLabelText(label).textContent).toBe(value);
    expect(figures.getByText('5 overdue')).toBeTruthy();
    expect(figures.getByText('3 deal(s) won in the period')).toBeTruthy();
    expect(figures.getByText('6 invoice(s), 2 overdue (350)')).toBeTruthy();
    expect(screen.getByText(/All organizations ·/)).toBeTruthy();
  });

  it('draws the six charts from the API rows, each with a table view', async () => {
    renderAs(<DashboardPage />, { permissions: ALL });
    await screen.findByRole('group', { name: 'Key figures' });
    const rows = async (title) => {
      const card = chartOf(title);
      return (await card.findAllByRole('listitem')).map((item) => item.textContent);
    };
    expect(await rows('Leads by source')).toEqual(['Heron Fair=12', 'No source=9']);
    expect(await rows('Leads by status')).toEqual(['Wren New=15', 'Owl Ready=6']);
    expect(await rows('Opportunity pipeline')).toEqual(['Discovery=6000', 'Proposal=0']);
    expect((await rows('Monthly sales')).map((row) => row.split('=')[1])).toEqual(['0', '3068']);
    expect(await rows('Salesperson performance')).toEqual(['Norah North=2360', 'Unassigned=708']);
    expect(await rows('Product performance')).toEqual(['Desk=2000']);
    expect(chartOf('Opportunity pipeline').getByText(/Kestrel Sales: .* win rate in the period 75%/)).toBeTruthy();

    // The same rows as a table - nothing is reachable only by hovering.
    fireEvent.click(screen.getByRole('button', { name: 'Salesperson performance as a table' }));
    const table = within(screen.getByRole('table', { name: 'Salesperson performance' }));
    expect(within(table.getByRole('row', { name: /Norah North/ })).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['2.4K', '1', '1', '400']);
  });

  it('the period and organization filters are sent to every endpoint', async () => {
    renderAs(<DashboardPage />, { permissions: ALL });
    await screen.findByRole('group', { name: 'Key figures' });
    expect(getDashboardSummary).toHaveBeenLastCalledWith({ period: 'month' }, expect.anything());

    fireEvent.click(screen.getByRole('button', { name: 'This quarter' }));
    for (const api of [getDashboardSummary, getDashboardLeads, getDashboardOpportunities, getDashboardSales, getDashboardActivities]) {
      await waitFor(() => expect(api).toHaveBeenLastCalledWith({ period: 'quarter' }, expect.anything()));
    }

    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Organization/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'South Region' }));
    await waitFor(() => expect(getDashboardSales).toHaveBeenLastCalledWith({ period: 'quarter', organizationId: 'o2' }, expect.anything()));

    // Custom: nothing is requested until both dates are in.
    const calls = getDashboardSummary.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByText(/Choose a start and an end date/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2031-02-10' } });
    expect(getDashboardSummary.mock.calls.length).toBe(calls);
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2031-02-20' } });
    await waitFor(() =>
      expect(getDashboardSummary).toHaveBeenLastCalledWith({ period: 'custom', from: '2031-02-10', to: '2031-02-20', organizationId: 'o2' }, expect.anything())
    );
  });

  it('RBAC: sections the user cannot read are neither requested nor shown, and unavailable figures are left out', async () => {
    getDashboardSummary.mockResolvedValue({
      data: {
        ...SUMMARY,
        scope: { type: 'organization', organization: { id: 'o1', name: 'North Region' }, organizations: [] },
        metrics: { ...Object.fromEntries(Object.keys(SUMMARY.metrics).map((key) => [key, off])), totalLeads: SUMMARY.metrics.totalLeads, newLeads: SUMMARY.metrics.newLeads, qualifiedLeads: SUMMARY.metrics.qualifiedLeads },
      },
    });
    renderAs(<DashboardPage />, { permissions: ['dashboard.read', 'leads.read'] });
    const figures = within(await screen.findByRole('group', { name: 'Key figures' }));
    expect(figures.getAllByRole('link')).toHaveLength(3);
    expect(figures.queryByLabelText('Pipeline value')).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Leads by source' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Monthly sales' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Opportunity pipeline' })).toBeNull();
    expect(getDashboardSales).not.toHaveBeenCalled();
    expect(getDashboardOpportunities).not.toHaveBeenCalled();
    // Locked to their organization: named, and no organization filter offered.
    expect(screen.getByText(/North Region ·/)).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: /Organization/ })).toBeNull();
  });
});
