import AddIcon from '@mui/icons-material/Add';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RadioButtonUncheckedOutlinedIcon from '@mui/icons-material/RadioButtonUncheckedOutlined';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemAvatar from '@mui/material/ListItemAvatar';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { PROJECT_CONFIG } from '../../api/leadConfig.api.js';
import useNotify from '../../hooks/useNotify.js';
import usePermission from '../../hooks/usePermission.js';
import { useProjectMilestones, useProjectMutations, useProjectTasks, useProjectTimeline } from '../../hooks/useProjects.js';
import { EMPTY, formatDate, initials, toDateInput } from '../../utils/format.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import ConfirmDialog from '../ConfirmDialog.jsx';
import EventTimeline, { TIMELINE_PAGE_SIZE } from '../EventTimeline.jsx';
import ConfigChip from '../leads/ConfigChip.jsx';
import LeadConfigSelect from '../leads/LeadConfigSelect.jsx';
import LoadingScreen from '../LoadingScreen.jsx';
import UserSelect from '../users/UserSelect.jsx';
import UsersSelect from '../users/UsersSelect.jsx';
import TaskDialog, { projectPeople } from './TaskDialog.jsx';

const CLOSED = ['done', 'cancelled'];
const isOverdue = (task) => task.dueDate && !CLOSED.includes(task.status?.category) && new Date(task.dueDate) < new Date();

