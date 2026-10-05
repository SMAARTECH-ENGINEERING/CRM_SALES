import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Pagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatDateTime } from '../utils/format.js';
import LoadingScreen from './LoadingScreen.jsx';

export const TIMELINE_PAGE_SIZE = 20;

const ACTIONS = {
  created: { label: 'Created', color: 'success' },
  updated: { label: 'Updated', color: 'info' },
  deleted: { label: 'Deleted', color: 'error' },
  assigned: { label: 'Assigned', color: 'info' },
  status_changed: { label: 'Status changed', color: 'info' },
  stage_changed: { label: 'Stage changed', color: 'info' },
  converted: { label: 'Converted', color: 'success' },
  reminded: { label: 'Reminder sent', color: 'warning' },
  emailed: { label: 'Emailed', color: 'info' },
};

const NOTHING = 'empty';

// Renders a record's history. `query` is the result of a timeline query
// ({ events, pagination }); the caller owns the page number.
export default function EventTimeline({ query, page, onPageChange }) {
  const { data, error, isPending, refetch } = query;

  if (isPending) return <LoadingScreen />;
  if (error) {
    return (
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
    );
  }
  if (data.events.length === 0) return <Alert severity="info">No history recorded yet.</Alert>;

  return (
    <Stack spacing={2}>
      <Stack component="ol" spacing={0} sx={{ listStyle: 'none', p: 0, m: 0 }}>
        {data.events.map((event) => {
          const action = ACTIONS[event.action] ?? { label: event.action, color: 'default' };
          return (
            <Box
              component="li"
              key={event.id}
              sx={{ py: 2, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                <Chip size="small" color={action.color} variant="outlined" label={action.label} />
                <Typography variant="body2">by {event.actor?.fullName ?? 'Unknown user'}</Typography>
                <Typography variant="body2" color="text.secondary">
                  · {formatDateTime(event.createdAt)}
                </Typography>
              </Stack>

              {event.summary && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  {event.summary}
                </Typography>
              )}

              {event.changes.length > 0 && (
                <Box component="ul" sx={{ m: 0, mt: 1, pl: 3 }}>
                  {event.changes.map((change) => (
                    <Typography component="li" variant="body2" key={change.field} sx={{ wordBreak: 'break-word' }}>
                      <strong>{change.label}:</strong> {change.from ?? NOTHING} → {change.to ?? NOTHING}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          );
        })}
      </Stack>

      {data.pagination.totalPages > 1 && (
        <Pagination
          count={data.pagination.totalPages}
          page={page}
          onChange={(event, value) => onPageChange(value)}
          sx={{ alignSelf: 'center' }}
        />
      )}
    </Stack>
  );
}
