import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { listLeadConfig } from '../api/leadConfig.api.js';
import { listActivities } from '../api/activities.api.js';
import { listFollowUps } from '../api/followups.api.js';
import { changeLeadStatus, getLead, getLeadTimeline } from '../api/leads.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import LeadDetailPage from './LeadDetailPage.jsx';

vi.mock('../api/leads.api.js');
vi.mock('../api/activities.api.js');
vi.mock('../api/followups.api.js');
vi.mock('../api/leadConfig.api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listLeadConfig: vi.fn(),
}));

const STATUSES = [
  { id: 's1', name: 'Zebra Stage', color: '#112233', isDefault: true },
  { id: 's2', name: 'Quokka Stage', color: '#445566' },
];

const LEAD = {
  id: 'l1',
  leadNumber: 'LEAD-000042',
  title: 'Website redesign',
  statusId: 's1',
  status: STATUSES[0],
  priority: { id: 'p1', name: 'Puffin Priority' },
  company: { id: 'c1', name: 'Acme Industries' },
  isConverted: false,
  tags: ['web'],
};

// May look at everything about a lead, change nothing.
const READ_ONLY = ['leads.read', 'activities.read', 'followups.read'];

const ALL = ['leads.read', 'leads.update', 'leads.assign', 'leads.convert', 'leads.delete'];

function renderPage(options = {}) {
  return renderAs(
    <Routes>
      <Route path="/leads/:id" element={<LeadDetailPage />} />
    </Routes>,
    { route: '/leads/l1', permissions: READ_ONLY, ...options }
  );
}

const button = (name) => screen.queryByRole('button', { name });
const loaded = () => screen.findByRole('heading', { name: 'Website redesign' });

beforeEach(() => {
  getLead.mockResolvedValue({ data: { lead: LEAD } });
  listLeadConfig.mockResolvedValue({ data: { items: STATUSES } });
  changeLeadStatus.mockResolvedValue({ data: { lead: { ...LEAD, statusId: 's2', status: STATUSES[1] } } });
  const empty = { page: 1, limit: 20, total: 0, totalPages: 0 };
  getLeadTimeline.mockResolvedValue({ data: { events: [], pagination: empty } });
  listActivities.mockResolvedValue({ data: { activities: [], pagination: empty } });
  listFollowUps.mockResolvedValue({ data: { followUps: [], pagination: empty } });
});

afterEach(cleanup);

describe('LeadDetailPage', () => {
  it('a read-only user sees the lead but none of the actions', async () => {
    renderPage();
    await loaded();

    expect(screen.getAllByText('LEAD-000042').length).toBeGreaterThan(0);
    expect(screen.queryByRole('combobox', { name: /Status/ })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull();
    for (const name of ['Assign', 'Convert', 'Delete']) expect(button(name)).toBeNull();
  });

  it('each action follows its own permission', async () => {
    renderPage({ permissions: ['leads.read', 'leads.assign'] });
    await loaded();
    expect(button('Assign')).toBeTruthy();
    for (const name of ['Convert', 'Delete']) expect(button(name)).toBeNull();
    cleanup();

    renderPage({ permissions: ALL });
    await loaded();
    expect(screen.getByRole('link', { name: 'Edit' })).toBeTruthy();
    for (const name of ['Assign', 'Convert', 'Delete']) expect(button(name)).toBeTruthy();
  });

  it('a converted lead cannot be converted again', async () => {
    getLead.mockResolvedValue({
      data: {
        lead: { ...LEAD, isConverted: true, opportunity: { id: 'o9', opportunityNumber: 'OPP-000009', name: 'Website redesign', status: 'open' } },
      },
    });
    renderPage({ permissions: ALL });
    await loaded();

    expect(button('Convert')).toBeNull();
    expect(screen.getAllByText('Converted').length).toBeGreaterThan(0);
    expect(screen.getByText('OPP-000009 - Website redesign')).toBeTruthy();
  });

  it('the status dropdown offers the configured statuses and changes status through the API', async () => {
    renderPage({ permissions: ['leads.read', 'leads.update'] });
    await loaded();
    await waitFor(() => expect(listLeadConfig).toHaveBeenCalledWith('lead-statuses', { isActive: true }, expect.anything()));

    fireEvent.mouseDown(await screen.findByRole('combobox', { name: /Status/ }));
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Zebra Stage', 'Quokka Stage']);

    fireEvent.click(screen.getByRole('option', { name: 'Quokka Stage' }));
    await waitFor(() => expect(changeLeadStatus).toHaveBeenCalledWith('l1', 's2'));
  });

  it('activities, follow-ups and timeline each load from their own endpoint', async () => {
    renderPage();
    await loaded();
    expect(listActivities).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('tab', { name: 'Activities' }));
    expect(await screen.findByText('No activities yet.')).toBeTruthy();
    // The generic activities API, filtered to this lead.
    expect(listActivities).toHaveBeenCalledWith(
      { leadId: 'l1', page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' },
      expect.anything()
    );
    // Logging needs activities.create, which this user does not have.
    expect(button('Log activity')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Follow-ups' }));
    expect(await screen.findByText('No follow-ups yet.')).toBeTruthy();
    expect(listFollowUps).toHaveBeenCalledWith(
      { relatedType: 'lead', relatedId: 'l1', page: 1, limit: 20, sortBy: 'dueDate', sortOrder: 'asc' },
      expect.anything()
    );
    expect(button('Add follow-up')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Timeline' }));
    expect(await screen.findByText('No history recorded yet.')).toBeTruthy();
    expect(getLeadTimeline).toHaveBeenCalledWith('l1', { page: 1, limit: 20 }, expect.anything());
  });
});
