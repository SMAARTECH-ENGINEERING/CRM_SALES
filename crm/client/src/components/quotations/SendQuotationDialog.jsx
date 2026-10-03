import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import useNotify from '../../hooks/useNotify.js';
import { useQuotationMutations } from '../../hooks/useQuotations.js';

// Emails the quotation with its PDF attached. If the server has no email
// configured, it only marks the quotation as sent - and says so.
// Mount it only while open.
export default function SendQuotationDialog({ quotation, onClose }) {
  const notify = useNotify();
  const { send } = useQuotationMutations();
  const [to, setTo] = useState(quotation.contact?.email ?? quotation.company?.email ?? '');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(null);

  async function submit() {
    setError(null);
    try {
      const response = await send.mutateAsync({
        id: quotation.id,
        data: { to: to.trim() || null, subject: subject.trim() || null, message: message.trim() || null },
      });
      const { email } = response.data;
      if (email.delivered) notify.success(`Emailed to ${email.to}`);
      else notify.success(response.message);
      onClose();
    } catch (err) {
      setError(err.errors?.[0]?.message ?? err.message);
    }
  }

  return (
    <Dialog open onClose={send.isPending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Send {quotation.quotationNumber}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="To"
            type="email"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            helperText="Blank: the contact's email, else the company's"
          />
          <TextField
            label="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            placeholder={`Quotation ${quotation.quotationNumber}`}
            helperText="Blank: a subject naming the quotation and your company"
          />
          <TextField
            label="Message"
            multiline
            minRows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            helperText="Blank: a short standard message. The PDF is attached."
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={send.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} loading={send.isPending}>
          Send
        </Button>
      </DialogActions>
    </Dialog>
  );
}
