import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { LEAD_CONFIG } from '../../../api/leadConfig.api.js';
import { MASTER_DATA } from '../../../api/masterData.api.js';
import LeadConfigSelect from '../../../components/leads/LeadConfigSelect.jsx';
import UserSelect from '../../../components/users/UserSelect.jsx';
import useAuth from '../../../hooks/useAuth.js';
import useNotify from '../../../hooks/useNotify.js';
import usePermission from '../../../hooks/usePermission.js';
import { useScraperMutations } from '../../../hooks/useScraper.js';
import { PERMISSIONS } from '../../../utils/permissions.js';
import ListSelect from './ListSelect.jsx';

const BATCH = 50;
// The lead source chosen last time, remembered in this browser only.
const SOURCE_KEY = (userId) => `crm.scraper.leadSource.${userId}`;
const remembered = (key) => {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
};

const OUTCOME = { ready: 'Ready', imported: 'Imported', choose: 'Needs your choice', skip: 'Skipped', already: 'Already imported', failed: 'Problem' };

function Summary({ summary }) {
  const row = (label, values) => (
    <TableRow>
      <TableCell>{label}</TableCell>
      {values.map((v, i) => (
        <TableCell key={i} align="right">
          {v}
        </TableCell>
      ))}
    </TableRow>
  );
  return (
    <Table size="small" aria-label="Import summary">
      <TableHead>
        <TableRow>
          <TableCell />
          <TableCell align="right">New</TableCell>
          <TableCell align="right">Update existing</TableCell>
          <TableCell align="right">Use existing</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {row('Companies', [summary.companies.create, summary.companies.update, summary.companies.link])}
        {row('Contacts', [summary.contacts.create, summary.contacts.update, summary.contacts.link])}
        {row('Leads', [summary.leads, '—', '—'])}
      </TableBody>
    </Table>
  );
}

