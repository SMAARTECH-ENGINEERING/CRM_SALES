import DocumentScannerOutlinedIcon from '@mui/icons-material/DocumentScannerOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import PlayArrowOutlinedIcon from '@mui/icons-material/PlayArrowOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LoadingState from '../../../components/ui/LoadingState.jsx';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { useDocument, useDocumentFile } from '../../../hooks/useDocuments.js';
import useNotify from '../../../hooks/useNotify.js';
import usePermission from '../../../hooks/usePermission.js';
import { saveBlob } from '../../../hooks/useQuotations.js';
import { PERMISSIONS } from '../../../utils/permissions.js';
import { baseName, CAN, kindOf, MIME } from '../lib/fileKinds.js';
import { parseRange } from '../lib/pdfLayout.js';
import { extractTables, rowsToSheet } from '../lib/pdfToSheet.js';
import { writeXlsx } from '../lib/spreadsheet.js';
import useSaveOutput from '../useSaveOutput.js';

const SheetView = lazy(() => import('../viewers/SheetView.jsx'));

// What OCR can read. The language data is downloaded the first time it is used.
const LANGUAGES = [
  { value: 'eng', label: 'English' },
  { value: 'eng+hin', label: 'English and Hindi' },
  { value: 'eng+ori', label: 'English and Odia' },
];

