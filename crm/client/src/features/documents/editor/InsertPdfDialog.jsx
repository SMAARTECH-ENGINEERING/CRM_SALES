import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import { useEffect, useState } from 'react';
import { downloadDocument } from '../../../api/documents.api.js';
import { useDocumentsList } from '../../../hooks/useDocuments.js';
import { SEARCH_DEBOUNCE_MS } from '../../../hooks/useListParams.js';
import { formatDateTime } from '../../../utils/format.js';

// Another PDF to insert (merge): from this computer, or one of the CRM's documents.
// onPick({ bytes, fileName }).
export default function InsertPdfDialog({ onPick, onClose, excludeId }) {
  const [tab, setTab] = useState('computer');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const list = useDocumentsList({ kind: 'pdf', limit: 20, sortBy: 'updatedAt', sortOrder: 'desc', ...(search ? { search } : {}) }, { enabled: tab === 'crm' });

  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  async function pickDocument(document) {
    setBusy(true);
    setError(null);
    try {
      const blob = await downloadDocument(document.id);
      onPick({ bytes: new Uint8Array(await blob.arrayBuffer()), fileName: document.fileName });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Insert pages from another PDF</DialogTitle>
      <DialogContent>
        <Tabs value={tab} onChange={(e, value) => setTab(value)} sx={{ mb: 2 }}>
          <Tab value="computer" label="From this computer" />
          <Tab value="crm" label="From documents" />
        </Tabs>
        {tab === 'computer' ? (
          <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
            <Button component="label" variant="contained">
              Choose a PDF
              <input
                type="file"
                hidden
                accept="application/pdf,.pdf"
                onChange={async (event) => {
                  const [file] = event.target.files;
                  if (file) onPick({ bytes: new Uint8Array(await file.arrayBuffer()), fileName: file.name });
                }}
              />
            </Button>
            <Alert severity="info">Its pages are added after the current page. Nothing is saved until you save.</Alert>
          </Stack>
        ) : (
          <Stack spacing={1}>
            <TextField size="small" label="Search" value={input} onChange={(e) => setInput(e.target.value)} autoFocus placeholder="File name, record or company" />
            {list.error && <Alert severity="error">{list.error.message}</Alert>}
            <List dense sx={{ maxHeight: 320, overflowY: 'auto' }}>
              {(list.data?.documents ?? [])
                .filter((d) => d.id !== excludeId)
                .map((document) => (
                  <ListItemButton key={document.id} onClick={() => pickDocument(document)} disabled={busy}>
                    <ListItemText primary={document.fileName} secondary={[document.relatedLabel, formatDateTime(document.updatedAt)].filter(Boolean).join(' · ')} />
                  </ListItemButton>
                ))}
              {list.data?.documents.length === 0 && <Alert severity="info">No PDF documents found.</Alert>}
            </List>
          </Stack>
        )}
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}
