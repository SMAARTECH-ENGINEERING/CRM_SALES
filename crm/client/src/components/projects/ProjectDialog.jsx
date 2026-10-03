import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LEAD_CONFIG, PROJECT_CONFIG } from '../../api/leadConfig.api.js';
import useNotify from '../../hooks/useNotify.js';
import { useProjectMutations } from '../../hooks/useProjects.js';
import { toDateInput } from '../../utils/format.js';
import CompanySelect from '../companies/CompanySelect.jsx';
import LeadConfigSelect from '../leads/LeadConfigSelect.jsx';
import OrderSelect from '../orders/OrderSelect.jsx';
import UserSelect from '../users/UserSelect.jsx';
import UsersSelect from '../users/UsersSelect.jsx';

const FULL = { gridColumn: '1 / -1' };

// Creates a project (no `project`) or edits one. The customer is not chosen:
// the API takes the company's customer record. Mount it only while open.
export default function ProjectDialog({ project, initialCompanyId = '', onClose }) {
  const isCreate = !project;
  const navigate = useNavigate();
  const notify = useNotify();
  const { create, update } = useProjectMutations();
  const [values, setValues] = useState({
    name: project?.name ?? '',
    companyId: project?.companyId ?? initialCompanyId,
    orderId: project?.orderId ?? '',
    statusId: project?.statusId ?? '',
    priorityId: project?.priorityId ?? '',
    projectManagerId: project?.projectManagerId ?? '',
    teamMembers: project?.teamMembers ?? [],
    startDate: toDateInput(project?.startDate),
    expectedEndDate: toDateInput(project?.expectedEndDate),
    actualEndDate: toDateInput(project?.actualEndDate),
    budget: project?.budget ?? '',
    description: project?.description ?? '',
    notes: project?.notes ?? '',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const set = (field) => (value) => setValues((current) => ({ ...current, [field]: value }));
  const pending = create.isPending || update.isPending;

  function check() {
    const found = {};
    if (values.name.trim().length < 2) found.name = 'Name is required (at least 2 characters)';
    if (isCreate && !values.companyId) found.companyId = 'Choose a company';
    for (const field of ['expectedEndDate', 'actualEndDate']) {
      if (values.startDate && values[field] && values[field] < values.startDate) found[field] = 'Must not be before the start date';
    }
    if (values.budget !== '' && Number(values.budget) < 0) found.budget = 'Must be 0 or more';
    return found;
  }

  async function save() {
    setError(null);
    const found = check();
    setErrors(found);
    if (Object.keys(found).length) return;

    const data = {
      name: values.name.trim(),
      orderId: values.orderId || null,
      priorityId: values.priorityId || null,
      projectManagerId: values.projectManagerId || null,
      teamMembers: values.teamMembers,
      startDate: values.startDate || null,
      expectedEndDate: values.expectedEndDate || null,
      actualEndDate: values.actualEndDate || null,
      budget: values.budget === '' ? null : Number(values.budget),
      description: values.description,
      notes: values.notes,
    };
    if (values.statusId) data.statusId = values.statusId;
    try {
      if (isCreate) {
        const response = await create.mutateAsync({ ...data, companyId: values.companyId });
        const created = response.data.project;
        notify.success(`Project ${created.projectNumber} created`);
        onClose();
        navigate(`/projects/${created.id}`);
      } else {
        await update.mutateAsync({ id: project.id, data });
        notify.success('Project updated');
        onClose();
      }
    } catch (err) {
      const fields = Object.fromEntries((err.errors ?? []).map((e) => [e.field.split('.')[0], e.message]));
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
  const date = (field, label) => text(field, label, { type: 'date', slotProps: { inputLabel: { shrink: true } } });

  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isCreate ? 'New project' : `Edit ${project.projectNumber}`}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gap: 2, pt: 1, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          {text('name', 'Name', { required: true, autoFocus: true, sx: FULL })}
          {isCreate ? (
            <CompanySelect
              required
              value={values.companyId}
              onChange={(id) => setValues((current) => ({ ...current, companyId: id, orderId: '' }))}
              error={errors.companyId}
              helperText={errors.companyId ?? "The project is linked to the company's customer record automatically"}
            />
          ) : (
            <TextField label="Company" value={project.company?.name ?? ''} disabled helperText="Fixed once the project exists" />
          )}
          <OrderSelect
            companyId={values.companyId}
            value={values.orderId}
            onChange={set('orderId')}
            current={project?.order}
            error={errors.orderId}
            helperText={errors.orderId ?? 'Optional: the order this project delivers'}
          />
          {/* Statuses and priorities are the configured lists, from the API. */}
          <LeadConfigSelect
            list={PROJECT_CONFIG.STATUSES}
            label="Status"
            required
            selectDefault={isCreate}
            value={values.statusId}
            current={project?.status}
            onChange={set('statusId')}
            error={errors.statusId}
            helperText={errors.statusId}
          />
          <LeadConfigSelect
            list={LEAD_CONFIG.PRIORITIES}
            label="Priority"
            selectDefault={isCreate}
            value={values.priorityId}
            current={project?.priority}
            onChange={set('priorityId')}
            error={errors.priorityId}
            helperText={errors.priorityId}
          />
          <UserSelect
            label="Project manager"
            value={values.projectManagerId}
            onChange={set('projectManagerId')}
            current={project?.projectManager}
            error={errors.projectManagerId}
            helperText={errors.projectManagerId}
          />
          <UsersSelect
            label="Team members"
            value={values.teamMembers}
            onChange={set('teamMembers')}
            current={project?.team}
            error={errors.teamMembers}
            helperText={errors.teamMembers}
          />
          {date('startDate', 'Start date')}
          {date('expectedEndDate', 'Expected end date')}
          {!isCreate && date('actualEndDate', 'Actual end date')}
          {text('budget', 'Budget', { type: 'number', slotProps: { htmlInput: { min: 0, step: 'any' } } })}
          {text('description', 'Description', { multiline: true, minRows: 2, sx: FULL })}
          {text('notes', 'Notes', { multiline: true, minRows: 2, sx: FULL })}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} loading={pending}>
          {isCreate ? 'Create project' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
