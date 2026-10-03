import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ORDER_CONFIG } from '../api/leadConfig.api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ContactSelect from '../components/contacts/ContactSelect.jsx';
import EventTimeline, { TIMELINE_PAGE_SIZE } from '../components/EventTimeline.jsx';
import ConfigChip from '../components/leads/ConfigChip.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import RecordPayments from '../components/payments/RecordPayments.jsx';
import LineItemsTable from '../components/quotations/LineItemsTable.jsx';
import UserSelect from '../components/users/UserSelect.jsx';
import useNotify from '../hooks/useNotify.js';
import { useOrder, useOrderMutations, useOrderTimeline } from '../hooks/useOrders.js';
import usePermission from '../hooks/usePermission.js';
import { EMPTY, formatAmount, formatDate, formatDateTime, toDateInput } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';
import DocumentList from '../components/documents/DocumentList.jsx';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'payments', label: 'Payments' },
  { value: 'documents', label: 'Documents' },
  { value: 'timeline', label: 'Timeline' },
];
// Completed and cancelled orders are locked (the API refuses edits).
const LOCKED = ['completed', 'cancelled'];

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

// Edits the scheduling details. Lines and prices are those agreed; the API
// accepts new lines too, but this screen does not change them.
function EditOrderDialog({ order, onClose }) {
  const notify = useNotify();
  const { update } = useOrderMutations();
  const [values, setValues] = useState({
    orderDate: toDateInput(order.orderDate),
    deliveryDate: toDateInput(order.deliveryDate),
    contactId: order.contactId ?? '',
    assignedTo: order.assignedTo ?? '',
    notes: order.notes ?? '',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const set = (field) => (value) => setValues((current) => ({ ...current, [field]: value }));

  async function save() {
    setError(null);
    setErrors({});
    if (values.deliveryDate && values.orderDate && values.deliveryDate < values.orderDate) {
      setErrors({ deliveryDate: 'Must not be before the order date' });
      return;
    }
    try {
      await update.mutateAsync({
        id: order.id,
        data: {
          orderDate: values.orderDate || undefined,
          deliveryDate: values.deliveryDate || null,
          contactId: values.contactId || null,
          assignedTo: values.assignedTo || null,
          notes: values.notes,
        },
      });
      notify.success('Order updated');
      onClose();
    } catch (err) {
      const fields = Object.fromEntries((err.errors ?? []).map((e) => [e.field, e.message]));
      setErrors(fields);
      if (!Object.keys(fields).some((field) => field in values)) setError(err.message);
    }
  }

  return (
    <Dialog open onClose={update.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit {order.orderNumber}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              type="date"
              label="Order date"
              value={values.orderDate}
              onChange={(event) => set('orderDate')(event.target.value)}
              error={Boolean(errors.orderDate)}
              helperText={errors.orderDate}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              type="date"
              label="Delivery date"
              value={values.deliveryDate}
              onChange={(event) => set('deliveryDate')(event.target.value)}
              error={Boolean(errors.deliveryDate)}
              helperText={errors.deliveryDate}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
          </Stack>
          <ContactSelect
            companyId={order.companyId}
            value={values.contactId}
            onChange={set('contactId')}
            current={order.contact}
            error={errors.contactId}
            helperText={errors.contactId}
          />
          <UserSelect
            label="Assigned to"
            value={values.assignedTo}
            onChange={set('assignedTo')}
            current={order.assignedToUser}
            error={errors.assignedTo}
            helperText={errors.assignedTo}
          />
          <TextField
            label="Notes"
            multiline
            minRows={3}
            value={values.notes}
            onChange={(event) => set('notes')(event.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} loading={update.isPending}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function OrderHistory({ orderId }) {
  const [page, setPage] = useState(1);
  const query = useOrderTimeline(orderId, { page, limit: TIMELINE_PAGE_SIZE });
  return <EventTimeline query={query} page={page} onPageChange={setPage} />;
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  // null | 'edit' | 'delete'
  const [dialog, setDialog] = useState(null);
  const { changeStatus, remove } = useOrderMutations();
  const { data: order, error, isPending, refetch } = useOrder(id);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/orders'));
  const backButton = (
    <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ alignSelf: 'flex-start' }}>
      Back to orders
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
  const locked = LOCKED.includes(order.status?.category);
  const { company, contact, quotation } = order;

  async function setStatus(statusId) {
    if (!statusId || statusId === order.statusId) return;
    try {
      const response = await changeStatus.mutateAsync({ id: order.id, statusId });
      notify.success(`Status changed to ${response.data.order.status.name}`);
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function confirmDelete() {
    try {
      await remove.mutateAsync(order.id);
      notify.success(`${order.orderNumber} deleted`);
      navigate('/orders', { replace: true });
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
                  {order.orderNumber}
                </Typography>
                <ConfigChip value={order.status} />
              </Stack>
              <Typography color="text.secondary">
                {[company?.name, contact?.fullName].filter(Boolean).join(' · ')}
                {' · '}
                Grand total {formatAmount(order.grandTotal)}
              </Typography>
            </Box>

            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, alignItems: 'center' }}>
              <PermissionGate permission={PERMISSIONS.ORDERS_UPDATE}>
                {/* The statuses are the configured ones, from the API. */}
                <LeadConfigSelect
                  list={ORDER_CONFIG.STATUSES}
                  label="Status"
                  required
                  value={order.statusId}
                  current={order.status}
                  onChange={setStatus}
                  disabled={changeStatus.isPending}
                  sx={{ minWidth: 170 }}
                />
                {!locked && (
                  <Button variant="contained" onClick={() => setDialog('edit')}>
                    Edit
                  </Button>
                )}
              </PermissionGate>
              <PermissionGate permission={PERMISSIONS.ORDERS_DELETE}>
                <Button variant="outlined" color="error" onClick={() => setDialog('delete')}>
                  Delete
                </Button>
              </PermissionGate>
            </Stack>
          </Stack>
          {locked && (
            <Alert severity="info" sx={{ mt: 2 }}>
              This order is {order.status.name.toLowerCase()}, so it cannot be edited. Change its status to edit it
              again.
            </Alert>
          )}
        </CardContent>
      </Card>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tab}
          onChange={(event, value) => setSearchParams(value === TABS[0].value ? {} : { tab: value }, { replace: true })}
          aria-label="Order sections"
        >
          {TABS.map((entry) => (
            <Tab key={entry.value} value={entry.value} label={entry.label} />
          ))}
        </Tabs>
      </Box>

      {tab === 'overview' && (
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
                <Field label="From quotation">
                  {quotation &&
                    linked(can(PERMISSIONS.QUOTATIONS_READ), `/quotations/${quotation.id}`, quotation.quotationNumber)}
                </Field>
                <Field label="Assigned to">{order.assignedToUser?.fullName}</Field>
                <Field label="Order date">{formatDate(order.orderDate)}</Field>
                <Field label="Delivery date">{order.deliveryDate ? formatDate(order.deliveryDate) : ''}</Field>
                <Field label="Created by">{order.createdByUser?.fullName}</Field>
                <Field label="Last updated">{formatDateTime(order.updatedAt)}</Field>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
                Products
              </Typography>
              <LineItemsTable document={order} label="Order lines" />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
                Notes
              </Typography>
              <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} color={order.notes ? 'text.primary' : 'text.secondary'}>
                {order.notes || 'No notes.'}
              </Typography>
            </CardContent>
          </Card>
        </Stack>
      )}
      {tab === 'payments' && (
        <Card>
          <CardContent>
            <RecordPayments filter={{ companyId: order.companyId, orderId: order.id }} />
          </CardContent>
        </Card>
      )}
      {tab === 'documents' && (
        <Card>
          <CardContent>
            <DocumentList entityType="order" entityId={order.id} />
          </CardContent>
        </Card>
      )}
      {tab === 'timeline' && (
        <Card>
          <CardContent>
            <OrderHistory orderId={order.id} />
          </CardContent>
        </Card>
      )}

      {dialog === 'edit' && <EditOrderDialog order={order} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Delete order"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDialog(null)}
      >
        {`${order.orderNumber} will be removed from the CRM.${quotation ? ` ${quotation.quotationNumber} can then be turned into an order again.` : ''}`}
      </ConfirmDialog>
    </Stack>
  );
}
