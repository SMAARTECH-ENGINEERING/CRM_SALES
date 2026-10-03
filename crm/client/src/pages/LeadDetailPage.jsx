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
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LEAD_CONFIG } from '../api/leadConfig.api.js';
import ActivityTimeline from '../components/activities/ActivityTimeline.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import FollowUpList from '../components/followups/FollowUpList.jsx';
import AssignLeadDialog from '../components/leads/AssignLeadDialog.jsx';
import ConfigChip from '../components/leads/ConfigChip.jsx';
import ConvertLeadDialog from '../components/leads/ConvertLeadDialog.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import LeadTimeline from '../components/leads/LeadTimeline.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import { useLead, useLeadMutations } from '../hooks/useLeads.js';
import useNotify from '../hooks/useNotify.js';
import usePermission from '../hooks/usePermission.js';
import { EMPTY, formatAmount, formatDate, formatDateTime } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';
import DocumentList from '../components/documents/DocumentList.jsx';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'activities', label: 'Activities' },
  { value: 'follow-ups', label: 'Follow-ups' },
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

function InfoCard({ title, children, sx }) {
  return (
    <Card sx={sx}>
      <CardContent>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
          {title}
        </Typography>
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>{children}</Box>
      </CardContent>
    </Card>
  );
}

function Overview({ lead, canViewCompanies, canViewContacts, canViewOpportunities }) {
  const { company, contact, opportunity } = lead;
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
      <InfoCard title="Lead">
        <Field label="Lead number">{lead.leadNumber}</Field>
        <Field label="Source">{lead.source?.name}</Field>
        <Field label="Status">{lead.status?.name}</Field>
        <Field label="Priority">{lead.priority?.name}</Field>
        <Field label="Estimated value">{lead.estimatedValue == null ? '' : formatAmount(lead.estimatedValue)}</Field>
        <Field label="Expected close date">{lead.expectedCloseDate ? formatDate(lead.expectedCloseDate) : ''}</Field>
        <Box sx={{ gridColumn: '1 / -1' }}>
          <Field label="Description">{lead.description}</Field>
        </Box>
        <Box sx={{ gridColumn: '1 / -1' }}>
          <Field label="Tags">
            {lead.tags?.length > 0 && (
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                {lead.tags.map((tag) => (
                  <Chip key={tag} size="small" label={tag} />
                ))}
              </Stack>
            )}
          </Field>
        </Box>
      </InfoCard>

      <InfoCard title="Company and ownership">
        <Field label="Company">
          {company &&
            (canViewCompanies ? (
              <Link component={RouterLink} to={`/companies/${company.id}`} underline="hover">
                {company.name}
              </Link>
            ) : (
              company.name
            ))}
        </Field>
        <Field label="Contact">
          {contact &&
            (canViewContacts ? (
              <Link component={RouterLink} to={`/contacts/${contact.id}`} underline="hover">
                {contact.fullName}
              </Link>
            ) : (
              contact.fullName
            ))}
        </Field>
        <Field label="Assigned to">{lead.assignedToUser?.fullName}</Field>
        <Field label="Organization">{lead.organization?.name}</Field>
        <Field label="Created by">{lead.createdByUser?.fullName}</Field>
        <Field label="Created">{formatDateTime(lead.createdAt)}</Field>
        <Field label="Last updated">{formatDateTime(lead.updatedAt)}</Field>
      </InfoCard>

      {lead.isConverted && (
        <InfoCard title="Conversion" sx={{ gridColumn: '1 / -1' }}>
          <Field label="Opportunity">
            {opportunity &&
              (canViewOpportunities ? (
                <Link component={RouterLink} to={`/opportunities/${opportunity.id}`} underline="hover">
                  {`${opportunity.opportunityNumber} - ${opportunity.name}`}
                </Link>
              ) : (
                `${opportunity.opportunityNumber} - ${opportunity.name}`
              ))}
          </Field>
          <Field label="Opportunity status">{opportunity?.status}</Field>
          <Field label="Converted by">{lead.convertedByUser?.fullName}</Field>
          <Field label="Converted">{formatDateTime(lead.convertedAt)}</Field>
        </InfoCard>
      )}

      <Card sx={{ gridColumn: '1 / -1' }}>
        <CardContent>
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
            Notes
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} color={lead.notes ? 'text.primary' : 'text.secondary'}>
            {lead.notes || 'No notes.'}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

