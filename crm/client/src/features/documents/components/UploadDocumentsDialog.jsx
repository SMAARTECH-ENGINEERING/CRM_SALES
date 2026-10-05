import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import { useState } from 'react';
import { DOCUMENT_CONFIG } from '../../../api/leadConfig.api.js';
import FileUploader from '../../../components/documents/FileUploader.jsx';
import LeadConfigSelect from '../../../components/leads/LeadConfigSelect.jsx';
import { useDocumentConfig, useDocumentMutations } from '../../../hooks/useDocuments.js';
import useNotify from '../../../hooks/useNotify.js';
import RecordPicker from './RecordPicker.jsx';

// Uploads files from the Documents page: choose the record they belong to,
// what they are and their status, then pick or drop the files.
//
//   <UploadDocumentsDialog open files={dropped} onClose={...} />
//
// `record`: { type, id, title } to attach to a fixed record (no picker).
export default function UploadDocumentsDialog({ open, onClose, files, record: fixedRecord }) {
  const notify = useNotify();
  const config = useDocumentConfig({ enabled: open });
  const { upload } = useDocumentMutations();
  const [record, setRecord] = useState(fixedRecord ?? null);
  const [documentTypeId, setDocumentTypeId] = useState('');
  const [statusId, setStatusId] = useState('');

  return (
    <Dialog open={open} onClose={upload.isPending ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Upload documents</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {!fixedRecord && <RecordPicker value={record} onChange={setRecord} entityTypes={config.data?.entityTypes} required autoFocus />}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <LeadConfigSelect list={DOCUMENT_CONFIG.TYPES} label="Document type" value={documentTypeId} onChange={setDocumentTypeId} sx={{ flex: 1 }} />
            <LeadConfigSelect list={DOCUMENT_CONFIG.STATUSES} label="Status" value={statusId} onChange={setStatusId} selectDefault sx={{ flex: 1 }} />
          </Stack>
          <FileUploader
            rules={config.data}
            initialFiles={files}
            ready={Boolean(record)}
            hint={record ? undefined : 'Choose the record first'}
            onUpload={async (picked, { onProgress }) => {
              const response = await upload.mutateAsync({
                entityType: record.type,
                entityId: record.id,
                files: picked,
                field: config.data?.field,
                documentTypeId,
                statusId,
                onProgress,
              });
              notify.success(`${response.data.documents.length} document(s) uploaded to ${record.title}`);
              onClose(response.data.documents);
            }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose()} disabled={upload.isPending}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
