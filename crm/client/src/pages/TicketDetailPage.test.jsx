import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { listLeadConfig } from '../api/leadConfig.api.js';
import { addInternalNote, addReply, assignTicket, getConversation, getTicketStats, listTickets } from '../api/tickets.api.js';
import { listUserOptions } from '../api/users.api.js';
import { makeUser, renderAs } from '../test/renderWithProviders.jsx';
import TicketDetailPage from './TicketDetailPage.jsx';
import TicketsPage from './TicketsPage.jsx';

vi.mock('../api/tickets.api.js');
vi.mock('../api/users.api.js');
vi.mock('../api/companies.api.js');
vi.mock('../api/leadConfig.api.js', async (importOriginal) => ({ ...(await importOriginal()), listLeadConfig: vi.fn() }));

const STATUSES = [
  { id: 's1', name: 'Kingfisher New', category: 'open', isDefault: true },
  { id: 's5', name: 'Albatross Closed', category: 'closed' },
];
const AGENT = { id: 'user-1', firstName: 'Asha', lastName: 'Agent', fullName: 'Asha Agent' };
const BOSS = { id: 'u2', firstName: 'Ada', lastName: 'Admin', fullName: 'Ada Admin' };
const TICKET = {
  id: 't1',
  ticketNumber: 'TKT-000007',
  subject: 'Printer offline',
  description: 'It stopped on Monday',
  companyId: 'c1',
  company: { id: 'c1', name: 'Acme Industries' },
  contact: { id: 'k1', fullName: 'Priya Nair' },
  statusId: 's1',
  status: STATUSES[0],
  createdByUser: BOSS,
  createdAt: '2031-01-01T09:00:00.000Z',
  lastActivityAt: '2031-01-01T11:00:00.000Z',
};
const CONVERSATION = {
  ticket: TICKET,
  attachments: [{ id: 'a1', fileName: 'error.log', size: 2048, mimeType: 'text/plain' }],
  items: [
    { kind: 'event', id: 'e1', action: 'created', actor: BOSS, changes: [], createdAt: '2031-01-01T09:00:00.000Z' },
    { kind: 'message', id: 'm1', type: 'reply', body: 'Please restart it.', author: AGENT, attachments: [], createdAt: '2031-01-01T10:00:00.000Z' },
    {
      kind: 'event',
      id: 'e2',
      action: 'status_changed',
      actor: AGENT,
      changes: [{ field: 'status', label: 'Status', from: 'Kingfisher New', to: 'Heron Working' }],
      createdAt: '2031-01-01T10:30:00.000Z',
    },
    {
      kind: 'message',
      id: 'm2',
      type: 'internal_note',
      body: 'Vendor case 123',
      author: BOSS,
      attachments: [{ id: 'a2', fileName: 'vendor.pdf', size: 3145728, mimeType: 'application/pdf' }],
      createdAt: '2031-01-01T11:00:00.000Z',
    },
  ],
  counts: { replies: 1, internalNotes: 1, events: 2 },
};

function renderAt(route, permissions, user) {
  return renderAs(
    <Routes>
      <Route path="/tickets" element={<TicketsPage />} />
      <Route path="/tickets/:id" element={<TicketDetailPage />} />
    </Routes>,
    { route, permissions, user: user ?? makeUser(permissions) }
  );
}
const loaded = () => screen.findByRole('heading', { name: 'Printer offline' });

beforeEach(() => {
  getConversation.mockResolvedValue({ data: CONVERSATION });
  listUserOptions.mockResolvedValue({ data: { users: [AGENT, BOSS] } });
  listLeadConfig.mockResolvedValue({ data: { items: STATUSES } });
});

afterEach(cleanup);

