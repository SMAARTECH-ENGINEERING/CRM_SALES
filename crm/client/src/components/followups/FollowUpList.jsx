import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Pagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useFollowUpMutations, useFollowUps } from '../../hooks/useActivities.js';
import useNotify from '../../hooks/useNotify.js';
import usePermission from '../../hooks/usePermission.js';
import { formatDateTime } from '../../utils/format.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import { labelOf, PRIORITY_OPTIONS, WORK_STATUS_OPTIONS } from '../activities/options.js';
import LoadingScreen from '../LoadingScreen.jsx';
import PermissionGate from '../PermissionGate.jsx';
import FollowUpDialog from './FollowUpDialog.jsx';

const PAGE_SIZE = 20;

// The follow-ups of one record (soonest due first), with the actions on them.
//
//   <FollowUpList relatedType="lead" relatedId={lead.id} />
//
// `relatedType` is one of company | contact | lead | opportunity.
export default function FollowUpList({ relatedType, relatedId }) {
  const notify = useNotify();
  const { can } = usePermission();
  const canRead = can(PERMISSIONS.FOLLOWUPS_READ);
  const canUpdate = can(PERMISSIONS.FOLLOWUPS_UPDATE);
  const [page, setPage] = useState(1);
  // null | { mode: 'create' } | { mode: 'edit' | 'reschedule', followUp }
  const [dialog, setDialog] = useState(null);
  const { complete, update } = useFollowUpMutations();
  const { data, error, isPending, refetch } = useFollowUps(
    { relatedType, relatedId, page, limit: PAGE_SIZE, sortBy: 'dueDate', sortOrder: 'asc' },
    { enabled: canRead }
  );

  async function run(action, done) {
    try {
      await action();
      notify.success(done);
    } catch (err) {
      notify.error(err.message);
    }
  }

  // Ticking completes; unticking reopens.
  const toggle = (followUp, checked) =>
    checked
      ? run(() => complete.mutateAsync(followUp.id), 'Follow-up completed')
      : run(() => update.mutateAsync({ id: followUp.id, data: { status: 'pending' } }), 'Follow-up reopened');

  const cancel = (followUp) =>
    run(() => update.mutateAsync({ id: followUp.id, data: { status: 'cancelled' } }), 'Follow-up cancelled');

  const busy = complete.isPending || update.isPending;

  return (
    <Stack spacing={2}>
      <PermissionGate permission={PERMISSIONS.FOLLOWUPS_CREATE}>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setDialog({ mode: 'create' })}
          sx={{ alignSelf: 'flex-start' }}
        >
          Add follow-up
        </Button>
      </PermissionGate>

      {!canRead && <Alert severity="warning">You do not have permission to view follow-ups.</Alert>}
      {canRead && isPending && <LoadingScreen />}
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
      {data && data.followUps.length === 0 && <Alert severity="info">No follow-ups yet.</Alert>}

      {data && data.followUps.length > 0 && (
        <Stack component="ul" spacing={0} sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="Follow-ups">
          {data.followUps.map((followUp) => {
            const pending = followUp.status === 'pending';
            const completed = followUp.status === 'completed';
            const overdue = pending && new Date(followUp.dueDate) < new Date();
            return (
              <Box
                component="li"
                key={followUp.id}
                sx={{ py: 1.5, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <Checkbox
                    checked={completed}
                    disabled={!canUpdate || busy || followUp.status === 'cancelled'}
                    onChange={(event) => toggle(followUp, event.target.checked)}
                    slotProps={{ input: { 'aria-label': `Mark "${followUp.title}" as completed` } }}
                    sx={{ mt: -0.5 }}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                      <Typography
                        sx={{
                          fontWeight: 500,
                          wordBreak: 'break-word',
                          textDecoration: pending ? 'none' : 'line-through',
                          color: pending ? 'text.primary' : 'text.secondary',
                        }}
                      >
                        {followUp.title}
                      </Typography>
                      {!pending && (
                        <Chip
                          size="small"
                          variant="outlined"
                          color={completed ? 'success' : 'default'}
                          label={labelOf(WORK_STATUS_OPTIONS, followUp.status)}
                        />
                      )}
                      {overdue && <Chip size="small" color="error" label="Overdue" />}
                      {pending && followUp.priority === 'high' && (
                        <Chip size="small" color="error" variant="outlined" label={`${labelOf(PRIORITY_OPTIONS, 'high')} priority`} />
                      )}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      Due {formatDateTime(followUp.dueDate)} · {followUp.assignedToUser?.fullName ?? 'Unassigned'}
                      {pending && followUp.reminderDate ? ` · reminder ${formatDateTime(followUp.reminderDate)}` : ''}
                      {completed && followUp.completedByUser
                        ? ` · completed by ${followUp.completedByUser.fullName} on ${formatDateTime(followUp.completedAt)}`
                        : ''}
                    </Typography>
                    {followUp.description && (
                      <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {followUp.description}
                      </Typography>
                    )}
                  </Box>

                  <PermissionGate permission={PERMISSIONS.FOLLOWUPS_UPDATE}>
                    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0, alignItems: 'center' }}>
                      {pending && (
                        <Button size="small" onClick={() => setDialog({ mode: 'reschedule', followUp })}>
                          Reschedule
                        </Button>
                      )}
                      {pending && (
                        <Button size="small" color="inherit" disabled={busy} onClick={() => cancel(followUp)}>
                          Cancel
                        </Button>
                      )}
                      <IconButton
                        size="small"
                        aria-label={`Edit follow-up ${followUp.title}`}
                        onClick={() => setDialog({ mode: 'edit', followUp })}
                      >
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  </PermissionGate>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}

      {data && data.pagination.totalPages > 1 && (
        <Pagination
          count={data.pagination.totalPages}
          page={page}
          onChange={(event, value) => setPage(value)}
          sx={{ alignSelf: 'center' }}
        />
      )}

      {/* Mounted only while open so the form starts from fresh values. */}
      {dialog && (
        <FollowUpDialog
          mode={dialog.mode}
          followUp={dialog.followUp}
          relatedType={relatedType}
          relatedId={relatedId}
          onClose={() => setDialog(null)}
        />
      )}
    </Stack>
  );
}
