import NotificationsOutlinedIcon from '@mui/icons-material/NotificationsOutlined';
import Alert from '@mui/material/Alert';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationMutations, useNotificationsList, useNotificationStream } from '../../hooks/useNotifications.js';
import useNotify from '../../hooks/useNotify.js';
import { entityPath } from '../../utils/entityPaths.js';
import NotificationItem from './NotificationItem.jsx';

const RECENT = 8;

// The bell in the top bar: the unread count from the API, the latest
// notifications in a popover, and the real-time connection that keeps both
// up to date.
export default function NotificationBell() {
  const navigate = useNavigate();
  const notify = useNotify();
  const [anchor, setAnchor] = useState(null);
  const { data, error } = useNotificationsList({ page: 1, limit: RECENT }, { poll: true });
  const { read, readAll, remove } = useNotificationMutations();
  useNotificationStream();

  const unread = data?.unreadCount ?? 0;
  const close = () => setAnchor(null);
  const fail = (err) => notify.error(err.message);

  function open(notification) {
    if (!notification.isRead) read.mutate(notification.id, { onError: fail });
    close();
    const path = entityPath(notification.entityType, notification.entityId);
    if (path) navigate(path);
  }

  return (
    <>
      <IconButton
        color="inherit"
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <Badge badgeContent={unread} color="error" max={99}>
          <NotificationsOutlinedIcon />
        </Badge>
      </IconButton>

      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 400, maxWidth: 'calc(100vw - 32px)' } } }}
      >
        <Stack direction="row" sx={{ px: 2, py: 1.5, alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>
            Notifications
          </Typography>
          <Button size="small" disabled={!unread || readAll.isPending} onClick={() => readAll.mutate(undefined, { onError: fail })}>
            Mark all as read
          </Button>
        </Stack>
        <Divider />
        {error && <Alert severity="error">{error.message}</Alert>}
        {data && data.notifications.length === 0 && (
          <Typography color="text.secondary" sx={{ p: 2 }}>
            Nothing yet. You will be told here when something is assigned to you or needs your attention.
          </Typography>
        )}
        {data && data.notifications.length > 0 && (
          <List disablePadding aria-label="Recent notifications" sx={{ maxHeight: 420, overflowY: 'auto' }}>
            {data.notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onOpen={open}
                onDelete={(item) => remove.mutate(item.id, { onError: fail })}
              />
            ))}
          </List>
        )}
        <Divider />
        <Box sx={{ p: 1, textAlign: 'center' }}>
          <Button
            size="small"
            onClick={() => {
              close();
              navigate('/notifications');
            }}
          >
            View all
          </Button>
        </Box>
      </Popover>
    </>
  );
}
