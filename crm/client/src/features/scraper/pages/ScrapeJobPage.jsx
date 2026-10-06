import ReplayIcon from '@mui/icons-material/Replay';
import StopCircleOutlinedIcon from '@mui/icons-material/StopCircleOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ConfirmDialog from '../../../components/ConfirmDialog.jsx';
import LoadingState from '../../../components/ui/LoadingState.jsx';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import useNotify from '../../../hooks/useNotify.js';
import usePermission from '../../../hooks/usePermission.js';
import { useScrapeJob, useScraperMutations } from '../../../hooks/useScraper.js';
import { EMPTY, formatDateTime } from '../../../utils/format.js';
import { PERMISSIONS } from '../../../utils/permissions.js';
import PagesTable from '../components/PagesTable.jsx';
import ResultsTable from '../components/ResultsTable.jsx';
import { JOB_STATUS, StatusChip } from '../components/ScraperChips.jsx';

function Figure({ label, value }) {
  return (
    <Box sx={{ minWidth: 110 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6" component="p">
        {value ?? 0}
      </Typography>
    </Box>
  );
}

const elapsed = (from, to) => {
  if (!from) return EMPTY;
  const seconds = Math.max(0, Math.round(((to ? new Date(to) : new Date()) - new Date(from)) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
};

// /scraper/jobs/:id - one job: progress while it runs, then its results to
// review and import, and the pages it visited.
export default function ScrapeJobPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const { data: job, error, isPending } = useScrapeJob(id);
  const { cancel, rerun, remove } = useScraperMutations();
  const [tab, setTab] = useState('results');
  const [deleting, setDeleting] = useState(false);

  if (isPending) return <LoadingState />;
  if (error) return <Alert severity={error.status === 404 ? 'info' : 'error'}>{error.status === 404 ? 'This scraping job does not exist, or it is not yours.' : error.message}</Alert>;

  const active = ['queued', 'running'].includes(job.status);
  const s = job.stats ?? {};
  const act = async (fn, message, then) => {
    try {
      const response = await fn();
      notify.success(message);
      then?.(response);
    } catch (err) {
      notify.error(err.message);
    }
  };

  return (
    <Stack spacing={2}>
      <PageHeader
        back="/scraper"
        title={job.name}
        meta={<StatusChip map={JOB_STATUS} value={job.status} />}
        subtitle={`${job.industry?.name ? `${job.industry.name} · ` : ''}Started ${formatDateTime(job.startedAt ?? job.createdAt)}${job.createdByUser ? ` by ${job.createdByUser.fullName}` : ''}`}
        actions={
          <>
            {can(PERMISSIONS.SCRAPER_CREATE) && active && (
              <Button color="warning" variant="outlined" startIcon={<StopCircleOutlinedIcon />} onClick={() => act(() => cancel.mutateAsync(job.id), 'Cancelling - results found so far are kept')}>
                Cancel
              </Button>
            )}
            {can(PERMISSIONS.SCRAPER_CREATE) && !active && (
              <Button startIcon={<ReplayIcon />} onClick={() => act(() => rerun.mutateAsync(job.id), 'Job queued again', (r) => navigate(`/scraper/jobs/${r.data.job.id}`))}>
                Re-run
              </Button>
            )}
            {can(PERMISSIONS.SCRAPER_DELETE) && !active && (
              <Button color="error" onClick={() => setDeleting(true)}>
                Delete job
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent>
          {active && (
            <Stack spacing={1} sx={{ mb: 2 }}>
              <Typography>{job.status === 'queued' ? 'Waiting to start…' : `Scraping… ${s.pagesVisited ?? 0} of at most ${job.settings.maxPages} pages read`}</Typography>
              <LinearProgress variant={job.status === 'queued' ? 'indeterminate' : 'determinate'} value={Math.min(100, ((s.pagesVisited ?? 0) / job.settings.maxPages) * 100)} aria-label="Scraping progress" />
              <Typography variant="caption" color="text.secondary">
                Pages are read slowly - at least {Math.round(job.settings.delayMs / 1000)}s apart on each site - and results are compared with the CRM when the job finishes.
              </Typography>
            </Stack>
          )}
          {job.message && <Alert severity={job.status === 'failed' ? 'error' : job.status === 'cancelled' ? 'warning' : 'info'} sx={{ mb: 2 }}>{job.message}</Alert>}
          <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 3, rowGap: 1 }}>
            <Figure label="Pages read" value={s.pagesVisited} />
            <Figure label="Pages failed" value={s.pagesFailed} />
            <Figure label="Records found" value={s.records} />
            <Figure label="Companies" value={s.companies} />
            <Figure label="Contacts" value={s.contacts} />
            <Figure label="New" value={s.new} />
            <Figure label="Possible duplicates" value={s.possible} />
            <Figure label="Existing" value={s.existing} />
            <Figure label="Imported" value={s.imported} />
            <Figure label="Time" value={elapsed(job.startedAt, job.finishedAt)} />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            Sources:{' '}
            {job.targets.map((t, i) => (
              <span key={t}>
                {i ? ', ' : ''}
                <Link href={t} target="_blank" rel="noopener noreferrer nofollow">
                  {t}
                </Link>
              </span>
            ))}
            {' · '}
            {job.settings.maxPages} pages max, depth {job.settings.maxDepth}
            {job.settings.followLinks ? ', following links' : ''}
            {job.settings.sameDomain ? ' (same websites)' : ''}
          </Typography>
        </CardContent>
      </Card>

      <Tabs value={tab} onChange={(e, value) => setTab(value)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="results" label={`Results (${s.records ?? 0})`} />
        <Tab value="pages" label={`Pages (${(s.pagesVisited ?? 0) + (s.pagesFailed ?? 0)}+)`} />
      </Tabs>
      {tab === 'results' ? <ResultsTable jobId={job.id} live={active} /> : <PagesTable jobId={job.id} live={active} />}

      <ConfirmDialog
        open={deleting}
        title="Delete scraping job"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={() => act(() => remove.mutateAsync(job.id), 'Job deleted', () => navigate('/scraper'))}
        onClose={() => setDeleting(false)}
      >
        {`"${job.name}" and its results will be deleted. Companies, contacts and leads already imported from it stay in the CRM.`}
      </ConfirmDialog>
    </Stack>
  );
}
