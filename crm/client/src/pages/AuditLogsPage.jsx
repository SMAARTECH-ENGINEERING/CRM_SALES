import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DataGrid } from '@mui/x-data-grid';
import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import LoadingScreen from '../components/LoadingScreen.jsx';
import UserSelect from '../components/users/UserSelect.jsx';
import { useAuditFilters, useAuditLog, useAuditLogs } from '../hooks/useAuditLogs.js';
import { PAGE_SIZES, SEARCH_DEBOUNCE_MS, sortModelOf } from '../hooks/useListParams.js';
import { entityPath } from '../utils/entityPaths.js';
import { EMPTY, formatDateTime } from '../utils/format.js';

const BLANK = { userId: '', action: '', entityType: '', from: '', to: '', success: '', search: '' };
// How each kind of action is tinted. The actions themselves come from the API.
const ACTION_COLORS = { CREATE: 'success', DELETE: 'error', LOGIN: 'info', LOGOUT: 'info', PASSWORD_CHANGE: 'warning', PERMISSION_CHANGE: 'warning' };
const words = (value) => String(value ?? '').replace(/_/g, ' ').toLowerCase();
const centered = { display: 'flex', alignItems: 'center', height: '100%' };
const filterSx = { minWidth: 180, flex: '1 1 180px', maxWidth: 260 };

function ActionChip({ entry }) {
  return <Chip size="small" color={entry.success ? (ACTION_COLORS[entry.action] ?? 'default') : 'error'} variant={entry.success ? 'outlined' : 'filled'} label={`${words(entry.action)}${entry.success ? '' : ' - refused'}`} sx={{ textTransform: 'capitalize' }} />;
}

// A stored value, as text.
const show = (value) => (value === undefined ? EMPTY : typeof value === 'object' && value !== null ? JSON.stringify(value, null, 1) : String(value));

function Field({ label, children }) {
  return (
    <div>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant="body2" component="div" sx={{ wordBreak: 'break-word' }}>
        {children || EMPTY}
      </Typography>
    </div>
  );
}

