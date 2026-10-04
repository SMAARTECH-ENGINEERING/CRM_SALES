import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { GridActionsCellItem } from '@mui/x-data-grid';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import AdvancedDataTable from '../components/ui/AdvancedDataTable.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { FilterBar } from '../components/ui/FilterDrawer.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { ORDER_CONFIG } from '../api/leadConfig.api.js';
import CompanySelect from '../components/companies/CompanySelect.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ConfigChip from '../components/leads/ConfigChip.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import useListParams, { SEARCH_DEBOUNCE_MS, serverPaging, serverSorting, toApiParams } from '../hooks/useListParams.js';
import useNotify from '../hooks/useNotify.js';
import { useOrderMutations, useOrdersList } from '../hooks/useOrders.js';
import usePermission from '../hooks/usePermission.js';
import { EMPTY, formatAmount, formatDate } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const FILTER_KEYS = ['statusId', 'companyId', 'dateFrom', 'dateTo'];
const centered = { display: 'flex', alignItems: 'center', height: '100%' };

export default function OrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const { remove } = useOrderMutations();
  const [params, updateParams] = useListParams(FILTER_KEYS);
  const [searchInput, setSearchInput] = useState(params.search);
  const [deleting, setDeleting] = useState(null);

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
  const { data, error, isFetching, refetch } = useOrdersList(apiParams);
  const canDelete = can(PERMISSIONS.ORDERS_DELETE);

  const columns = useMemo(
    () => [
      {
        field: 'orderNumber',
        headerName: t('fields.number'),
        width: 140,
        renderCell: ({ row }) => (
          <Link component={RouterLink} to={`/orders/${row.id}`} underline="hover" sx={{ fontWeight: 500 }}>
            {row.orderNumber}
          </Link>
        ),
      },
      {
        field: 'company',
        headerName: t('fields.customer'),
        flex: 1.4,
        minWidth: 180,
        sortable: false,
        valueGetter: (value) => value?.name ?? EMPTY,
      },
      {
        field: 'status',
        headerName: t('fields.status'),
        width: 140,
        sortable: false,
        renderCell: ({ value }) => <Box sx={centered}>{value ? <ConfigChip value={value} /> : EMPTY}</Box>,
      },
      {
        field: 'quotation',
        headerName: t('fields.quotation'),
        width: 140,
        sortable: false,
        valueGetter: (value) => value?.quotationNumber ?? EMPTY,
      },
      { field: 'orderDate', headerName: t('fields.orderDate'), width: 130, valueFormatter: (value) => formatDate(value) },
      { field: 'deliveryDate', headerName: t('fields.delivery'), width: 130, valueFormatter: (value) => formatDate(value) },
      {
        field: 'assignedToUser',
        headerName: t('fields.assignedTo'),
        width: 150,
        sortable: false,
        valueGetter: (value) => value?.fullName ?? EMPTY,
      },
      {
        field: 'grandTotal',
        headerName: t('fields.grandTotal'),
        width: 140,
        align: 'right',
        headerAlign: 'right',
        valueFormatter: (value) => formatAmount(value),
      },
      {
        field: 'actions',
        type: 'actions',
        headerName: t('fields.actions'),
        width: 80,
        getActions: ({ row }) =>
          [
            <GridActionsCellItem
              key="view"
              showInMenu
              icon={<VisibilityOutlinedIcon />}
              label={t('fields.viewDetails')}
              onClick={() => navigate(`/orders/${row.id}`)}
            />,
            canDelete && (
              <GridActionsCellItem
                key="delete"
                showInMenu
                icon={<DeleteOutlinedIcon />}
                label={t('fields.delete')}
                onClick={() => setDeleting(row)}
              />
            ),
          ].filter(Boolean),
      },
    ],
    [canDelete, navigate, t]
  );

  async function confirmDelete() {
    try {
      await remove.mutateAsync(deleting.id);
      notify.success(`${deleting.orderNumber} deleted`);
    } catch (err) {
      notify.error(err.message);
    }
    setDeleting(null);
  }

  const hasFilters = Boolean(params.search || FILTER_KEYS.some((key) => params[key]));
  const filterSx = { flex: 1, minWidth: 150 };

  return (
    <Stack spacing={2}>
      <PageHeader title={t('pages.orders.title')} subtitle={t('pages.orders.subtitle')} />

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
        tableId="orders"
        height="calc(100vh - 200px)"
        rowHref={(row) => `/orders/${row.id}`}
        toolbar={
          <FilterBar activeCount={FILTER_KEYS.filter((key) => params[key]).length}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
              <TextField
                label={t('fields.search')}
                placeholder="Number, product or notes"
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
              {/* The statuses are the configured ones, from the API. */}
              <LeadConfigSelect
                list={ORDER_CONFIG.STATUSES}
                label={t('fields.status')}
                emptyLabel={t('fields.allStatuses')}
                value={params.statusId}
                onChange={(statusId) => updateParams({ statusId })}
                sx={filterSx}
              />
              <CompanySelect
                label={t('fields.customer')}
                value={params.companyId}
                onChange={(companyId) => updateParams({ companyId })}
                sx={{ ...filterSx, minWidth: 200 }}
              />
              <TextField
                type="date"
                label={t('fields.from')}
                value={params.dateFrom}
                onChange={(event) => updateParams({ dateFrom: event.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={filterSx}
              />
              <TextField
                type="date"
                label={t('fields.to')}
                value={params.dateTo}
                onChange={(event) => updateParams({ dateTo: event.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={filterSx}
              />
              <Button
                disabled={!hasFilters && !searchInput}
                onClick={() => {
                  setSearchInput('');
                  updateParams({ search: '', statusId: '', companyId: '', dateFrom: '', dateTo: '' });
                }}
                sx={{ flexShrink: 0 }}
              >
                {t('actions.clear')}
              </Button>
            </Stack>
          </FilterBar>
        }
        rows={data?.orders ?? []}
        columns={columns}
        loading={isFetching}
        {...serverPaging(params, updateParams, data?.pagination)}
        {...serverSorting(params, updateParams)}
        emptyState={<EmptyState dense filtered={hasFilters} />}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete order"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      >
        {deleting
          ? `${deleting.orderNumber} will be removed from the CRM.${deleting.quotation ? ` Its quotation can then be turned into an order again.` : ''}`
          : ''}
      </ConfirmDialog>
    </Stack>
  );
}
