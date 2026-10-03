import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PAYMENT_CONFIG } from '../api/leadConfig.api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import EventTimeline, { TIMELINE_PAGE_SIZE } from '../components/EventTimeline.jsx';
import ConfigChip from '../components/leads/ConfigChip.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import OverdueChip from '../components/payments/OverdueChip.jsx';
import PaymentDialog from '../components/payments/PaymentDialog.jsx';
import ReceivePaymentDialog from '../components/payments/ReceivePaymentDialog.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import { useLeadConfig } from '../hooks/useLeadConfig.js';
import useNotify from '../hooks/useNotify.js';
import { usePayment, usePaymentMutations, usePaymentTimeline } from '../hooks/usePayments.js';
import usePermission from '../hooks/usePermission.js';
import { EMPTY, formatAmount, formatDate, formatDateTime, formatMoney } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';
import DocumentList from '../components/documents/DocumentList.jsx';

const TABS = [
  { value: 'overview', label: 'Overview' },
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

// One figure from the API, never worked out here.
function Metric({ label, value, color }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" component="p" sx={{ fontWeight: 600, color }} aria-label={label}>
          {value}
        </Typography>
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

function PaymentHistory({ paymentId }) {
  const [page, setPage] = useState(1);
  const query = usePaymentTimeline(paymentId, { page, limit: TIMELINE_PAGE_SIZE });
  return <EventTimeline query={query} page={page} onPageChange={setPage} />;
}

export default function PaymentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  // null | 'edit' | 'receive' | 'cancel' | 'delete'
  const [dialog, setDialog] = useState(null);
  const { update, remove } = usePaymentMutations();
  const { data: payment, error, isPending, refetch } = usePayment(id);
  // Needed only to cancel or re-open: which statuses mean what, from the API.
  const statuses = useLeadConfig(PAYMENT_CONFIG.STATUSES.resource, { activeOnly: true });

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/payments'));
  const backButton = (
    <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ alignSelf: 'flex-start' }}>
      Back to payments
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
  const cancelled = payment.status?.category === 'cancelled';
  const cancelStatus = (statuses.data ?? []).find((status) => status.category === 'cancelled');
  const liveStatus = (statuses.data ?? []).find((status) => status.category !== 'cancelled');
  const { company, customer, order } = payment;
  // For the bar only; the amounts themselves are the API's.
  const share = payment.amount > 0 ? Math.min(100, (payment.paidAmount / payment.amount) * 100) : 0;

  // Cancelling and re-opening are status changes; on re-opening the API picks
  // the status the amounts call for.
  async function setStatus(statusId, done) {
    try {
      await update.mutateAsync({ id: payment.id, data: { statusId } });
      notify.success(done);
    } catch (err) {
      notify.error((err.errors ?? []).map((e) => e.message).join(', ') || err.message);
    }
    setDialog(null);
  }

  async function confirmDelete() {
    try {
      await remove.mutateAsync(payment.id);
      notify.success(`${payment.invoiceNumber} deleted`);
      navigate('/payments', { replace: true });
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
                  {payment.invoiceNumber}
                </Typography>
                <ConfigChip value={payment.status} />
                <OverdueChip payment={payment} />
              </Stack>
              <Typography color="text.secondary">
                {[company?.name, order?.orderNumber, payment.dueDate ? `Due ${formatDate(payment.dueDate)}` : null].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <PermissionGate permission={PERMISSIONS.PAYMENTS_UPDATE}>
                {!cancelled && payment.remainingAmount > 0 && (
                  <Button variant="contained" onClick={() => setDialog('receive')}>
                    Record payment
                  </Button>
                )}
                <Button variant="outlined" onClick={() => setDialog('edit')}>
                  Edit
                </Button>
                {cancelled
                  ? liveStatus && (
                      <Button variant="outlined" onClick={() => setStatus(liveStatus.id, 'Payment re-opened')} disabled={update.isPending}>
                        Re-open
                      </Button>
                    )
                  : cancelStatus && (
                      <Button variant="outlined" color="warning" onClick={() => setDialog('cancel')}>
                        Cancel payment
                      </Button>
                    )}
              </PermissionGate>
              <PermissionGate permission={PERMISSIONS.PAYMENTS_DELETE}>
                <Button variant="outlined" color="error" onClick={() => setDialog('delete')}>
                  Delete
                </Button>
              </PermissionGate>
            </Stack>
          </Stack>
          {cancelled && (
            <Alert severity="info" sx={{ mt: 2 }}>
              This payment is cancelled: it is left out of the totals and no longer counts against its order.
            </Alert>
          )}
        </CardContent>
      </Card>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tab}
          onChange={(event, value) => setSearchParams(value === 'overview' ? {} : { tab: value }, { replace: true })}
          aria-label="Payment sections"
        >
          {TABS.map((entry) => (
            <Tab key={entry.value} value={entry.value} label={entry.label} />
          ))}
        </Tabs>
      </Box>

      {tab === 'overview' && (
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}>
            <Metric label="Amount" value={formatMoney(payment.amount)} />
            <Metric label="Paid" value={formatMoney(payment.paidAmount)} color="success.main" />
            <Metric label="Remaining" value={formatMoney(payment.remainingAmount)} color={payment.remainingAmount > 0 ? 'warning.main' : undefined} />
          </Box>
          <LinearProgress variant="determinate" value={share} color="success" aria-label="Share of the amount paid" sx={{ height: 8, borderRadius: 4 }} />
          {payment.overpaidAmount > 0 && <Alert severity="info">Overpaid by {formatAmount(payment.overpaidAmount)}.</Alert>}

          <Card>
            <CardContent>
              <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' } }}>
                <Field label="Company">{company && linked(can(PERMISSIONS.COMPANIES_READ), `/companies/${company.id}`, company.name)}</Field>
                <Field label="Customer">
                  {customer && linked(can(PERMISSIONS.CUSTOMERS_READ), `/customers/${customer.id}`, customer.customerNumber)}
                </Field>
                <Field label="Order">
                  {order && linked(can(PERMISSIONS.ORDERS_READ), `/orders/${order.id}`, `${order.orderNumber} (${formatAmount(order.grandTotal)})`)}
                </Field>
                <Field label="Payment method">{payment.paymentMethod?.name}</Field>
                <Field label="Due date">{payment.dueDate ? formatDate(payment.dueDate) : ''}</Field>
                <Field label="Payment date">{payment.paymentDate ? formatDate(payment.paymentDate) : ''}</Field>
                <Field label="Created by">{payment.createdByUser?.fullName}</Field>
                <Field label="Last updated">{formatDateTime(payment.updatedAt)}</Field>
                <Box sx={{ gridColumn: '1 / -1' }}>
                  <Field label="Notes">{payment.notes}</Field>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Stack>
      )}
      {tab === 'documents' && (
        <Card>
          <CardContent>
            <DocumentList entityType="payment" entityId={payment.id} />
          </CardContent>
        </Card>
      )}
      {tab === 'timeline' && (
        <Card>
          <CardContent>
            <PaymentHistory paymentId={payment.id} />
          </CardContent>
        </Card>
      )}

      {dialog === 'edit' && <PaymentDialog payment={payment} onClose={() => setDialog(null)} />}
      {dialog === 'receive' && <ReceivePaymentDialog payment={payment} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'cancel'}
        title="Cancel payment"
        confirmLabel="Cancel payment"
        confirmColor="warning"
        loading={update.isPending}
        onConfirm={() => setStatus(cancelStatus.id, 'Payment cancelled')}
        onClose={() => setDialog(null)}
      >
        {`${payment.invoiceNumber} will be marked as not to be collected. It can be re-opened later.`}
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Delete payment"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDialog(null)}
      >
        {`${payment.invoiceNumber} will be removed from the CRM. Its invoice number cannot be used again.`}
      </ConfirmDialog>
    </Stack>
  );
}
