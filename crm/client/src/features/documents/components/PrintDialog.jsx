import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useEffect, useMemo, useState } from 'react';
import useNotify from '../../../hooks/useNotify.js';
import { saveBlob } from '../../../hooks/useQuotations.js';
import { baseName, KIND, kindOf } from '../lib/fileKinds.js';
import { printHtml, printPdf } from '../lib/pdfLayout.js';
import { buildPrintable, DEFAULT_PRINT_OPTIONS } from '../lib/printJob.js';

const PAPERS = ['A4', 'A3', 'Letter', 'Legal'];
const MARGIN_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'narrow', label: 'Narrow' },
  { value: 'normal', label: 'Normal' },
  { value: 'wide', label: 'Wide' },
];

// Print with a preview: which pages, copies, paper, orientation, margins,
// scaling, header, footer and page numbers. The browser's own print dialog
// then picks the printer. The same file can be saved as a PDF instead.
//
//   <PrintDialog open file={{ fileName, fileType, bytes }} currentPage={2} onClose={...} />
//
// `sheets`: a spreadsheet being edited (printed as it is now, not as saved).
// `onSavePdf(bytes, fileName)`: offers saving the result to the CRM's documents
// (used to convert a spreadsheet or picture to PDF); `title` names the dialog.
export default function PrintDialog({ open, onClose, file, currentPage = 0, sheets, onSavePdf, title }) {
  const notify = useNotify();
  const phone = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const kind = kindOf(file ?? {});
  const isSheet = kind === KIND.EXCEL || kind === KIND.CSV;
  const isHtml = kind === KIND.WORD || kind === KIND.TEXT;
  const [options, setOptions] = useState(() => ({
    ...DEFAULT_PRINT_OPTIONS,
    ...(isSheet || isHtml ? { paper: 'A4', margins: 'normal', orientation: isSheet ? 'portrait' : 'auto' } : {}),
    ...(kind === KIND.IMAGE ? { paper: 'A4', margins: 'normal' } : {}),
  }));
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [building, setBuilding] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (changes) => setOptions((current) => ({ ...current, ...changes }));

  // Rebuilt shortly after the options stop changing.
  useEffect(() => {
    if (!open || !file?.bytes) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBuilding(true);
      try {
        const built = await buildPrintable(file, { ...options, current: currentPage }, { sheets });
        if (!cancelled) {
          setResult(built);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setBuilding(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, file, options, currentPage, sheets]);

  const previewUrl = useMemo(() => {
    if (!result) return null;
    return URL.createObjectURL(result.type === 'pdf' ? new Blob([result.bytes], { type: 'application/pdf' }) : new Blob([result.html], { type: 'text/html' }));
  }, [result]);
  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  async function print() {
    try {
      if (result.type === 'pdf') await printPdf(result.bytes);
      else await printHtml(result.html);
    } catch (err) {
      notify.error(`Could not open the print dialog: ${err.message}`);
    }
  }

  async function savePdf() {
    setSaving(true);
    try {
      await onSavePdf(result.bytes, `${baseName(file.fileName)}.pdf`);
    } catch (err) {
      notify.error((err.errors ?? []).map((e) => e.message).join(', ') || err.message);
    } finally {
      setSaving(false);
    }
  }

  const field = { size: 'small', fullWidth: true };
  const sheetNames = (sheets ?? []).map((s) => s.name);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg" fullScreen={phone} aria-labelledby="print-title">
      <DialogTitle id="print-title">{title ?? `Print ${file?.fileName}`}</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} sx={{ height: { md: '72vh' } }}>
          <Stack spacing={2} sx={{ p: 2, width: { md: 300 }, flexShrink: 0, overflowY: 'auto', borderRight: { md: 1 }, borderColor: 'divider' }}>
            {!isHtml && (
              <>
                <TextField {...field} select label="Pages" value={options.pages} onChange={(e) => set({ pages: e.target.value })}>
                  <MenuItem value="all">All pages</MenuItem>
                  <MenuItem value="current">Current page ({currentPage + 1})</MenuItem>
                  <MenuItem value="range">Selected pages</MenuItem>
                </TextField>
                {options.pages === 'range' && (
                  <TextField {...field} label="Page range" placeholder="e.g. 1-3, 5" value={options.range} onChange={(e) => set({ range: e.target.value })} autoFocus />
                )}
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <TextField
                    {...field}
                    type="number"
                    label="Copies"
                    value={options.copies}
                    onChange={(e) => set({ copies: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })}
                    slotProps={{ htmlInput: { min: 1, max: 50 } }}
                    sx={{ width: 110 }}
                  />
                  <FormControlLabel control={<Checkbox checked={options.collate} onChange={(e) => set({ collate: e.target.checked })} />} label="Collate" disabled={options.copies < 2} />
                </Stack>
              </>
            )}
            {isSheet && sheetNames.length > 1 && (
              <TextField
                {...field}
                select
                label="Sheets"
                value={options.sheets ?? []}
                onChange={(e) => set({ sheets: e.target.value.length ? e.target.value : null })}
                slotProps={{ select: { multiple: true, displayEmpty: true, renderValue: (v) => (v.length ? v.map((i) => sheetNames[i]).join(', ') : 'The open sheet') }, inputLabel: { shrink: true } }}
              >
                {sheetNames.map((name, index) => (
                  <MenuItem key={name} value={index}>
                    {name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField {...field} select label="Paper" value={options.paper} onChange={(e) => set({ paper: e.target.value })}>
              {kind === KIND.PDF && <MenuItem value="original">As the document</MenuItem>}
              {PAPERS.map((p) => (
                <MenuItem key={p} value={p}>
                  {p}
                </MenuItem>
              ))}
            </TextField>
            <TextField {...field} select label="Orientation" value={options.orientation} onChange={(e) => set({ orientation: e.target.value })}>
              {!isSheet && <MenuItem value="auto">Automatic</MenuItem>}
              <MenuItem value="portrait">Portrait</MenuItem>
              <MenuItem value="landscape">Landscape</MenuItem>
            </TextField>
            <TextField {...field} select label="Margins" value={options.margins} onChange={(e) => set({ margins: e.target.value })}>
              {MARGIN_OPTIONS.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
            {!isHtml && kind !== KIND.IMAGE && (
              <TextField {...field} select label="Scaling" value={options.scaling} onChange={(e) => set({ scaling: e.target.value })}>
                <MenuItem value="fit">{isSheet ? 'Fit to page width' : 'Fit to page'}</MenuItem>
                {isSheet && <MenuItem value="fitPage">Fit on one page</MenuItem>}
                <MenuItem value="actual">Actual size</MenuItem>
                <MenuItem value="custom">Custom</MenuItem>
              </TextField>
            )}
            {options.scaling === 'custom' && !isHtml && (
              <TextField
                {...field}
                type="number"
                label="Scale (%)"
                value={options.scale}
                onChange={(e) => set({ scale: Math.max(10, Math.min(400, Number(e.target.value) || 100)) })}
                slotProps={{ htmlInput: { min: 10, max: 400 } }}
              />
            )}
            {isSheet && (
              <>
                <FormControlLabel control={<Checkbox checked={options.gridlines} onChange={(e) => set({ gridlines: e.target.checked })} />} label="Gridlines" />
                <TextField
                  {...field}
                  type="number"
                  label="Repeat top rows on every page"
                  value={options.repeatHeaderRows}
                  onChange={(e) => set({ repeatHeaderRows: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })}
                  slotProps={{ htmlInput: { min: 0, max: 20 } }}
                />
              </>
            )}
            <TextField {...field} label="Header" value={options.header} onChange={(e) => set({ header: e.target.value })} slotProps={{ htmlInput: { maxLength: 120 } }} />
            <TextField {...field} label="Footer" value={options.footer} onChange={(e) => set({ footer: e.target.value })} slotProps={{ htmlInput: { maxLength: 120 } }} />
            <FormControlLabel control={<Checkbox checked={options.pageNumbers} onChange={(e) => set({ pageNumbers: e.target.checked })} />} label="Page numbers" />
            {isHtml && (
              <Typography variant="caption" color="text.secondary">
                Copies and pages are chosen in your browser&apos;s print dialog for this kind of file.
              </Typography>
            )}
          </Stack>
          <Box sx={{ flex: 1, minHeight: { xs: 420, md: 0 }, position: 'relative', bgcolor: 'action.hover' }}>
            {error && (
              <Alert severity="error" sx={{ m: 2 }}>
                {error}
              </Alert>
            )}
            {building && (
              <Stack sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', zIndex: 1, pointerEvents: 'none' }}>
                <CircularProgress aria-label="Preparing the preview" />
              </Stack>
            )}
            {previewUrl && !error && <Box component="iframe" title="Print preview" src={previewUrl} sx={{ border: 0, width: '100%', height: '100%', minHeight: { xs: 420, md: 0 }, display: 'block', bgcolor: 'background.paper' }} />}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {result?.type === 'pdf' && (
          <Button startIcon={<DownloadOutlinedIcon />} onClick={() => saveBlob(new Blob([result.bytes], { type: 'application/pdf' }), `${baseName(file.fileName)}${onSavePdf ? '' : '-print'}.pdf`)} disabled={building || Boolean(error)}>
            Download PDF
          </Button>
        )}
        <Button variant={onSavePdf ? 'outlined' : 'contained'} startIcon={<PrintOutlinedIcon />} onClick={print} disabled={!result || building || Boolean(error)}>
          Print
        </Button>
        {onSavePdf && result?.type === 'pdf' && (
          <Button variant="contained" startIcon={<SaveOutlinedIcon />} onClick={savePdf} loading={saving} disabled={building || Boolean(error)}>
            Save PDF to documents
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
