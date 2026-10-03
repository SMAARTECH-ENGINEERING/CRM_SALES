import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CompanySelect from '../components/companies/CompanySelect.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import UserSelect from '../components/users/UserSelect.jsx';
import { PAGE_SIZES, SEARCH_DEBOUNCE_MS, sortModelOf } from '../hooks/useListParams.js';
import useNotify from '../hooks/useNotify.js';
import { saveBlob } from '../hooks/useQuotations.js';
import { useReport, useReportCatalog, useReportExport } from '../hooks/useReports.js';
import { EMPTY, formatAmount, formatDate, formatDateTime } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const FORMAT_LABELS = { csv: 'CSV', xlsx: 'Excel', pdf: 'PDF' };
// How a value of each column type is shown. The values themselves are the API's.
const FORMATTERS = {
  money: (value) => (value == null ? EMPTY : formatAmount(value)),
  number: (value) => (value == null ? EMPTY : formatAmount(value)),
  date: (value) => (value ? formatDate(value) : EMPTY),
  datetime: (value) => (value ? formatDateTime(value) : EMPTY),
  text: (value) => value || EMPTY,
};
const NUMERIC = ['money', 'number'];
const WIDTHS = { money: 140, number: 110, date: 120, datetime: 170 };
const filterSx = { minWidth: 190, flex: '1 1 190px', maxWidth: 280 };

// The filters of one report, starting from its defaults.
const defaultsOf = (report) => Object.fromEntries(report.filters.filter((filter) => filter.default).map((filter) => [filter.key, filter.default]));
const blank = (report) => ({ dateField: report.dateFields[0].key, from: '', to: '', search: '', filters: defaultsOf(report), sortBy: '', sortOrder: '', page: 1, limit: 20 });

