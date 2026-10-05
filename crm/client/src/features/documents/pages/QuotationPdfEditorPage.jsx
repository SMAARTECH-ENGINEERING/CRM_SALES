import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DOCUMENT_CONFIG } from '../../../api/leadConfig.api.js';
import { getQuotationPdf } from '../../../api/quotations.api.js';
import LeadConfigSelect from '../../../components/leads/LeadConfigSelect.jsx';
import LoadingState from '../../../components/ui/LoadingState.jsx';
import useAuth from '../../../hooks/useAuth.js';
import { useDocumentMutations } from '../../../hooks/useDocuments.js';
import useNotify from '../../../hooks/useNotify.js';
import { useQuotation } from '../../../hooks/useQuotations.js';
import PdfEditor from '../editor/PdfEditor.jsx';
import { MIME } from '../lib/fileKinds.js';

// Name, type and status for the edited quotation PDF, asked once - when it is
// first attached to the quotation.
function AttachDialog({ defaultName, onDone, onCancel }) {
  const [name, setName] = useState(defaultName);
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [statusId, setStatusId] = useState('');
  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>Attach to the quotation</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required autoFocus slotProps={{ input: { endAdornment: <InputAdornment position="end">.pdf</InputAdornment> } }} />
          <LeadConfigSelect list={DOCUMENT_CONFIG.TYPES} label="Document type" value={documentTypeId} onChange={setDocumentTypeId} />
          <LeadConfigSelect list={DOCUMENT_CONFIG.STATUSES} label="Status" value={statusId} onChange={setStatusId} selectDefault />
          <Alert severity="info">It is saved in the quotation&apos;s Documents. Saving again adds a new version; earlier ones are kept.</Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="contained" disabled={!name.trim()} onClick={() => onDone({ fileName: `${name.trim().replace(/\.pdf$/i, '')}.pdf`, documentTypeId, statusId })}>
          Attach
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// /quotations/:id/edit-pdf - the quotation's PDF, as the CRM makes it, in the
// PDF editor: change text, add the logo and a signature, then attach the
// result to the quotation (and print or download it).
export default function QuotationPdfEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useAuth();
  const quotation = useQuotation(id);
  const { upload, saveVersion } = useDocumentMutations();
  const [attached, setAttached] = useState(null);
  const [asking, setAsking] = useState(null);
  const pending = useRef(null);
  const number = quotation.data?.quotationNumber;

  // The PDF made once for this visit.
  const pdf = useQuery({
    queryKey: ['quotations', 'pdf-for-editing', id],
    queryFn: async () => new Uint8Array(await (await getQuotationPdf(id)).arrayBuffer()),
    enabled: Boolean(number),
    staleTime: Infinity,
    gcTime: 0,
  });
  const file = useMemo(() => (pdf.data && number ? { fileName: `${number}.pdf`, fileType: MIME.pdf, bytes: pdf.data } : null), [pdf.data, number]);

  const back = () => navigate(`/quotations/${id}?tab=documents`);
  const askDetails = () =>
    new Promise((resolve, reject) => {
      pending.current = { resolve, reject };
      setAsking(true);
    });

  async function save(bytes) {
    if (attached) {
      const response = await saveVersion.mutateAsync({ id: attached.id, file: new File([bytes], attached.fileName, { type: MIME.pdf }), note: 'Edited in the PDF editor' });
      setAttached(response.data.document);
      notify.success(`Saved as version ${response.data.document.version} in ${number}`);
      return;
    }
    const details = await askDetails();
    const response = await upload.mutateAsync({ entityType: 'quotation', entityId: id, files: [new File([bytes], details.fileName, { type: MIME.pdf })], documentTypeId: details.documentTypeId, statusId: details.statusId });
    const [document] = response.data.documents;
    setAttached(document);
    notify.success(`${document.fileName} attached to ${number}`);
  }

  if (quotation.error || pdf.error) {
    return (
      <Stack spacing={2}>
        <Alert severity="error">{(quotation.error ?? pdf.error).message}</Alert>
        <Button onClick={back} sx={{ alignSelf: 'flex-start' }}>
          Back to the quotation
        </Button>
      </Stack>
    );
  }
  if (!file) return <LoadingState />;

  return (
    <>
      <PdfEditor
        file={file}
        user={{ id: user?.id, fullName: user?.fullName ?? [user?.firstName, user?.lastName].filter(Boolean).join(' ') }}
        saveLabel={attached ? 'Save new version' : 'Attach to quotation'}
        onSave={save}
        onClose={back}
      />
      {asking && (
        <AttachDialog
          defaultName={number}
          onCancel={() => {
            setAsking(false);
            pending.current?.reject(new Error('Not attached - nothing was saved.'));
          }}
          onDone={(details) => {
            setAsking(false);
            pending.current?.resolve(details);
          }}
        />
      )}
    </>
  );
}
