import AddIcon from '@mui/icons-material/Add';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
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
import { CATALOG_CONFIG } from '../api/leadConfig.api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import StatusChip, { STATUS_OPTIONS } from '../components/StatusChip.jsx';
import useListParams, { SEARCH_DEBOUNCE_MS, serverPaging, serverSorting, toApiParams } from '../hooks/useListParams.js';
import useNotify from '../hooks/useNotify.js';
import usePermission from '../hooks/usePermission.js';
import { useProductMutations, useProductsList } from '../hooks/useProducts.js';
import { EMPTY, formatAmount, formatDateTime } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const FILTER_KEYS = ['categoryId', 'status', 'minPrice', 'maxPrice'];
const TEXT_KEYS = ['search', 'minPrice', 'maxPrice'];

export default function ProductsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const { remove } = useProductMutations();
  const [params, updateParams] = useListParams(FILTER_KEYS);
  // Typed filters are held locally and applied after a pause.
  const [typed, setTyped] = useState({ search: params.search, minPrice: params.minPrice, maxPrice: params.maxPrice });
  const [deleting, setDeleting] = useState(null);

  // A range the wrong way round is not sent; the fields say why.
  const min = typed.minPrice === '' ? null : Number(typed.minPrice);
  const max = typed.maxPrice === '' ? null : Number(typed.maxPrice);
  const rangeInvalid = min !== null && max !== null && min > max;

  // Debounce typing so each keystroke does not hit the API.
  useEffect(() => {
    if (rangeInvalid) return undefined;
    const next = Object.fromEntries(TEXT_KEYS.map((key) => [key, String(typed[key]).trim()]));
    if (TEXT_KEYS.every((key) => next[key] === params[key])) return undefined;
    const timer = setTimeout(() => updateParams(next), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed.search, typed.minPrice, typed.maxPrice]);

  const apiParams = useMemo(
    () => toApiParams(params),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(params)]
  );
  const { data, error, isFetching, refetch } = useProductsList(apiParams);

  const canEdit = can(PERMISSIONS.PRODUCTS_UPDATE);
  const canDelete = can(PERMISSIONS.PRODUCTS_DELETE);

  const columns = useMemo(
    () => [
      { field: 'sku', headerName: t('fields.sKU'), width: 150 },
      {
        field: 'name',
        headerName: t('fields.product'),
        flex: 1.5,
        minWidth: 220,
        renderCell: ({ row }) => (
          <Link component={RouterLink} to={`/products/${row.id}`} underline="hover" sx={{ fontWeight: 500 }}>
            {row.name}
          </Link>
        ),
      },
      {
        field: 'category',
        headerName: t('fields.category'),
        width: 170,
        sortable: false,
        valueGetter: (value) => value?.name ?? EMPTY,
      },
      {
        field: 'basePrice',
        headerName: t('fields.price'),
        width: 140,
        align: 'right',
        headerAlign: 'right',
        valueFormatter: (value) => formatAmount(value),
      },
      {
        field: 'unit',
        headerName: t('fields.unit'),
        width: 100,
        sortable: false,
        valueGetter: (value) => value?.symbol ?? EMPTY,
      },
      {
        field: 'tax',
        headerName: t('fields.tax'),
        width: 150,
        sortable: false,
        valueGetter: (value) => (value ? `${value.name} (${value.rate}%)` : EMPTY),
      },
      {
        field: 'status',
        headerName: t('fields.status'),
        width: 120,
        renderCell: ({ value }) => <StatusChip status={value} />,
      },
      {
        field: 'createdAt',
        headerName: t('fields.created'),
        width: 180,
        valueFormatter: (value) => formatDateTime(value),
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
              onClick={() => navigate(`/products/${row.id}`)}
            />,
            canEdit && (
              <GridActionsCellItem
                key="edit"
                showInMenu
                icon={<EditOutlinedIcon />}
                label={t('fields.edit')}
                onClick={() => navigate(`/products/${row.id}/edit`)}
              />
            ),
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
    [canEdit, canDelete, navigate, t]
  );

  async function confirmDelete() {
    try {
      await remove.mutateAsync(deleting.id);
      notify.success(`${deleting.name} deleted`);
    } catch (err) {
      notify.error(err.message);
    }
    setDeleting(null);
  }

  const hasFilters = Boolean(params.search || FILTER_KEYS.some((key) => params[key]));
  const anyTyped = TEXT_KEYS.some((key) => typed[key] !== '');
  const price = (key, label) => (
    <TextField
      label={label}
      type="number"
      value={typed[key]}
      onChange={(event) => setTyped((current) => ({ ...current, [key]: event.target.value }))}
      error={rangeInvalid}
      helperText={rangeInvalid && key === 'maxPrice' ? 'Must not be below the minimum' : undefined}
      slotProps={{ htmlInput: { min: 0, step: 'any' } }}
      sx={{ flex: 1, minWidth: 130 }}
    />
  );

  return (
    <Stack spacing={2}>
      <PageHeader
        title={t('pages.products.title')}
        subtitle={t('pages.products.subtitle')}
        actions={
          <>
            <PermissionGate permission={PERMISSIONS.PRODUCTS_CREATE}>
              <Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to="/products/new">
                {t('pages.products.new')}
              </Button>
            </PermissionGate>
          </>
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
        tableId="products"
        height="calc(100vh - 200px)"
        rowHref={(row) => `/products/${row.id}`}
        toolbar={
          <FilterBar activeCount={FILTER_KEYS.filter((key) => params[key]).length}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
              <TextField
                label={t('fields.search')}
                placeholder="Name, SKU or description"
                value={typed.search}
                onChange={(event) => setTyped((current) => ({ ...current, search: event.target.value }))}
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
              {/* Categories are whatever administrators have configured, from the API. */}
              <LeadConfigSelect
                list={CATALOG_CONFIG.CATEGORIES}
                label={t('fields.category')}
                emptyLabel={t('fields.allCategories')}
                value={params.categoryId}
                onChange={(categoryId) => updateParams({ categoryId })}
                sx={{ flex: 1, minWidth: 170 }}
              />
              <TextField
                select
                label={t('fields.status')}
                value={params.status}
                onChange={(event) => updateParams({ status: event.target.value })}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                sx={{ flex: 1, minWidth: 150 }}
              >
                <MenuItem value="">All statuses</MenuItem>
                {STATUS_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              {price('minPrice', 'Min price')}
              {price('maxPrice', 'Max price')}
              <Button
                disabled={!hasFilters && !anyTyped}
                onClick={() => {
                  setTyped({ search: '', minPrice: '', maxPrice: '' });
                  updateParams({ search: '', categoryId: '', status: '', minPrice: '', maxPrice: '' });
                }}
                sx={{ flexShrink: 0, alignSelf: { lg: 'flex-start' }, mt: { lg: 0.25 } }}
              >
                {t('actions.clear')}
              </Button>
            </Stack>
          </FilterBar>
        }
        rows={data?.products ?? []}
        columns={columns}
        loading={isFetching}
        {...serverPaging(params, updateParams, data?.pagination)}
        {...serverSorting(params, updateParams)}
        emptyState={<EmptyState dense filtered={hasFilters} />}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete product"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      >
        {deleting
          ? `${deleting.name} (${deleting.sku}) will be removed from the catalogue. Its SKU cannot be used again.`
          : ''}
      </ConfirmDialog>
    </Stack>
  );
}
