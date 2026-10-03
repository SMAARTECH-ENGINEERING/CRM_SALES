import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ActivityTimeline from '../components/activities/ActivityTimeline.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import EventTimeline, { TIMELINE_PAGE_SIZE } from '../components/EventTimeline.jsx';
import FollowUpList from '../components/followups/FollowUpList.jsx';
import ConfigChip from '../components/leads/ConfigChip.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import AssignOpportunityDialog from '../components/opportunities/AssignOpportunityDialog.jsx';
import OpportunityStatusChip from '../components/opportunities/OpportunityStatusChip.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import useNotify from '../hooks/useNotify.js';
import { useOpportunity, useOpportunityMutations, useOpportunityTimeline } from '../hooks/useOpportunities.js';
import usePermission from '../hooks/usePermission.js';
import { usePipelineStages } from '../hooks/usePipelines.js';
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

function InfoCard({ title, children }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
          {title}
        </Typography>
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>{children}</Box>
      </CardContent>
    </Card>
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

function Overview({ opportunity, can }) {
  const { company, contact, lead } = opportunity;
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
      <InfoCard title="Opportunity">
        <Field label="Opportunity number">{opportunity.opportunityNumber}</Field>
        <Field label="Pipeline">{opportunity.pipeline?.name}</Field>
        <Field label="Stage">{opportunity.stage?.name}</Field>
        <Field label="Probability">{opportunity.probability == null ? '' : `${opportunity.probability}%`}</Field>
        <Field label="Estimated value">
          {opportunity.estimatedValue == null ? '' : formatAmount(opportunity.estimatedValue)}
        </Field>
        <Field label="Expected close date">
          {opportunity.expectedCloseDate ? formatDate(opportunity.expectedCloseDate) : ''}
        </Field>
        <Field label="Priority">{opportunity.priority?.name}</Field>
        <Field label="Source">{opportunity.source?.name}</Field>
        {opportunity.closedAt && <Field label="Closed">{formatDateTime(opportunity.closedAt)}</Field>}
      </InfoCard>

      <InfoCard title="Company and ownership">
        <Field label="Company">
          {company && linked(can(PERMISSIONS.COMPANIES_READ), `/companies/${company.id}`, company.name)}
        </Field>
        <Field label="Contact">
          {contact && linked(can(PERMISSIONS.CONTACTS_READ), `/contacts/${contact.id}`, contact.fullName)}
        </Field>
        <Field label="Converted from lead">
          {lead && linked(can(PERMISSIONS.LEADS_READ), `/leads/${lead.id}`, `${lead.leadNumber} - ${lead.title}`)}
        </Field>
        <Field label="Assigned to">{opportunity.assignedToUser?.fullName}</Field>
        <Field label="Organization">{opportunity.organization?.name}</Field>
        <Field label="Created by">{opportunity.createdByUser?.fullName}</Field>
        <Field label="Created">{formatDateTime(opportunity.createdAt)}</Field>
        <Field label="Last updated">{formatDateTime(opportunity.updatedAt)}</Field>
      </InfoCard>

      <Card sx={{ gridColumn: '1 / -1' }}>
        <CardContent>
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
            Notes
          </Typography>
          <Typography
            sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            color={opportunity.notes ? 'text.primary' : 'text.secondary'}
          >
            {opportunity.notes || 'No notes.'}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

// The stages of the opportunity's own pipeline, from the API. The current stage
// stays listed even if it has since been deactivated.
function StageSelect({ opportunity, onChange, disabled }) {
  const stages = usePipelineStages(opportunity.pipelineId);
  const list = (stages.data ?? []).filter((stage) => stage.status === 'active' || stage.id === opportunity.stageId);
  const options = list.some((stage) => stage.id === opportunity.stageId) || !opportunity.stage
    ? list
    : [opportunity.stage, ...list];

  return (
    <TextField
      select
      size="small"
      label="Stage"
      value={options.length ? opportunity.stageId : ''}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled || stages.isPending}
      error={Boolean(stages.error)}
      helperText={stages.error?.message}
      sx={{ minWidth: 200 }}
    >
      {options.map((stage) => (
        <MenuItem key={stage.id} value={stage.id}>
          {stage.name}
        </MenuItem>
      ))}
    </TextField>
  );
}

function OpportunityHistory({ opportunityId }) {
  const [page, setPage] = useState(1);
  const query = useOpportunityTimeline(opportunityId, { page, limit: TIMELINE_PAGE_SIZE });
  return <EventTimeline query={query} page={page} onPageChange={setPage} />;
}

export default function OpportunityDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  // null | 'assign' | 'delete'
  const [dialog, setDialog] = useState(null);
  const { move, remove } = useOpportunityMutations();
  const { data: opportunity, error, isPending, refetch } = useOpportunity(id);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/opportunities'));
  const backButton = (
    <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ alignSelf: 'flex-start' }}>
      Back to opportunities
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

  async function setStage(stageId) {
    if (!stageId || stageId === opportunity.stageId) return;
    try {
      const response = await move.mutateAsync({ id: opportunity.id, stageId });
      notify.success(`Moved to ${response.data.opportunity.stage.name}`);
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function confirmDelete() {
    try {
      await remove.mutateAsync(opportunity.id);
      notify.success(`${opportunity.opportunityNumber} deleted`);
      navigate('/opportunities', { replace: true });
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
                  {opportunity.name}
                </Typography>
                <Chip size="small" label={opportunity.opportunityNumber} />
                <ConfigChip value={opportunity.stage} />
                <OpportunityStatusChip status={opportunity.status} />
                <ConfigChip value={opportunity.priority} prefix="Priority" />
              </Stack>
              <Typography color="text.secondary">
                {[opportunity.company?.name, opportunity.contact?.fullName].filter(Boolean).join(' · ')}
                {' · '}
                {opportunity.assignedToUser ? `Assigned to ${opportunity.assignedToUser.fullName}` : 'Unassigned'}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, alignItems: 'center' }}>
              <PermissionGate permission={PERMISSIONS.OPPORTUNITIES_UPDATE}>
                <StageSelect opportunity={opportunity} onChange={setStage} disabled={move.isPending} />
                <Button variant="contained" component={RouterLink} to={`/opportunities/${opportunity.id}/edit`}>
                  Edit
                </Button>
              </PermissionGate>
              <PermissionGate permission={PERMISSIONS.QUOTATIONS_CREATE}>
                <Button
                  variant="outlined"
                  component={RouterLink}
                  to={`/quotations/new?companyId=${opportunity.companyId}&opportunityId=${opportunity.id}`}
                >
                  New quotation
                </Button>
              </PermissionGate>
              <PermissionGate permission={PERMISSIONS.OPPORTUNITIES_ASSIGN}>
                <Button variant="outlined" onClick={() => setDialog('assign')}>
                  Assign
                </Button>
              </PermissionGate>
              <PermissionGate permission={PERMISSIONS.OPPORTUNITIES_DELETE}>
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
          aria-label="Opportunity sections"
        >
          {TABS.map((entry) => (
            <Tab key={entry.value} value={entry.value} label={entry.label} />
          ))}
        </Tabs>
      </Box>

      {tab === 'overview' && <Overview opportunity={opportunity} can={can} />}
      {tab !== 'overview' && (
        <Card>
          <CardContent>
            {tab === 'activities' && <ActivityTimeline related={{ opportunityId: opportunity.id }} />}
            {tab === 'follow-ups' && <FollowUpList relatedType="opportunity" relatedId={opportunity.id} />}
            {tab === 'documents' && <DocumentList entityType="opportunity" entityId={opportunity.id} />}
            {tab === 'timeline' && <OpportunityHistory opportunityId={opportunity.id} />}
          </CardContent>
        </Card>
      )}

      {dialog === 'assign' && <AssignOpportunityDialog opportunity={opportunity} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Delete opportunity"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDialog(null)}
      >
        {`${opportunity.opportunityNumber} - ${opportunity.name} will be removed from the CRM.`}
      </ConfirmDialog>
    </Stack>
  );
}
