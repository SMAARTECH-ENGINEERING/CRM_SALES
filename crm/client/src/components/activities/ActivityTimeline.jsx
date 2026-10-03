import AddIcon from '@mui/icons-material/Add';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Pagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useActivities, useActivityMutations } from '../../hooks/useActivities.js';
import useNotify from '../../hooks/useNotify.js';
import usePermission from '../../hooks/usePermission.js';
import { formatDateTime } from '../../utils/format.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import ConfirmDialog from '../ConfirmDialog.jsx';
import ConfigChip from '../leads/ConfigChip.jsx';
import LoadingScreen from '../LoadingScreen.jsx';
import PermissionGate from '../PermissionGate.jsx';
import ActivityForm from './ActivityForm.jsx';
import { labelOf, PRIORITY_OPTIONS, WORK_STATUS_OPTIONS } from './options.js';

const PAGE_SIZE = 20;

// The other records an activity is about, as "Label: name" - skipping the one
// whose page we are on.
function aboutLine(activity, related) {
  return [
    !related.companyId && activity.company && `Company: ${activity.company.name}`,
    !related.contactId && activity.contact && `Contact: ${activity.contact.fullName}`,
    !related.leadId && activity.lead && `Lead: ${activity.lead.leadNumber} - ${activity.lead.title}`,
    !related.opportunityId &&
      activity.opportunity &&
      `Opportunity: ${activity.opportunity.opportunityNumber} - ${activity.opportunity.name}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

// The activities of one record, newest first, with a button to log a new one.
// Works on any page - pass the record it is for:
//
//   <ActivityTimeline related={{ companyId }} />     everything about the company,
//                                                   including its contacts' and leads' activities
//   <ActivityTimeline related={{ contactId }} />
//   <ActivityTimeline related={{ leadId }} />
//   <ActivityTimeline related={{ opportunityId }} />
export default function ActivityTimeline({ related }) {
  const notify = useNotify();
  const { can } = usePermission();
  const canRead = can(PERMISSIONS.ACTIVITIES_READ);
  const [page, setPage] = useState(1);
  // null | { type: 'create' } | { type: 'edit' | 'delete', activity }
  const [dialog, setDialog] = useState(null);
  const { update, remove } = useActivityMutations();
  const { data, error, isPending, refetch } = useActivities(
    { ...related, page, limit: PAGE_SIZE, sortBy: 'createdAt', sortOrder: 'desc' },
    { enabled: canRead }
  );

  async function markDone(activity) {
    try {
      await update.mutateAsync({ id: activity.id, data: { status: 'completed' } });
      notify.success('Activity completed');
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function confirmDelete() {
    try {
      await remove.mutateAsync(dialog.activity.id);
      notify.success('Activity deleted');
    } catch (err) {
      notify.error(err.message);
    }
    setDialog(null);
  }

  const close = () => setDialog(null);

  return (
    <Stack spacing={2}>
      <PermissionGate permission={PERMISSIONS.ACTIVITIES_CREATE}>
        <Button
          variant="contained"
          size="small"
          startIcon={<AddIcon />}
          onClick={() => setDialog({ type: 'create' })}
          sx={{ alignSelf: 'flex-start' }}
        >
          Log activity
        </Button>
      </PermissionGate>

      {!canRead && <Alert severity="warning">You do not have permission to view activities.</Alert>}
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
      {data && data.activities.length === 0 && <Alert severity="info">No activities yet.</Alert>}

      {data && data.activities.length > 0 && (
        <Stack component="ol" spacing={0} sx={{ listStyle: 'none', p: 0, m: 0 }} aria-label="Activities">
          {data.activities.map((activity) => {
            const pending = activity.status === 'pending';
            const overdue = pending && activity.dueDate && new Date(activity.dueDate) < new Date();
            const about = aboutLine(activity, related);
            return (
              <Box
                component="li"
                key={activity.id}
                sx={{ py: 2, borderBottom: 1, borderColor: 'divider', '&:last-of-type': { borderBottom: 0 } }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                      <ConfigChip value={activity.type} />
                      <Typography sx={{ fontWeight: 500, wordBreak: 'break-word' }}>{activity.subject}</Typography>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={WORK_STATUS_OPTIONS.find((o) => o.value === activity.status)?.color ?? 'default'}
                        label={labelOf(WORK_STATUS_OPTIONS, activity.status)}
                      />
                      {activity.priority === 'high' && pending && (
                        <Chip size="small" color="error" variant="outlined" label={`${labelOf(PRIORITY_OPTIONS, 'high')} priority`} />
                      )}
                      {overdue && <Chip size="small" color="error" label="Overdue" />}
                    </Stack>

                    <Typography variant="body2" color="text.secondary">
                      {activity.status === 'completed' && `Completed ${formatDateTime(activity.completedAt)}`}
                      {pending && (activity.dueDate ? `Due ${formatDateTime(activity.dueDate)}` : 'No due date')}
                      {activity.status === 'cancelled' && 'Cancelled'}
                      {' · '}
                      {activity.assignedToUser?.fullName ?? 'Unassigned'}
                      {' · logged '}
                      {formatDateTime(activity.createdAt)}
                    </Typography>
                    {about && (
                      <Typography variant="body2" color="text.secondary">
                        {about}
                      </Typography>
                    )}
                    {activity.description && (
                      <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {activity.description}
                      </Typography>
                    )}
                  </Box>

                  <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0, alignItems: 'center' }}>
                    <PermissionGate permission={PERMISSIONS.ACTIVITIES_UPDATE}>
                      {pending && (
                        <Button size="small" disabled={update.isPending} onClick={() => markDone(activity)}>
                          Mark done
                        </Button>
                      )}
                      <IconButton
                        size="small"
                        aria-label={`Edit activity ${activity.subject}`}
                        onClick={() => setDialog({ type: 'edit', activity })}
                      >
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </PermissionGate>
                    <PermissionGate permission={PERMISSIONS.ACTIVITIES_DELETE}>
                      <IconButton
                        size="small"
                        aria-label={`Delete activity ${activity.subject}`}
                        onClick={() => setDialog({ type: 'delete', activity })}
                      >
                        <DeleteOutlinedIcon fontSize="small" />
                      </IconButton>
                    </PermissionGate>
                  </Stack>
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
      {(dialog?.type === 'create' || dialog?.type === 'edit') && (
        <Dialog open onClose={close} maxWidth="sm" fullWidth>
          <DialogTitle>{dialog.type === 'create' ? 'Log activity' : 'Edit activity'}</DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 1 }}>
              <ActivityForm related={related} activity={dialog.activity} onSaved={close} onCancel={close} />
            </Box>
          </DialogContent>
        </Dialog>
      )}
      <ConfirmDialog
        open={dialog?.type === 'delete'}
        title="Delete activity"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={close}
      >
        {dialog?.activity ? `"${dialog.activity.subject}" will be removed.` : ''}
      </ConfirmDialog>
    </Stack>
  );
}
