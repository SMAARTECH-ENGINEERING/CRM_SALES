import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import RecordEngagement from '../components/activities/RecordEngagement.jsx';
import CompanyTimeline from '../components/companies/CompanyTimeline.jsx';
import CompanyCustomerLink from '../components/customers/CompanyCustomerLink.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import CompanyContacts from '../components/contacts/CompanyContacts.jsx';
import CompanyLeads from '../components/leads/CompanyLeads.jsx';
import CompanyOpportunities from '../components/opportunities/CompanyOpportunities.jsx';
import CompanyOrders from '../components/orders/CompanyOrders.jsx';
import CompanyProjects from '../components/projects/CompanyProjects.jsx';
import RecordTickets from '../components/tickets/RecordTickets.jsx';
import RecordContracts from '../components/contracts/RecordContracts.jsx';
import RecordPayments from '../components/payments/RecordPayments.jsx';
import DocumentList from '../components/documents/DocumentList.jsx';
import CompanyQuotations from '../components/quotations/CompanyQuotations.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { useCompany, useCompanyMutations, useCompanySections } from '../hooks/useCompanies.js';
import useNotify from '../hooks/useNotify.js';
import { EMPTY, formatDateTime } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const OVERVIEW = 'overview';

// How to render a section the API reports as available. A module that adds a
// section registers its count on the server and its view here.
const SECTION_VIEWS = {
  contacts: CompanyContacts,
  leads: CompanyLeads,
  opportunities: CompanyOpportunities,
  quotations: CompanyQuotations,
  orders: CompanyOrders,
  projects: CompanyProjects,
  tickets: ({ companyId }) => <RecordTickets filter={{ companyId }} />,
  contracts: RecordContracts,
  payments: ({ companyId }) => <RecordPayments filter={{ companyId }} />,
  documents: ({ companyId }) => <DocumentList entityType="company" entityId={companyId} />,
  // Everything logged about the company or its contacts, leads and opportunities.
  activities: ({ companyId }) => <RecordEngagement type="company" id={companyId} />,
  timeline: CompanyTimeline,
};

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

function Overview({ company }) {
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
      <InfoCard title="Company">
        <Field label="Company code">{company.companyCode}</Field>
        <Field label="Name">{company.name}</Field>
        <Field label="Legal name">{company.legalName}</Field>
        <Field label="Industry">{company.industry?.name}</Field>
        <Field label="Company type">{company.companyType?.name}</Field>
        <Field label="Website">
          {company.website && (
            <Link href={company.website} target="_blank" rel="noopener noreferrer">
              {company.website}
            </Link>
          )}
        </Field>
      </InfoCard>

      <InfoCard title="Contact and address">
        <Field label="Email">{company.email && <Link href={`mailto:${company.email}`}>{company.email}</Link>}</Field>
        <Field label="Phone">{company.phone}</Field>
        <Box sx={{ gridColumn: '1 / -1' }}>
          <Field label="Address">{company.address}</Field>
        </Box>
        <Field label="City">{company.city}</Field>
        <Field label="State">{company.state}</Field>
        <Field label="Country">{company.country}</Field>
        <Field label="Postal code">{company.postalCode}</Field>
      </InfoCard>

      <InfoCard title="Tax">
        <Field label="GST number">{company.gstNumber}</Field>
        <Field label="PAN number">{company.panNumber}</Field>
      </InfoCard>

      <InfoCard title="Ownership">
        <Field label="Assigned to">{company.assignedToUser?.fullName}</Field>
        <Field label="Organization">{company.organization?.name}</Field>
        <Field label="Created by">{company.createdByUser?.fullName}</Field>
        <Field label="Created">{formatDateTime(company.createdAt)}</Field>
        <Field label="Last updated">{formatDateTime(company.updatedAt)}</Field>
      </InfoCard>

      <Card sx={{ gridColumn: '1 / -1' }}>
        <CardContent>
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
            Notes
          </Typography>
          <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} color={company.notes ? 'text.primary' : 'text.secondary'}>
            {company.notes || 'No notes.'}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}

