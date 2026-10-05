import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { KIND, kindOf } from '../lib/fileKinds.js';
import { printableHtml, wordToHtml } from '../lib/printJob.js';
import { readSpreadsheet } from '../lib/spreadsheet.js';
import PdfViewer from './PdfViewer.jsx';

const SheetView = lazy(() => import('./SheetView.jsx'));

const Loading = ({ label }) => (
  <Stack sx={{ alignItems: 'center', py: 8 }}>
    <CircularProgress aria-label={label} />
  </Stack>
);

function SheetPreview({ file, onSheets }) {
  const [sheets, setSheets] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    readSpreadsheet(file.bytes, file)
      .then((data) => {
        if (cancelled) return;
        setSheets(data);
        onSheets?.(data);
      })
      .catch((err) => !cancelled && setError(`This spreadsheet could not be read: ${err.message}`));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!sheets) return <Loading label="Reading the spreadsheet" />;
  return (
    <Suspense fallback={<Loading label="Loading the spreadsheet view" />}>
      <SheetView data={sheets} />
    </Suspense>
  );
}

// Word (.docx) as HTML in a frame that cannot run scripts or load anything.
function WordPreview({ file }) {
  const [state, setState] = useState({});
  useEffect(() => {
    let cancelled = false;
    if (/\.doc$/i.test(file.fileName)) {
      setState({ error: 'Old Word files (.doc) cannot be shown in the browser. Download it to open it, or save it as .docx and upload that as a new version.' });
      return undefined;
    }
    wordToHtml(file.bytes)
      .then(({ html, warnings }) => !cancelled && setState({ html: printableHtml(html, { margins: 'none' }, file.fileName), warnings }))
      .catch((err) => !cancelled && setState({ error: `This Word file could not be read: ${err.message}` }));
    return () => {
      cancelled = true;
    };
  }, [file]);
  if (state.error) return <Alert severity="warning">{state.error}</Alert>;
  if (!state.html) return <Loading label="Reading the Word file" />;
  return (
    <Stack sx={{ height: '100%' }} spacing={1}>
      <Alert severity="info" sx={{ flexShrink: 0 }}>
        A preview of the text, tables and pictures. Page layout, headers and footers are shown in Word itself.
      </Alert>
      <Box component="iframe" title={file.fileName} sandbox="" srcDoc={state.html} sx={{ flex: 1, border: 1, borderColor: 'divider', bgcolor: '#fff', width: '100%', minHeight: 400 }} />
    </Stack>
  );
}

function ImagePreview({ file }) {
  const url = useMemo(() => URL.createObjectURL(new Blob([file.bytes], { type: file.fileType })), [file]);
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <Box sx={{ overflow: 'auto', height: '100%', bgcolor: 'action.hover', p: 2, textAlign: 'center' }}>
      <Box
        component="img"
        src={url}
        alt={file.fileName}
        onClick={() => setZoomed((v) => !v)}
        sx={{ maxWidth: zoomed ? 'none' : '100%', maxHeight: zoomed ? 'none' : '100%', cursor: zoomed ? 'zoom-out' : 'zoom-in', boxShadow: 2, bgcolor: '#fff' }}
      />
    </Box>
  );
}

function TextPreview({ file }) {
  const text = useMemo(() => new TextDecoder().decode(file.bytes), [file]);
  return (
    <Box component="pre" sx={{ m: 0, p: 2, height: '100%', overflow: 'auto', fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap', bgcolor: 'background.paper' }}>
      {text}
    </Box>
  );
}

// Shows any file the CRM can show: PDF, spreadsheet, Word, image or text.
//   file: { fileName, fileType, bytes }
//   onPageChange(index): the PDF page in view;  onSheets(sheets): the spreadsheet as read
export default function FilePreview({ file, onPageChange, onSheets }) {
  const kind = kindOf(file);
  if (kind === KIND.PDF) return <PdfViewer bytes={file.bytes} onPageChange={onPageChange} />;
  if (kind === KIND.EXCEL || kind === KIND.CSV) return <SheetPreview file={file} onSheets={onSheets} />;
  if (kind === KIND.WORD) return <WordPreview file={file} />;
  if (kind === KIND.IMAGE) return <ImagePreview file={file} />;
  if (kind === KIND.TEXT) return <TextPreview file={file} />;
  return <Alert severity="info">This type of file cannot be shown in the browser. Use Download to open it.</Alert>;
}
