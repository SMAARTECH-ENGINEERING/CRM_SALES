import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import LaunchIcon from '@mui/icons-material/Launch';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { useEffect, useMemo, useState } from 'react';
import { exportScrapedRecords, listScrapedRecordIds } from '../../../api/scraper.api.js';
import AdvancedDataTable from '../../../components/ui/AdvancedDataTable.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import { FilterBar } from '../../../components/ui/FilterDrawer.jsx';
import useListParams, { SEARCH_DEBOUNCE_MS, serverPaging, serverSorting, toApiParams } from '../../../hooks/useListParams.js';
import useNotify from '../../../hooks/useNotify.js';
import usePermission from '../../../hooks/usePermission.js';
import { saveBlob } from '../../../hooks/useQuotations.js';
import { useScrapedRecords, useScrapeJobs, useScraperMutations } from '../../../hooks/useScraper.js';
import { EMPTY, formatDate } from '../../../utils/format.js';
import { PERMISSIONS } from '../../../utils/permissions.js';
import ImportDialog from './ImportDialog.jsx';
import RecordReviewDialog from './RecordReviewDialog.jsx';
import { IMPORT_STATUS, MATCH, MatchChip, QualityBar, StatusChip } from './ScraperChips.jsx';

export const RESULT_FILTER_KEYS = ['jobId', 'type', 'match', 'importStatus', 'duplicates', 'hasEmail', 'hasPhone', 'location', 'industry', 'minQuality', 'from', 'to'];
const centered = { display: 'flex', alignItems: 'center', height: '100%', gap: 1, minWidth: 0 };

function select(label, value, onChange, options, sx) {
  return (
    <TextField select label={label} value={value} onChange={(e) => onChange(e.target.value)} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} sx={sx}>
      {options.map(([v, text]) => (
        <MenuItem key={v} value={v}>
          {text}
        </MenuItem>
      ))}
    </TextField>
  );
}

