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
import RecordEngagement from '../components/activities/RecordEngagement.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import CompanyContacts from '../components/contacts/CompanyContacts.jsx';
import CustomerDialog from '../components/customers/CustomerDialog.jsx';
import EventTimeline, { TIMELINE_PAGE_SIZE } from '../components/EventTimeline.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import CompanyOpportunities from '../components/opportunities/CompanyOpportunities.jsx';
import CompanyOrders from '../components/orders/CompanyOrders.jsx';
import CompanyProjects from '../components/projects/CompanyProjects.jsx';
import RecordTickets from '../components/tickets/RecordTickets.jsx';
import RecordContracts from '../components/contracts/RecordContracts.jsx';
import RecordPayments from '../components/payments/RecordPayments.jsx';
import DocumentList from '../components/documents/DocumentList.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import CompanyQuotations from '../components/quotations/CompanyQuotations.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { useCustomerMutations, useCustomerSummary, useCustomerTimeline } from '../hooks/useCustomers.js';
import useNotify from '../hooks/useNotify.js';
import usePermission from '../hooks/usePermission.js';
import { EMPTY, formatAmount, formatDate, formatDateTime } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const OVERVIEW = 'overview';

function CustomerTimeline({ customerId }) {
  const [page, setPage] = useState(1);
  const query = useCustomerTimeline(customerId, { page, limit: TIMELINE_PAGE_SIZE });
  return <EventTimeline query={query} page={page} onPageChange={setPage} />;
}

