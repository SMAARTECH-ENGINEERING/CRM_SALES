import AddIcon from '@mui/icons-material/Add';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
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
import { QUOTATION_CONFIG } from '../api/leadConfig.api.js';
import CompanySelect from '../components/companies/CompanySelect.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ConfigChip from '../components/leads/ConfigChip.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import useListParams, { SEARCH_DEBOUNCE_MS, serverPaging, serverSorting, toApiParams } from '../hooks/useListParams.js';
import useNotify from '../hooks/useNotify.js';
import usePermission from '../hooks/usePermission.js';
import { useQuotationMutations, useQuotationsList } from '../hooks/useQuotations.js';
import { EMPTY, formatAmount, formatDate } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const FILTER_KEYS = ['statusId', 'companyId', 'dateFrom', 'dateTo'];
// Accepted and rejected quotations are locked (the API refuses edits).
const LOCKED = ['accepted', 'rejected'];

const centered = { display: 'flex', alignItems: 'center', height: '100%' };

export default function QuotationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const { remove } = useQuotationMutations();
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
  const { data, error, isFetching, refetch } = useQuotationsList(apiParams);

  const canEdit = can(PERMISSIONS.QUOTATIONS_UPDATE);
  const canDelete = can(PERMISSIONS.QUOTATIONS_DELETE);

  const columns = useMemo(
    () => [
      {
        field: 'quotationNumber',
        headerName: t('fields.number'),
        width: 140,
        renderCell: ({ row }) => (
          <Link component={RouterLink} to={`/quotations/${row.id}`} underline="hover" sx={{ fontWeight: 500 }}>
            {row.quotationNumber}
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
        field: 'contact',
        headerName: t('fields.contact'),
        flex: 1,
        minWidth: 140,
        sortable: false,
        valueGetter: (value) => value?.fullName ?? EMPTY,
      },
      {
        field: 'status',
        headerName: t('fields.status'),
        width: 140,
        sortable: false,
        renderCell: ({ value }) => <Box sx={centered}>{value ? <ConfigChip value={value} /> : EMPTY}</Box>,
      },
      { field: 'quotationDate', headerName: t('fields.date'), width: 130, valueFormatter: (value) => formatDate(value) },
      { field: 'validUntil', headerName: t('fields.validUntil'), width: 130, valueFormatter: (value) => formatDate(value) },
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
              onClick={() => navigate(`/quotations/${row.id}`)}
            />,
            canEdit && !LOCKED.includes(row.status?.category) && (
              <GridActionsCellItem
                key="edit"
                showInMenu
                icon={<EditOutlinedIcon />}
                label={t('fields.edit')}
                onClick={() => navigate(`/quotations/${row.id}/edit`)}
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
    [canEdit, canDelete, navigate]
  );

  async function confirmDelete() {
    try {
      await remove.mutateAsync(deleting.id);
      notify.success(`${deleting.quotationNumber} deleted`);
    } catch (err) {
      notify.error(err.message);
    }
    setDeleting(null);
  }

  const hasFilters = Boolean(params.search || FILTER_KEYS.some((key) => params[key]));
  const filterSx = { flex: 1, minWidth: 150 };

  return (
    <Stack spacing={2}>
      <PageHeader
        title={t('pages.quotations.title')}
        subtitle={t('pages.quotations.subtitle')}
        actions={
          <>
            <PermissionGate permission={PERMISSIONS.QUOTATIONS_CREATE}>
              <Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to="/quotations/new">
                {t('pages.quotations.new')}
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
        tableId="quotations"
        height="calc(100vh - 200px)"
        rowHref={(row) => `/quotations/${row.id}`}
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
                list={QUOTATION_CONFIG.STATUSES}
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
        rows={data?.quotations ?? []}
        columns={columns}
        loading={isFetching}
        {...serverPaging(params, updateParams, data?.pagination)}
        {...serverSorting(params, updateParams)}
        emptyState={<EmptyState dense filtered={hasFilters} />}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete quotation"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      >
        {deleting ? `${deleting.quotationNumber} will be removed from the CRM.` : ''}
      </ConfirmDialog>
    </Stack>
  );
}