function SectionPanel({ section, companyId }) {
  if (!section.available) {
    return (
      <Alert severity="info">
        {section.label} is not available yet. It will show this company&apos;s records once that module is added.
      </Alert>
    );
  }
  const View = SECTION_VIEWS[section.key];
  if (!View) {
    return (
      <Alert severity="info">
        This company has {section.count} {section.label.toLowerCase()} record(s). The screen that lists them
        arrives with the {section.label} module.
      </Alert>
    );
  }
  return (
    <Card>
      <CardContent>
        <View companyId={companyId} />
      </CardContent>
    </Card>
  );
}

export default function CompanyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const [searchParams, setSearchParams] = useSearchParams();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { remove } = useCompanyMutations();

  const { data: company, error, isPending, refetch } = useCompany(id);
  // The tabs after Overview, and their counts, come from the API.
  const sections = useCompanySections(id);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/companies'));
  const backButton = (
    <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ alignSelf: 'flex-start' }}>
      Back to companies
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

  const sectionList = sections.data ?? [];
  const requested = searchParams.get('tab') ?? OVERVIEW;
  const activeSection = sectionList.find((section) => section.key === requested);
  const tab = activeSection ? requested : OVERVIEW;

  async function confirmDelete() {
    try {
      await remove.mutateAsync(company.id);
      notify.success(`${company.name} deleted`);
      navigate('/companies', { replace: true });
    } catch (err) {
      // e.g. "…still has related records… (Contacts: 2)"
      const details = (err.errors ?? []).map((e) => e.message).join(', ');
      notify.error(details ? `${err.message} (${details})` : err.message);
      setConfirmingDelete(false);
    }
  }

  return (
    <Stack spacing={2}>
      {backButton}

      <Card>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
                  {company.name}
                </Typography>
                <Chip size="small" label={company.companyCode} />
                <StatusChip status={company.status} />
                {company.companyType && <Chip size="small" variant="outlined" label={company.companyType.name} />}
                {company.industry && <Chip size="small" variant="outlined" label={company.industry.name} />}
              </Stack>
              <Typography color="text.secondary">
                {[company.city, company.state, company.country].filter(Boolean).join(', ') || 'No location recorded'}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1}>
              <CompanyCustomerLink companyId={company.id} />
              <PermissionGate permission={PERMISSIONS.COMPANIES_UPDATE}>
                <Button variant="contained" component={RouterLink} to={`/companies/${company.id}/edit`}>
                  Edit
                </Button>
              </PermissionGate>
              <PermissionGate permission={PERMISSIONS.COMPANIES_DELETE}>
                <Button variant="outlined" color="error" onClick={() => setConfirmingDelete(true)}>
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
          onChange={(event, value) => setSearchParams(value === OVERVIEW ? {} : { tab: value }, { replace: true })}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Company sections"
        >
          <Tab value={OVERVIEW} label="Overview" />
          {sectionList.map((section) => (
            <Tab
              key={section.key}
              value={section.key}
              label={
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <span>{section.label}</span>
                  {/* A count is shown only when the API supplies one. */}
                  {section.available && section.count != null && <Chip size="small" label={section.count} />}
                </Stack>
              }
            />
          ))}
        </Tabs>
      </Box>

      {sections.isPending && <Skeleton variant="rounded" height={8} aria-label="Loading sections" />}
      {sections.error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => sections.refetch()}>
              Retry
            </Button>
          }
        >
          Could not load the other sections: {sections.error.message}
        </Alert>
      )}

      {tab === OVERVIEW ? (
        <Overview company={company} />
      ) : (
        <SectionPanel key={activeSection.key} section={activeSection} companyId={company.id} />
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete company"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setConfirmingDelete(false)}
      >
        {`${company.name} (${company.companyCode}) will be removed from the CRM.`}
      </ConfirmDialog>
    </Stack>
  );
}
