import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { formatDateTime } from '../../utils/format.js';

// One notification as the API returns it. Clicking it calls `onOpen`
// (mark read and go to the record); the cross calls `onDelete`.
export default function NotificationItem({ notification, onOpen, onDelete }) {
  const unread = !notification.isRead;
  return (
    <ListItem
      disablePadding
      aria-label={`${unread ? 'Unread' : 'Read'} notification: ${notification.title}`}
      secondaryAction={
        <IconButton edge="end" size="small" aria-label={`Delete notification: ${notification.title}`} onClick={() => onDelete(notification)}>
          <CloseIcon fontSize="small" />
        </IconButton>
      }
      sx={{ bgcolor: unread ? 'action.hover' : 'transparent' }}
    >
      <ListItemButton onClick={() => onOpen(notification)} sx={{ alignItems: 'flex-start', gap: 1.5, pr: 6 }}>
        {/* A dot for unread, an equal gap otherwise so the text lines up. */}
        <Box sx={{ mt: 1, width: 8, height: 8, flexShrink: 0, borderRadius: '50%', bgcolor: unread ? 'primary.main' : 'transparent' }} />
        <ListItemText
          primary={notification.title}
          secondary={
            <>
              <Typography component="span" variant="body2" color="text.primary" sx={{ display: 'block', wordBreak: 'break-word' }}>
                {notification.message}
              </Typography>
              <Typography component="span" variant="caption" color="text.secondary">
                {formatDateTime(notification.createdAt)}
              </Typography>
            </>
          }
          slotProps={{ primary: { sx: { fontWeight: unread ? 600 : 400 } } }}
        />
      </ListItemButton>
    </ListItem>
  );
}