function Failed({ error, refetch }) {
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

// --- tasks ---------------------------------------------------------------------

export function ProjectTasks({ project }) {
  const notify = useNotify();
  const { can } = usePermission();
  const canManage = can(PERMISSIONS.PROJECTS_MANAGE_TASKS);
  const { updateTask, removeTask } = useProjectMutations();
  const [filters, setFilters] = useState({ statusCategory: '', assignedTo: '' });
  // null | { create: true } | { task } | { remove: task }
  const [dialog, setDialog] = useState(null);
  const params = Object.fromEntries(Object.entries({ ...filters, sortBy: 'dueDate', sortOrder: 'asc', limit: 100 }).filter(([, v]) => v !== ''));
  const { data, error, isPending, refetch } = useProjectTasks(project.id, params);
  const people = projectPeople(project);

  async function setStatus(task, statusId) {
    if (!statusId || statusId === task.statusId) return;
    try {
      await updateTask.mutateAsync({ projectId: project.id, taskId: task.id, data: { statusId } });
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function confirmRemove() {
    try {
      await removeTask.mutateAsync({ projectId: project.id, taskId: dialog.remove.id });
      notify.success('Task deleted');
    } catch (err) {
      notify.error(err.message);
    }
    setDialog(null);
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
        <TextField
          select
          size="small"
          label="Show"
          value={filters.statusCategory}
          onChange={(event) => setFilters((current) => ({ ...current, statusCategory: event.target.value }))}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">All tasks</MenuItem>
          {PROJECT_CONFIG.TASK_STATUSES.categories.map((category) => (
            <MenuItem key={category.value} value={category.value}>
              {category.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label="Assigned to"
          value={filters.assignedTo}
          onChange={(event) => setFilters((current) => ({ ...current, assignedTo: event.target.value }))}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="">Anyone</MenuItem>
          {people.map((person) => (
            <MenuItem key={person.id} value={person.id}>
              {person.fullName}
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ flexGrow: 1 }} />
        {canManage && (
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setDialog({ create: true })}>
            Add task
          </Button>
        )}
      </Stack>

      {isPending && <LoadingScreen />}
      {error && <Failed error={error} refetch={refetch} />}
      {data && data.tasks.length === 0 && <Alert severity="info">No tasks{filters.statusCategory || filters.assignedTo ? ' match these filters' : ' yet'}.</Alert>}
      {data && data.tasks.length > 0 && (
        <TableContainer>
          <Table size="small" aria-label="Project tasks">
            <TableHead>
              <TableRow>
                <TableCell>Task</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Assigned to</TableCell>
                <TableCell>Milestone</TableCell>
                <TableCell>Due</TableCell>
                <TableCell>Priority</TableCell>
                {canManage && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.tasks.map((task) => (
                <TableRow key={task.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {task.title}
                    </Typography>
                    {task.estimatedHours != null && (
                      <Typography variant="caption" color="text.secondary">
                        {task.estimatedHours} h estimated
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell sx={{ minWidth: 160 }}>
                    {canManage ? (
                      <LeadConfigSelect
                        list={PROJECT_CONFIG.TASK_STATUSES}
                        label="Status"
                        required
                        value={task.statusId}
                        current={task.status}
                        onChange={(statusId) => setStatus(task, statusId)}
                        sx={{ minWidth: 150 }}
                      />
                    ) : (
                      <ConfigChip value={task.status} />
                    )}
                  </TableCell>
                  <TableCell>{task.assignedToUser?.fullName ?? EMPTY}</TableCell>
                  <TableCell>{task.milestone?.name ?? EMPTY}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <span>{formatDate(task.dueDate)}</span>
                      {isOverdue(task) && <Chip size="small" color="error" variant="outlined" label="Overdue" />}
                    </Stack>
                  </TableCell>
                  <TableCell>{task.priority ? <ConfigChip value={task.priority} /> : EMPTY}</TableCell>
                  {canManage && (
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <IconButton size="small" aria-label={`Edit ${task.title}`} onClick={() => setDialog({ task })}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" aria-label={`Delete ${task.title}`} onClick={() => setDialog({ remove: task })}>
                        <DeleteOutlinedIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {dialog?.create && <TaskDialog project={project} onClose={() => setDialog(null)} />}
      {dialog?.task && <TaskDialog project={project} task={dialog.task} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={Boolean(dialog?.remove)}
        title="Delete task"
        confirmLabel="Delete"
        confirmColor="error"
        loading={removeTask.isPending}
        onConfirm={confirmRemove}
        onClose={() => setDialog(null)}
      >
        {dialog?.remove ? `"${dialog.remove.title}" will be removed from the project.` : ''}
      </ConfirmDialog>
    </Stack>
  );
}

// --- milestones ------------------------------------------------------------------

function MilestoneDialog({ project, milestone, onClose }) {
  const notify = useNotify();
  const { createMilestone, updateMilestone } = useProjectMutations();
  const [values, setValues] = useState({
    name: milestone?.name ?? '',
    description: milestone?.description ?? '',
    dueDate: toDateInput(milestone?.dueDate),
  });
  const [error, setError] = useState(null);
  const pending = createMilestone.isPending || updateMilestone.isPending;

  async function save() {
    if (values.name.trim().length < 2) {
      setError('Name is required (at least 2 characters)');
      return;
    }
    const data = { name: values.name.trim(), description: values.description, dueDate: values.dueDate || null };
    try {
      if (milestone) await updateMilestone.mutateAsync({ projectId: project.id, milestoneId: milestone.id, data });
      else await createMilestone.mutateAsync({ projectId: project.id, data });
      notify.success(milestone ? 'Milestone updated' : 'Milestone added');
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{milestone ? 'Edit milestone' : 'Add milestone'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Name" required autoFocus value={values.name} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
          <TextField
            type="date"
            label="Due date"
            value={values.dueDate}
            onChange={(e) => setValues((v) => ({ ...v, dueDate: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="Description"
            multiline
            minRows={2}
            value={values.description}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} loading={pending}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ProjectMilestones({ project }) {
  const notify = useNotify();
  const { can } = usePermission();
  const canManage = can(PERMISSIONS.PROJECTS_MANAGE_TASKS);
  const { updateMilestone, removeMilestone } = useProjectMutations();
  const { data, error, isPending, refetch } = useProjectMilestones(project.id);
  // null | { create: true } | { milestone } | { remove: milestone }
  const [dialog, setDialog] = useState(null);

  async function toggle(milestone) {
    try {
      await updateMilestone.mutateAsync({
        projectId: project.id,
        milestoneId: milestone.id,
        data: { completed: !milestone.completedAt },
      });
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function confirmRemove() {
    try {
      await removeMilestone.mutateAsync({ projectId: project.id, milestoneId: dialog.remove.id });
      notify.success('Milestone deleted');
    } catch (err) {
      notify.error(err.message);
    }
    setDialog(null);
  }

  if (isPending) return <LoadingScreen />;
  if (error) return <Failed error={error} refetch={refetch} />;

  return (
    <Stack spacing={2}>
      {canManage && (
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setDialog({ create: true })} sx={{ alignSelf: 'flex-start' }}>
          Add milestone
        </Button>
      )}
      {data.length === 0 ? (
        <Alert severity="info">No milestones yet.</Alert>
      ) : (
        <List aria-label="Milestones">
          {data.map((milestone) => {
            const overdue = !milestone.completedAt && milestone.dueDate && new Date(milestone.dueDate) < new Date();
            return (
              <ListItem
                key={milestone.id}
                divider
                secondaryAction={
                  canManage && (
                    <Stack direction="row">
                      <IconButton aria-label={`Edit ${milestone.name}`} onClick={() => setDialog({ milestone })}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                      <IconButton aria-label={`Delete ${milestone.name}`} onClick={() => setDialog({ remove: milestone })}>
                        <DeleteOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  )
                }
              >
                <ListItemAvatar>
                  <Tooltip title={canManage ? (milestone.completedAt ? 'Reopen' : 'Mark reached') : ''}>
                    <span>
                      <IconButton
                        aria-label={milestone.completedAt ? `Reopen ${milestone.name}` : `Mark ${milestone.name} reached`}
                        onClick={() => toggle(milestone)}
                        disabled={!canManage}
                        color={milestone.completedAt ? 'success' : 'default'}
                      >
                        {milestone.completedAt ? <CheckCircleOutlinedIcon /> : <RadioButtonUncheckedOutlinedIcon />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <span>{milestone.name}</span>
                      {overdue && <Chip size="small" color="error" variant="outlined" label="Overdue" />}
                    </Stack>
                  }
                  secondary={`Due ${formatDate(milestone.dueDate)} · ${milestone.doneTasks} of ${milestone.totalTasks} task(s) done${milestone.completedAt ? ` · Reached ${formatDate(milestone.completedAt)}` : ''}`}
                  slotProps={{ primary: { component: 'div' } }}
                />
              </ListItem>
            );
          })}
        </List>
      )}

      {dialog?.create && <MilestoneDialog project={project} onClose={() => setDialog(null)} />}
      {dialog?.milestone && <MilestoneDialog project={project} milestone={dialog.milestone} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={Boolean(dialog?.remove)}
        title="Delete milestone"
        confirmLabel="Delete"
        confirmColor="error"
        loading={removeMilestone.isPending}
        onConfirm={confirmRemove}
        onClose={() => setDialog(null)}
      >
        {dialog?.remove ? `"${dialog.remove.name}" will be deleted. A milestone with tasks cannot be deleted - move them first.` : ''}
      </ConfirmDialog>
    </Stack>
  );
}

// --- team ------------------------------------------------------------------------

function TeamDialog({ project, onClose }) {
  const notify = useNotify();
  const { update } = useProjectMutations();
  const [managerId, setManagerId] = useState(project.projectManagerId ?? '');
  const [members, setMembers] = useState(project.teamMembers ?? []);
  const [error, setError] = useState(null);

  async function save() {
    try {
      await update.mutateAsync({ id: project.id, data: { projectManagerId: managerId || null, teamMembers: members } });
      notify.success('Team updated');
      onClose();
    } catch (err) {
      setError(err.errors?.[0]?.message ?? err.message);
    }
  }

  return (
    <Dialog open onClose={update.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit team</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <UserSelect label="Project manager" value={managerId} onChange={setManagerId} current={project.projectManager} />
          <UsersSelect label="Team members" value={members} onChange={setMembers} current={project.team} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} loading={update.isPending}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ProjectTeam({ project }) {
  const { can } = usePermission();
  const [editing, setEditing] = useState(false);
  const people = projectPeople(project);

  return (
    <Stack spacing={2}>
      {can(PERMISSIONS.PROJECTS_UPDATE) && (
        <Button variant="outlined" size="small" onClick={() => setEditing(true)} sx={{ alignSelf: 'flex-start' }}>
          Edit team
        </Button>
      )}
      {people.length === 0 ? (
        <Alert severity="info">No one is on this project yet.</Alert>
      ) : (
        <List aria-label="Team">
          {people.map((person) => (
            <ListItem key={person.id} divider>
              <ListItemAvatar>
                <Avatar>{initials(person)}</Avatar>
              </ListItemAvatar>
              <ListItemText primary={person.fullName} secondary={person.email} />
              {person.id === project.projectManagerId && <Chip size="small" color="primary" label="Project manager" />}
            </ListItem>
          ))}
        </List>
      )}
      {editing && <TeamDialog project={project} onClose={() => setEditing(false)} />}
    </Stack>
  );
}

// --- timeline ----------------------------------------------------------------------

export function ProjectHistory({ projectId }) {
  const [page, setPage] = useState(1);
  const query = useProjectTimeline(projectId, { page, limit: TIMELINE_PAGE_SIZE });
  return <EventTimeline query={query} page={page} onPageChange={setPage} />;
}
