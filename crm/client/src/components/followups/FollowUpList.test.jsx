import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeFollowUp,
  createFollowUp,
  listFollowUps,
  rescheduleFollowUp,
  updateFollowUp,
} from '../../api/followups.api.js';
import { listUserOptions } from '../../api/users.api.js';
import { renderAs } from '../../test/renderWithProviders.jsx';
import FollowUpList from './FollowUpList.jsx';

vi.mock('../../api/followups.api.js');
vi.mock('../../api/users.api.js');

const FOLLOW_UPS = [
  {
    id: 'f1',
    title: 'Send proposal',
    status: 'pending',
    priority: 'high',
    dueDate: '2020-01-01T10:00:00.000Z',
    reminderDate: '2019-12-31T10:00:00.000Z',
    assignedToUser: { id: 'u1', fullName: 'Riya Rep' },
  },
  {
    id: 'f2',
    title: 'Confirm budget',
    status: 'completed',
    priority: 'medium',
    dueDate: '2026-01-05T10:00:00.000Z',
    completedAt: '2026-01-04T10:00:00.000Z',
    completedByUser: { id: 'u2', fullName: 'Mo Manager' },
  },
];

const ALL = ['followups.read', 'followups.create', 'followups.update'];
const page = (followUps) => ({
  data: { followUps, pagination: { page: 1, limit: 20, total: followUps.length, totalPages: 1 } },
});
const item = (title) => screen.getByText(title).closest('li');
const button = (name) => screen.queryByRole('button', { name });
const render = (permissions = ALL) =>
  renderAs(<FollowUpList relatedType="lead" relatedId="l1" />, { permissions });

beforeEach(() => {
  listFollowUps.mockResolvedValue(page(FOLLOW_UPS));
  listUserOptions.mockResolvedValue({ data: { users: [] } });
  for (const call of [completeFollowUp, createFollowUp, rescheduleFollowUp, updateFollowUp]) {
    call.mockResolvedValue({ data: { followUp: {} } });
  }
});

afterEach(cleanup);

describe('FollowUpList', () => {
  it('asks the API for the follow-ups of the record it is given, soonest due first', async () => {
    render();
    await screen.findByText('Send proposal');
    expect(listFollowUps).toHaveBeenCalledWith(
      { relatedType: 'lead', relatedId: 'l1', page: 1, limit: 20, sortBy: 'dueDate', sortOrder: 'asc' },
      expect.anything()
    );
  });

  it('shows what is overdue, who it is for, and who completed what', async () => {
    render();
    const pending = within(await waitFor(() => item('Send proposal')));
    expect(pending.getByText('Overdue')).toBeTruthy();
    expect(pending.getByText('High priority')).toBeTruthy();
    expect(pending.getByText(/Riya Rep/)).toBeTruthy();
    expect(pending.getByText(/reminder/)).toBeTruthy();
    expect(pending.getByRole('checkbox').checked).toBe(false);

    const done = within(item('Confirm budget'));
    expect(done.getByText('Completed')).toBeTruthy();
    expect(done.getByText(/completed by Mo Manager/)).toBeTruthy();
    expect(done.queryByText('Overdue')).toBeNull();
    expect(done.getByRole('checkbox').checked).toBe(true);
  });

  it('says so when there are none', async () => {
    listFollowUps.mockResolvedValue(page([]));
    render();
    expect(await screen.findByText('No follow-ups yet.')).toBeTruthy();
  });

  it('a read-only user can look but not act', async () => {
    render(['followups.read']);
    await screen.findByText('Send proposal');

    for (const name of ['Add follow-up', 'Reschedule', 'Cancel', 'Edit follow-up Send proposal']) {
      expect(button(name)).toBeNull();
    }
    expect(within(item('Send proposal')).getByRole('checkbox').disabled).toBe(true);
  });

  it('ticking completes through the API; unticking reopens', async () => {
    render();
    await screen.findByText('Send proposal');

    fireEvent.click(within(item('Send proposal')).getByRole('checkbox'));
    await waitFor(() => expect(completeFollowUp).toHaveBeenCalledWith('f1'));

    fireEvent.click(within(item('Confirm budget')).getByRole('checkbox'));
    await waitFor(() => expect(updateFollowUp).toHaveBeenCalledWith('f2', { status: 'pending' }));
  });

  it('only pending follow-ups can be rescheduled or cancelled', async () => {
    render();
    await screen.findByText('Send proposal');

    expect(within(item('Confirm budget')).queryByRole('button', { name: 'Reschedule' })).toBeNull();
    expect(within(item('Confirm budget')).queryByRole('button', { name: 'Cancel' })).toBeNull();

    fireEvent.click(within(item('Send proposal')).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(updateFollowUp).toHaveBeenCalledWith('f1', { status: 'cancelled' }));
  });

  it('reschedule asks only for the dates and sends them to the reschedule endpoint', async () => {
    render();
    await screen.findByText('Send proposal');
    fireEvent.click(within(item('Send proposal')).getByRole('button', { name: 'Reschedule' }));

    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('Reschedule follow-up')).toBeTruthy();
    expect(dialog.queryByLabelText(/What needs doing/)).toBeNull();

    fireEvent.change(dialog.getByLabelText(/Due/), { target: { value: '2027-03-01T09:30' } });
    fireEvent.change(dialog.getByLabelText(/Remind me/), { target: { value: '' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Reschedule' }));

    await waitFor(() => expect(rescheduleFollowUp).toHaveBeenCalled());
    expect(rescheduleFollowUp).toHaveBeenCalledWith('f1', {
      dueDate: new Date('2027-03-01T09:30').toISOString(),
      reminderDate: null,
    });
    expect(updateFollowUp).not.toHaveBeenCalled();
  });

  it('adding a follow-up attaches it to the record and refuses a reminder after the due date', async () => {
    render();
    await screen.findByText('Send proposal');
    fireEvent.click(button('Add follow-up'));
    const dialog = within(await screen.findByRole('dialog'));

    fireEvent.change(dialog.getByLabelText(/What needs doing/), { target: { value: 'Call back' } });
    fireEvent.change(dialog.getByLabelText(/Due/), { target: { value: '2027-03-01T09:30' } });
    fireEvent.change(dialog.getByLabelText(/Remind me/), { target: { value: '2027-03-02T09:30' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Add follow-up' }));

    expect(await dialog.findByText('The reminder cannot be after the due date')).toBeTruthy();
    expect(createFollowUp).not.toHaveBeenCalled();

    fireEvent.change(dialog.getByLabelText(/Remind me/), { target: { value: '2027-02-28T09:30' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Add follow-up' }));

    await waitFor(() => expect(createFollowUp).toHaveBeenCalled());
    expect(createFollowUp.mock.calls[0][0]).toEqual({
      title: 'Call back',
      description: '',
      priority: 'medium',
      dueDate: new Date('2027-03-01T09:30').toISOString(),
      reminderDate: new Date('2027-02-28T09:30').toISOString(),
      relatedType: 'lead',
      relatedId: 'l1',
    });
  });
});