describe('TicketDetailPage (conversation)', () => {
  it('shows the report, replies, notes and changes in order, with their files', async () => {
    renderAt('/tickets/t1', ['tickets.read']);
    await loaded();
    const feed = within(screen.getByRole('list', { name: 'Conversation' }));
    const entries = feed.getAllByRole('listitem').map((item) => item.getAttribute('aria-label'));
    expect(entries).toEqual(['Reply', 'Reply', 'Ticket event', 'Internal note']);
    expect(feed.getByText('It stopped on Monday')).toBeTruthy();
    expect(feed.getByText('On behalf of Priya Nair')).toBeTruthy();
    expect(feed.getByText(/Asha Agent changed the status: Kingfisher New → Heron Working/)).toBeTruthy();
    expect(feed.getByLabelText('Download error.log')).toBeTruthy();
    expect(feed.getByLabelText('Download vendor.pdf').textContent).toContain('3.0 MB');
    // A reader may not write.
    expect(screen.queryByRole('tab', { name: 'Reply' })).toBeNull();
  });

  it('the composer offers what the user may do, and sends the text and files', async () => {
    addReply.mockResolvedValue({ data: { message: {} } });
    addInternalNote.mockResolvedValue({ data: { message: {} } });
    renderAt('/tickets/t1', ['tickets.read', 'tickets.reply', 'tickets.addInternalNote']);
    await loaded();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Reply', 'Internal note']);

    fireEvent.change(screen.getByLabelText('Write a reply'), { target: { value: 'Try the new driver' } });
    const file = new File(['driver'], 'driver.zip', { type: 'application/zip' });
    fireEvent.change(screen.getByLabelText('Attach files to the message'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Send reply' }));
    await waitFor(() => expect(addReply).toHaveBeenCalledWith('t1', 'Try the new driver', [file]));

    fireEvent.click(screen.getByRole('tab', { name: 'Internal note' }));
    fireEvent.change(screen.getByLabelText('Write an internal note'), { target: { value: 'Escalate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() => expect(addInternalNote).toHaveBeenCalledWith('t1', 'Escalate', []));
  });

  it('a closed ticket takes internal notes but not replies', async () => {
    getConversation.mockResolvedValue({ data: { ...CONVERSATION, ticket: { ...TICKET, statusId: 's5', status: STATUSES[1] } } });
    renderAt('/tickets/t1', ['tickets.read', 'tickets.reply', 'tickets.addInternalNote']);
    await loaded();
    expect(screen.getByText(/This ticket is closed/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send reply' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Internal note' }));
    expect(screen.getByRole('button', { name: 'Add note' })).toBeTruthy();
  });

  it('an agent without tickets.assign can take an unassigned ticket', async () => {
    assignTicket.mockResolvedValue({ data: { ticket: { ...TICKET, assignedTo: 'user-1', assignedToUser: AGENT } } });
    renderAt('/tickets/t1', ['tickets.read', 'tickets.update']);
    await loaded();
    fireEvent.click(screen.getByRole('button', { name: 'Take it' }));
    await waitFor(() => expect(assignTicket).toHaveBeenCalledWith('t1', 'user-1'));
  });
});

describe('TicketsPage', () => {
  it('shows the API counts and lists tickets; a count filters the list', async () => {
    getTicketStats.mockResolvedValue({ data: { byCategory: { open: 4, in_progress: 2, waiting: 1, resolved: 0, closed: 9 }, unassignedOpen: 3, total: 16 } });
    listTickets.mockResolvedValue({ data: { tickets: [{ ...TICKET, replyCount: 1 }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    renderAt('/tickets', ['tickets.read']);
    expect(await screen.findByRole('link', { name: 'Printer offline' })).toBeTruthy();
    const counts = within(screen.getByLabelText('Ticket counts'));
    expect(counts.getByText('Open: 4')).toBeTruthy();
    expect(counts.getByText('Closed: 9')).toBeTruthy();
    expect(counts.getByText('Unassigned and open: 3')).toBeTruthy();

    fireEvent.click(counts.getByText('Waiting: 1'));
    await waitFor(() => expect(listTickets).toHaveBeenLastCalledWith(expect.objectContaining({ statusCategory: 'waiting' }), expect.anything()));
    expect(screen.queryByRole('button', { name: 'New ticket' })).toBeNull();
  });
});
