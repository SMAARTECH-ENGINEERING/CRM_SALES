import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { LEAD_CONFIG, PROJECT_CONFIG } from '../../api/leadConfig.api.js';
import useNotify from '../../hooks/useNotify.js';
import { useProjectMilestones, useProjectMutations } from '../../hooks/useProjects.js';
import { toDateInput } from '../../utils/format.js';
import LeadConfigSelect from '../leads/LeadConfigSelect.jsx';

const FULL = { gridColumn: '1 / -1' };

// The people a task can go to: the project manager and the team.
export function projectPeople(project) {
  const people = [...(project.projectManager ? [project.projectManager] : []), ...(project.team ?? [])];
  return people.filter((person, index) => people.findIndex((other) => other.id === person.id) === index);
}

// Adds a task to `project` (no `task`) or edits one. Mount it only while open.
export default function TaskDialog({ project, task, onClose }) {
  const isCreate = !task;
  const notify = useNotify();
  const { createTask, updateTask } = useProjectMutations();
  const milestones = useProjectMilestones(project.id);
  const people = projectPeople(project);
  const [values, setValues] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    statusId: task?.statusId ?? '',
    priorityId: task?.priorityId ?? '',
    assignedTo: task?.assignedTo ?? '',
    milestoneId: task?.milestoneId ?? '',
    startDate: toDateInput(task?.startDate),
    dueDate: toDateInput(task?.dueDate),
    estimatedHours: task?.estimatedHours ?? '',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const set = (field) => (value) => setValues((current) => ({ ...current, [field]: value }));
  const pending = createTask.isPending || updateTask.isPending;

  async function save() {
    setError(null);
    const found = {};
    if (values.title.trim().length < 2) found.title = 'Title is required (at least 2 characters)';
    if (values.startDate && values.dueDate && values.dueDate < values.startDate) found.dueDate = 'Must not be before the start date';
    setErrors(found);
    if (Object.keys(found).length) return;

    const data = {
      title: values.title.trim(),
      description: values.description,
      priorityId: values.priorityId || null,
      assignedTo: values.assignedTo || null,
      milestoneId: values.milestoneId || null,
      startDate: values.startDate || null,
      dueDate: values.dueDate || null,
      estimatedHours: values.estimatedHours === '' ? null : Number(values.estimatedHours),
    };
    if (values.statusId) data.statusId = values.statusId;
    try {
      if (isCreate) await createTask.mutateAsync({ projectId: project.id, data });
      else await updateTask.mutateAsync({ projectId: project.id, taskId: task.id, data });
      notify.success(isCreate ? 'Task added' : 'Task updated');
      onClose();
    } catch (err) {
      const fields = Object.fromEntries((err.errors ?? []).map((e) => [e.field, e.message]));
      setErrors(fields);
      if (!Object.keys(fields).some((field) => field in values)) setError(err.message);
    }
  }

  const text = (field, label, props = {}) => (
    <TextField
      label={label}
      value={values[field]}
      onChange={(event) => set(field)(event.target.value)}
      error={Boolean(errors[field])}
      helperText={errors[field] ?? props.helperText}
      {...props}
    />
  );

  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isCreate ? 'Add task' : 'Edit task'}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gap: 2, pt: 1, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
          {text('title', 'Title', { required: true, autoFocus: true, sx: FULL })}
          <LeadConfigSelect
            list={PROJECT_CONFIG.TASK_STATUSES}
            label="Status"
            required
            selectDefault={isCreate}
            value={values.statusId}
            current={task?.status}
            onChange={set('statusId')}
            error={errors.statusId}
            helperText={errors.statusId}
          />
          <LeadConfigSelect
            list={LEAD_CONFIG.PRIORITIES}
            label="Priority"
            value={values.priorityId}
            current={task?.priority}
            onChange={set('priorityId')}
            error={errors.priorityId}
            helperText={errors.priorityId}
          />
          <TextField
            select
            label="Assigned to"
            value={people.some((person) => person.id === values.assignedTo) ? values.assignedTo : ''}
            onChange={(event) => set('assignedTo')(event.target.value)}
            error={Boolean(errors.assignedTo)}
            helperText={errors.assignedTo ?? (people.length ? 'The project manager or a team member' : 'Add people to the team first')}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">Unassigned</MenuItem>
            {people.map((person) => (
              <MenuItem key={person.id} value={person.id}>
                {person.fullName}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Milestone"
            value={(milestones.data ?? []).some((m) => m.id === values.milestoneId) ? values.milestoneId : ''}
            onChange={(event) => set('milestoneId')(event.target.value)}
            error={Boolean(errors.milestoneId)}
            helperText={errors.milestoneId}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          >
            <MenuItem value="">None</MenuItem>
            {(milestones.data ?? []).map((milestone) => (
              <MenuItem key={milestone.id} value={milestone.id}>
                {milestone.name}
              </MenuItem>
            ))}
          </TextField>
          {text('startDate', 'Start date', { type: 'date', slotProps: { inputLabel: { shrink: true } } })}
          {text('dueDate', 'Due date', { type: 'date', slotProps: { inputLabel: { shrink: true } } })}
          {text('estimatedHours', 'Estimated hours', { type: 'number', slotProps: { htmlInput: { min: 0, step: 'any' } } })}
          {text('description', 'Description', { multiline: true, minRows: 2, sx: FULL })}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} loading={pending}>
          {isCreate ? 'Add task' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
