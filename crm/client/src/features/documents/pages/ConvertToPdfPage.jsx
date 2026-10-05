import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LoadingState from '../../../components/ui/LoadingState.jsx';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { useDocument, useDocumentFile } from '../../../hooks/useDocuments.js';
import usePermission from '../../../hooks/usePermission.js';
import { PERMISSIONS } from '../../../utils/permissions.js';
import PrintDialog from '../components/PrintDialog.jsx';
import { CAN, KIND, kindOf, MIME } from '../lib/fileKinds.js';
import { readSpreadsheet } from '../lib/spreadsheet.js';
import useSaveOutput from '../useSaveOutput.js';

// /documents/:id/to-pdf - a spreadsheet (or picture) as a PDF: which sheets,
// paper, orientation, margins, scaling, header and footer, page numbers,
// repeated header rows and gridlines - with a preview. The PDF can be
// downloaded, printed or saved as a new document of the same record.
export default function ConvertToPdfPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = usePermission();
  const document = useDocument(id);
  const doc = document.data;
  const file = useDocumentFile(id, { version: doc?.version, enabled: Boolean(doc) });
  const save = useSaveOutput(doc ?? {});
  const [sheets, setSheets] = useState(null);
  const [error, setError] = useState(null);
  const kind = doc ? kindOf(doc) : null;
  const isSheet = kind === KIND.EXCEL || kind === KIND.CSV;
  const loaded = useMemo(() => (file.data && doc ? { fileName: doc.fileName, fileType: doc.fileType, bytes: file.data.bytes } : null), [file.data, doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loaded || !isSheet) return;
    readSpreadsheet(loaded.bytes, loaded)
      .then(setSheets)
      .catch((err) => setError(`This spreadsheet could not be read: ${err.message}`));
  }, [loaded, isSheet]);

  const back = () => navigate(`/documents/${id}`);
  const problem = error ?? document.error?.message ?? file.error?.message ?? (doc && !CAN.toPdf(kind) ? 'Only spreadsheets and pictures can be converted to PDF here.' : null);

  return (
    <Stack spacing={2}>
      <PageHeader title="Convert to PDF" subtitle={doc?.fileName} back={`/documents/${id}`} />
      {problem ? (
        <Stack spacing={2}>
          <Alert severity="warning">{problem}</Alert>
          <Button onClick={back} sx={{ alignSelf: 'flex-start' }}>
            Back to the document
          </Button>
        </Stack>
      ) : !loaded || (isSheet && !sheets) ? (
        <LoadingState />
      ) : (
        <PrintDialog
          open
          title={`Convert ${doc.fileName} to PDF`}
          file={loaded}
          sheets={sheets ?? undefined}
          onSavePdf={
            can(PERMISSIONS.DOCUMENTS_CREATE)
              ? async (bytes, fileName) => {
                  const created = await save.asNew(bytes, fileName, MIME.pdf);
                  navigate(`/documents/${created.id}`);
                }
              : undefined
          }
          onClose={back}
        />
      )}
    </Stack>
  );
}