export default function LeadDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  // null | 'assign' | 'convert' | 'delete'
  const [dialog, setDialog] = useState(null);
  const { changeStatus, remove } = useLeadMutations();
  const { data: lead, error, isPending, refetch } = useLead(id);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/leads'));
  const backButton = (
    <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ alignSelf: 'flex-start' }}>
      Back to leads
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
  const tab = TABS.some((t) => t.value === requested) ? requested : TABS[0].value;

  async function setStatus(statusId) {
    if (!statusId || statusId === lead.statusId) return;
    try {
      const response = await changeStatus.mutateAsync({ id: lead.id, statusId });
      notify.success(`Status changed to ${response.data.lead.status.name}`);
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function confirmDelete() {
    try {
      await remove.mutateAsync(lead.id);
      notify.success(`${lead.leadNumber} deleted`);
      navigate('/leads', { replace: true });
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
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            spacing={2}
            sx={{ alignItems: { lg: 'flex-start' }, justifyContent: 'space-between' }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
                  {lead.title}
                </Typography>
                <Chip size="small" label={lead.leadNumber} />
                <ConfigChip value={lead.status} />
                <ConfigChip value={lead.priority} prefix="Priority" />
                {lead.isConverted && <Chip size="small" color="success" label="Converted" />}
              </Stack>
              <Typography color="text.secondary">
                {[lead.company?.name, lead.contact?.fullName].filter(Boolean).join(' · ') || 'No company yet'}
                {' · '}
                {lead.assignedToUser ? `Assigned to ${lead.assignedToUser.fullName}` : 'Unassigned'}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, alignItems: 'center' }}>
              <PermissionGate permission={PERMISSIONS.LEADS_UPDATE}>
                {/* Options are the active statuses configured in Lead settings. */}
                <LeadConfigSelect
                  list={LEAD_CONFIG.STATUSES}
                  label="Status"
                  required
                  value={lead.statusId}
                  current={lead.status}
                  onChange={setStatus}
                  disabled={changeStatus.isPending}
                  sx={{ minWidth: 190 }}
                />
                <Button variant="contained" component={RouterLink} to={`/leads/${lead.id}/edit`}>
                  Edit
                </Button>
              </PermissionGate>
              <PermissionGate permission={PERMISSIONS.LEADS_ASSIGN}>
                <Button variant="outlined" onClick={() => setDialog('assign')}>
                  Assign
                </Button>
              </PermissionGate>
              {!lead.isConverted && (
                <PermissionGate permission={PERMISSIONS.LEADS_CONVERT}>
                  <Button variant="outlined" color="success" onClick={() => setDialog('convert')}>
                    Convert
                  </Button>
                </PermissionGate>
              )}
              <PermissionGate permission={PERMISSIONS.LEADS_DELETE}>
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
          onChange={(event, value) => setSearchParams(value === TABS[0].value ? {} : { tab: value }, { replace: true })}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Lead sections"
        >
          {TABS.map((entry) => (
            <Tab key={entry.value} value={entry.value} label={entry.label} />
          ))}
        </Tabs>
      </Box>

      {tab === 'overview' && (
        <Overview
          lead={lead}
          canViewCompanies={can(PERMISSIONS.COMPANIES_READ)}
          canViewContacts={can(PERMISSIONS.CONTACTS_READ)}
          canViewOpportunities={can(PERMISSIONS.OPPORTUNITIES_READ)}
        />
      )}
      {tab !== 'overview' && (
        <Card>
          <CardContent>
            {tab === 'activities' && <ActivityTimeline related={{ leadId: lead.id }} />}
            {tab === 'follow-ups' && <FollowUpList relatedType="lead" relatedId={lead.id} />}
            {tab === 'documents' && <DocumentList entityType="lead" entityId={lead.id} />}
            {tab === 'timeline' && <LeadTimeline leadId={lead.id} />}
          </CardContent>
        </Card>
      )}

      {dialog === 'assign' && <AssignLeadDialog lead={lead} onClose={() => setDialog(null)} />}
      {dialog === 'convert' && <ConvertLeadDialog lead={lead} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Delete lead"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDialog(null)}
      >
        {`${lead.leadNumber} - ${lead.title} will be removed from the CRM.`}
      </ConfirmDialog>
    </Stack>
  );
}
