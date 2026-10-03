import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes, useLocation } from 'react-router-dom';
import { deleteNotification, listNotifications, markAllNotificationsRead, markNotificationRead } from '../../api/notifications.api.js';
import NotificationsPage from '../../pages/NotificationsPage.jsx';
import { connectNotifications } from '../../realtime/notificationSocket.js';
import { renderAs } from '../../test/renderWithProviders.jsx';
import NotificationBell from './NotificationBell.jsx';

vi.mock('../../api/notifications.api.js');
// No real connection in tests: the handlers given to it are called by hand.
vi.mock('../../realtime/notificationSocket.js', () => ({ connectNotifications: vi.fn(() => () => {}) }));

const LEAD = { id: 'n1', type: 'lead_assigned', title: 'Lead assigned to you', message: 'LEAD-000007 - Office fit-out was assigned to you by Ada Admin', entityType: 'lead', entityId: 'l7', isRead: false, createdAt: '2031-01-02T09:00:00.000Z' };
const PAID = { id: 'n2', type: 'payment_overdue', title: 'Payment overdue', message: 'INV-000004: 600.00 outstanding', entityType: 'payment', entityId: 'p4', isRead: true, createdAt: '2031-01-01T09:00:00.000Z' };
const inbox = (notifications, unreadCount) => ({ data: { notifications, unreadCount, pagination: { page: 1, limit: 8, total: notifications.length, totalPages: 1 } } });

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}
const renderBell = () =>
  renderAs(
    <>
      <NotificationBell />
      <Where />
    </>,
    { permissions: [] }
  );

beforeEach(() => {
  vi.clearAllMocks();
  connectNotifications.mockImplementation(() => () => {});
  listNotifications.mockResolvedValue(inbox([LEAD, PAID], 1));
  markNotificationRead.mockResolvedValue({});
  markAllNotificationsRead.mockResolvedValue({});
  deleteNotification.mockResolvedValue({});
});

afterEach(cleanup);

describe('NotificationBell', () => {
  it('shows the unread count from the API and lists the latest notifications', async () => {
    renderBell();
    const bell = await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    fireEvent.click(bell);
    const list = within(await screen.findByRole('list', { name: 'Recent notifications' }));
    expect(list.getByLabelText('Unread notification: Lead assigned to you')).toBeTruthy();
    expect(list.getByLabelText('Read notification: Payment overdue')).toBeTruthy();
    expect(list.getByText(/Office fit-out was assigned to you by Ada Admin/)).toBeTruthy();
  });

  it('opening a notification marks it read and goes to the record', async () => {
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    fireEvent.click(await screen.findByText('Lead assigned to you'));
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith('n1'));
    expect(screen.getByTestId('where').textContent).toBe('/leads/l7');
  });

  it('marks all as read and deletes through the API', async () => {
    renderBell();
    fireEvent.click(await screen.findByRole('button', { name: 'Notifications, 1 unread' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(markAllNotificationsRead).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText('Delete notification: Payment overdue'));
    await waitFor(() => expect(deleteNotification).toHaveBeenCalledWith('n2'));
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it('a notification arriving in real time refreshes the count and is announced', async () => {
    renderBell();
    await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    expect(connectNotifications).toHaveBeenCalledTimes(1);
    const { onNotification } = connectNotifications.mock.calls[0][0];

    listNotifications.mockResolvedValue(inbox([{ ...PAID, id: 'n3', title: 'Ticket assigned to you', isRead: false }, LEAD, PAID], 2));
    act(() => onNotification({ notification: { title: 'Ticket assigned to you', message: 'TKT-000002 - Scanner jam' }, unreadCount: 2 }));
    expect(await screen.findByRole('button', { name: 'Notifications, 2 unread' })).toBeTruthy();
    expect(screen.getByText('Ticket assigned to you: TKT-000002 - Scanner jam')).toBeTruthy();
  });

  it('closes the connection when it goes away', async () => {
    const close = vi.fn();
    connectNotifications.mockImplementation(() => close);
    const { unmount } = renderBell();
    await screen.findByRole('button', { name: 'Notifications, 1 unread' });
    unmount();
    expect(close).toHaveBeenCalled();
  });
});

describe('NotificationsPage', () => {
  it('lists everything, and only the unread ones on request', async () => {
    renderAs(
      <Routes>
        <Route path="/notifications" element={<NotificationsPage />} />
      </Routes>,
      { route: '/notifications', permissions: [] }
    );
    const list = within(await screen.findByRole('list', { name: 'Notifications' }));
    expect(list.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('1 unread')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    await waitFor(() => expect(listNotifications).toHaveBeenLastCalledWith(expect.objectContaining({ isRead: false }), expect.anything()));
  });
});