// Import the selected results: options -> preview (nothing changes) -> import
// in batches, with progress.
export default function ImportDialog({ ids, onClose, onDone }) {
  const notify = useNotify();
  const { user } = useAuth();
  const { can } = usePermission();
  const { preview, importBatch, refreshAfterImport } = useScraperMutations();
  const [options, setOptions] = useState(() => ({ createLead: false, industryId: '', assignedTo: '', lead: { title: '{company}', requirement: '', sourceId: remembered(SOURCE_KEY(user?.id)), statusId: '', priorityId: '' } }));
  const [plan, setPlan] = useState(null);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const canLead = can(PERMISSIONS.LEADS_CREATE);
  // A change of options needs a new preview.
  const set = (changes) => {
    setOptions((o) => ({ ...o, ...changes }));
    setPlan(null);
  };
  const setLead = (changes) => {
    setOptions((o) => ({ ...o, lead: { ...o.lead, ...changes } }));
    setPlan(null);
  };

  const payload = () => ({
    createLead: options.createLead,
    industryId: options.industryId || undefined,
    assignedTo: options.assignedTo || undefined,
    lead: options.createLead ? { ...options.lead, assignedTo: options.assignedTo || undefined } : undefined,
  });

  async function runPreview() {
    try {
      const response = await preview.mutateAsync({ recordIds: ids, options: payload() });
      setPlan(response.data);
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function runImport() {
    if (options.createLead && options.lead.sourceId) {
      try {
        localStorage.setItem(SOURCE_KEY(user?.id), options.lead.sourceId);
      } catch {
        // Only remembered when the browser allows it.
      }
    }
    // Companies before people, so a person's company is imported in an earlier batch.
    // Only what the preview found ready: undecided duplicates and problems stay out.
    const order = [...plan.results].filter((r) => r.outcome === 'ready').sort((a, b) => (a.type === b.type ? 0 : a.type === 'company' ? -1 : 1)).map((r) => r.id);
    const results = [];
    setProgress({ done: 0, total: order.length });
    for (let i = 0; i < order.length; i += BATCH) {
      try {
        const response = await importBatch.mutateAsync({ recordIds: order.slice(i, i + BATCH), options: payload() });
        results.push(...response.data.results);
      } catch (err) {
        notify.error(err.message);
        break;
      }
      setProgress({ done: Math.min(order.length, i + BATCH), total: order.length });
    }
    await refreshAfterImport();
    const imported = results.filter((r) => r.outcome === 'imported').length;
    // What was left out at the preview is listed with the outcome of the rest.
    setResult({ results: [...results, ...plan.results.filter((r) => r.outcome !== 'ready')], imported });
    setProgress(null);
    notify.success(`${imported} result(s) imported`);
    onDone?.();
  }

  const problems = (result?.results ?? plan?.results ?? []).filter((r) => ['choose', 'failed'].includes(r.outcome));

  return (
    <Dialog open onClose={progress ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Import {ids.length} result{ids.length === 1 ? '' : 's'}</DialogTitle>
      <DialogContent dividers>
        {result ? (
          <Stack spacing={2}>
            <Alert severity={result.imported ? 'success' : 'warning'}>
              {result.imported} imported into the CRM. {result.results.length - result.imported ? `${result.results.length - result.imported} not imported - see below.` : ''}
            </Alert>
          </Stack>
        ) : progress ? (
          <Stack spacing={1}>
            <Typography>
              Importing… {progress.done} / {progress.total}
            </Typography>
            <LinearProgress variant="determinate" value={(progress.done / progress.total) * 100} aria-label="Import progress" />
          </Stack>
        ) : (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Companies and contacts go into the existing Companies and Contacts, with the source page, the job and the dates in their notes. Possible duplicates you have not decided on are left out.
            </Typography>
            <ListSelect resource={MASTER_DATA.INDUSTRIES} label="Industry for new companies" value={options.industryId} onChange={(industryId) => set({ industryId })} emptyLabel="Leave empty" />
            <UserSelect label="Assign to" value={options.assignedTo} onChange={(assignedTo) => set({ assignedTo })} />
            {canLead && (
              <FormControlLabel control={<Checkbox checked={options.createLead} onChange={(e) => set({ createLead: e.target.checked })} />} label="Also create a lead for each company" />
            )}
            {options.createLead && (
              <Stack spacing={2} sx={{ pl: 4 }}>
                <TextField label="Lead title" value={options.lead.title} onChange={(e) => setLead({ title: e.target.value })} helperText='"{company}" is replaced with the company name' />
                <TextField
                  label="Requirement (optional)"
                  multiline
                  minRows={2}
                  value={options.lead.requirement}
                  onChange={(e) => setLead({ requirement: e.target.value })}
                  helperText="What they may need - only what you know or have confirmed. Nothing is taken from the website."
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <LeadConfigSelect list={LEAD_CONFIG.SOURCES} label="Source" value={options.lead.sourceId} onChange={(sourceId) => setLead({ sourceId })} sx={{ flex: 1 }} />
                  <LeadConfigSelect list={LEAD_CONFIG.STATUSES} label="Status" value={options.lead.statusId} onChange={(statusId) => setLead({ statusId })} selectDefault sx={{ flex: 1 }} />
                  <LeadConfigSelect list={LEAD_CONFIG.PRIORITIES} label="Priority" value={options.lead.priorityId} onChange={(priorityId) => setLead({ priorityId })} selectDefault sx={{ flex: 1 }} />
                </Stack>
              </Stack>
            )}
            {plan && (
              <Stack spacing={1}>
                <Typography variant="subtitle2">Import summary</Typography>
                <Summary summary={plan.summary} />
                <Typography variant="body2" color="text.secondary">
                  {plan.summary.ready} ready
                  {plan.summary.needChoice ? ` · ${plan.summary.needChoice} need your choice` : ''}
                  {plan.summary.skipped ? ` · ${plan.summary.skipped} to skip` : ''}
                  {plan.summary.already ? ` · ${plan.summary.already} already imported` : ''}
                  {plan.summary.failed ? ` · ${plan.summary.failed} with a problem` : ''}
                </Typography>
              </Stack>
            )}
          </Stack>
        )}
        {problems.length > 0 && !progress && (
          <List dense aria-label="Not imported" sx={{ mt: 1, maxHeight: 220, overflowY: 'auto' }}>
            {problems.slice(0, 100).map((r) => (
              <ListItem key={r.id} disableGutters>
                <ListItemText primary={`${r.name || 'Unnamed'} - ${OUTCOME[r.outcome]}`} secondary={r.message} />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={Boolean(progress)}>
          {result ? 'Close' : 'Cancel'}
        </Button>
        {!result && !plan && (
          <Button variant="contained" onClick={runPreview} loading={preview.isPending}>
            Preview
          </Button>
        )}
        {!result && plan && (
          <Button variant="contained" onClick={runImport} loading={Boolean(progress)} disabled={!plan.summary.ready}>
            Import {plan.summary.ready} selected
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
