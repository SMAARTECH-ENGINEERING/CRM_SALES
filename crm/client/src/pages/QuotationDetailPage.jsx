import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
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
import { QUOTATION_CONFIG } from '../api/leadConfig.api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import EventTimeline, { TIMELINE_PAGE_SIZE } from '../components/EventTimeline.jsx';
import ConfigChip from '../components/leads/ConfigChip.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import LineItemsTable from '../components/quotations/LineItemsTable.jsx';
import SendQuotationDialog from '../components/quotations/SendQuotationDialog.jsx';
import CreateOrderDialog from '../components/orders/CreateOrderDialog.jsx';
import useNotify from '../hooks/useNotify.js';
import usePermission from '../hooks/usePermission.js';
import { saveBlob, useQuotation, useQuotationMutations, useQuotationTimeline } from '../hooks/useQuotations.js';
import { EMPTY, formatAmount, formatDate, formatDateTime } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';
import DocumentList from '../components/documents/DocumentList.jsx';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'documents', label: 'Documents' },
  { value: 'timeline', label: 'Timeline' },
];
const LOCKED = ['accepted', 'rejected'];

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

function Overview({ quotation, can }) {
  const { company, contact, opportunity } = quotation;
  return (
    <Stack spacing={2}>
      <Card>
        <CardContent>
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' } }}>
            <Field label="Customer">
              {company && linked(can(PERMISSIONS.COMPANIES_READ), `/companies/${company.id}`, company.name)}
            </Field>
            <Field label="Contact">
              {contact && linked(can(PERMISSIONS.CONTACTS_READ), `/contacts/${contact.id}`, contact.fullName)}
            </Field>
            <Field label="Opportunity">
              {opportunity &&
                linked(
                  can(PERMISSIONS.OPPORTUNITIES_READ),
                  `/opportunities/${opportunity.id}`,
                  `${opportunity.opportunityNumber} - ${opportunity.name}`
                )}
            </Field>
            <Field label="Quotation date">{formatDate(quotation.quotationDate)}</Field>
            <Field label="Valid until">{quotation.validUntil ? formatDate(quotation.validUntil) : ''}</Field>
            <Field label="Created by">{quotation.createdByUser?.fullName}</Field>
            <Field label="Last sent">
              {quotation.sentAt
                ? `${formatDateTime(quotation.sentAt)}${quotation.sentTo ? ` to ${quotation.sentTo}` : ''}`
                : ''}
            </Field>
            <Field label="Last updated">{formatDateTime(quotation.updatedAt)}</Field>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
            Products
          </Typography>
          <LineItemsTable document={quotation} label="Quotation lines" />
        </CardContent>
      </Card>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
        {[
          ['Terms and conditions', quotation.termsAndConditions, 'No terms.'],
          ['Notes', quotation.notes, 'No notes.'],
        ].map(([title, body, none]) => (
          <Card key={title}>
            <CardContent>
              <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
                {title}
              </Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} color={body ? 'text.primary' : 'text.secondary'}>
                {body || none}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Stack>
  );
}

function QuotationHistory({ quotationId }) {
  const [page, setPage] = useState(1);
  const query = useQuotationTimeline(quotationId, { page, limit: TIMELINE_PAGE_SIZE });
  return <EventTimeline query={query} page={page} onPageChange={setPage} />;
}

export default function QuotationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  // null | 'send' | 'order' | 'delete'
  const [dialog, setDialog] = useState(null);
  const { changeStatus, pdf, remove } = useQuotationMutations();
  const { data: quotation, error, isPending, refetch } = useQuotation(id);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/quotations'));
  const backButton = (
    <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ alignSelf: 'flex-start' }}>
      Back to quotations
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
  const locked = LOCKED.includes(quotation.status?.category);

  async function setStatus(statusId) {
    if (!statusId || statusId === quotation.statusId) return;
    try {
      const response = await changeStatus.mutateAsync({ id: quotation.id, statusId });
      notify.success(`Status changed to ${response.data.quotation.status.name}`);
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function downloadPdf() {
    try {
      const blob = await pdf.mutateAsync(quotation.id);
      saveBlob(blob, `${quotation.quotationNumber}.pdf`);
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function confirmDelete() {
    try {
      await remove.mutateAsync(quotation.id);
      notify.success(`${quotation.quotationNumber} deleted`);
      navigate('/quotations', { replace: true });
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
                  {quotation.quotationNumber}
                </Typography>
                <ConfigChip value={quotation.status} />
                {quotation.sentAt && <Chip size="small" variant="outlined" label="Sent" />}
              </Stack>
              <Typography color="text.secondary">
                {[quotation.company?.name, quotation.contact?.fullName].filter(Boolean).join(' · ')}
                {' · '}
                Grand total {formatAmount(quotation.grandTotal)}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, alignItems: 'center' }}>
              <PermissionGate permission={PERMISSIONS.QUOTATIONS_UPDATE}>
                {/* The statuses are the configured ones, from the API. */}
                <LeadConfigSelect
                  list={QUOTATION_CONFIG.STATUSES}
                  label="Status"
                  required
                  value={quotation.statusId}
                  current={quotation.status}
                  onChange={setStatus}
                  disabled={changeStatus.isPending}
                  sx={{ minWidth: 170 }}
                />
                {!locked && (
                  <Button variant="contained" component={RouterLink} to={`/quotations/${quotation.id}/edit`}>
                    Edit
                  </Button>
                )}
              </PermissionGate>
              <Button variant="outlined" startIcon={<PictureAsPdfOutlinedIcon />} onClick={downloadPdf} loading={pdf.isPending}>
                PDF
              </Button>
              {/* Change the PDF itself (text, logo, signature) and attach it to the quotation. */}
              {can(PERMISSIONS.DOCUMENTS_READ) && can(PERMISSIONS.DOCUMENTS_CREATE) && can(PERMISSIONS.DOCUMENTS_UPDATE) && (
                <Button variant="outlined" startIcon={<EditNoteOutlinedIcon />} component={RouterLink} to={`/quotations/${quotation.id}/edit-pdf`}>
                  Edit PDF
                </Button>
              )}
              {quotation.order ? (
                <PermissionGate permission={PERMISSIONS.ORDERS_READ}>
                  <Button variant="outlined" component={RouterLink} to={`/orders/${quotation.orderId}`}>
                    Order {quotation.order.orderNumber}
                  </Button>
                </PermissionGate>
              ) : (
                quotation.status?.category === 'accepted' && (
                  <PermissionGate permission={PERMISSIONS.ORDERS_CREATE}>
                    <Button variant="contained" color="success" onClick={() => setDialog('order')}>
                      Create order
                    </Button>
                  </PermissionGate>
                )
              )}
              <PermissionGate permission={PERMISSIONS.QUOTATIONS_SEND}>
                <Button variant="outlined" startIcon={<SendOutlinedIcon />} onClick={() => setDialog('send')}>
                  Send
                </Button>
              </PermissionGate>
              <PermissionGate permission={PERMISSIONS.QUOTATIONS_DELETE}>
                <Button variant="outlined" color="error" onClick={() => setDialog('delete')}>
                  Delete
                </Button>
              </PermissionGate>
            </Stack>
          </Stack>
          {locked && (
            <Alert severity="info" sx={{ mt: 2 }}>
              This quotation is {quotation.status.name.toLowerCase()}, so it cannot be edited. Change its status to
              edit it again.
            </Alert>
          )}
        </CardContent>
      </Card>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tab}
          onChange={(event, value) => setSearchParams(value === TABS[0].value ? {} : { tab: value }, { replace: true })}
          aria-label="Quotation sections"
        >
          {TABS.map((entry) => (
            <Tab key={entry.value} value={entry.value} label={entry.label} />
          ))}
        </Tabs>
      </Box>

      {tab === 'overview' && <Overview quotation={quotation} can={can} />}
      {tab === 'documents' && (
        <Card>
          <CardContent>
            <DocumentList entityType="quotation" entityId={quotation.id} />
          </CardContent>
        </Card>
      )}
      {tab === 'timeline' && (
        <Card>
          <CardContent>
            <QuotationHistory quotationId={quotation.id} />
          </CardContent>
        </Card>
      )}

      {dialog === 'send' && <SendQuotationDialog quotation={quotation} onClose={() => setDialog(null)} />}
      {dialog === 'order' && <CreateOrderDialog quotation={quotation} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Delete quotation"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDialog(null)}
      >
        {`${quotation.quotationNumber} will be removed from the CRM.`}
      </ConfirmDialog>
    </Stack>
  );
}