// What each section shows. Records always come from the module's own API,
// filtered by the customer's company; a module that is not built has no view.
const SECTION_VIEWS = {
  contacts: ({ companyId }) => <CompanyContacts companyId={companyId} />,
  activities: ({ companyId }) => <RecordEngagement type="company" id={companyId} />,
  opportunities: ({ companyId }) => <CompanyOpportunities companyId={companyId} />,
  quotations: ({ companyId }) => <CompanyQuotations companyId={companyId} />,
  orders: ({ companyId }) => <CompanyOrders companyId={companyId} />,
  projects: ({ companyId }) => <CompanyProjects companyId={companyId} />,
  tickets: ({ companyId }) => <RecordTickets filter={{ companyId }} />,
  contracts: ({ companyId }) => <RecordContracts companyId={companyId} />,
  payments: ({ companyId }) => <RecordPayments filter={{ companyId }} />,
  // A customer's documents are its company's.
  documents: ({ companyId }) => <DocumentList entityType="company" entityId={companyId} />,
  timeline: ({ customerId }) => <CustomerTimeline customerId={customerId} />,
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

// One figure from the API, with a caption. Never computed here.
function Metric({ label, value, caption }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" component="p" sx={{ fontWeight: 600 }} aria-label={label}>
          {value}
        </Typography>
        {caption && (
          <Typography variant="caption" color="text.secondary">
            {caption}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

function Overview({ customer, metrics, can }) {
  const { company } = customer;
  const { orders, quotations, opportunities, activities } = metrics;
  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
        <Metric
          label="Order value"
          value={formatAmount(orders.orderValue)}
          caption={`${orders.orderCount} order(s), cancelled excluded`}
        />
        <Metric label="Last order" value={orders.lastOrderDate ? formatDate(orders.lastOrderDate) : EMPTY} />
        <Metric
          label="Open opportunities"
          value={opportunities.open.count}
          caption={`Worth ${formatAmount(opportunities.open.value)}`}
        />
        <Metric
          label="Quotations awaiting answer"
          value={formatAmount(quotations.openValue)}
          caption="Value of drafts and sent quotations"
        />
        <Metric label="Won opportunities" value={opportunities.won.count} caption={`Worth ${formatAmount(opportunities.won.value)}`} />
        <Metric label="Activities" value={activities.total} caption={`${activities.pending} pending, ${activities.overdue} overdue`} />
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
        <Card>
          <CardContent>
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
              Customer
            </Typography>
            <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <Field label="Customer number">{customer.customerNumber}</Field>
              <Field label="Customer since">{formatDate(customer.customerSince)}</Field>
              <Field label="Account manager">{customer.accountManager?.fullName}</Field>
              <Field label="Primary contact">
                {customer.primaryContact &&
                  (can(PERMISSIONS.CONTACTS_READ) ? (
                    <Link component={RouterLink} to={`/contacts/${customer.primaryContact.id}`} underline="hover">
                      {customer.primaryContact.fullName}
                    </Link>
                  ) : (
                    customer.primaryContact.fullName
                  ))}
              </Field>
              <Field label="First order">
                {customer.firstOrder &&
                  (can(PERMISSIONS.ORDERS_READ) ? (
                    <Link component={RouterLink} to={`/orders/${customer.firstOrder.id}`} underline="hover">
                      {customer.firstOrder.orderNumber}
                    </Link>
                  ) : (
                    customer.firstOrder.orderNumber
                  ))}
              </Field>
              <Field label="Added">{formatDateTime(customer.createdAt)}</Field>
              <Box sx={{ gridColumn: '1 / -1' }}>
                <Field label="Notes">{customer.notes}</Field>
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* The company's own details, read from the company record. */}
        <Card>
          <CardContent>
            <Stack direction="row" sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="h6" component="h2">
                Company
              </Typography>
              {can(PERMISSIONS.COMPANIES_READ) && (
                <Button size="small" component={RouterLink} to={`/companies/${company.id}`}>
                  Open company
                </Button>
              )}
            </Stack>
            <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
              <Field label="Name">{company.name}</Field>
              <Field label="Company code">{company.companyCode}</Field>
              <Field label="Industry">{company.industry?.name}</Field>
              <Field label="Type">{company.companyType?.name}</Field>
              <Field label="Email">{company.email}</Field>
              <Field label="Phone">{company.phone}</Field>
              <Field label="Location">{[company.city, company.state, company.country].filter(Boolean).join(', ')}</Field>
              <Field label="Website">{company.website}</Field>
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Stack>
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  // null | 'edit' | 'delete'
  const [dialog, setDialog] = useState(null);
  const { remove } = useCustomerMutations();
  const { data, error, isPending, refetch } = useCustomerSummary(id);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/customers'));
  const backButton = (
    <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ alignSelf: 'flex-start' }}>
      Back to customers
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

  const { customer, sections, metrics } = data;
  const requested = searchParams.get('tab') ?? OVERVIEW;
  const active = sections.find((section) => section.key === requested);
  const tab = active ? requested : OVERVIEW;
  const View = active?.available ? SECTION_VIEWS[active.key] : null;

  async function confirmDelete() {
    try {
      await remove.mutateAsync(customer.id);
      notify.success(`${customer.company.name} is no longer a customer`);
      navigate('/customers', { replace: true });
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
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
                  {customer.company.name}
                </Typography>
                <Chip size="small" label={customer.customerNumber} />
                <StatusChip status={customer.status} />
              </Stack>
              <Typography color="text.secondary">
                Customer since {formatDate(customer.customerSince)}
                {customer.accountManager ? ` · Account manager ${customer.accountManager.fullName}` : ''}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <PermissionGate permission={PERMISSIONS.CUSTOMERS_UPDATE}>
                <Button variant="contained" onClick={() => setDialog('edit')}>
                  Edit
                </Button>
              </PermissionGate>
              <PermissionGate permission={PERMISSIONS.CUSTOMERS_DELETE}>
                <Button variant="outlined" color="error" onClick={() => setDialog('delete')}>
                  Remove
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
          aria-label="Customer sections"
        >
          <Tab value={OVERVIEW} label="Overview" />
          {sections.map((section) => (
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

      {tab === OVERVIEW && <Overview customer={customer} metrics={metrics} can={can} />}
      {active && !active.available && (
        <Alert severity="info">
          {active.label} is not available yet. This tab will show the customer&apos;s {active.label.toLowerCase()} once
          that module is added.
        </Alert>
      )}
      {View && (
        <Card>
          <CardContent>
            <View companyId={customer.companyId} customerId={customer.id} />
          </CardContent>
        </Card>
      )}

      {dialog === 'edit' && <CustomerDialog customer={customer} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Remove customer"
        confirmLabel="Remove"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDialog(null)}
      >
        {`${customer.company.name} will no longer be a customer. The company and all its contacts, quotations and orders stay unchanged.`}
      </ConfirmDialog>
    </Stack>
  );
}
