import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ORDER_CONFIG } from '../../api/leadConfig.api.js';
import useNotify from '../../hooks/useNotify.js';
import { useOrderMutations } from '../../hooks/useOrders.js';
import { formatAmount } from '../../utils/format.js';
import LeadConfigSelect from '../leads/LeadConfigSelect.jsx';
import UserSelect from '../users/UserSelect.jsx';

const today = () => new Date().toISOString().slice(0, 10);

// Turns an accepted quotation into an order. The customer, lines and totals
// come from the quotation on the server; only scheduling details are asked for.
// Mount it only while open.
export default function CreateOrderDialog({ quotation, onClose }) {
  const navigate = useNavigate();
  const notify = useNotify();
  const { fromQuotation } = useOrderMutations();
  const [values, setValues] = useState({ orderDate: today(), deliveryDate: '', statusId: '', assignedTo: '', notes: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const set = (field) => (value) => setValues((current) => ({ ...current, [field]: value }));

  async function submit() {
    setError(null);
    setErrors({});
    if (values.deliveryDate && values.deliveryDate < values.orderDate) {
      setErrors({ deliveryDate: 'Must not be before the order date' });
      return;
    }
    const data = Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ''));
    try {
      const response = await fromQuotation.mutateAsync({ quotationId: quotation.id, data });
      const { order } = response.data;
      notify.success(`Order ${order.orderNumber} created`);
      onClose();
      navigate(`/orders/${order.id}`);
    } catch (err) {
      const fields = Object.fromEntries((err.errors ?? []).map((e) => [e.field, e.message]));
      setErrors(fields);
      if (!Object.keys(fields).some((field) => field in values)) setError(err.message);
    }
  }

  return (
    <Dialog open onClose={fromQuotation.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create order from {quotation.quotationNumber}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">
            The order takes the customer, products and prices of this quotation as accepted - grand total{' '}
            {formatAmount(quotation.grandTotal)}.
          </Alert>
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
              helperText={errors.deliveryDate ?? 'Optional'}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
          </Stack>
          <LeadConfigSelect
            list={ORDER_CONFIG.STATUSES}
            label="Status"
            required
            selectDefault
            value={values.statusId}
            onChange={set('statusId')}
            error={errors.statusId}
            helperText={errors.statusId}
          />
          <UserSelect
            label="Assigned to"
            value={values.assignedTo}
            onChange={set('assignedTo')}
            error={errors.assignedTo}
            helperText={errors.assignedTo}
          />
          <TextField
            label="Notes"
            multiline
            minRows={2}
            value={values.notes}
            onChange={(event) => set('notes')(event.target.value)}
            helperText="Blank: the quotation's notes"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={fromQuotation.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} loading={fromQuotation.isPending}>
          Create order
        </Button>
      </DialogActions>
    </Dialog>
  );
}
