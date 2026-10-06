import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import LoadingState from '../../../components/ui/LoadingState.jsx';
import useNotify from '../../../hooks/useNotify.js';
import usePermission from '../../../hooks/usePermission.js';
import { useScrapedRecord, useScraperMutations } from '../../../hooks/useScraper.js';
import { EMPTY, formatDateTime } from '../../../utils/format.js';
import { PERMISSIONS } from '../../../utils/permissions.js';
import { DECISION, MatchChip, ORIGIN, QualityBar, QualityChecklist, REASON } from './ScraperChips.jsx';

const COMPANY_FIELDS = [
  ['name', 'Company name'],
  ['website', 'Website'],
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['address', 'Address'],
  ['city', 'City'],
  ['state', 'State'],
  ['country', 'Country'],
  ['postalCode', 'Postal code'],
  ['category', 'Category'],
];
const CONTACT_FIELDS = [
  ['firstName', 'First name'],
  ['lastName', 'Last name'],
  ['designation', 'Designation'],
  ['email', 'Email'],
  ['phone', 'Phone'],
];

function Editor({ record, onSaved }) {
  const notify = useNotify();
  const { updateRecord } = useScraperMutations();
  const [company, setCompany] = useState(() => Object.fromEntries(COMPANY_FIELDS.map(([f]) => [f, record.company?.[f] ?? ''])));
  const [contact, setContact] = useState(() => Object.fromEntries(CONTACT_FIELDS.map(([f]) => [f, record.contact?.[f] ?? ''])));
  const isContact = record.type === 'contact';
  const changed = (original, now) => Object.fromEntries(Object.entries(now).filter(([f, v]) => v !== (original?.[f] ?? '')));

  async function save() {
    const companyChanges = changed(record.company, company);
    const contactChanges = isContact ? changed(record.contact, contact) : {};
    if (!Object.keys(companyChanges).length && !Object.keys(contactChanges).length) return onSaved();
    try {
      await updateRecord.mutateAsync({ id: record.id, ...(Object.keys(companyChanges).length ? { company: companyChanges } : {}), ...(Object.keys(contactChanges).length ? { contact: contactChanges } : {}) });
      notify.success('Corrections saved');
      return onSaved();
    } catch (err) {
      return notify.error(err.message);
    }
  }

  return (
    <Stack spacing={2}>
      {isContact && (
        <>
          <Typography variant="subtitle2">Person</Typography>
          <Grid container spacing={2}>
            {CONTACT_FIELDS.map(([field, label]) => (
              <Grid key={field} size={{ xs: 12, sm: 6 }}>
                <TextField label={label} value={contact[field]} onChange={(e) => setContact((c) => ({ ...c, [field]: e.target.value }))} />
              </Grid>
            ))}
          </Grid>
        </>
      )}
      <Typography variant="subtitle2">Company</Typography>
      <Grid container spacing={2}>
        {COMPANY_FIELDS.map(([field, label]) => (
          <Grid key={field} size={{ xs: 12, sm: field === 'address' ? 12 : 6 }}>
            <TextField label={label} value={company[field]} onChange={(e) => setCompany((c) => ({ ...c, [field]: e.target.value }))} />
          </Grid>
        ))}
      </Grid>
      <Stack direction="row" spacing={1}>
        <Button variant="contained" onClick={save} loading={updateRecord.isPending}>
          Save corrections
        </Button>
        <Button onClick={onSaved}>Cancel</Button>
      </Stack>
    </Stack>
  );
}

