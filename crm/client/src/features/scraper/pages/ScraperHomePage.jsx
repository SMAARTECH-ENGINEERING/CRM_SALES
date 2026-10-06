import MoreVertIcon from '@mui/icons-material/MoreVert';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { exportScrapedRecords } from '../../../api/scraper.api.js';
import ConfirmDialog from '../../../components/ConfirmDialog.jsx';
import AdvancedDataTable from '../../../components/ui/AdvancedDataTable.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import useListParams, { serverPaging, serverSorting, toApiParams } from '../../../hooks/useListParams.js';
import useNotify from '../../../hooks/useNotify.js';
import usePermission from '../../../hooks/usePermission.js';
import { saveBlob } from '../../../hooks/useQuotations.js';
import { useScrapeJobs, useScraperMutations, useScraperStats } from '../../../hooks/useScraper.js';
import { EMPTY, formatDateTime } from '../../../utils/format.js';
import { PERMISSIONS } from '../../../utils/permissions.js';
import { JOB_STATUS, StatusChip } from '../components/ScraperChips.jsx';
import ScraperNav from '../components/ScraperNav.jsx';

const centered = { display: 'flex', alignItems: 'center', height: '100%', gap: 1 };

function Figure({ label, value, to, hint }) {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardActionArea component={RouterLink} to={to} sx={{ height: '100%' }} title={hint}>
        <CardContent>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="h5" component="p" sx={{ fontWeight: 600 }}>
            {value ?? EMPTY}
          </Typography>
        </CardContent>
      </CardActionArea>
    </Card>
  );
}

function JobActions({ job }) {
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const { cancel, rerun, remove } = useScraperMutations();
  const [anchor, setAnchor] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const active = ['queued', 'running'].includes(job.status);
  const run = (fn, message) => async () => {
    setAnchor(null);
    try {
      const response = await fn();
      notify.success(message);
      if (response?.data?.job && fn === rerunJob) navigate(`/scraper/jobs/${response.data.job.id}`);
    } catch (err) {
      notify.error(err.message);
    }
  };
  const rerunJob = () => rerun.mutateAsync(job.id);
  async function exportJob(format) {
    setAnchor(null);
    try {
      saveBlob(await exportScrapedRecords({ jobId: job.id, format }), `${job.name}.${format}`);
    } catch (err) {
      notify.error(err.message);
    }
  }
  return (
    <>
      <IconButton size="small" aria-label={`Actions for ${job.name}`} onClick={(e) => setAnchor(e.currentTarget)}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => navigate(`/scraper/jobs/${job.id}`)}>View results</MenuItem>
        {can(PERMISSIONS.SCRAPER_IMPORT) && !active && <MenuItem onClick={() => navigate(`/scraper/jobs/${job.id}?importStatus=pending`)}>Import remaining</MenuItem>}
        {can(PERMISSIONS.SCRAPER_CREATE) && active && <MenuItem onClick={run(() => cancel.mutateAsync(job.id), 'Job cancelled')}>Cancel</MenuItem>}
        {can(PERMISSIONS.SCRAPER_CREATE) && !active && <MenuItem onClick={run(rerunJob, 'Job queued again')}>Re-run</MenuItem>}
        {can(PERMISSIONS.SCRAPER_EXPORT) && !active && <MenuItem onClick={() => exportJob('xlsx')}>Export to Excel</MenuItem>}
        {can(PERMISSIONS.SCRAPER_EXPORT) && !active && <MenuItem onClick={() => exportJob('csv')}>Export to CSV</MenuItem>}
        {can(PERMISSIONS.SCRAPER_DELETE) && !active && (
          <MenuItem
            sx={{ color: 'error.main' }}
            onClick={() => {
              setAnchor(null);
              setDeleting(true);
            }}
          >
            Delete job
          </MenuItem>
        )}
      </Menu>
      <ConfirmDialog
        open={deleting}
        title="Delete scraping job"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={async () => {
          await run(() => remove.mutateAsync(job.id), 'Job deleted')();
          setDeleting(false);
        }}
        onClose={() => setDeleting(false)}
      >
        {`"${job.name}" and its ${job.stats?.records ?? 0} results will be deleted. Companies, contacts and leads already imported from it stay in the CRM.`}
      </ConfirmDialog>
    </>
  );
}

