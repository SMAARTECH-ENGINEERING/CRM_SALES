import CloseIcon from '@mui/icons-material/Close';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../../../components/ConfirmDialog.jsx';
import useNotify from '../../../hooks/useNotify.js';
import { saveBlob } from '../../../hooks/useQuotations.js';
import PrintDialog from '../components/PrintDialog.jsx';
import { baseName, MIME } from '../lib/fileKinds.js';
import { readSpreadsheet, writeXlsx } from '../lib/spreadsheet.js';

const SheetView = lazy(() => import('../viewers/SheetView.jsx'));

// What is in the sheets - values, formulas, formatting, merges, sizes - as text to compare.
const contentsOf = (sheets) => JSON.stringify((sheets ?? []).map((sheet) => [sheet.name, sheet.data ?? sheet.celldata, sheet.config]));

// A spreadsheet (.xlsx, .xls or .csv) to edit in the browser: values,
// formulas, formatting, merged cells, rows and columns, several sheets.
// Saved as .xlsx.
//
//   onSave(bytes, { fileName, note }), onSaveAs(bytes, fileName) - promises
//   onSavePdf(bytes, fileName) - optional: export to PDF (as the sheets are now) and save it as a document
export default function SheetEditor({ file, onSave, onSaveAs, onClose, onSavePdf, saveLabel = 'Save' }) {
  const notify = useNotify();
  const workbook = useRef(null);
  const [sheets, setSheets] = useState(null);
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(null);
  const [printing, setPrinting] = useState(null);
  const [leaving, setLeaving] = useState(false);
  // The contents as last saved (or as opened), to tell whether anything changed.
  const saved = useRef(null);
  const xlsxName = `${baseName(file.fileName)}.xlsx`;
  const converted = !/\.xlsx$/i.test(file.fileName);

  useEffect(() => {
    let cancelled = false;
    readSpreadsheet(file.bytes, file)
      .then((data) => {
        if (cancelled) return;
        setSheets(data);
      })
      .catch((err) => !cancelled && setError(`This spreadsheet could not be read: ${err.message}`));
    return () => {
      cancelled = true;
    };
  }, [file]);

  // The contents as the grid holds them once it is ready: what changes are compared with.
  useEffect(() => {
    if (!sheets) return undefined;
    const timer = setInterval(() => {
      const all = workbook.current?.getAllSheets?.();
      if (!all) return;
      saved.current = contentsOf(all);
      clearInterval(timer);
    }, 250);
    return () => clearInterval(timer);
  }, [sheets]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const current = () => workbook.current?.getAllSheets?.() ?? sheets;
  const run = async (label, task) => {
    setBusy(label);
    try {
      return await task();
    } catch (err) {
      notify.error((err.errors ?? []).map((e) => e.message).join(', ') || err.message);
      return undefined;
    } finally {
      setBusy(null);
    }
  };
  const save = () =>
    run('Saving…', async () => {
      const data = current();
      await onSave(await writeXlsx(data), { fileName: xlsxName, note: 'Edited in the spreadsheet editor' });
      saved.current = contentsOf(data);
      setDirty(false);
    });

  if (error) {
    return (
      <Stack spacing={2} sx={{ p: 3 }}>
        <Alert severity="error">{error}</Alert>
        <Button onClick={onClose} sx={{ alignSelf: 'flex-start' }}>
          Back
        </Button>
      </Stack>
    );
  }

  return (
    <Stack sx={{ position: 'fixed', inset: 0, zIndex: (theme) => theme.zIndex.drawer + 10, bgcolor: 'background.default' }} aria-label="Spreadsheet editor">
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', flexWrap: 'wrap', rowGap: 0.5 }}>
        <Tooltip title="Close the editor">
          <IconButton aria-label="Close the editor" onClick={() => (dirty ? setLeaving(true) : onClose())}>
            <CloseIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="subtitle1" noWrap sx={{ maxWidth: { xs: 160, md: 320 }, fontWeight: 600 }} title={file.fileName}>
          {file.fileName}
        </Typography>
        {dirty && (
          <Typography variant="caption" color="warning.main">
            Not saved
          </Typography>
        )}
        <Box sx={{ flex: 1 }} />
        {busy && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <CircularProgress size={16} />
            <Typography variant="caption">{busy}</Typography>
          </Stack>
        )}
        <Tooltip title="Print">
          <span>
            <IconButton aria-label="Print" disabled={!sheets} onClick={() => setPrinting({ sheets: current() })}>
              <PrintOutlinedIcon />
            </IconButton>
          </span>
        </Tooltip>
        {onSavePdf && (
          <Tooltip title="Export as PDF">
            <span>
              <IconButton aria-label="Export as PDF" disabled={!sheets} onClick={() => setPrinting({ sheets: current(), exporting: true })}>
                <PictureAsPdfOutlinedIcon />
              </IconButton>
            </span>
          </Tooltip>
        )}
        <Tooltip title="Download as .xlsx">
          <span>
            <IconButton aria-label="Download" disabled={!sheets || Boolean(busy)} onClick={() => run('Preparing…', async () => saveBlob(new Blob([await writeXlsx(current())], { type: MIME.xlsx }), xlsxName))}>
              <DownloadOutlinedIcon />
            </IconButton>
          </span>
        </Tooltip>
        {onSaveAs && (
          <Button disabled={!sheets || Boolean(busy)} onClick={() => run('Saving…', async () => onSaveAs(await writeXlsx(current()), `${baseName(file.fileName)} (edited).xlsx`))}>
            Save as new document
          </Button>
        )}
        <Button variant="contained" startIcon={<SaveOutlinedIcon />} disabled={!sheets || Boolean(busy) || !dirty} onClick={save}>
          {saveLabel}
        </Button>
      </Stack>
      {converted && (
        <Alert severity="info" sx={{ borderRadius: 0 }}>
          This file is saved as Excel (.xlsx). {/\.csv$/i.test(file.fileName) ? 'A CSV file has no formatting; formatting added here is kept in the .xlsx.' : 'Formatting of old .xls files is not carried over.'}
        </Alert>
      )}
      <Box sx={{ flex: 1, minHeight: 0 }}>
        {!sheets ? (
          <Stack sx={{ alignItems: 'center', py: 8 }}>
            <CircularProgress aria-label="Reading the spreadsheet" />
          </Stack>
        ) : (
          <Suspense
            fallback={
              <Stack sx={{ alignItems: 'center', py: 8 }}>
                <CircularProgress aria-label="Loading the spreadsheet editor" />
              </Stack>
            }
          >
            <SheetView
              ref={workbook}
              data={sheets}
              editable
              onChange={(data) => {
                // The grid also reports selection and layout; only changed cells count.
                if (saved.current !== null) setDirty(contentsOf(data) !== saved.current);
              }}
            />
          </Suspense>
        )}
      </Box>
      {printing && (
        <PrintDialog
          open
          file={{ fileName: xlsxName, fileType: MIME.xlsx, bytes: file.bytes }}
          sheets={printing.sheets}
          title={printing.exporting ? 'Export as PDF' : undefined}
          onSavePdf={printing.exporting ? onSavePdf : undefined}
          onClose={() => setPrinting(null)}
        />
      )}
      <ConfirmDialog open={leaving} title="Leave without saving?" confirmLabel="Leave" confirmColor="error" onConfirm={onClose} onClose={() => setLeaving(false)}>
        Your changes to this spreadsheet have not been saved and will be lost.
      </ConfirmDialog>
    </Stack>
  );
}