// One result: what was found and where, how complete it is, how it compares
// with the CRM - and the user's choice for the import.
export default function RecordReviewDialog({ id, onClose }) {
  const notify = useNotify();
  const { can } = usePermission();
  const { data: record, isPending, error } = useScrapedRecord(id);
  const { updateRecord } = useScraperMutations();
  const [editing, setEditing] = useState(false);
  const canChange = can(PERMISSIONS.SCRAPER_CREATE);

  async function decide(decision) {
    try {
      await updateRecord.mutateAsync({ id, decision });
      notify.success(decision ? `Marked: ${DECISION[decision]}` : 'Choice cleared');
    } catch (err) {
      notify.error(err.message);
    }
  }

  const isContact = record?.type === 'contact';
  const existing = isContact ? record?.match?.contact : record?.match?.company;
  const existingCompany = record?.match?.company;
  const imported = record?.importStatus === 'imported';
  const rows = record
    ? [
        ...(isContact
          ? [
              ['Name', record.contact.fullName, existing ? `${existing.firstName ?? ''} ${existing.lastName ?? ''}`.trim() : null],
              ['Designation', record.contact.designation, existing?.designation],
              ['Email', record.contact.email, existing?.email],
              ['Phone', record.contact.phone, existing?.phone],
            ]
          : []),
        [isContact ? 'Company' : 'Company name', record.company.name, existingCompany?.name],
        ['Website', record.company.website, existingCompany?.website],
        [isContact ? 'Company email' : 'Email', record.company.email, existingCompany?.email],
        [isContact ? 'Company phone' : 'Phone', record.company.phone, existingCompany?.phone],
        ['City', record.company.city, existingCompany?.city],
        ['State', record.company.state, existingCompany?.state],
      ]
    : [];

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{record ? (isContact ? record.contact.fullName : record.company.name) || 'Result' : 'Result'}</DialogTitle>
      <DialogContent dividers>
        {isPending ? (
          <LoadingState variant="spinner" />
        ) : error ? (
          <Alert severity="error">{error.message}</Alert>
        ) : editing ? (
          <Editor record={record} onSaved={() => setEditing(false)} />
        ) : (
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <MatchChip match={record.match} />
                <Typography variant="body2" color="text.secondary">
                  {isContact ? 'A person' : 'A company'} · {ORIGIN[record.origin]}
                </Typography>
              </Stack>
              <QualityBar value={record.quality} missing={record.missing} wide />
            </Stack>
            <QualityChecklist record={record} />

            {imported && (
              <Alert severity="success">
                Imported {formatDateTime(record.imported.at)}
                {record.imported.company && (
                  <>
                    {' '}
                    · company{' '}
                    <Link component={RouterLink} to={`/companies/${record.imported.company.id}`}>
                      {record.imported.company.name}
                    </Link>
                  </>
                )}
                {record.imported.contact && (
                  <>
                    {' '}
                    · contact{' '}
                    <Link component={RouterLink} to={`/contacts/${record.imported.contact.id}`}>
                      {record.imported.contact.fullName}
                    </Link>
                  </>
                )}
                {record.imported.lead && (
                  <>
                    {' '}
                    · lead{' '}
                    <Link component={RouterLink} to={`/leads/${record.imported.lead.id}`}>
                      {record.imported.lead.leadNumber}
                    </Link>
                  </>
                )}
              </Alert>
            )}
            {record.importStatus === 'failed' && <Alert severity="error">The last import failed: {record.importError}</Alert>}

            <Table size="small" aria-label="Scraped and CRM details">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 150 }} />
                  <TableCell>Found on the web</TableCell>
                  {existing || existingCompany ? <TableCell>In the CRM</TableCell> : null}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map(([label, scraped, crm]) => (
                  <TableRow key={label}>
                    <TableCell sx={{ color: 'text.secondary' }}>{label}</TableCell>
                    <TableCell sx={{ wordBreak: 'break-word', fontWeight: crm && scraped && String(crm).toLowerCase() !== String(scraped).toLowerCase() ? 600 : undefined }}>{scraped || EMPTY}</TableCell>
                    {existing || existingCompany ? <TableCell sx={{ wordBreak: 'break-word' }}>{crm || EMPTY}</TableCell> : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {(record.company.emails?.length > 1 || record.company.phones?.length > 1) && (
              <Typography variant="body2" color="text.secondary">
                Also found: {[...(record.company.emails ?? []).slice(1), ...(record.company.phones ?? []).slice(1)].join(', ')}
              </Typography>
            )}
            {record.company.description && (
              <Typography variant="body2" color="text.secondary">
                {record.company.description}
              </Typography>
            )}

            {existingCompany && (
              <Typography variant="body2">
                Matching CRM company:{' '}
                <Link component={RouterLink} to={`/companies/${existingCompany.id}`} target="_blank">
                  {existingCompany.companyCode} · {existingCompany.name} <OpenInNewIcon sx={{ fontSize: 14, verticalAlign: 'middle' }} />
                </Link>
                {record.match.reasons?.length ? ` (${record.match.reasons.map((r) => REASON[r] ?? r).join(', ')})` : ''}
              </Typography>
            )}

            <Divider />
            <Stack spacing={0.5}>
              <Typography variant="subtitle2">Source</Typography>
              {(record.sourceUrls?.length ? record.sourceUrls : [record.sourceUrl]).map((url) => (
                <Link key={url} href={url} target="_blank" rel="noopener noreferrer nofollow" variant="body2" sx={{ wordBreak: 'break-all' }}>
                  {url}
                </Link>
              ))}
              {record.contact?.profileUrl && (
                <Link href={record.contact.profileUrl} target="_blank" rel="noopener noreferrer nofollow" variant="body2">
                  Profile
                </Link>
              )}
              <Typography variant="caption" color="text.secondary">
                Scraped {formatDateTime(record.scrapedAt)}
                {record.job ? ` by the job "${record.job.name}"` : ''}. Everything here is what the page states - not a sales assumption.
              </Typography>
            </Stack>

            {!imported && canChange && (
              <>
                <Divider />
                <Stack spacing={1}>
                  <Typography variant="subtitle2">On import</Typography>
                  {record.match.status === 'possible' && !record.decision && <Alert severity="warning">This may already be in the CRM. Choose what to do - it is not imported until you do.</Alert>}
                  <ToggleButtonGroup exclusive size="small" value={record.decision ?? ''} onChange={(e, value) => value !== null && decide(value || null)} aria-label="On import">
                    <ToggleButton value="skip">Skip</ToggleButton>
                    {(existing || existingCompany) && <ToggleButton value="update">Update existing</ToggleButton>}
                    {(existing || existingCompany) && <ToggleButton value="link">Use existing</ToggleButton>}
                    <ToggleButton value="create">Create new</ToggleButton>
                  </ToggleButtonGroup>
                  <Typography variant="caption" color="text.secondary">
                    Update existing only fills fields that are empty in the CRM; nothing there is overwritten.{' '}
                    {record.decision ? '' : record.match.status === 'new' ? 'Default: create new.' : record.match.status === 'existing' ? 'Default: use the existing record.' : ''}
                  </Typography>
                </Stack>
              </>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        {record && !imported && canChange && !editing && <Button onClick={() => setEditing(true)}>Correct details</Button>}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
