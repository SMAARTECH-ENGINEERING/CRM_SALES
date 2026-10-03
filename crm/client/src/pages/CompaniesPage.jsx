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
import { MASTER_DATA } from '../api/masterData.api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import StatusChip, { STATUS_OPTIONS } from '../components/StatusChip.jsx';
import { useCompaniesList, useCompanyMutations } from '../hooks/useCompanies.js';
import useListParams, { SEARCH_DEBOUNCE_MS, serverPaging, serverSorting, toApiParams } from '../hooks/useListParams.js';
import { useMasterData } from '../hooks/useMasterData.js';
import useNotify from '../hooks/useNotify.js';
import usePermission from '../hooks/usePermission.js';
import { EMPTY, formatDateTime } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const FILTER_KEYS = ['status', 'industryId', 'companyTypeId'];

function FilterSelect({ label, value, onChange, options, allLabel, loading }) {
  return (
    <TextField
      select
      label={label}
      // Until the options load there is nothing matching the value to select.
      value={loading ? '' : value}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
      sx={{ flex: 1, minWidth: 150 }}
    >
      <MenuItem value="">{allLabel}</MenuItem>
      {options.map((option) => (
        <MenuItem key={option.value} value={option.value}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

const toOptions = (items) => (items ?? []).map((item) => ({ value: item.id, label: item.name }));

export default function CompaniesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const { remove } = useCompanyMutations();
  const [params, updateParams] = useListParams(FILTER_KEYS);
  const [searchInput, setSearchInput] = useState(params.search);
  const [deleting, setDeleting] = useState(null);

  const industries = useMasterData(MASTER_DATA.INDUSTRIES);
  const companyTypes = useMasterData(MASTER_DATA.COMPANY_TYPES);

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
  const { data, error, isFetching, refetch } = useCompaniesList(apiParams);

  const canEdit = can(PERMISSIONS.COMPANIES_UPDATE);
  const canDelete = can(PERMISSIONS.COMPANIES_DELETE);

  const columns = useMemo(
    () => [
      { field: 'companyCode', headerName: t('fields.code'), width: 130 },
      {
        field: 'name',
        headerName: t('fields.company'),
        flex: 1.4,
        minWidth: 200,
        renderCell: ({ row }) => (
          <Link component={RouterLink} to={`/companies/${row.id}`} underline="hover" sx={{ fontWeight: 500 }}>
            {row.name}
          </Link>
        ),
      },
      {
        field: 'industry',
        headerName: t('fields.industry'),
        width: 160,
        sortable: false,
        valueGetter: (value) => value?.name ?? EMPTY,
      },
      {
        field: 'companyType',
        headerName: t('fields.type'),
        width: 140,
        sortable: false,
        valueGetter: (value) => value?.name ?? EMPTY,
      },
      { field: 'city', headerName: t('fields.city'), width: 140, valueGetter: (value) => value || EMPTY },
      {
        field: 'phone',
        headerName: t('fields.phone'),
        width: 150,
        sortable: false,
        valueGetter: (value) => value || EMPTY,
      },
      {
        field: 'assignedToUser',
        headerName: t('fields.assignedTo'),
        width: 170,
        sortable: false,
        valueGetter: (value) => value?.fullName ?? EMPTY,
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
              onClick={() => navigate(`/companies/${row.id}`)}
            />,
            canEdit && (
              <GridActionsCellItem
                key="edit"
                showInMenu
                icon={<EditOutlinedIcon />}
                label={t('fields.edit')}
                onClick={() => navigate(`/companies/${row.id}/edit`)}
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
      notify.success(`${deleting.name} deleted`);
    } catch (err) {
      // e.g. "…still has related records… (Contacts: 2)"
      const details = (err.errors ?? []).map((e) => e.message).join(', ');
      notify.error(details ? `${err.message} (${details})` : err.message);
    }
    setDeleting(null);
  }

  const hasFilters = Boolean(params.search || FILTER_KEYS.some((key) => params[key]));

  return (
    <Stack spacing={2}>
      <PageHeader
        title={t('pages.companies.title')}
        subtitle={t('pages.companies.subtitle')}
        actions={
          <>
            <PermissionGate permission={PERMISSIONS.COMPANIES_CREATE}>
              <Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to="/companies/new">
                {t('pages.companies.new')}
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
        tableId="companies"
        height="calc(100vh - 200px)"
        rowHref={(row) => `/companies/${row.id}`}
        toolbar={
          <FilterBar activeCount={FILTER_KEYS.filter((key) => params[key]).length}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
              <TextField
                label={t('fields.search')}
                placeholder="Name, code, email, phone, GST, PAN or city"
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
              <FilterSelect
                label={t('fields.status')}
                allLabel="All statuses"
                value={params.status}
                onChange={(status) => updateParams({ status })}
                options={STATUS_OPTIONS}
              />
              <FilterSelect
                label={t('fields.industry')}
                allLabel="All industries"
                value={params.industryId}
                onChange={(industryId) => updateParams({ industryId })}
                options={toOptions(industries.data)}
                loading={!industries.data}
              />
              <FilterSelect
                label={t('fields.type')}
                allLabel="All types"
                value={params.companyTypeId}
                onChange={(companyTypeId) => updateParams({ companyTypeId })}
                options={toOptions(companyTypes.data)}
                loading={!companyTypes.data}
              />
              <Button
                disabled={!hasFilters && !searchInput}
                onClick={() => {
                  setSearchInput('');
                  updateParams({ search: '', status: '', industryId: '', companyTypeId: '' });
                }}
                sx={{ flexShrink: 0 }}
              >
                {t('actions.clear')}
              </Button>
            </Stack>
          </FilterBar>
        }
        rows={data?.companies ?? []}
        columns={columns}
        loading={isFetching}
        {...serverPaging(params, updateParams, data?.pagination)}
        {...serverSorting(params, updateParams)}
        emptyState={<EmptyState dense filtered={hasFilters} />}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete company"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      >
        {deleting ? `${deleting.name} (${deleting.companyCode}) will be removed from the CRM.` : ''}
      </ConfirmDialog>
    </Stack>
  );
}
