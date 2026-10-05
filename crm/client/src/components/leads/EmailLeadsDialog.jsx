import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLeadMutations } from '../../hooks/useLeads.js';
import useNotify from '../../hooks/useNotify.js';

// What a message may contain; each is filled in for every recipient by the server.
const PLACEHOLDERS = ['greeting', 'contactName', 'companyName', 'leadTitle', 'leadNumber', 'senderCompany'];

// One email, written once, to the contacts of the selected leads. Each person
// gets their own copy (nobody sees the others' addresses). Afterwards it says
// who got it, and who did not and why.
export default function EmailLeadsDialog({ open, ids, onClose, onSent }) {
  const { t } = useTranslation();
  const notify = useNotify();
  const { email } = useLeadMutations();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [result, setResult] = useState(null);
  const messageRef = useRef(null);
  // Where the cursor was in the message when it was last there (null = the end).
  const caret = useRef(null);

  function reset() {
    setSubject('');
    setMessage('');
    setErrors({});
    setResult(null);
    caret.current = null;
  }
  function close() {
    if (email.isPending) return;
    if (result) onSent?.();
    reset();
    onClose();
  }

  // Puts {{name}} where the cursor was in the message - at the end if it never was.
  function insert(name) {
    const token = `{{${name}}}`;
    const at = caret.current ?? message.length;
    setMessage((current) => current.slice(0, at) + token + current.slice(at));
    caret.current = at + token.length;
    requestAnimationFrame(() => messageRef.current?.focus());
  }

  async function send() {
    const missing = { ...(subject.trim() ? {} : { subject: t('bulkEmail.required') }), ...(message.trim() ? {} : { message: t('bulkEmail.required') }) };
    setErrors(missing);
    if (Object.keys(missing).length) return;
    try {
      const response = await email.mutateAsync({ leadIds: ids, subject: subject.trim(), message: message.trim() });
      const data = response.data;
      setResult(data);
      if (data.summary.sent) notify.success(t('bulkEmail.sent', { count: data.summary.sent }));
    } catch (error) {
      const fields = Object.fromEntries((error.errors ?? []).map((e) => [e.field, e.message]));
      setErrors(fields);
      if (!fields.subject && !fields.message) notify.error(error.message);
    }
  }

  const problems = result ? [...result.skipped, ...result.failed] : [];

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth aria-labelledby="email-leads-title">
      <DialogTitle id="email-leads-title">{result ? t('bulkEmail.resultTitle') : t('bulkEmail.title', { count: ids.length })}</DialogTitle>
      <DialogContent>
        {result ? (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity={result.summary.sent ? (problems.length ? 'warning' : 'success') : 'error'}>
              {t('bulkEmail.summary', { sent: result.summary.sent, requested: result.summary.requested })}
            </Alert>
            {problems.length > 0 && (
              <Box>
                <Typography variant="subtitle2">{t('bulkEmail.notSent')}</Typography>
                <List dense>
                  {problems.map((item) => (
                    <ListItem key={item.leadId} disableGutters>
                      <ListItemText primary={item.leadNumber ? `${item.leadNumber} – ${item.title}` : item.leadId} secondary={item.reason} />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </Stack>
        ) : (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('bulkEmail.intro')}
            </Typography>
            <TextField label={t('bulkEmail.subject')} value={subject} onChange={(event) => setSubject(event.target.value)} error={Boolean(errors.subject)} helperText={errors.subject} required />
            <TextField
              label={t('bulkEmail.message')}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onSelect={(event) => (caret.current = event.target.selectionStart)}
              error={Boolean(errors.message)}
              helperText={errors.message ?? t('bulkEmail.messageHint')}
              inputRef={messageRef}
              multiline
              minRows={8}
              required
            />
            <Box>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 0.5 }}>
                {t('bulkEmail.insert')}
              </Typography>
              <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {PLACEHOLDERS.map((name) => (
                  <Chip key={name} size="small" variant="outlined" label={`{{${name}}}`} onClick={() => insert(name)} />
                ))}
              </Stack>
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {result ? (
          <Button variant="contained" onClick={close}>
            {t('actions.done')}
          </Button>
        ) : (
          <>
            <Button onClick={close} disabled={email.isPending}>
              {t('actions.cancel')}
            </Button>
            <Button variant="contained" onClick={send} loading={email.isPending}>
              {t('bulkEmail.send', { count: ids.length })}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
