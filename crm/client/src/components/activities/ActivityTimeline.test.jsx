import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActivity, deleteActivity, listActivities, updateActivity } from '../../api/activities.api.js';
import { listLeadConfig } from '../../api/leadConfig.api.js';
import { listUserOptions } from '../../api/users.api.js';
import { renderAs } from '../../test/renderWithProviders.jsx';
import ActivityTimeline from './ActivityTimeline.jsx';

vi.mock('../../api/activities.api.js');
vi.mock('../../api/users.api.js');
vi.mock('../../api/leadConfig.api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listLeadConfig: vi.fn(),
}));

// Deliberately unlike the seed: types must be whatever the API returns.
const TYPES = [
  { id: 't1', name: 'Zebra Chat', color: '#112233' },
  { id: 't2', name: 'Quokka Visit', color: '#445566' },
];

const ACTIVITIES = [
  {
    id: 'a1',
    typeId: 't1',
    type: TYPES[0],
    subject: 'Discuss renewal',
    status: 'pending',
    priority: 'high',
    dueDate: '2020-01-01T10:00:00.000Z',
    company: { id: 'c1', name: 'Acme Industries' },
    lead: { id: 'l1', leadNumber: 'LEAD-000007', title: 'ERP rollout' },
    contact: { id: 'p1', fullName: 'Priya Nair' },
    assignedToUser: { id: 'u1', fullName: 'Riya Rep' },
    createdAt: '2026-01-01T10:00:00.000Z',
  },
  {
    id: 'a2',
    typeId: 't2',
    type: TYPES[1],
    subject: 'Factory tour',
    description: 'Met the plant manager',
    status: 'completed',
    priority: 'medium',
    completedAt: '2026-01-05T10:00:00.000Z',
    company: { id: 'c1', name: 'Acme Industries' },
    createdAt: '2026-01-05T10:00:00.000Z',
  },
];

const ALL = ['activities.read', 'activities.create', 'activities.update', 'activities.delete'];
const page = (activities) => ({
  data: { activities, pagination: { page: 1, limit: 20, total: activities.length, totalPages: 1 } },
});
const item = (subject) => screen.getByText(subject).closest('li');
const button = (name) => screen.queryByRole('button', { name });

beforeEach(() => {
  listActivities.mockResolvedValue(page(ACTIVITIES));
  listLeadConfig.mockResolvedValue({ data: { items: TYPES } });
  listUserOptions.mockResolvedValue({ data: { users: [] } });
  createActivity.mockResolvedValue({ data: { activity: {} } });
  updateActivity.mockResolvedValue({ data: { activity: {} } });
  deleteActivity.mockResolvedValue({ data: null });
});

afterEach(cleanup);

