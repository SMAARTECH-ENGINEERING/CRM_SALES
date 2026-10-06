import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import AdvancedDataTable from '../../../components/ui/AdvancedDataTable.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import { useScrapePages } from '../../../hooks/useScraper.js';
import { EMPTY, formatDateTime } from '../../../utils/format.js';
import { PAGE_REASON } from './ScraperChips.jsx';

const STATUS = { done: { label: 'Read', color: 'success' }, failed: { label: 'Failed', color: 'error' }, skipped: { label: 'Skipped', color: 'default' } };
const centered = { display: 'flex', alignItems: 'center', height: '100%' };

// The pages a job visited (or of every job): what was read, what failed and why.
export default function PagesTable({ jobId, defaultStatus = '', live = false, height = 'calc(100vh - 300px)' }) {
  const [status, setStatus] = useState(defaultStatus);
  const [paging, setPaging] = useState({ page: 0, pageSize: 20 });
  const { data, isFetching } = useScrapePages({ ...(jobId ? { jobId } : {}), ...(status ? { status } : {}), page: paging.page + 1, limit: paging.pageSize }, { live });

  const columns = [
    {
      field: 'url',
      headerName: 'Page',
      flex: 2,
      minWidth: 260,
      renderCell: ({ value }) => (
        <Box sx={centered}>
          <Link href={value} target="_blank" rel="noopener noreferrer nofollow" underline="hover" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {value}
          </Link>
        </Box>
      ),
    },
    { field: 'status', headerName: 'Status', width: 110, renderCell: ({ value }) => <Box sx={centered}><Chip size="small" color={STATUS[value]?.color} label={STATUS[value]?.label ?? value} variant={value === 'skipped' ? 'outlined' : 'filled'} /></Box> },
    { field: 'reason', headerName: 'Reason', width: 190, valueGetter: (value) => (value ? PAGE_REASON[value] ?? value : EMPTY) },
    { field: 'detail', headerName: 'Detail', flex: 1.5, minWidth: 220, valueGetter: (value, row) => value || (row.status === 'done' ? `${row.recordsFound} new result(s)` : EMPTY) },
    { field: 'httpStatus', headerName: 'HTTP', width: 80, valueGetter: (value) => value ?? EMPTY },
    ...(jobId
      ? []
      : [
          {
            field: 'job',
            headerName: 'Job',
            width: 180,
            renderCell: ({ value }) => (value ? <Box sx={centered}><Link component={RouterLink} to={`/scraper/jobs/${value.id}`}>{value.name}</Link></Box> : EMPTY),
          },
        ]),
    { field: 'at', headerName: 'Time', width: 165, valueFormatter: (value) => formatDateTime(value) },
  ];

  return (
    <AdvancedDataTable
      tableId={jobId ? 'scraper-job-pages' : 'scraper-pages'}
      height={height}
      rows={data?.pages ?? []}
      columns={columns}
      loading={isFetching}
      paginationMode="server"
      rowCount={data?.pagination?.total ?? -1}
      paginationModel={paging}
      onPaginationModelChange={setPaging}
      pageSizeOptions={[20, 50, 100]}
      toolbar={
        <Stack direction="row" spacing={2}>
          <TextField select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPaging((p) => ({ ...p, page: 0 })); }} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} sx={{ width: 200 }}>
            <MenuItem value="">Every page</MenuItem>
            <MenuItem value="done">Read</MenuItem>
            <MenuItem value="failed">Failed</MenuItem>
            <MenuItem value="skipped">Skipped (robots, not a web page)</MenuItem>
          </TextField>
        </Stack>
      }
      emptyState={<EmptyState dense filtered={Boolean(status)} title="No pages" description={status === 'failed' ? 'No page failed.' : 'Pages appear as a job visits them.'} />}
    />
  );
}