// One entry in full: who, what, from where, and the before and after of every
// field that changed - as the API returns it.
function AuditLogDialog({ id, onClose }) {
  const { data: entry, error, isPending } = useAuditLog(id);
  const fields = entry ? [...new Set([...Object.keys(entry.oldData ?? {}), ...Object.keys(entry.newData ?? {})])] : [];
  const path = entry ? entityPath(entry.entityType, entry.entityId) : null;

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Audit log entry</DialogTitle>
      <DialogContent>
        {isPending && <LoadingScreen />}
        {error && <Alert severity="error">{error.message}</Alert>}
        {entry && (
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
              <Field label="When">{formatDateTime(entry.timestamp)}</Field>
              <Field label="Who">{entry.user ? `${entry.user.fullName} (${entry.user.email})` : 'Not signed in'}</Field>
              <Field label="Action">
                <ActionChip entry={entry} />
              </Field>
              <Field label="Organization">{entry.organization?.name}</Field>
              <Field label="Record">
                {entry.entityType}
                {entry.entityId &&
                  (path ? (
                    <>
                      {' · '}
                      <Link component={RouterLink} to={path} underline="hover">
                        open
                      </Link>
                    </>
                  ) : (
                    ` · ${entry.entityId}`
                  ))}
              </Field>
              <Field label="IP address">{entry.ipAddress}</Field>
              <Field label="Request">{`${entry.method} ${entry.path} → ${entry.statusCode}`}</Field>
              <Field label="Browser / client">{entry.userAgent}</Field>
            </Box>

            {fields.length === 0 ? (
              <Alert severity="info">No data is kept for this kind of entry.</Alert>
            ) : (
              <Table size="small" aria-label="Changes" sx={{ tableLayout: 'fixed' }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: '24%' }}>Field</TableCell>
                    <TableCell>Before</TableCell>
                    <TableCell>After</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fields.map((field) => (
                    <TableRow key={field}>
                      <TableCell component="th" scope="row" sx={{ verticalAlign: 'top', fontWeight: 500 }}>
                        {field}
                      </TableCell>
                      {[entry.oldData, entry.newData].map((side, index) => (
                        <TableCell key={index} sx={{ verticalAlign: 'top', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', fontSize: 12 }}>
                          {show(side?.[field])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// /audit-logs - who did what, when and from where. Read-only: entries cannot
// be edited or deleted, here or through the API.
export default function AuditLogsPage() {
  const [filters, setFilters] = useState(BLANK);
  const [searchInput, setSearchInput] = useState('');
  const [paging, setPaging] = useState({ page: 1, limit: 20 });
  const [sortOrder, setSortOrder] = useState('desc');
  const [openId, setOpenId] = useState(null);
  const options = useAuditFilters();

  const change = (patch) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPaging((current) => ({ ...current, page: 1 }));
  };
  useEffect(() => {
    const value = searchInput.trim();
    if (value === filters.search) return undefined;
    const timer = setTimeout(() => change({ search: value }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const rangeValid = !filters.from || !filters.to || filters.from <= filters.to;
  const params = useMemo(
    () => ({ ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')), ...paging, sortOrder }),
    [filters, paging, sortOrder]
  );
  const { data, error, isFetching, refetch } = useAuditLogs(rangeValid ? params : { ...params, from: undefined, to: undefined });

  const columns = useMemo(
    () => [
      { field: 'timestamp', headerName: 'When', width: 180, valueFormatter: (value) => formatDateTime(value) },
      { field: 'user', headerName: 'Who', flex: 1, minWidth: 160, sortable: false, valueGetter: (value) => value?.fullName ?? 'Not signed in' },
      {
        field: 'action',
        headerName: 'Action',
        width: 210,
        sortable: false,
        renderCell: ({ row }) => (
          <Box sx={centered}>
            <ActionChip entry={row} />
          </Box>
        ),
      },
      { field: 'entityType', headerName: 'Record', width: 150, sortable: false, valueFormatter: (value) => value ?? EMPTY },
      { field: 'path', headerName: 'Request', flex: 1.4, minWidth: 220, sortable: false, valueGetter: (value, row) => `${row.method} ${value}` },
      { field: 'ipAddress', headerName: 'IP address', width: 140, sortable: false },
      {
        field: 'id',
        headerName: '',
        width: 90,
        sortable: false,
        renderCell: ({ row }) => (
          <Button size="small" onClick={() => setOpenId(row.id)} aria-label={`View entry of ${formatDateTime(row.timestamp)}`}>
            View
          </Button>
        ),
      },
    ],
    []
  );
  const dirty = JSON.stringify(filters) !== JSON.stringify(BLANK) || searchInput !== '';
  const select = (key, label, values, all) => (
    <TextField select label={label} value={filters[key]} onChange={(event) => change({ [key]: event.target.value })} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} sx={filterSx}>
      <MenuItem value="">{all}</MenuItem>
      {values.map(([value, text]) => (
        <MenuItem key={value} value={value} sx={{ textTransform: 'capitalize' }}>
          {text}
        </MenuItem>
      ))}
    </TextField>
  );

  return (
    <Stack spacing={2}>
      <div>
        <Typography variant="h4" component="h1">
          Audit log
        </Typography>
        <Typography color="text.secondary">Every change, sign-in and sign-out: who, what, when and from where. Entries cannot be edited or deleted.</Typography>
      </div>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}>
          <UserSelect label="User" value={filters.userId} onChange={(userId) => change({ userId })} sx={filterSx} />
          {/* The actions and kinds of record are the ones the API reports. */}
          {select('action', 'Action', (options.data?.actions ?? []).map((action) => [action, words(action)]), 'All actions')}
          {select('entityType', 'Record', (options.data?.entityTypes ?? []).map((type) => [type, type]), 'All records')}
          {['from', 'to'].map((field) => (
            <TextField
              key={field}
              type="date"
              label={field === 'from' ? 'From' : 'To'}
              value={filters[field]}
              onChange={(event) => change({ [field]: event.target.value })}
              error={!rangeValid}
              helperText={!rangeValid && field === 'to' ? 'Must not be before the start' : undefined}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: 170 }}
            />
          ))}
          {select('success', 'Result', [['true', 'Done'], ['false', 'Refused']], 'Any result')}
          <TextField
            label="Search"
            placeholder="IP address or path"
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
          <Button
            disabled={!dirty}
            onClick={() => {
              setSearchInput('');
              setFilters(BLANK);
              setPaging((current) => ({ ...current, page: 1 }));
            }}
          >
            Clear
          </Button>
        </Stack>
      </Paper>

      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          }
        >
          {error.message}
        </Alert>
      )}

      <Box sx={{ height: 'calc(100vh - 360px)', minHeight: 420, width: '100%' }}>
        <DataGrid
          rows={data?.auditLogs ?? []}
          columns={columns}
          loading={isFetching}
          rowCount={data?.pagination.total ?? 0}
          paginationMode="server"
          sortingMode="server"
          pageSizeOptions={PAGE_SIZES}
          paginationModel={{ page: paging.page - 1, pageSize: paging.limit }}
          onPaginationModelChange={(model) => setPaging((current) => ({ page: model.pageSize === current.limit ? model.page + 1 : 1, limit: model.pageSize }))}
          sortModel={sortModelOf('timestamp', sortOrder)}
          onSortModelChange={([sort]) => setSortOrder(sort?.sort === 'asc' ? 'asc' : 'desc')}
          disableColumnFilter
          disableRowSelectionOnClick
          localeText={{ noRowsLabel: dirty ? 'No entries match these filters' : 'No entries yet' }}
        />
      </Box>

      {openId && <AuditLogDialog id={openId} onClose={() => setOpenId(null)} />}
    </Stack>
  );
}
