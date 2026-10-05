import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { DOCUMENT_CONFIG } from '../../../api/leadConfig.api.js';
import LeadConfigSelect from '../../../components/leads/LeadConfigSelect.jsx';
import { useDocumentMutations } from '../../../hooks/useDocuments.js';
import useNotify from '../../../hooks/useNotify.js';
import { baseName, extensionOf } from '../lib/fileKinds.js';

// Rename a document and set its type and status. The extension stays: the
// kind of file does not change with its name.
export default function DocumentDetailsDialog({ document, onClose }) {
  const notify = useNotify();
  const { update } = useDocumentMutations();
  const ext = extensionOf(document.fileName);
  const [name, setName] = useState(baseName(document.fileName));
  const [documentTypeId, setDocumentTypeId] = useState(document.documentType?.id ?? '');
  const [statusId, setStatusId] = useState(document.status?.id ?? '');

  async function save(event) {
    event.preventDefault();
    const fileName = ext ? `${name.trim()}.${ext}` : name.trim();
    const changes = {
      ...(fileName !== document.fileName ? { fileName } : {}),
      ...(documentTypeId !== (document.documentType?.id ?? '') ? { documentTypeId } : {}),
      ...(statusId !== (document.status?.id ?? '') ? { statusId } : {}),
    };
    if (!Object.keys(changes).length) return onClose();
    try {
      await update.mutateAsync({ id: document.id, ...changes });
      notify.success('Document updated');
      return onClose();
    } catch (err) {
      return notify.error(err.message);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" component="form" onSubmit={save}>
      <DialogTitle>Document details</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoFocus
            slotProps={{ htmlInput: { maxLength: 190 }, input: ext ? { endAdornment: <InputAdornment position="end">.{ext}</InputAdornment> } : undefined }}
          />
          <LeadConfigSelect list={DOCUMENT_CONFIG.TYPES} label="Document type" value={documentTypeId} onChange={setDocumentTypeId} current={document.documentType} />
          <LeadConfigSelect list={DOCUMENT_CONFIG.STATUSES} label="Status" value={statusId} onChange={setStatusId} current={document.status} emptyLabel="Default status" />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="contained" loading={update.isPending} disabled={!name.trim()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
