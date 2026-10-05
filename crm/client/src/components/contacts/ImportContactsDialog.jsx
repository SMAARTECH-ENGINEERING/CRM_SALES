import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadContactsTemplate, importContacts } from '../../api/imports.api.js';
import { saveBlob } from '../../hooks/useQuotations.js';
import useNotify from '../../hooks/useNotify.js';
import usePermission from '../../hooks/usePermission.js';
import { PERMISSIONS } from '../../utils/permissions.js';

const ACTION_COLORS = { new: 'success', existing: 'default', none: 'default' };

// Business cards from an expo, into the CRM:
//   1. download the Excel template and fill it in (one row per card);
//   2. choose the file - the server says what will happen to every row
//      (new company, existing company, new contact, already a contact, problem);
//   3. import - companies are created once, contacts are added under them.
// Nothing changes until step 3.
export default function ImportContactsDialog({ open, onClose }) {
  const { t } = useTranslation();
  const notify = useNotify();
  const queryClient = useQueryClient();
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (input.current) input.current.value = '';
  }
  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  async function template() {
    setBusy('template');
    try {
      saveBlob(await downloadContactsTemplate(), 'contacts-import-template.xlsx');
    } catch (err) {
      notify.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function choose(event) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    setFile(chosen);
    setPreview(null);
    setResult(null);
    setError(null);
    setBusy('preview');
    try {
      setPreview((await importContacts(chosen, { dryRun: true })).data);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  async function run() {
    setBusy('import');
    try {
      const data = (await importContacts(file, { dryRun: false })).data;
      setResult(data);
      notify.success(t('contactImport.done', { count: data.summary.contactsNew }));
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['contacts'] }), queryClient.invalidateQueries({ queryKey: ['companies'] })]);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }

  const shown = result ?? preview;
  const summary = shown?.summary;
  const label = (action, what) => t(`contactImport.actions.${what}.${action}`);

  return (
    <Dialog open={open} onClose={close} maxWidth="lg" fullWidth aria-labelledby="import-contacts-title">
      <DialogTitle id="import-contacts-title">{t('contactImport.title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {!result && (
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <Box sx={{ flex: 1, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="subtitle2">{t('contactImport.step1')}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>
                  {t('contactImport.step1Help')}
                </Typography>
                <Button variant="outlined" startIcon={<FileDownloadOutlinedIcon />} onClick={template} loading={busy === 'template'}>
                  {t('contactImport.downloadTemplate')}
                </Button>
              </Box>
              <Box sx={{ flex: 1, p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="subtitle2">{t('contactImport.step2')}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>
                  {t('contactImport.step2Help')}
                </Typography>
                <Button variant="outlined" component="label" startIcon={<UploadFileOutlinedIcon />} disabled={Boolean(busy)}>
                  {file ? t('contactImport.chooseAnother') : t('contactImport.chooseFile')}
                  <input ref={input} hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" aria-label={t('contactImport.chooseFile')} onChange={choose} />
                </Button>
                {file && (
                  <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
                    {file.name}
                  </Typography>
                )}
              </Box>
            </Stack>
          )}

          {busy === 'preview' || busy === 'import' ? <LinearProgress aria-label={t('app.loading')} /> : null}
          {error && (
            <Alert severity="error">
              {error.message}
              {(error.errors ?? []).filter((e) => e.message !== error.message).map((e) => (
                <div key={e.message}>{e.message}</div>
              ))}
            </Alert>
          )}

          {summary && (
            <>
              <Alert severity={result ? 'success' : summary.rowsWithProblems ? 'warning' : 'info'}>
                {result ? t('contactImport.resultSummary', summary) : t('contactImport.previewSummary', summary)}
              </Alert>
              <TableContainer sx={{ maxHeight: 380, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Table size="small" stickyHeader aria-label={t('contactImport.rowsLabel')}>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('contactImport.columns.row')}</TableCell>
                      <TableCell>{t('fields.company')}</TableCell>
                      <TableCell>{t('fields.contact')}</TableCell>
                      <TableCell>{t('contactImport.columns.problems')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {shown.rows.map((row) => (
                      <TableRow key={row.rowNumber} sx={row.problems.length ? { bgcolor: 'action.hover' } : undefined}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>
                          <div>{row.company.name || '—'}</div>
                          {row.companyAction !== 'none' && <Chip size="small" variant="outlined" color={ACTION_COLORS[row.companyAction]} label={row.company.code ? `${label(row.companyAction, 'company')} · ${row.company.code}` : label(row.companyAction, 'company')} sx={{ mt: 0.5 }} />}
                        </TableCell>
                        <TableCell>
                          <div>{row.contact.name || '—'}</div>
                          {row.contact.email && (
                            <Typography variant="caption" color="text.secondary" component="div">
                              {row.contact.email}
                            </Typography>
                          )}
                          {row.contactAction !== 'none' && <Chip size="small" variant="outlined" color={ACTION_COLORS[row.contactAction]} label={label(row.contactAction, 'contact')} sx={{ mt: 0.5 }} />}
                        </TableCell>
                        <TableCell>
                          {row.problems.map((problem) => (
                            <Typography key={problem} variant="body2" color="error">
                              {problem}
                            </Typography>
                          ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {result ? (
          <Button variant="contained" onClick={close}>
            {t('actions.done')}
          </Button>
        ) : (
          <>
            <Button onClick={close} disabled={Boolean(busy)}>
              {t('actions.cancel')}
            </Button>
            <Button variant="contained" onClick={run} loading={busy === 'import'} disabled={!preview || (preview.summary.contactsNew === 0 && preview.summary.companiesNew === 0)}>
              {t('contactImport.import', { count: preview?.summary.contactsNew ?? 0 })}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}

// The "Import" button for a page header: offered only to someone who may
// create both companies and contacts (the API checks again).
export function ImportContactsButton() {
  const { t } = useTranslation();
  const { can } = usePermission();
  const [open, setOpen] = useState(false);
  if (!can(PERMISSIONS.COMPANIES_CREATE) || !can(PERMISSIONS.CONTACTS_CREATE)) return null;
  return (
    <>
      <Button variant="outlined" startIcon={<FileUploadOutlinedIcon />} onClick={() => setOpen(true)}>
        {t('contactImport.button')}
      </Button>
      <ImportContactsDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
