import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import AdvancedDataTable from '../components/ui/AdvancedDataTable.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { FilterBar } from '../components/ui/FilterDrawer.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { TICKET_CONFIG } from '../api/leadConfig.api.js';
import ConfigChip from '../components/leads/ConfigChip.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import TicketDialog from '../components/tickets/TicketDialog.jsx';
import useAuth from '../hooks/useAuth.js';
import useListParams, { SEARCH_DEBOUNCE_MS, serverPaging, serverSorting, toApiParams } from '../hooks/useListParams.js';
import { useTicketsList, useTicketStats } from '../hooks/useTickets.js';
import { EMPTY, formatDateTime } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const FILTER_KEYS = ['statusCategory', 'statusId', 'priorityId', 'categoryId', 'queue'];
const centered = { display: 'flex', alignItems: 'center', height: '100%' };

// Which tickets to show, by who has them.
const QUEUES = [
  { value: '', label: 'All tickets' },
  { value: 'mine', label: 'Assigned to me' },
  { value: 'unassigned', label: 'Unassigned' },
];

export default function TicketsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [params, updateParams] = useListParams(FILTER_KEYS);
  const [searchInput, setSearchInput] = useState(params.search);
  const [adding, setAdding] = useState(false);

  // Debounce typing so each keystroke does not hit the API.
  useEffect(() => {
    const value = searchInput.trim();
    if (value === params.search) return undefined;
    const timer = setTimeout(() => updateParams({ search: value }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const apiParams = useMemo(() => {
    const { queue, ...rest } = params;
    return toApiParams({
      ...rest,
      ...(queue === 'mine' ? { assignedTo: user.id } : {}),
      ...(queue === 'unassigned' ? { unassigned: 'true' } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params), user.id]);
  const { data, error, isFetching, refetch } = useTicketsList(apiParams);
  const stats = useTicketStats(params.queue === 'mine' ? { assignedTo: user.id } : {});

  const columns = useMemo(
    () => [
      { field: 'ticketNumber', headerName: t('fields.number'), width: 120 },
      {
        field: 'subject',
        headerName: t('fields.subject'),
        flex: 1.6,
        minWidth: 220,
        renderCell: ({ row }) => (
          <Link component={RouterLink} to={`/tickets/${row.id}`} underline="hover" sx={{ fontWeight: 500 }}>
            {row.subject}
          </Link>
        ),
      },
      { field: 'company', headerName: t('fields.company'), flex: 1, minWidth: 150, sortable: false, valueGetter: (value) => value?.name ?? EMPTY },
      {
        field: 'status',
        headerName: t('fields.status'),
        width: 160,
        sortable: false,
        renderCell: ({ value }) => <Box sx={centered}>{value ? <ConfigChip value={value} /> : EMPTY}</Box>,
      },
      {
        field: 'priority',
        headerName: t('fields.priority'),
        width: 120,
        sortable: false,
        renderCell: ({ value }) => <Box sx={centered}>{value ? <ConfigChip value={value} /> : EMPTY}</Box>,
      },
      { field: 'category', headerName: t('fields.category'), width: 140, sortable: false, valueGetter: (value) => value?.name ?? EMPTY },
      { field: 'assignedToUser', headerName: t('fields.assignedTo'), width: 150, sortable: false, valueGetter: (value) => value?.fullName ?? 'Unassigned' },
      { field: 'replyCount', headerName: t('fields.replies'), width: 90, align: 'right', headerAlign: 'right', sortable: false },
      { field: 'lastActivityAt', headerName: t('fields.lastActivity'), width: 170, valueFormatter: (value) => formatDateTime(value) },
    ],
    [t]
  );

  const hasFilters = Boolean(params.search || FILTER_KEYS.some((key) => params[key]));
  const filterSx = { flex: 1, minWidth: 150 };
  const counts = stats.data?.byCategory;

  return (
    <Stack spacing={2}>
      <PageHeader
        title={t('pages.tickets.title')}
        subtitle={t('pages.tickets.subtitle')}
        actions={
          <>
            <PermissionGate permission={PERMISSIONS.TICKETS_CREATE}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
                {t('pages.tickets.new')}
              </Button>
            </PermissionGate>
          </>
        }
      />

      {/* Counts by what the status means, from the API; a click filters the list. */}
      {counts && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }} aria-label="Ticket counts">
          {TICKET_CONFIG.STATUSES.categories.map((category) => (
            <Chip
              key={category.value}
              label={`${category.label}: ${counts[category.value] ?? 0}`}
              color={params.statusCategory === category.value ? 'primary' : 'default'}
              variant={params.statusCategory === category.value ? 'filled' : 'outlined'}
              onClick={() => updateParams({ statusCategory: params.statusCategory === category.value ? '' : category.value, statusId: '' })}
            />
          ))}
          <Chip
            label={`Unassigned and open: ${stats.data.unassignedOpen}`}
            variant={params.queue === 'unassigned' ? 'filled' : 'outlined'}
            color={params.queue === 'unassigned' ? 'primary' : 'default'}
            onClick={() => updateParams({ queue: params.queue === 'unassigned' ? '' : 'unassigned' })}
          />
        </Stack>
      )}

      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              {t('actions.retry')}
            </Button>
          }
        >
          {error.message}
        </Alert>
      )}

      <AdvancedDataTable
        tableId="tickets"
        height="calc(100vh - 240px)"
        rowHref={(row) => `/tickets/${row.id}`}
        toolbar={
          <FilterBar activeCount={FILTER_KEYS.filter((key) => params[key]).length}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
              <TextField
                label={t('fields.search')}
                placeholder="Number, subject or description"
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
                sx={{ flex: 2 }}
              />
              <TextField
                select
                label={t('fields.queue')}
                value={params.queue}
                onChange={(event) => updateParams({ queue: event.target.value })}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                sx={filterSx}
              >
                {QUEUES.map((queue) => (
                  <MenuItem key={queue.value} value={queue.value}>
                    {queue.label}
                  </MenuItem>
                ))}
              </TextField>
              {/* Statuses, priorities and categories are the configured lists, from the API. */}
              <LeadConfigSelect
                list={TICKET_CONFIG.STATUSES}
                label={t('fields.status')}
                emptyLabel={t('fields.allStatuses')}
                value={params.statusId}
                onChange={(statusId) => updateParams({ statusId, statusCategory: '' })}
                sx={filterSx}
              />
              <LeadConfigSelect
                list={TICKET_CONFIG.PRIORITIES}
                label={t('fields.priority')}
                emptyLabel={t('fields.allPriorities')}
                value={params.priorityId}
                onChange={(priorityId) => updateParams({ priorityId })}
                sx={filterSx}
              />
              <LeadConfigSelect
                list={TICKET_CONFIG.CATEGORIES}
                label={t('fields.category')}
                emptyLabel={t('fields.allCategories')}
                value={params.categoryId}
                onChange={(categoryId) => updateParams({ categoryId })}
                sx={filterSx}
              />
              <Button
                disabled={!hasFilters && !searchInput}
                onClick={() => {
                  setSearchInput('');
                  updateParams({ search: '', statusCategory: '', statusId: '', priorityId: '', categoryId: '', queue: '' });
                }}
                sx={{ flexShrink: 0 }}
              >
                {t('actions.clear')}
              </Button>
            </Stack>
          </FilterBar>
        }
        rows={data?.tickets ?? []}
        columns={columns}
        loading={isFetching}
        {...serverPaging(params, updateParams, data?.pagination)}
        {...serverSorting(params, updateParams)}
        emptyState={<EmptyState dense filtered={hasFilters} />}
      />

      {adding && <TicketDialog onClose={() => setAdding(false)} />}
    </Stack>
  );
}