// /scraper - the figures and every scraping job (the history).
export default function ScraperHomePage() {
  const [params, updateParams] = useListParams(['status']);
  const stats = useScraperStats();
  const apiParams = useMemo(() => toApiParams({ ...params, sortBy: params.sortBy || 'createdAt' }), [params]);
  const { data, error, isFetching } = useScrapeJobs(apiParams);
  const s = stats.data;

  const columns = useMemo(
    () => [
      {
        field: 'name',
        headerName: 'Job',
        flex: 1.5,
        minWidth: 220,
        renderCell: ({ row }) => (
          <Box sx={centered}>
            <Link component={RouterLink} to={`/scraper/jobs/${row.id}`} underline="hover" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {row.name}
            </Link>
          </Box>
        ),
      },
      {
        field: 'status',
        headerName: 'Status',
        width: 170,
        renderCell: ({ row }) => (
          <Stack sx={{ justifyContent: 'center', height: '100%', gap: 0.5 }}>
            <StatusChip map={JOB_STATUS} value={row.status} />
            {row.status === 'running' && <LinearProgress variant="determinate" value={Math.min(100, ((row.stats?.pagesVisited ?? 0) / (row.settings?.maxPages || 1)) * 100)} aria-label="Pages visited" />}
          </Stack>
        ),
      },
      { field: 'targets', headerName: 'Sources', width: 90, sortable: false, valueGetter: (value) => value?.length ?? 0 },
      { field: 'pages', headerName: 'Pages', width: 80, sortable: false, valueGetter: (value, row) => row.stats?.pagesVisited ?? 0 },
      { field: 'records', headerName: 'Found', width: 80, sortable: false, valueGetter: (value, row) => row.stats?.records ?? 0 },
      { field: 'new', headerName: 'New', width: 70, sortable: false, valueGetter: (value, row) => row.stats?.new ?? 0 },
      { field: 'duplicates', headerName: 'Duplicates', width: 100, sortable: false, valueGetter: (value, row) => (row.stats?.possible ?? 0) + (row.stats?.existing ?? 0) },
      { field: 'failed', headerName: 'Failed', width: 80, sortable: false, valueGetter: (value, row) => row.stats?.pagesFailed ?? 0 },
      { field: 'imported', headerName: 'Imported', width: 90, sortable: false, valueGetter: (value, row) => row.stats?.imported ?? 0 },
      { field: 'createdAt', headerName: 'Started', width: 165, valueFormatter: (value) => formatDateTime(value) },
      { field: 'createdByUser', headerName: 'By', width: 140, sortable: false, valueGetter: (value) => value?.fullName ?? EMPTY },
      { field: 'actions', headerName: '', width: 60, sortable: false, disableColumnMenu: true, renderCell: ({ row }) => <Box sx={centered}><JobActions job={row} /></Box> },
    ],
    []
  );

  return (
    <Stack spacing={2}>
      <ScraperNav />
      <Alert severity="info" variant="outlined">
        Only public pages are read, and each site&apos;s robots.txt is obeyed. Sign-in pages, CAPTCHAs and paywalls are never worked around, and sites are visited slowly.
        Results stay here for review; nothing reaches the CRM until you import it.
      </Alert>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(auto-fill, minmax(170px, 1fr))' } }} role="group" aria-label="Scraper figures">
        <Figure label="Scraping jobs" value={s?.jobs} to="/scraper" hint={s?.running ? `${s.running} running` : undefined} />
        <Figure label="Records collected" value={s?.records} to="/scraper/results" />
        <Figure label="New companies" value={s?.newCompanies} to="/scraper/results?type=company&match=new" />
        <Figure label="New contacts" value={s?.newContacts} to="/scraper/results?type=contact&match=new" />
        <Figure label="Duplicates" value={s?.duplicates} to="/scraper/results?duplicates=true" />
        <Figure label="Imported" value={s?.imported} to="/scraper/results?importStatus=imported" />
        <Figure label="Failed pages" value={s?.failedPages} to="/scraper/failed" />
      </Box>
      {error && <Alert severity="error">{error.message}</Alert>}
      <AdvancedDataTable
        tableId="scraper-jobs"
        height="calc(100vh - 420px)"
        minHeight={360}
        rows={data?.jobs ?? []}
        columns={columns}
        loading={isFetching && !data}
        rowHref={(row) => `/scraper/jobs/${row.id}`}
        {...serverPaging(params, updateParams, data?.pagination)}
        {...serverSorting(params, updateParams)}
        emptyState={<EmptyState dense title="No scraping jobs yet" description="Create one with New scraping job." />}
      />
    </Stack>
  );
}
