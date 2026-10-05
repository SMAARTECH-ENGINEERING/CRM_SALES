import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LoadingState from '../../../components/ui/LoadingState.jsx';
import useAuth from '../../../hooks/useAuth.js';
import { useDocument, useDocumentFile } from '../../../hooks/useDocuments.js';
import usePermission from '../../../hooks/usePermission.js';
import { PERMISSIONS } from '../../../utils/permissions.js';
import PdfEditor from '../editor/PdfEditor.jsx';
import SheetEditor from '../editor/SheetEditor.jsx';
import { CAN, kindOf, MIME } from '../lib/fileKinds.js';
import useSaveOutput from '../useSaveOutput.js';

// /documents/:id/edit - the PDF editor or the spreadsheet editor, for the
// document's current version. Saving adds a new version; the earlier one is kept.
export default function DocumentEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermission();
  const document = useDocument(id);
  const file = useDocumentFile(id, { version: document.data?.version, enabled: Boolean(document.data) });
  const save = useSaveOutput(document.data ?? {});
  const doc = document.data;
  // The bytes the editor starts from: fixed for this visit, not replaced by each save.
  const loaded = useMemo(() => (file.data && doc ? { fileName: doc.fileName, fileType: doc.fileType, bytes: file.data.bytes } : null), [file.data, doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => navigate(`/documents/${id}`);
  const problem = document.error?.message ?? file.error?.message ?? (doc && !can(PERMISSIONS.DOCUMENTS_UPDATE) ? 'You do not have permission to edit documents.' : null);
  if (problem) {
    return (
      <Stack spacing={2}>
        <Alert severity="warning">{problem}</Alert>
        <Button onClick={back} sx={{ alignSelf: 'flex-start' }}>
          Back to the document
        </Button>
      </Stack>
    );
  }
  if (!loaded) return <LoadingState />;

  const kind = kindOf(doc);
  const person = { id: user?.id, fullName: user?.fullName ?? [user?.firstName, user?.lastName].filter(Boolean).join(' ') };
  if (CAN.editPdf(kind)) {
    return (
      <PdfEditor
        file={loaded}
        user={person}
        documentId={doc.id}
        saveLabel="Save new version"
        onSave={(bytes, { fileName, note }) => save.asVersion(bytes, { fileName, note, type: MIME.pdf })}
        onSaveAs={async (bytes, fileName) => {
          const created = await save.asNew(bytes, fileName, MIME.pdf);
          navigate(`/documents/${created.id}`);
        }}
        onSaveParts={(parts) => save.asNewMany(parts.map((p) => ({ ...p, type: MIME.pdf })))}
        onClose={back}
      />
    );
  }
  if (CAN.editSheet(kind)) {
    return (
      <SheetEditor
        file={loaded}
        saveLabel="Save new version"
        onSave={(bytes, { fileName, note }) => save.asVersion(bytes, { fileName, note, type: MIME.xlsx })}
        onSaveAs={async (bytes, fileName) => {
          const created = await save.asNew(bytes, fileName, MIME.xlsx);
          navigate(`/documents/${created.id}`);
        }}
        onSavePdf={(bytes, fileName) => save.asNew(bytes, fileName, MIME.pdf)}
        onClose={back}
      />
    );
  }
  return (
    <Stack spacing={2}>
      <Alert severity="info">This kind of file cannot be edited in the CRM. Download it to edit it in its own program, then upload it as a new version.</Alert>
      <Button onClick={back} sx={{ alignSelf: 'flex-start' }}>
        Back to the document
      </Button>
    </Stack>
  );
}
