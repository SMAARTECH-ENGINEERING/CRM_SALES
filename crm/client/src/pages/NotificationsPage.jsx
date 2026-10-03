import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import List from '@mui/material/List';
import Pagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingScreen from '../components/LoadingScreen.jsx';
import NotificationItem from '../components/notifications/NotificationItem.jsx';
import { useNotificationMutations, useNotificationsList } from '../hooks/useNotifications.js';
import useNotify from '../hooks/useNotify.js';
import { entityPath } from '../utils/entityPaths.js';

const PAGE_SIZE = 20;

// /notifications - all of the signed-in user's notifications. New ones
// appear by themselves: the layout's real-time connection refreshes this list.
export default function NotificationsPage() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const { data, error, isPending, refetch } = useNotificationsList({
    page,
    limit: PAGE_SIZE,
    ...(filter === 'unread' ? { isRead: false } : {}),
  });
  const { read, readAll, remove } = useNotificationMutations();
  const fail = (err) => notify.error(err.message);

  function open(notification) {
    if (!notification.isRead) read.mutate(notification.id, { onError: fail });
    const path = entityPath(notification.entityType, notification.entityId);
    if (path) navigate(path);
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <div>
          <Typography variant="h4" component="h1">
            Notifications
          </Typography>
          {data && <Typography color="text.secondary">{data.unreadCount} unread</Typography>}
        </div>
        <Stack direction="row" spacing={1}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={filter}
            onChange={(event, value) => {
              if (!value) return;
              setFilter(value);
              setPage(1);
            }}
            aria-label="Which notifications to show"
          >
            <ToggleButton value="all">All</ToggleButton>
            <ToggleButton value="unread">Unread</ToggleButton>
          </ToggleButtonGroup>
          <Button
            variant="outlined"
            disabled={!data?.unreadCount || readAll.isPending}
            onClick={() => readAll.mutate(undefined, { onError: fail })}
          >
            Mark all as read
          </Button>
        </Stack>
      </Stack>

      {isPending && <LoadingScreen />}
      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }
        >
          {error.message}
        </Alert>
      )}
      {data && data.notifications.length === 0 && (
        <Alert severity="info">{filter === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}</Alert>
      )}
      {data && data.notifications.length > 0 && (
        <Card>
          <List disablePadding aria-label="Notifications">
            {data.notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onOpen={open}
                onDelete={(item) => remove.mutate(item.id, { onError: fail })}
              />
            ))}
          </List>
        </Card>
      )}
      {data && data.pagination.totalPages > 1 && (
        <Pagination count={data.pagination.totalPages} page={page} onChange={(event, value) => setPage(value)} sx={{ alignSelf: 'center' }} />
      )}
    </Stack>
  );
}