// One report: its filter row, totals, grid and exports. Everything shown is
// what the API returned for these parameters; nothing is filtered, sorted or
// added up here. Keyed by report, so each starts from a clean state.
function ReportView({ report, formats, maxRows }) {
  const notify = useNotify();
  const [state, setState] = useState(() => blank(report));
  const [searchInput, setSearchInput] = useState('');
  const exporter = useReportExport();
  const change = (patch) => setState((current) => ({ ...current, page: 1, ...patch }));

  // Debounce typing so each keystroke does not hit the API.
  useEffect(() => {
    const value = searchInput.trim();
    if (value === state.search) return undefined;
    const timer = setTimeout(() => change({ search: value }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const rangeValid = !state.from || !state.to || state.from <= state.to;
  // What is sent, for both the report and its exports: only what is set.
  const criteria = useMemo(() => {
    const { page, limit, filters, ...rest } = state;
    return Object.fromEntries(Object.entries({ ...rest, ...filters }).filter(([, value]) => value !== '' && value != null));
  }, [state]);
  const params = useMemo(() => ({ ...criteria, page: state.page, limit: state.limit }), [criteria, state.page, state.limit]);
  const { data, error, isFetching, isPending, refetch } = useReport(report.key, params, { enabled: rangeValid });

  const columns = useMemo(
    () =>
      report.columns.map((column, index) => ({
        field: column.key,
        headerName: column.label,
        ...(column.type === 'text' ? { flex: index < 3 ? 1.2 : 1, minWidth: 140 } : { width: WIDTHS[column.type] }),
        align: NUMERIC.includes(column.type) ? 'right' : 'left',
        headerAlign: NUMERIC.includes(column.type) ? 'right' : 'left',
        valueFormatter: FORMATTERS[column.type],
      })),
    [report]
  );
  const labelOf = (key) => report.columns.find((column) => column.key === key)?.label ?? key;
  const typeOf = (key) => report.columns.find((column) => column.key === key)?.type ?? 'number';
  const setFilter = (key) => (value) => change({ filters: { ...state.filters, [key]: value } });
  const dirty = JSON.stringify({ ...state, page: 1, limit: 20 }) !== JSON.stringify(blank(report)) || searchInput !== '';

  async function download(format) {
    try {
      const blob = await exporter.mutateAsync({ key: report.key, params: criteria, format });
      saveBlob(blob, `${report.key}-report-${new Date().toISOString().slice(0, 10)}.${format}`);
      const total = data?.pagination.total ?? 0;
      if (total > maxRows) notify.info(`The file holds the first ${formatAmount(maxRows)} of ${formatAmount(total)} rows. Narrow the report to export the rest.`);
      else notify.success(`${report.title} report exported`);
    } catch (err) {
      notify.error(err.message);
    }
  }

  return (
    <Stack spacing={2}>
      <Typography color="text.secondary">{report.description}</Typography>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}>
          {report.dateFields.length > 1 && (
            <TextField select label="Date" value={state.dateField} onChange={(event) => change({ dateField: event.target.value })} sx={{ width: 170 }}>
              {report.dateFields.map((field) => (
                <MenuItem key={field.key} value={field.key}>
                  {field.label}
                </MenuItem>
              ))}
            </TextField>
          )}
          {['from', 'to'].map((field) => (
            <TextField
              key={field}
              type="date"
              // With one date field there is no selector, so the label names it.
              label={`${report.dateFields.length > 1 ? '' : `${report.dateFields[0].label}: `}${field === 'from' ? 'From' : 'To'}`}
              value={state[field]}
              onChange={(event) => change({ [field]: event.target.value })}
              error={!rangeValid}
              helperText={!rangeValid && field === 'to' ? 'Must not be before the start' : undefined}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: 170 }}
            />
          ))}
          <TextField
            label="Search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
            sx={filterSx}
          />
          {/* The report's own filters, as the API describes them. */}
          {report.filters.map((filter) => {
            const value = state.filters[filter.key] ?? '';
            if (filter.type === 'user') return <UserSelect key={filter.key} label={filter.label} value={value} onChange={setFilter(filter.key)} sx={filterSx} />;
            if (filter.type === 'company') return <CompanySelect key={filter.key} label={filter.label} value={value} onChange={setFilter(filter.key)} sx={filterSx} />;
            return (
              <TextField
                key={filter.key}
                select
                label={filter.label}
                value={value}
                onChange={(event) => setFilter(filter.key)(event.target.value)}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                sx={filterSx}
              >
                {!filter.required && <MenuItem value="">All</MenuItem>}
                {filter.options.map((option) => (
                  <MenuItem key={option.value} value={option.value} sx={{ textTransform: 'capitalize' }}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            );
          })}
          <Button
            disabled={!dirty}
            onClick={() => {
              setSearchInput('');
              setState(blank(report));
            }}
          >
            Clear
          </Button>
        </Stack>
      </Paper>

      <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center', justifyContent: 'space-between' }}>
        {/* Totals over every matching row, added up by the API. */}
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }} aria-label="Report totals">
          {data && <Chip label={`Rows: ${formatAmount(data.pagination.total)}`} />}
          {data &&
            Object.entries(data.totals).map(([key, value]) => (
              <Chip key={key} variant="outlined" label={`${labelOf(key)}: ${FORMATTERS[typeOf(key)](value)}`} />
            ))}
          {data && data.scope.type !== 'all' && <Chip variant="outlined" color="info" label={data.scope.organization ? data.scope.organization.name : 'Your own records'} />}
        </Stack>
        <PermissionGate permission={PERMISSIONS.REPORTS_EXPORT}>
          <Stack direction="row" spacing={1}>
            {formats.map((format) => (
              <Button
                key={format}
                size="small"
                variant="outlined"
                startIcon={<DownloadOutlinedIcon />}
                disabled={!data || !rangeValid || exporter.isPending}
                loading={exporter.isPending && exporter.variables?.format === format}
                onClick={() => download(format)}
              >
                {FORMAT_LABELS[format] ?? format}
              </Button>
            ))}
          </Stack>
        </PermissionGate>
      </Stack>

      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }
        >
          {(error.errors ?? []).map((e) => e.message).join(', ') || error.message}
        </Alert>
      )}

      <Box sx={{ height: 'calc(100vh - 430px)', minHeight: 420, width: '100%' }}>
        <DataGrid
          rows={data?.rows ?? []}
          columns={columns}
          loading={isFetching || (isPending && rangeValid)}
          rowCount={data?.pagination.total ?? 0}
          paginationMode="server"
          sortingMode="server"
          pageSizeOptions={PAGE_SIZES}
          paginationModel={{ page: state.page - 1, pageSize: state.limit }}
          onPaginationModelChange={(model) => setState((current) => ({ ...current, page: model.pageSize === current.limit ? model.page + 1 : 1, limit: model.pageSize }))}
          sortModel={sortModelOf(state.sortBy, state.sortOrder)}
          onSortModelChange={([sort]) => change({ sortBy: sort?.field ?? '', sortOrder: sort?.sort ?? '' })}
          disableColumnFilter
          disableRowSelectionOnClick
          localeText={{ noRowsLabel: 'No rows match' }}
        />
      </Box>
    </Stack>
  );
}

// /reports and /reports/:key - the reports the API says this user can run.
export default function ReportsPage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { data, error, isPending } = useReportCatalog();

  if (isPending) return <LoadingScreen />;
  if (error) return <Alert severity="error">{error.message}</Alert>;
  if (data.reports.length === 0) {
    return <Alert severity="info">Your role can open reports but cannot read any of the modules they report on.</Alert>;
  }
  const report = data.reports.find((entry) => entry.key === key) ?? data.reports[0];

  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        Reports
      </Typography>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={report.key} onChange={(event, value) => navigate(`/reports/${value}`)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Reports">
          {data.reports.map((entry) => (
            <Tab key={entry.key} value={entry.key} label={entry.title} />
          ))}
        </Tabs>
      </Box>
      <ReportView key={report.key} report={report} formats={data.exportFormats} maxRows={data.exportMaxRows} />
    </Stack>
  );
}
