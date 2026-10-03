import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { PAYMENT_CONFIG } from '../../api/leadConfig.api.js';
import useNotify from '../../hooks/useNotify.js';
import { usePaymentMutations } from '../../hooks/usePayments.js';
import { formatAmount, toDateInput } from '../../utils/format.js';
import LeadConfigSelect from '../leads/LeadConfigSelect.jsx';

// Records money received against a payment. Only the amount received is sent:
// the API adds it to what was paid, works out what remains and sets the status.
export default function ReceivePaymentDialog({ payment, onClose }) {
  const notify = useNotify();
  const { update } = usePaymentMutations();
  const [received, setReceived] = useState('');
  const [paymentDate, setPaymentDate] = useState(toDateInput(new Date()));
  const [paymentMethodId, setPaymentMethodId] = useState(payment.paymentMethodId ?? '');
  const [error, setError] = useState(null);

  async function save() {
    setError(null);
    if (received === '' || Number(received) <= 0) {
      setError('Enter the amount received');
      return;
    }
    try {
      const response = await update.mutateAsync({
        id: payment.id,
        data: { receivedAmount: Number(received), paymentDate: paymentDate || null, paymentMethodId: paymentMethodId || null },
      });
      const updated = response.data.payment;
      notify.success(`Recorded. ${formatAmount(updated.remainingAmount)} remaining on ${updated.invoiceNumber}`);
      onClose();
    } catch (err) {
      setError((err.errors ?? []).map((e) => e.message).join(', ') || err.message);
    }
  }

  return (
    <Dialog open onClose={update.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Record payment on {payment.invoiceNumber}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Alert severity="info">Outstanding: {formatAmount(payment.remainingAmount)}</Alert>
          <TextField
            label="Amount received"
            type="number"
            required
            autoFocus
            value={received}
            onChange={(event) => setReceived(event.target.value)}
            slotProps={{ htmlInput: { min: 0, step: 'any' } }}
          />
          <TextField
            label="Payment date"
            type="date"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <LeadConfigSelect
            list={PAYMENT_CONFIG.METHODS}
            label="Payment method"
            value={paymentMethodId}
            current={payment.paymentMethod}
            onChange={setPaymentMethodId}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={update.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} loading={update.isPending}>
          Record
        </Button>
      </DialogActions>
    </Dialog>
  );
}
