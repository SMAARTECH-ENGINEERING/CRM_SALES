import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
import { MASTER_DATA } from '../api/masterData.api.js';
import CustomerDialog, { CUSTOMER_STATUSES } from '../components/customers/CustomerDialog.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import StatusChip from '../components/StatusChip.jsx';
import UserSelect from '../components/users/UserSelect.jsx';
import { useCustomersList } from '../hooks/useCustomers.js';
import useListParams, { SEARCH_DEBOUNCE_MS, serverPaging, serverSorting, toApiParams } from '../hooks/useListParams.js';
import { useMasterData } from '../hooks/useMasterData.js';
import { EMPTY, formatAmount, formatDate } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const FILTER_KEYS = ['status', 'accountManagerId', 'industryId'];
const centered = { display: 'flex', alignItems: 'center', height: '100%' };

export default function CustomersPage() {
  const { t } = useTranslation();
  const [params, updateParams] = useListParams(FILTER_KEYS);
  const [searchInput, setSearchInput] = useState(params.search);
  const [adding, setAdding] = useState(false);
  const industries = useMasterData(MASTER_DATA.INDUSTRIES);

  // Debounce typing so each keystroke does not hit the API.
  useEffect(() => {
    const value = searchInput.trim();
    if (value === params.search) return undefined;
    const timer = setTimeout(() => updateParams({ search: value }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const apiParams = useMemo(
    () => toApiParams(params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(params)]
  );
  const { data, error, isFetching, refetch } = useCustomersList(apiParams);

  // Every figure in a row is the API's (`stats`); none is worked out here.
  const columns = useMemo(
    () => [
      { field: 'customerNumber', headerName: t('fields.number'), width: 130 },
      {
        field: 'name',
        headerName: t('fields.customer'),
        flex: 1.5,
        minWidth: 200,
        valueGetter: (value, row) => row.company?.name,
        renderCell: ({ row }) => (
          <Link component={RouterLink} to={`/customers/${row.id}`} underline="hover" sx={{ fontWeight: 500 }}>
            {row.company?.name}
          </Link>
        ),
      },
      {
        field: 'city',
        headerName: t('fields.city'),
        width: 130,
        sortable: false,
        valueGetter: (value, row) => row.company?.city ?? EMPTY,
      },
      {
        field: 'accountManager',
        headerName: t('fields.accountManager'),
        width: 160,
        sortable: false,
        valueGetter: (value) => value?.fullName ?? EMPTY,
      },
      {
        field: 'status',
        headerName: t('fields.status'),
        width: 110,
        sortable: false,
        renderCell: ({ value }) => (
          <Box sx={centered}>
            <StatusChip status={value} />
          </Box>
        ),
      },
      { field: 'customerSince', headerName: t('fields.since'), width: 130, valueFormatter: (value) => formatDate(value) },
      {
        field: 'orderCount',
        headerName: t('fields.orders'),
        width: 90,
        align: 'right',
        headerAlign: 'right',
        sortable: false,
        valueGetter: (value, row) => row.stats?.orderCount,
      },
      {
        field: 'orderValue',
        headerName: t('fields.orderValue'),
        width: 140,
        align: 'right',
        headerAlign: 'right',
        sortable: false,
        valueGetter: (value, row) => row.stats?.orderValue,
        valueFormatter: (value) => formatAmount(value),
      },
      {
        field: 'lastOrderDate',
        headerName: t('fields.lastOrder'),
        width: 130,
        sortable: false,
        valueGetter: (value, row) => row.stats?.lastOrderDate,
        valueFormatter: (value) => formatDate(value),
      },
    ],
    [t]
  );

  const hasFilters = Boolean(params.search || FILTER_KEYS.some((key) => params[key]));
  const filterSx = { flex: 1, minWidth: 160 };

  return (
    <Stack spacing={2}>
      <PageHeader
        title={t('pages.customers.title')}
        subtitle={t('pages.customers.subtitle')}
        actions={
          <PermissionGate permission={PERMISSIONS.CUSTOMERS_CREATE}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
              {t('pages.customers.new')}
            </Button>
          </PermissionGate>
        }
      />

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
        tableId="customers"
        height="calc(100vh - 200px)"
        rowHref={(row) => `/customers/${row.id}`}
        toolbar={
          <FilterBar activeCount={FILTER_KEYS.filter((key) => params[key]).length}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
              <TextField
                label={t('fields.search')}
                placeholder="Number, name, code, email, phone or city"
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
                label={t('fields.status')}
                value={params.status}
                onChange={(event) => updateParams({ status: event.target.value })}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                sx={filterSx}
              >
                <MenuItem value="">All statuses</MenuItem>
                {CUSTOMER_STATUSES.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              {/* Industries are the configured list, from the API. */}
              <TextField
                select
                label={t('fields.industry')}
                value={industries.data?.some((item) => item.id === params.industryId) ? params.industryId : ''}
                onChange={(event) => updateParams({ industryId: event.target.value })}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                sx={filterSx}
              >
                <MenuItem value="">All industries</MenuItem>
                {(industries.data ?? []).map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name}
                  </MenuItem>
                ))}
              </TextField>
              <UserSelect
                label={t('fields.accountManager')}
                value={params.accountManagerId}
                onChange={(id) => updateParams({ accountManagerId: id })}
                sx={{ ...filterSx, minWidth: 200 }}
              />
              <Button
                disabled={!hasFilters && !searchInput}
                onClick={() => {
                  setSearchInput('');
                  updateParams({ search: '', status: '', accountManagerId: '', industryId: '' });
                }}
                sx={{ flexShrink: 0 }}
              >
                {t('actions.clear')}
              </Button>
            </Stack>
          </FilterBar>
        }
        rows={data?.customers ?? []}
        columns={columns}
        loading={isFetching}
        {...serverPaging(params, updateParams, data?.pagination)}
        {...serverSorting(params, updateParams)}
        emptyState={<EmptyState dense filtered={hasFilters} />}
      />

      {adding && <CustomerDialog onClose={() => setAdding(false)} />}
    </Stack>
  );
}
