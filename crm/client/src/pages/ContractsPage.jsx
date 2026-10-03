import AddIcon from '@mui/icons-material/Add';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
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
import { CONTRACT_CONFIG } from '../api/leadConfig.api.js';
import ContractDialog from '../components/contracts/ContractDialog.jsx';
import ContractEndChip from '../components/contracts/ContractEndChip.jsx';
import ConfigChip from '../components/leads/ConfigChip.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import useAuth from '../hooks/useAuth.js';
import { useContractMutations, useContractsList, useContractStats } from '../hooks/useContracts.js';
import useListParams, { SEARCH_DEBOUNCE_MS, serverPaging, serverSorting, toApiParams } from '../hooks/useListParams.js';
import useNotify from '../hooks/useNotify.js';
import { EMPTY, formatAmount, formatDate } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const FILTER_KEYS = ['statusCategory', 'statusId', 'contractTypeId', 'billingCycleId', 'queue', 'expiring'];
const centered = { display: 'flex', alignItems: 'center', height: '100%' };

const QUEUES = [
  { value: '', label: 'All contracts' },
  { value: 'mine', label: 'Assigned to me' },
];

export default function ContractsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const notify = useNotify();
  const [params, updateParams] = useListParams(FILTER_KEYS);
  const [searchInput, setSearchInput] = useState(params.search);
  const [adding, setAdding] = useState(false);
  const { runReminders } = useContractMutations();

  useEffect(() => {
    const value = searchInput.trim();
    if (value === params.search) return undefined;
    const timer = setTimeout(() => updateParams({ search: value }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const stats = useContractStats(params.queue === 'mine' ? { assignedTo: user.id } : {});
  // How far ahead "expiring soon" looks: the longest active reminder period, from the API.
  const soonWithin = stats.data?.expiringSoon.withinDays;

  const apiParams = useMemo(() => {
    const { queue, expiring, ...rest } = params;
    return toApiParams({
      ...rest,
      ...(queue === 'mine' ? { assignedTo: user.id } : {}),
      ...(expiring && soonWithin != null ? { expiringWithin: soonWithin } : {}),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params), user.id, soonWithin]);
  const { data, error, isFetching, refetch } = useContractsList(apiParams);

  async function runCheck() {
    try {
      const { data: result } = await runReminders.mutateAsync();
      notify.success(
        `Reminder check done: ${result.reminded} reminder(s) sent (${result.emailed} by email), ${result.expired} contract(s) marked expired`
      );
    } catch (err) {
      notify.error(err.message);
    }
  }

  const columns = useMemo(
    () => [
      {
        field: 'contractNumber',
        headerName: t('fields.number'),
        width: 130,
        renderCell: ({ row }) => (
          <Link component={RouterLink} to={`/contracts/${row.id}`} underline="hover" sx={{ fontWeight: 500 }}>
            {row.contractNumber}
          </Link>
        ),
      },
      { field: 'company', headerName: t('fields.company'), flex: 1.2, minWidth: 170, sortable: false, valueGetter: (value) => value?.name ?? EMPTY },
      { field: 'contractType', headerName: t('fields.type'), flex: 1, minWidth: 150, sortable: false, valueGetter: (value) => value?.name ?? EMPTY },
      {
        field: 'status',
        headerName: t('fields.status'),
        width: 130,
        sortable: false,
        renderCell: ({ value }) => <Box sx={centered}>{value ? <ConfigChip value={value} /> : EMPTY}</Box>,
      },
      { field: 'startDate', headerName: t('fields.start'), width: 115, valueFormatter: (value) => formatDate(value) },
      { field: 'endDate', headerName: t('fields.end'), width: 115, valueFormatter: (value) => formatDate(value) },
      {
        field: 'daysToEnd',
        headerName: t('fields.ends'),
        width: 160,
        sortable: false,
        renderCell: ({ row }) => (
          <Box sx={centered}>
            <ContractEndChip contract={row} soonWithin={soonWithin} />
          </Box>
        ),
      },
      { field: 'renewalDate', headerName: t('fields.renewal'), width: 115, valueFormatter: (value) => (value ? formatDate(value) : EMPTY) },
      {
        field: 'amount',
        headerName: t('fields.amount'),
        width: 130,
        align: 'right',
        headerAlign: 'right',
        valueFormatter: (value) => formatAmount(value),
      },
      { field: 'billingCycle', headerName: t('fields.billing'), width: 120, sortable: false, valueGetter: (value) => value?.name ?? EMPTY },
      { field: 'assignedToUser', headerName: t('fields.assignedTo'), width: 150, sortable: false, valueGetter: (value) => value?.fullName ?? EMPTY },
    ],
    [soonWithin]
  );

  const hasFilters = Boolean(params.search || FILTER_KEYS.some((key) => params[key]));
  const filterSx = { flex: 1, minWidth: 150 };
  const counts = stats.data?.byCategory;

  return (
    <Stack spacing={2}>
      <PageHeader
        title={t('pages.contracts.title')}
        subtitle={t('pages.contracts.subtitle')}
        actions={
          <>
            <PermissionGate permission={PERMISSIONS.CONTRACTS_MANAGE_SETTINGS}>
              <Button variant="outlined" startIcon={<NotificationsActiveOutlinedIcon />} onClick={runCheck} loading={runReminders.isPending}>
                Run reminder check
              </Button>
            </PermissionGate>
            <PermissionGate permission={PERMISSIONS.CONTRACTS_CREATE}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
                {t('pages.contracts.new')}
              </Button>
            </PermissionGate>
          </>
        }
      />

      {/* Counts and values from the API; a click filters the list. */}
      {counts && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }} aria-label="Contract counts">
          {CONTRACT_CONFIG.STATUSES.categories.map((category) => (
            <Chip
              key={category.value}
              label={`${category.label}: ${counts[category.value]?.count ?? 0}`}
              title={`Worth ${formatAmount(counts[category.value]?.value ?? 0)}`}
              color={params.statusCategory === category.value ? 'primary' : 'default'}
              variant={params.statusCategory === category.value ? 'filled' : 'outlined'}
              onClick={() =>
                updateParams({ statusCategory: params.statusCategory === category.value ? '' : category.value, statusId: '', expiring: '' })
              }
            />
          ))}
          {soonWithin != null && (
            <Chip
              label={`Expiring within ${soonWithin} days: ${stats.data.expiringSoon.count} (${formatAmount(stats.data.expiringSoon.value)})`}
              color="warning"
              variant={params.expiring ? 'filled' : 'outlined'}
              onClick={() => updateParams({ expiring: params.expiring ? '' : '1', statusCategory: '', statusId: '' })}
            />
          )}
          {stats.data.pastEndDate > 0 && (
            <Chip color="error" variant="outlined" label={`Active but past the end date: ${stats.data.pastEndDate}`} />
          )}
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
        tableId="contracts"
        height="calc(100vh - 240px)"
        rowHref={(row) => `/contracts/${row.id}`}
        toolbar={
          <FilterBar activeCount={FILTER_KEYS.filter((key) => params[key]).length}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
              <TextField
                label={t('fields.search')}
                placeholder="Number or description"
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
                label={t('fields.show')}
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
              <LeadConfigSelect
                list={CONTRACT_CONFIG.STATUSES}
                label={t('fields.status')}
                emptyLabel={t('fields.allStatuses')}
                value={params.statusId}
                onChange={(statusId) => updateParams({ statusId, statusCategory: '' })}
                sx={filterSx}
              />
              <LeadConfigSelect
                list={CONTRACT_CONFIG.TYPES}
                label={t('fields.type')}
                emptyLabel={t('fields.allTypes')}
                value={params.contractTypeId}
                onChange={(contractTypeId) => updateParams({ contractTypeId })}
                sx={filterSx}
              />
              <LeadConfigSelect
                list={CONTRACT_CONFIG.BILLING_CYCLES}
                label={t('fields.billingCycle')}
                emptyLabel={t('fields.allCycles')}
                value={params.billingCycleId}
                onChange={(billingCycleId) => updateParams({ billingCycleId })}
                sx={filterSx}
              />
              <Button
                disabled={!hasFilters && !searchInput}
                onClick={() => {
                  setSearchInput('');
                  updateParams({ search: '', statusCategory: '', statusId: '', contractTypeId: '', billingCycleId: '', queue: '', expiring: '' });
                }}
                sx={{ flexShrink: 0 }}
              >
                {t('actions.clear')}
              </Button>
            </Stack>
          </FilterBar>
        }
        rows={data?.contracts ?? []}
        columns={columns}
        loading={isFetching}
        {...serverPaging(params, updateParams, data?.pagination)}
        {...serverSorting(params, updateParams)}
        emptyState={<EmptyState dense filtered={hasFilters} />}
      />

      {adding && <ContractDialog onClose={() => setAdding(false)} />}
    </Stack>
  );
}