// /documents/:id/to-excel - the tables of a PDF as a spreadsheet, checked and
// corrected here before it is downloaded or saved as a new document.
export default function ConvertToExcelPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const document = useDocument(id);
  const doc = document.data;
  const file = useDocumentFile(id, { version: doc?.version, enabled: Boolean(doc) });
  const save = useSaveOutput(doc ?? {});
  const workbook = useRef(null);
  const [options, setOptions] = useState({ ocr: 'auto', language: 'eng', layout: 'perPage', pages: '' });
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const set = (changes) => setOptions((o) => ({ ...o, ...changes }));

  const sheets = useMemo(() => {
    if (!result) return null;
    const withRows = result.filter((page) => page.rows.length);
    if (!withRows.length) return null;
    if (options.layout === 'single') {
      const rows = withRows.flatMap((page, i) => (i ? [[], ...page.rows] : page.rows));
      return [rowsToSheet('Tables', rows)];
    }
    return withRows.map((page, i) => rowsToSheet(`Page ${page.number}`, page.rows, i));
  }, [result, options.layout]);

  async function run() {
    setError(null);
    setResult(null);
    let pages;
    try {
      pages = options.pages.trim() ? parseRange(options.pages, 5000).map((i) => i + 1) : undefined;
    } catch (err) {
      setError(err.message.replace(/outside 1-\d+/, 'not valid'));
      return;
    }
    setProgress({ status: 'Opening the PDF', page: 0, pages: 1 });
    try {
      const pagesOut = await extractTables(file.data.bytes, { ocr: options.ocr, language: options.language, pages, onProgress: setProgress });
      setResult(pagesOut);
      if (!pagesOut.some((p) => p.rows.length)) setError('No text was found in this PDF.');
    } catch (err) {
      setError(/fetch|network|load/i.test(err.message) && options.ocr !== 'off' ? `OCR could not start: ${err.message}. Reading scanned pages needs an internet connection the first time (to download the language data).` : err.message);
    } finally {
      setProgress(null);
    }
  }

  const current = () => workbook.current?.getAllSheets?.() ?? sheets;
  const xlsxName = `${baseName(doc?.fileName ?? 'converted')}.xlsx`;

  async function saveToDocuments() {
    setSaving(true);
    try {
      const created = await save.asNew(await writeXlsx(current()), xlsxName, MIME.xlsx);
      navigate(`/documents/${created.id}`);
    } catch (err) {
      notify.error((err.errors ?? []).map((e) => e.message).join(', ') || err.message);
    } finally {
      setSaving(false);
    }
  }

  if (document.isPending || (doc && !file.data && !file.error)) return <LoadingState />;
  const problem = document.error?.message ?? file.error?.message ?? (doc && !CAN.toExcel(kindOf(doc)) ? 'Only PDFs can be converted to Excel.' : null);
  const ocrPages = result?.filter((p) => p.method === 'ocr') ?? [];

  return (
    <Stack spacing={2} sx={{ height: { md: 'calc(100vh - 120px)' } }}>
      <PageHeader title="Convert to Excel" subtitle={doc?.fileName} back={`/documents/${id}`} />
      {problem ? (
        <Alert severity="warning">{problem}</Alert>
      ) : (
        <>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' }, '& .MuiTextField-root': { flex: { md: 1 }, minWidth: { md: 150 } } }}>
              <TextField size="small" select label="Scanned pages" value={options.ocr} onChange={(e) => set({ ocr: e.target.value })} >
                <MenuItem value="auto">Read with OCR when there is no text</MenuItem>
                <MenuItem value="always">Read every page with OCR</MenuItem>
                <MenuItem value="off">Do not use OCR</MenuItem>
              </TextField>
              {options.ocr !== 'off' && (
                <TextField size="small" select label="OCR language" value={options.language} onChange={(e) => set({ language: e.target.value })} >
                  {LANGUAGES.map((l) => (
                    <MenuItem key={l.value} value={l.value}>
                      {l.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
              <TextField size="small" label="Pages" placeholder="All, or e.g. 1-2" value={options.pages} onChange={(e) => set({ pages: e.target.value })}  />
              <TextField size="small" select label="Sheets" value={options.layout} onChange={(e) => set({ layout: e.target.value })} >
                <MenuItem value="perPage">One sheet per page</MenuItem>
                <MenuItem value="single">All pages in one sheet</MenuItem>
              </TextField>
              <Button variant="contained" startIcon={<PlayArrowOutlinedIcon />} onClick={run} disabled={Boolean(progress)} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
                {result ? 'Convert again' : 'Convert'}
              </Button>
            </Stack>
            {progress && (
              <Stack spacing={0.5} sx={{ mt: 2 }}>
                <Typography variant="body2">
                  {progress.status}
                  {progress.page ? ` - page ${progress.page} of ${progress.pages}` : ''}…
                </Typography>
                <LinearProgress variant={progress.page ? 'determinate' : 'indeterminate'} value={progress.page ? (progress.page / progress.pages) * 100 : undefined} />
              </Stack>
            )}
          </Paper>

          {error && <Alert severity="warning">{error}</Alert>}
          {result && (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1, alignItems: 'center' }}>
              {result.map((page) => (
                <Chip
                  key={page.number}
                  size="small"
                  icon={page.method === 'ocr' ? <DocumentScannerOutlinedIcon /> : undefined}
                  color={page.method === 'ocr' ? 'warning' : page.method === 'empty' ? 'default' : 'success'}
                  variant="outlined"
                  label={`Page ${page.number}: ${page.method === 'ocr' ? `OCR (${page.confidence}% sure)` : page.method === 'empty' ? 'no text' : `${page.rows.length} rows`}`}
                />
              ))}
            </Stack>
          )}
          {ocrPages.length > 0 && (
            <Alert severity="warning">
              {ocrPages.length === 1 ? 'One page was' : `${ocrPages.length} pages were`} scanned and read with OCR. OCR can misread characters - check names and numbers against the PDF before using them.
            </Alert>
          )}
          {sheets && (
            <>
              <Alert severity="info">
                Check the result and correct anything here before saving. Tables are found from where the words sit on the page; merged or unusual layouts may need fixing.
              </Alert>
              <Paper variant="outlined" sx={{ flex: 1, minHeight: 420, overflow: 'hidden' }}>
                <Suspense fallback={<LoadingState />}>
                  <SheetView key={`${options.layout}-${result.length}`} ref={workbook} data={sheets} editable />
                </Suspense>
              </Paper>
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                <Button startIcon={<DownloadOutlinedIcon />} onClick={async () => saveBlob(new Blob([await writeXlsx(current())], { type: MIME.xlsx }), xlsxName)}>
                  Download .xlsx
                </Button>
                {can(PERMISSIONS.DOCUMENTS_CREATE) && (
                  <Button variant="contained" startIcon={<SaveOutlinedIcon />} onClick={saveToDocuments} loading={saving}>
                    Save to documents
                  </Button>
                )}
              </Stack>
            </>
          )}
        </>
      )}
    </Stack>
  );
}
