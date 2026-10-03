import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PAYMENT_CONFIG } from '../../api/leadConfig.api.js';
import useNotify from '../../hooks/useNotify.js';
import { usePaymentMutations } from '../../hooks/usePayments.js';
import { toDateInput } from '../../utils/format.js';
import CompanySelect from '../companies/CompanySelect.jsx';
import LeadConfigSelect from '../leads/LeadConfigSelect.jsx';
import OrderSelect from '../orders/OrderSelect.jsx';

const FULL = { gridColumn: '1 / -1' };

// Creates a payment record (no `payment`) or edits one. There is no
// "remaining" field: the API works it out from the amount and what was paid,
// and sets the status from them. Mount it only while open.
export default function PaymentDialog({ payment, initial = {}, onClose }) {
  const isCreate = !payment;
  const navigate = useNavigate();
  const notify = useNotify();
  const { create, update } = usePaymentMutations();
  const [values, setValues] = useState({
    invoiceNumber: '',
    companyId: payment?.companyId ?? initial.companyId ?? '',
    orderId: payment?.orderId ?? initial.orderId ?? '',
    amount: payment?.amount ?? '',
    paidAmount: payment?.paidAmount ?? '',
    dueDate: toDateInput(payment?.dueDate),
    paymentDate: toDateInput(payment?.paymentDate),
    paymentMethodId: payment?.paymentMethodId ?? '',
    notes: payment?.notes ?? '',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const set = (field) => (value) => setValues((current) => ({ ...current, [field]: value }));
  const pending = create.isPending || update.isPending;

  function check() {
    const found = {};
    if (isCreate && !values.companyId) found.companyId = 'Choose a company';
    if (values.amount === '' || Number(values.amount) <= 0) found.amount = 'Enter an amount greater than 0';
    if (values.paidAmount !== '' && Number(values.paidAmount) < 0) found.paidAmount = 'Must be 0 or more';
    return found;
  }

  async function save() {
    setError(null);
    const found = check();
    setErrors(found);
    if (Object.keys(found).length) return;

    const data = {
      orderId: values.orderId || null,
      amount: Number(values.amount),
      paidAmount: values.paidAmount === '' ? 0 : Number(values.paidAmount),
      dueDate: values.dueDate || null,
      paymentDate: values.paymentDate || null,
      paymentMethodId: values.paymentMethodId || null,
      notes: values.notes,
    };
    try {
      if (isCreate) {
        const response = await create.mutateAsync({
          ...data,
          companyId: values.companyId,
          ...(values.invoiceNumber.trim() ? { invoiceNumber: values.invoiceNumber.trim() } : {}),
        });
        const created = response.data.payment;
        notify.success(`Payment ${created.invoiceNumber} created`);
        onClose();
        navigate(`/payments/${created.id}`);
      } else {
        await update.mutateAsync({ id: payment.id, data });
        notify.success('Payment updated');
        onClose();
      }
    } catch (err) {
      const fields = Object.fromEntries((err.errors ?? []).map((e) => [e.field.split('.')[0], e.message]));
      setErrors(fields);
      if (!Object.keys(fields).some((field) => field in values)) setError(err.message);
    }
  }

  const text = (field, label, props = {}) => (
    <TextField
      label={label}
      value={values[field]}
      onChange={(event) => set(field)(event.target.value)}
      error={Boolean(errors[field])}
      helperText={errors[field] ?? props.helperText}
      {...props}
    />
  );
  const date = (field, label, props = {}) =>
    text(field, label, { type: 'date', slotProps: { inputLabel: { shrink: true } }, ...props });
  const amount = (field, label, props = {}) =>
    text(field, label, { type: 'number', slotProps: { htmlInput: { min: 0, step: 'any' } }, ...props });

  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isCreate ? 'New payment' : `Edit ${payment.invoiceNumber}`}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gap: 2, pt: 1, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          {isCreate ? (
            <CompanySelect
              required
              value={values.companyId}
              onChange={(id) => setValues((current) => ({ ...current, companyId: id, orderId: '' }))}
              error={errors.companyId}
              helperText={errors.companyId ?? "Linked to the company's customer record automatically"}
            />
          ) : (
            <TextField label="Company" value={payment.company?.name ?? ''} disabled helperText="Fixed once the payment exists" />
          )}
          <OrderSelect
            companyId={values.companyId}
            value={values.orderId}
            onChange={set('orderId')}
            current={payment?.order}
            error={errors.orderId}
            helperText={errors.orderId ?? 'Optional: the order being paid for'}
          />
          {isCreate
            ? text('invoiceNumber', 'Invoice number', { helperText: 'Leave blank to generate one' })
            : text('invoiceNumber', 'Invoice number', { value: payment.invoiceNumber, disabled: true, helperText: 'Fixed' })}
          {date('dueDate', 'Due date')}
          {amount('amount', 'Amount', { required: true, helperText: 'What is to be collected' })}
          {amount('paidAmount', 'Paid so far', { helperText: 'The remaining amount and the status are worked out when you save' })}
          {date('paymentDate', 'Payment date', { helperText: 'When money was last received' })}
          {/* Methods are the configured list, from the API. */}
          <LeadConfigSelect
            list={PAYMENT_CONFIG.METHODS}
            label="Payment method"
            value={values.paymentMethodId}
            current={payment?.paymentMethod}
            onChange={set('paymentMethodId')}
            error={errors.paymentMethodId}
            helperText={errors.paymentMethodId}
          />
          {text('notes', 'Notes', { multiline: true, minRows: 3, sx: FULL })}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} loading={pending}>
          {isCreate ? 'Create payment' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
