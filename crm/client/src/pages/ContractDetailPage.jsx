import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CONTRACT_CONFIG } from '../api/leadConfig.api.js';
import RecordEngagement from '../components/activities/RecordEngagement.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ContractDialog from '../components/contracts/ContractDialog.jsx';
import ContractEndChip from '../components/contracts/ContractEndChip.jsx';
import EventTimeline, { TIMELINE_PAGE_SIZE } from '../components/EventTimeline.jsx';
import ConfigChip from '../components/leads/ConfigChip.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import { useContract, useContractMutations, useContractReminders, useContractTimeline } from '../hooks/useContracts.js';
import useNotify from '../hooks/useNotify.js';
import usePermission from '../hooks/usePermission.js';
import { EMPTY, formatDate, formatDateTime, formatMoney } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';
import DocumentList from '../components/documents/DocumentList.jsx';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'reminders', label: 'Reminders' },
  { value: 'activities', label: 'Activities & follow-ups' },
  { value: 'documents', label: 'Documents' },
  { value: 'timeline', label: 'Timeline' },
];

function Field({ label, children }) {
  return (
    <div>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant="body1" component="div" sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
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

function Overview({ contract, can }) {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' } }}>
          <Field label="Company">
            {contract.company && linked(can(PERMISSIONS.COMPANIES_READ), `/companies/${contract.company.id}`, contract.company.name)}
          </Field>
          <Field label="Customer">
            {contract.customer &&
              linked(can(PERMISSIONS.CUSTOMERS_READ), `/customers/${contract.customer.id}`, contract.customer.customerNumber)}
          </Field>
          <Field label="Contract type">{contract.contractType?.name}</Field>
          <Field label="Assigned to">{contract.assignedToUser?.fullName}</Field>
          <Field label="Start date">{formatDate(contract.startDate)}</Field>
          <Field label="End date">{formatDate(contract.endDate)}</Field>
          <Field label="Renewal date">{contract.renewalDate ? formatDate(contract.renewalDate) : ''}</Field>
          <Field label="Days to end">{String(contract.daysToEnd)}</Field>
          <Field label="Amount">{formatMoney(contract.amount)}</Field>
          <Field label="Billing cycle">{contract.billingCycle?.name}</Field>
          <Field label="Created by">{contract.createdByUser?.fullName}</Field>
          <Field label="Created">{formatDateTime(contract.createdAt)}</Field>
          <Box sx={{ gridColumn: '1 / -1' }}>
            <Field label="Description">{contract.description}</Field>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

// Expiry reminders already sent, from the API. When they go out is set by the
// reminder periods in Settings.
function Reminders({ contractId }) {
  const { data, error, isPending } = useContractReminders(contractId);
  if (isPending) return <LoadingScreen />;
  if (error) return <Alert severity="error">{error.message}</Alert>;
  return (
    <Stack spacing={2}>
      <Alert severity="info">
        Active contracts get a reminder for each reminder period configured under Settings → Contract reminder periods. Each
        reminder is a follow-up for the person assigned (shown under Activities &amp; follow-ups) and an email when email is
        set up.
      </Alert>
      {data.length === 0 ? (
        <Typography color="text.secondary">No reminders sent yet.</Typography>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Reminders sent">
            <TableHead>
              <TableRow>
                <TableCell>Sent</TableCell>
                <TableCell>Period</TableCell>
                <TableCell>Days left</TableCell>
                <TableCell>For end date</TableCell>
                <TableCell>Sent to</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Follow-up</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((reminder) => (
                <TableRow key={reminder.id}>
                  <TableCell>{formatDateTime(reminder.createdAt)}</TableCell>
                  <TableCell>{reminder.daysBefore} days before</TableCell>
                  <TableCell>{reminder.daysLeft}</TableCell>
                  <TableCell>{formatDate(reminder.endDate)}</TableCell>
                  <TableCell>{reminder.recipient?.fullName ?? 'Nobody (unassigned)'}</TableCell>
                  <TableCell>{reminder.emailedAt ? 'Emailed' : (reminder.emailError ?? EMPTY)}</TableCell>
                  <TableCell>{reminder.followUp?.status ?? EMPTY}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}

function ContractHistory({ contractId }) {
  const [page, setPage] = useState(1);
  const query = useContractTimeline(contractId, { page, limit: TIMELINE_PAGE_SIZE });
  return <EventTimeline query={query} page={page} onPageChange={setPage} />;
}

export default function ContractDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  // null | 'edit' | 'delete'
  const [dialog, setDialog] = useState(null);
  const { changeStatus, remove } = useContractMutations();
  const { data: contract, error, isPending, refetch } = useContract(id);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/contracts'));
  const backButton = (
    <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ alignSelf: 'flex-start' }}>
      Back to contracts
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

  const requested = searchParams.get('tab');
  const tab = TABS.some((entry) => entry.value === requested) ? requested : 'overview';

  async function setStatus(statusId) {
    if (!statusId || statusId === contract.statusId) return;
    try {
      await changeStatus.mutateAsync({ id: contract.id, statusId });
      notify.success('Status updated');
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function confirmDelete() {
    try {
      await remove.mutateAsync(contract.id);
      notify.success(`${contract.contractNumber} deleted`);
      navigate('/contracts', { replace: true });
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
                  {contract.contractNumber}
                </Typography>
                <ConfigChip value={contract.status} />
                {contract.contractType && <Chip size="small" variant="outlined" label={contract.contractType.name} />}
                <ContractEndChip contract={contract} />
              </Stack>
              <Typography color="text.secondary">
                {[
                  contract.company?.name,
                  `${formatDate(contract.startDate)} – ${formatDate(contract.endDate)}`,
                  formatMoney(contract.amount),
                  contract.billingCycle?.name,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              {can(PERMISSIONS.CONTRACTS_UPDATE) && (
                <LeadConfigSelect
                  list={CONTRACT_CONFIG.STATUSES}
                  label="Status"
                  required
                  value={contract.statusId}
                  current={contract.status}
                  onChange={setStatus}
                  disabled={changeStatus.isPending}
                  sx={{ minWidth: 170 }}
                />
              )}
              <PermissionGate permission={PERMISSIONS.CONTRACTS_UPDATE}>
                <Button variant="contained" onClick={() => setDialog('edit')}>
                  Edit
                </Button>
              </PermissionGate>
              <PermissionGate permission={PERMISSIONS.CONTRACTS_DELETE}>
                <Button variant="outlined" color="error" onClick={() => setDialog('delete')}>
                  Delete
                </Button>
              </PermissionGate>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tab}
          onChange={(event, value) => setSearchParams(value === 'overview' ? {} : { tab: value }, { replace: true })}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Contract sections"
        >
          {TABS.map((entry) => (
            <Tab key={entry.value} value={entry.value} label={entry.label} />
          ))}
        </Tabs>
      </Box>

      {tab === 'overview' && <Overview contract={contract} can={can} />}
      {tab !== 'overview' && (
        <Card>
          <CardContent>
            {tab === 'reminders' && <Reminders contractId={contract.id} />}
            {tab === 'activities' && <RecordEngagement type="contract" id={contract.id} />}
            {tab === 'documents' && <DocumentList entityType="contract" entityId={contract.id} />}
            {tab === 'timeline' && <ContractHistory contractId={contract.id} />}
          </CardContent>
        </Card>
      )}

      {dialog === 'edit' && <ContractDialog contract={contract} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Delete contract"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDialog(null)}
      >
        {`${contract.contractNumber} will be removed from the CRM, and its pending reminder follow-ups cancelled.`}
      </ConfirmDialog>
    </Stack>
  );
}