// The results of one job (`jobId`) or of all jobs: search, filter, sort,
// select, review one, import or export.
export default function ResultsTable({ jobId, live = false, height = 'calc(100vh - 300px)' }) {
  const notify = useNotify();
  const { can } = usePermission();
  const [params, updateParams] = useListParams(RESULT_FILTER_KEYS);
  const [searchInput, setSearchInput] = useState(params.search);
  const [reviewing, setReviewing] = useState(null);
  const [importing, setImporting] = useState(null);
  const [exportMenu, setExportMenu] = useState(null);
  const { updateRecord, recheck } = useScraperMutations();
  const jobs = useScrapeJobs({ limit: 100, page: 1, sortBy: 'createdAt', sortOrder: 'desc' });
  const canImport = can(PERMISSIONS.SCRAPER_IMPORT) && can(PERMISSIONS.COMPANIES_CREATE) && can(PERMISSIONS.CONTACTS_CREATE);
  const canChange = can(PERMISSIONS.SCRAPER_CREATE);

  useEffect(() => {
    const value = searchInput.trim();
    if (value === params.search) return undefined;
    const timer = setTimeout(() => updateParams({ search: value }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const filters = useMemo(() => {
    const { page: _p, limit: _l, sortBy: _s, sortOrder: _o, ...rest } = params;
    return toApiParams({ ...rest, ...(jobId ? { jobId } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params), jobId]);
  const apiParams = useMemo(() => toApiParams({ ...params, ...(jobId ? { jobId } : {}), sortBy: params.sortBy || 'scrapedAt' }), [params, jobId]);
  const { data, error, isFetching, refetch } = useScrapedRecords(apiParams, { live });

  async function importAll() {
    try {
      const response = await listScrapedRecordIds({ ...filters, importStatus: filters.importStatus ?? 'pending' });
      if (!response.data.ids.length) notify.info('Nothing left to import here.');
      else setImporting({ ids: response.data.ids });
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function exportAs(format) {
    setExportMenu(null);
    try {
      const blob = await exportScrapedRecords({ ...filters, format });
      saveBlob(blob, `scraped-results-${new Date().toISOString().slice(0, 10)}.${format}`);
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function bulk(ids, decision, clear) {
    const results = await Promise.allSettled(ids.map((id) => updateRecord.mutateAsync({ id, decision })));
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) notify.error(`${failed} could not be changed (already imported?)`);
    else notify.success(`${ids.length} marked`);
    clear();
  }

  const columns = useMemo(
    () => [
      {
        field: 'company',
        headerName: 'Company',
        flex: 1.4,
        minWidth: 200,
        sortable: true,
        valueGetter: (value, row) => row.company?.name,
        renderCell: ({ row }) => (
          <Box sx={centered}>
            <Tooltip title={row.type === 'company' ? 'A company' : 'A person'}>
              {row.type === 'company' ? <ApartmentOutlinedIcon fontSize="small" color="action" /> : <PersonOutlineOutlinedIcon fontSize="small" color="action" />}
            </Tooltip>
            <Link component="button" type="button" underline="hover" onClick={() => setReviewing(row.id)} sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
              {row.company?.name || '(no company name)'}
            </Link>
          </Box>
        ),
      },
      { field: 'contact', headerName: 'Contact', flex: 1, minWidth: 140, valueGetter: (value, row) => row.contact?.fullName || EMPTY },
      { field: 'designation', headerName: 'Designation', width: 150, sortable: false, valueGetter: (value, row) => row.contact?.designation || EMPTY },
      { field: 'email', headerName: 'Email', flex: 1.1, minWidth: 180, sortable: false, valueGetter: (value, row) => row.contact?.email || row.company?.email || EMPTY },
      { field: 'phone', headerName: 'Phone', width: 140, sortable: false, valueGetter: (value, row) => row.contact?.phone || row.company?.phone || EMPTY },
      { field: 'city', headerName: 'Location', width: 150, valueGetter: (value, row) => [row.company?.city, row.company?.state].filter(Boolean).join(', ') || EMPTY },
      {
        field: 'website',
        headerName: 'Website',
        width: 170,
        sortable: false,
        renderCell: ({ row }) =>
          row.company?.website ? (
            <Box sx={centered}>
              <Link href={row.company.website} target="_blank" rel="noopener noreferrer nofollow" underline="hover" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {row.company.website.replace(/^https?:\/\/(www\.)?/, '')}
              </Link>
            </Box>
          ) : (
            EMPTY
          ),
      },
      { field: 'match', headerName: 'In the CRM', width: 150, renderCell: ({ row }) => <Box sx={centered}><MatchChip match={row.match} /></Box> },
      { field: 'quality', headerName: 'Quality', width: 130, renderCell: ({ row }) => <Box sx={centered}><QualityBar value={row.quality} missing={row.missing} /></Box> },
      { field: 'importStatus', headerName: 'Import', width: 120, sortable: false, renderCell: ({ row }) => <Box sx={centered}><StatusChip map={IMPORT_STATUS} value={row.importStatus} /></Box> },
      ...(jobId ? [] : [{ field: 'job', headerName: 'Job', width: 170, sortable: false, valueGetter: (value) => value?.name ?? EMPTY }]),
      { field: 'scrapedAt', headerName: 'Scraped', width: 110, valueFormatter: (value) => formatDate(value) },
      {
        field: 'source',
        headerName: 'Source',
        width: 70,
        sortable: false,
        renderCell: ({ row }) => (
          <Tooltip title={row.sourceUrl}>
            <IconButton size="small" component="a" href={row.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" aria-label="Open the source page">
              <LaunchIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ),
      },
    ],
    [jobId]
  );

  const hasFilters = Boolean(params.search || RESULT_FILTER_KEYS.some((key) => params[key]));
  const sx = { flex: 1, minWidth: 140 };
  const yesNo = [['', 'Any'], ['true', 'Yes'], ['false', 'No']];

  return (
    <Stack spacing={1}>
      {error && (
        <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => refetch()}>Retry</Button>}>
          {error.message}
        </Alert>
      )}
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', flexWrap: 'wrap', rowGap: 1 }}>
        {canImport && (
          <Tooltip title="Every result matching the filters that is not imported yet">
            <Button variant="contained" onClick={importAll} disabled={!data?.pagination?.total}>
              Import all not imported
            </Button>
          </Tooltip>
        )}
        {can(PERMISSIONS.SCRAPER_EXPORT) && (
          <>
            <Button startIcon={<FileDownloadOutlinedIcon />} onClick={(e) => setExportMenu(e.currentTarget)} disabled={!data?.pagination?.total}>
              Export
            </Button>
            <Menu anchorEl={exportMenu} open={Boolean(exportMenu)} onClose={() => setExportMenu(null)}>
              <MenuItem onClick={() => exportAs('xlsx')}>Excel (.xlsx)</MenuItem>
              <MenuItem onClick={() => exportAs('csv')}>CSV</MenuItem>
            </Menu>
          </>
        )}
      </Stack>
      <AdvancedDataTable
        tableId={jobId ? 'scraper-job-results' : 'scraper-results'}
        height={height}
        rows={data?.records ?? []}
        columns={columns}
        loading={isFetching && !live}
        onRowDoubleClick={({ row }) => setReviewing(row.id)}
        bulkActions={
          canImport || canChange
            ? ({ ids, clear }) => (
                <>
                  {canImport && (
                    <Button size="small" variant="contained" onClick={() => setImporting({ ids, clear })}>
                      Import {ids.length}
                    </Button>
                  )}
                  {canChange && (
                    <>
                      <Button size="small" onClick={() => bulk(ids, 'skip', clear)}>
                        Skip
                      </Button>
                      <Button size="small" onClick={() => bulk(ids, 'create', clear)}>
                        Create new
                      </Button>
                      <Button size="small" onClick={() => bulk(ids, null, clear)}>
                        Clear choice
                      </Button>
                      <Button
                        size="small"
                        onClick={async () => {
                          await recheck.mutateAsync(ids);
                          notify.success('Checked against the CRM again');
                          clear();
                        }}
                      >
                        Check again
                      </Button>
                    </>
                  )}
                </>
              )
            : undefined
        }
        toolbar={
          <FilterBar activeCount={RESULT_FILTER_KEYS.filter((key) => params[key] && !(key === 'jobId' && jobId)).length}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
              <TextField
                label="Search"
                placeholder="Company, person, email, phone or website"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> } }}
                sx={{ flex: 2 }}
              />
              {!jobId && select('Job', params.jobId, (v) => updateParams({ jobId: v }), [['', 'All jobs'], ...(jobs.data?.jobs ?? []).map((j) => [j.id, j.name])], sx)}
              {select('Type', params.type, (v) => updateParams({ type: v }), [['', 'Companies and contacts'], ['company', 'Companies'], ['contact', 'Contacts']], sx)}
              {select('In the CRM', params.match, (v) => updateParams({ match: v, duplicates: '' }), [['', 'Any'], ...Object.entries(MATCH).map(([v, m]) => [v, m.label])], sx)}
              {select('Duplicates', params.duplicates, (v) => updateParams({ duplicates: v, match: '' }), [['', 'Any'], ['true', 'Possible and existing']], sx)}
              {select('Import', params.importStatus, (v) => updateParams({ importStatus: v }), [['', 'Any'], ...Object.entries(IMPORT_STATUS).map(([v, m]) => [v, m.label])], sx)}
              {select('Has email', params.hasEmail, (v) => updateParams({ hasEmail: v }), yesNo, sx)}
              {select('Has phone', params.hasPhone, (v) => updateParams({ hasPhone: v }), yesNo, sx)}
              <TextField label="Location" placeholder="City, state, PIN" value={params.location} onChange={(e) => updateParams({ location: e.target.value })} sx={sx} />
              <TextField label="Industry / category" placeholder="e.g. FPO" value={params.industry} onChange={(e) => updateParams({ industry: e.target.value })} sx={sx} />
              {select('Quality', params.minQuality, (v) => updateParams({ minQuality: v }), [['', 'Any'], ['50', '50% or more'], ['75', '75% or more'], ['90', '90% or more']], sx)}
              <TextField type="date" label="Scraped from" value={params.from} onChange={(e) => updateParams({ from: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} sx={sx} />
              <TextField type="date" label="Scraped to" value={params.to} onChange={(e) => updateParams({ to: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} sx={sx} />
              <Button
                disabled={!hasFilters && !searchInput}
                onClick={() => {
                  setSearchInput('');
                  updateParams(Object.fromEntries(['search', ...RESULT_FILTER_KEYS.filter((k) => !(k === 'jobId' && jobId))].map((key) => [key, ''])));
                }}
              >
                Clear
              </Button>
            </Stack>
          </FilterBar>
        }
        {...serverPaging(params, updateParams, data?.pagination)}
        {...serverSorting(params, updateParams)}
        emptyState={<EmptyState dense filtered={hasFilters} title={hasFilters ? undefined : 'No results yet'} description={hasFilters ? undefined : live ? 'Results appear when the job finishes.' : 'Run a scraping job to collect results.'} />}
      />
      {reviewing && <RecordReviewDialog id={reviewing} onClose={() => setReviewing(null)} />}
      {importing && <ImportDialog ids={importing.ids} onDone={() => importing.clear?.()} onClose={() => setImporting(null)} />}
    </Stack>
  );
}
