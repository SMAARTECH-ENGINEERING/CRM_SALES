import AttachFileIcon from '@mui/icons-material/AttachFile';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TICKET_CONFIG } from '../../api/leadConfig.api.js';
import useAuth from '../../hooks/useAuth.js';
import useNotify from '../../hooks/useNotify.js';
import usePermission from '../../hooks/usePermission.js';
import { useProjectsList } from '../../hooks/useProjects.js';
import { useTicketMutations } from '../../hooks/useTickets.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import CompanySelect from '../companies/CompanySelect.jsx';
import ContactSelect from '../contacts/ContactSelect.jsx';
import LeadConfigSelect from '../leads/LeadConfigSelect.jsx';
import UserSelect from '../users/UserSelect.jsx';

const FULL = { gridColumn: '1 / -1' };

// The company's projects, for users who may see projects.
function ProjectPicker({ companyId, value, onChange, error }) {
  const { can } = usePermission();
  const enabled = can(PERMISSIONS.PROJECTS_READ) && Boolean(companyId);
  const projects = useProjectsList({ companyId, limit: 100, sortBy: 'name', sortOrder: 'asc' }, { enabled });
  if (!can(PERMISSIONS.PROJECTS_READ)) return null;
  const list = projects.data?.projects ?? [];
  return (
    <TextField
      select
      label="Project"
      value={list.some((p) => p.id === value) ? value : ''}
      onChange={(event) => onChange(event.target.value)}
      disabled={!companyId}
      error={Boolean(error)}
      helperText={error ?? (companyId ? 'Optional' : 'Select a company first')}
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
    >
      <MenuItem value="">None</MenuItem>
      {list.map((project) => (
        <MenuItem key={project.id} value={project.id}>
          {project.projectNumber} - {project.name}
        </MenuItem>
      ))}
    </TextField>
  );
}

// Opens a ticket (no `ticket`) or edits its details. Status and assignment are
// changed on the ticket page. Mount it only while open.
export default function TicketDialog({ ticket, initial = {}, onClose }) {
  const isCreate = !ticket;
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useAuth();
  const { can } = usePermission();
  const { create, update } = useTicketMutations();
  const [values, setValues] = useState({
    companyId: ticket?.companyId ?? initial.companyId ?? '',
    contactId: ticket?.contactId ?? '',
    projectId: ticket?.projectId ?? initial.projectId ?? '',
    subject: ticket?.subject ?? '',
    description: ticket?.description ?? '',
    categoryId: ticket?.categoryId ?? '',
    priorityId: ticket?.priorityId ?? '',
    assignedTo: '',
  });
  const [takeIt, setTakeIt] = useState(false);
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const set = (field) => (value) => setValues((current) => ({ ...current, [field]: value }));
  const pending = create.isPending || update.isPending;
  const canAssign = can(PERMISSIONS.TICKETS_ASSIGN);

  async function save() {
    setError(null);
    const found = {};
    if (values.subject.trim().length < 3) found.subject = 'Subject is required (at least 3 characters)';
    if (isCreate && !values.companyId) found.companyId = 'Choose a company';
    setErrors(found);
    if (Object.keys(found).length) return;

    const data = {
      contactId: values.contactId || null,
      projectId: values.projectId || null,
      subject: values.subject.trim(),
      description: values.description,
      categoryId: values.categoryId || null,
      priorityId: values.priorityId || null,
    };
    try {
      if (isCreate) {
        const assignedTo = canAssign ? values.assignedTo : takeIt ? user.id : '';
        const payload = { ...data, companyId: values.companyId, ...(assignedTo ? { assignedTo } : {}) };
        // Multipart cannot carry null: leave empty optional fields out.
        const clean = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== null && value !== ''));
        const response = await create.mutateAsync({ data: clean, files });
        const created = response.data.ticket;
        notify.success(`Ticket ${created.ticketNumber} opened`);
        onClose();
        navigate(`/tickets/${created.id}`);
      } else {
        await update.mutateAsync({ id: ticket.id, data });
        notify.success('Ticket updated');
        onClose();
      }
    } catch (err) {
      const fields = Object.fromEntries((err.errors ?? []).map((e) => [e.field, e.message]));
      setErrors(fields);
      if (!Object.keys(fields).some((field) => field in values)) setError(err.message);
    }
  }

  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isCreate ? 'New ticket' : `Edit ${ticket.ticketNumber}`}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gap: 2, pt: 1, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          {isCreate ? (
            <CompanySelect
              required
              value={values.companyId}
              onChange={(id) => setValues((current) => ({ ...current, companyId: id, contactId: '', projectId: '' }))}
              error={errors.companyId}
              helperText={errors.companyId}
            />
          ) : (
            <TextField label="Company" value={ticket.company?.name ?? ''} disabled helperText="Fixed once the ticket exists" />
          )}
          <ContactSelect
            label="Raised by"
            companyId={values.companyId}
            value={values.contactId}
            onChange={set('contactId')}
            current={ticket?.contact}
            error={errors.contactId}
            helperText={errors.contactId}
          />
          <TextField
            label="Subject"
            required
            autoFocus
            value={values.subject}
            onChange={(event) => set('subject')(event.target.value)}
            error={Boolean(errors.subject)}
            helperText={errors.subject}
            sx={FULL}
          />
          <TextField
            label="Description"
            multiline
            minRows={4}
            value={values.description}
            onChange={(event) => set('description')(event.target.value)}
            error={Boolean(errors.description)}
            helperText={errors.description}
            sx={FULL}
          />
          {/* Categories and priorities are the configured lists, from the API. */}
          <LeadConfigSelect
            list={TICKET_CONFIG.CATEGORIES}
            label="Category"
            value={values.categoryId}
            current={ticket?.category}
            onChange={set('categoryId')}
            error={errors.categoryId}
            helperText={errors.categoryId}
          />
          <LeadConfigSelect
            list={TICKET_CONFIG.PRIORITIES}
            label="Priority"
            selectDefault={isCreate}
            value={values.priorityId}
            current={ticket?.priority}
            onChange={set('priorityId')}
            error={errors.priorityId}
            helperText={errors.priorityId}
          />
          <ProjectPicker companyId={values.companyId} value={values.projectId} onChange={set('projectId')} error={errors.projectId} />
          {isCreate &&
            (canAssign ? (
              <UserSelect label="Assign to" value={values.assignedTo} onChange={set('assignedTo')} error={errors.assignedTo} helperText={errors.assignedTo} />
            ) : (
              <FormControlLabel control={<Switch checked={takeIt} onChange={(event) => setTakeIt(event.target.checked)} />} label="Assign to me" />
            ))}
          {isCreate && (
            <Stack spacing={1} sx={FULL}>
              <Button component="label" variant="outlined" startIcon={<AttachFileIcon />} sx={{ alignSelf: 'flex-start' }}>
                Attach files
                <input
                  hidden
                  multiple
                  type="file"
                  aria-label="Attach files"
                  onChange={(event) => setFiles([...files, ...event.target.files])}
                />
              </Button>
              {errors.attachments && <Alert severity="error">{errors.attachments}</Alert>}
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                {files.map((file, index) => (
                  <Chip key={`${file.name}-${index}`} label={file.name} onDelete={() => setFiles(files.filter((_, i) => i !== index))} />
                ))}
              </Stack>
            </Stack>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} loading={pending}>
          {isCreate ? 'Open ticket' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