describe('ActivityTimeline', () => {
  it('asks the API for the activities of the record it is given', async () => {
    renderAs(<ActivityTimeline related={{ leadId: 'l1' }} />, { permissions: ALL });
    await screen.findByText('Discuss renewal');
    expect(listActivities).toHaveBeenCalledWith(
      { leadId: 'l1', page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' },
      expect.anything()
    );
    cleanup();

    renderAs(<ActivityTimeline related={{ companyId: 'c1' }} />, { permissions: ALL });
    await screen.findByText('Discuss renewal');
    expect(listActivities).toHaveBeenLastCalledWith(expect.objectContaining({ companyId: 'c1' }), expect.anything());
    cleanup();

    renderAs(<ActivityTimeline related={{ contactId: 'p1' }} />, { permissions: ALL });
    await screen.findByText('Discuss renewal');
    expect(listActivities).toHaveBeenLastCalledWith(expect.objectContaining({ contactId: 'p1' }), expect.anything());
    cleanup();

    renderAs(<ActivityTimeline related={{ opportunityId: 'o1' }} />, { permissions: ALL });
    await screen.findByText('Discuss renewal');
    expect(listActivities).toHaveBeenLastCalledWith(expect.objectContaining({ opportunityId: 'o1' }), expect.anything());
  });

  it('shows type, status, who and the other related records - but not the record whose page it is on', async () => {
    renderAs(<ActivityTimeline related={{ leadId: 'l1' }} />, { permissions: ALL });
    const first = within(await waitFor(() => item('Discuss renewal')));

    expect(first.getByText('Zebra Chat')).toBeTruthy();
    expect(first.getByText('Pending')).toBeTruthy();
    expect(first.getByText('Overdue')).toBeTruthy();
    expect(first.getByText('High priority')).toBeTruthy();
    expect(first.getByText(/Riya Rep/)).toBeTruthy();
    expect(first.getByText('Company: Acme Industries · Contact: Priya Nair')).toBeTruthy();
    expect(first.queryByText(/Lead: LEAD-000007/)).toBeNull();

    const second = within(item('Factory tour'));
    expect(second.getByText('Quokka Visit')).toBeTruthy();
    expect(second.getByText('Completed')).toBeTruthy();
    expect(second.getByText('Met the plant manager')).toBeTruthy();
    expect(second.queryByText('Overdue')).toBeNull();
  });

  it('on a company page, says which lead and contact each activity is about', async () => {
    renderAs(<ActivityTimeline related={{ companyId: 'c1' }} />, { permissions: ALL });
    const first = within(await waitFor(() => item('Discuss renewal')));
    expect(first.getByText('Contact: Priya Nair · Lead: LEAD-000007 - ERP rollout')).toBeTruthy();
  });

  it('says so when there are none, rather than showing samples', async () => {
    listActivities.mockResolvedValue(page([]));
    renderAs(<ActivityTimeline related={{ leadId: 'l1' }} />, { permissions: ALL });
    expect(await screen.findByText('No activities yet.')).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toEqual([]);
  });

  it('a read-only user sees activities but no way to change them', async () => {
    renderAs(<ActivityTimeline related={{ leadId: 'l1' }} />, { permissions: ['activities.read'] });
    await screen.findByText('Discuss renewal');

    for (const name of ['Log activity', 'Mark done', 'Edit activity Discuss renewal', 'Delete activity Discuss renewal']) {
      expect(button(name)).toBeNull();
    }
  });

  it('without activities.read nothing is requested', async () => {
    renderAs(<ActivityTimeline related={{ leadId: 'l1' }} />, { permissions: ['activities.create'] });
    expect(await screen.findByText(/do not have permission to view activities/)).toBeTruthy();
    expect(listActivities).not.toHaveBeenCalled();
    expect(button('Log activity')).toBeTruthy();
  });

  it('Mark done is offered only for pending activities and completes through the API', async () => {
    renderAs(<ActivityTimeline related={{ leadId: 'l1' }} />, { permissions: ALL });
    await screen.findByText('Discuss renewal');

    expect(within(item('Factory tour')).queryByRole('button', { name: 'Mark done' })).toBeNull();
    fireEvent.click(within(item('Discuss renewal')).getByRole('button', { name: 'Mark done' }));
    await waitFor(() => expect(updateActivity).toHaveBeenCalledWith('a1', { status: 'completed' }));
  });

  it('logging an activity offers the types from the API and attaches the record', async () => {
    renderAs(<ActivityTimeline related={{ leadId: 'l1' }} />, { permissions: ALL });
    await screen.findByText('Discuss renewal');

    fireEvent.click(button('Log activity'));
    const dialog = within(await screen.findByRole('dialog'));
    await waitFor(() => expect(listLeadConfig).toHaveBeenCalledWith('activity-types', { isActive: true }, expect.anything()));

    fireEvent.mouseDown(await dialog.findByRole('combobox', { name: /Type/ }));
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Zebra Chat', 'Quokka Visit']);
    fireEvent.click(screen.getByRole('option', { name: 'Quokka Visit' }));

    fireEvent.change(dialog.getByLabelText(/Subject/), { target: { value: 'Site survey' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Save activity' }));

    await waitFor(() => expect(createActivity).toHaveBeenCalled());
    expect(createActivity.mock.calls[0][0]).toEqual({
      typeId: 't2',
      subject: 'Site survey',
      description: '',
      status: 'pending',
      priority: 'medium',
      dueDate: null,
      leadId: 'l1',
    });
  });

  it('requires a type and a subject before saving', async () => {
    renderAs(<ActivityTimeline related={{ leadId: 'l1' }} />, { permissions: ALL });
    await screen.findByText('Discuss renewal');
    fireEvent.click(button('Log activity'));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Save activity' }));

    expect(await dialog.findByText('Choose a type')).toBeTruthy();
    expect(dialog.getByText('Subject is required')).toBeTruthy();
    expect(createActivity).not.toHaveBeenCalled();
  });

  it('deletes after confirmation', async () => {
    renderAs(<ActivityTimeline related={{ leadId: 'l1' }} />, { permissions: ALL });
    await screen.findByText('Factory tour');

    fireEvent.click(button('Delete activity Factory tour'));
    expect(deleteActivity).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteActivity).toHaveBeenCalledWith('a2'));
  });
});
