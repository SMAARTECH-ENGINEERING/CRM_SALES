import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { TICKET_CONFIG } from '../api/leadConfig.api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ConfigChip from '../components/leads/ConfigChip.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import TicketConversation from '../components/tickets/TicketConversation.jsx';
import TicketDialog from '../components/tickets/TicketDialog.jsx';
import UserSelect from '../components/users/UserSelect.jsx';
import useAuth from '../hooks/useAuth.js';
import useNotify from '../hooks/useNotify.js';
import usePermission from '../hooks/usePermission.js';
import { useTicketConversation, useTicketMutations } from '../hooks/useTickets.js';
import { EMPTY, formatDateTime } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';
import DocumentList from '../components/documents/DocumentList.jsx';

function Field({ label, children }) {
  return (
    <div>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ wordBreak: 'break-word' }}>
        {children || EMPTY}
      </Typography>
    </div>
  );
}

const linked = (allowed, to, label) =>
  allowed ? (
    <Link component={RouterLink} to={to} underline="hover">
      {label}
    </Link>
  ) : (
    label
  );

// Who has the ticket. Anyone with tickets.assign picks a person; others can
// take it themselves or let go of their own.
function Assignee({ ticket }) {
  const notify = useNotify();
  const { user } = useAuth();
  const { can } = usePermission();
  const { assign } = useTicketMutations();

  async function set(userId) {
    try {
      const response = await assign.mutateAsync({ id: ticket.id, assignedTo: userId || null });
      const assignee = response.data.ticket.assignedToUser;
      notify.success(assignee ? `Assigned to ${assignee.fullName}` : 'Ticket unassigned');
    } catch (err) {
      notify.error(err.message);
    }
  }

  if (can(PERMISSIONS.TICKETS_ASSIGN)) {
    return <UserSelect label="Assigned to" value={ticket.assignedTo ?? ''} current={ticket.assignedToUser} onChange={set} />;
  }
  const mine = ticket.assignedTo === user.id;
  return (
    <Stack spacing={1}>
      <Field label="Assigned to">{ticket.assignedToUser?.fullName ?? 'Unassigned'}</Field>
      <PermissionGate permission={PERMISSIONS.TICKETS_UPDATE}>
        {!ticket.assignedTo && (
          <Button size="small" variant="outlined" onClick={() => set(user.id)} loading={assign.isPending}>
            Take it
          </Button>
        )}
        {mine && (
          <Button size="small" onClick={() => set(null)} loading={assign.isPending}>
            Unassign me
          </Button>
        )}
      </PermissionGate>
    </Stack>
  );
}

export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  // null | 'edit' | 'delete'
  const [dialog, setDialog] = useState(null);
  const { changeStatus, remove } = useTicketMutations();
  const { data, error, isPending, refetch } = useTicketConversation(id);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/tickets'));
  const backButton = (
    <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ alignSelf: 'flex-start' }}>
      Back to tickets
    </Button>
  );

  if (isPending) return <LoadingScreen />;
  if (error) {
    return (
      <Stack spacing={2}>
        {backButton}
        <Alert
          severity="error"
          action={
            error.status === 404 ? undefined : (
              <Button color="inherit" size="small" onClick={() => refetch()}>
                Retry
              </Button>
            )
          }
        >
          {error.message}
        </Alert>
      </Stack>
    );
  }

  const { ticket, counts } = data;

  async function setStatus(statusId) {
    if (!statusId || statusId === ticket.statusId) return;
    try {
      const response = await changeStatus.mutateAsync({ id: ticket.id, statusId });
      notify.success(`Status changed to ${response.data.ticket.status.name}`);
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function confirmDelete() {
    try {
      await remove.mutateAsync(ticket.id);
      notify.success(`${ticket.ticketNumber} deleted`);
      navigate('/tickets', { replace: true });
    } catch (err) {
      notify.error(err.message);
      setDialog(null);
    }
  }

  return (
    <Stack spacing={2}>
      {backButton}

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
                  {ticket.subject}
                </Typography>
                <Chip size="small" label={ticket.ticketNumber} />
                <ConfigChip value={ticket.status} />
                <ConfigChip value={ticket.priority} prefix="Priority" />
              </Stack>
              <Typography color="text.secondary">
                {[ticket.company?.name, ticket.contact?.fullName].filter(Boolean).join(' · ')} · {counts.replies} repl
                {counts.replies === 1 ? 'y' : 'ies'}, {counts.internalNotes} internal note{counts.internalNotes === 1 ? '' : 's'}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <PermissionGate permission={PERMISSIONS.TICKETS_UPDATE}>
                <Button variant="outlined" onClick={() => setDialog('edit')}>
                  Edit
                </Button>
              </PermissionGate>
              <PermissionGate permission={PERMISSIONS.TICKETS_DELETE}>
                <Button variant="outlined" color="error" onClick={() => setDialog('delete')}>
                  Delete
                </Button>
              </PermissionGate>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', lg: '1fr 320px' } }}>
        <Card>
          <CardContent>
            <TicketConversation data={data} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Stack spacing={2}>
              {can(PERMISSIONS.TICKETS_UPDATE) ? (
                // The statuses are the configured ones, from the API.
                <LeadConfigSelect
                  list={TICKET_CONFIG.STATUSES}
                  label="Status"
                  required
                  value={ticket.statusId}
                  current={ticket.status}
                  onChange={setStatus}
                  disabled={changeStatus.isPending}
                />
              ) : (
                <Field label="Status">{ticket.status?.name}</Field>
              )}
              <Assignee ticket={ticket} />
              <Divider />
              <Field label="Company">
                {ticket.company && linked(can(PERMISSIONS.COMPANIES_READ), `/companies/${ticket.company.id}`, ticket.company.name)}
              </Field>
              <Field label="Raised by">
                {ticket.contact && linked(can(PERMISSIONS.CONTACTS_READ), `/contacts/${ticket.contact.id}`, ticket.contact.fullName)}
              </Field>
              <Field label="Customer">
                {ticket.customer && linked(can(PERMISSIONS.CUSTOMERS_READ), `/customers/${ticket.customer.id}`, ticket.customer.customerNumber)}
              </Field>
              <Field label="Project">
                {ticket.project &&
                  linked(can(PERMISSIONS.PROJECTS_READ), `/projects/${ticket.project.id}`, `${ticket.project.projectNumber} - ${ticket.project.name}`)}
              </Field>
              <Field label="Category">{ticket.category?.name}</Field>
              <Field label="Opened">{formatDateTime(ticket.createdAt)}</Field>
              <Field label="Last activity">{formatDateTime(ticket.lastActivityAt)}</Field>
              <Field label="Resolved">{ticket.resolvedAt ? formatDateTime(ticket.resolvedAt) : ''}</Field>
              <Field label="Closed">{ticket.closedAt ? formatDateTime(ticket.closedAt) : ''}</Field>
            </Stack>
          </CardContent>
        </Card>
      </Box>

      {/* Files kept with the ticket; files sent in the conversation are above, with their message. */}
      <Card>
        <CardContent>
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
            Documents
          </Typography>
          <DocumentList entityType="ticket" entityId={ticket.id} />
        </CardContent>
      </Card>

      {dialog === 'edit' && <TicketDialog ticket={ticket} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Delete ticket"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDialog(null)}
      >
        {`${ticket.ticketNumber} - ${ticket.subject} will be removed from the CRM.`}
      </ConfirmDialog>
    </Stack>
  );
}
