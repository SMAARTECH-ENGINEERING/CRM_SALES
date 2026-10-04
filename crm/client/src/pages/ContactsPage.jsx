import AddIcon from '@mui/icons-material/Add';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
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
import CompanySelect from '../components/companies/CompanySelect.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import StatusChip, { STATUS_OPTIONS } from '../components/StatusChip.jsx';
import { useContactMutations, useContactsList } from '../hooks/useContacts.js';
import useListParams, { SEARCH_DEBOUNCE_MS, serverPaging, serverSorting, toApiParams } from '../hooks/useListParams.js';
import useNotify from '../hooks/useNotify.js';
import usePermission from '../hooks/usePermission.js';
import { EMPTY, formatDateTime } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const FILTER_KEYS = ['companyId', 'status'];

export default function ContactsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const { remove } = useContactMutations();
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
  const { data, error, isFetching, refetch } = useContactsList(apiParams);

  const canViewCompanies = can(PERMISSIONS.COMPANIES_READ);
  const canDelete = can(PERMISSIONS.CONTACTS_DELETE);

  const columns = useMemo(
    () => [
      {
        field: 'firstName',
        headerName: t('fields.name'),
        flex: 1.2,
        minWidth: 180,
        renderCell: ({ row }) => (
          <Link component={RouterLink} to={`/contacts/${row.id}`} underline="hover" sx={{ fontWeight: 500 }}>
            {row.fullName}
          </Link>
        ),
      },
      {
        field: 'company',
        headerName: t('fields.company'),
        flex: 1.2,
        minWidth: 180,
        sortable: false,
        renderCell: ({ value }) => {
          if (!value) return EMPTY;
          return canViewCompanies ? (
            <Link component={RouterLink} to={`/companies/${value.id}`} underline="hover">
              {value.name}
            </Link>
          ) : (
            value.name
          );
        },
      },
      { field: 'designation', headerName: t('fields.designation'), width: 170, valueGetter: (value) => value || EMPTY },
      { field: 'email', headerName: t('fields.email'), flex: 1.2, minWidth: 200, valueGetter: (value) => value || EMPTY },
      { field: 'phone', headerName: t('fields.phone'), width: 160, sortable: false, valueGetter: (value) => value || EMPTY },
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
              onClick={() => navigate(`/contacts/${row.id}`)}
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
    [canViewCompanies, canDelete, navigate, t]
  );

  async function confirmDelete() {
    try {
      await remove.mutateAsync(deleting.id);
      notify.success(`${deleting.fullName} deleted`);
    } catch (err) {
      notify.error(err.message);
    }
    setDeleting(null);
  }

  const hasFilters = Boolean(params.search || params.companyId || params.status);
  const newContactLink = params.companyId ? `/contacts/new?companyId=${params.companyId}` : '/contacts/new';

  return (
    <Stack spacing={2}>
      <PageHeader
        title={t('pages.contacts.title')}
        subtitle={t('pages.contacts.subtitle')}
        actions={
          <>
            <PermissionGate permission={PERMISSIONS.CONTACTS_CREATE}>
              <Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to={newContactLink}>
                {t('pages.contacts.new')}
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
        tableId="contacts"
        height="calc(100vh - 200px)"
        rowHref={(row) => `/contacts/${row.id}`}
        toolbar={
          <FilterBar activeCount={FILTER_KEYS.filter((key) => params[key]).length}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label={t('fields.search')}
                placeholder="Name, email, phone, designation or department"
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
              <CompanySelect
                value={params.companyId}
                onChange={(companyId) => updateParams({ companyId })}
                sx={{ flex: 1.5, minWidth: 220 }}
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
              <Button
                disabled={!hasFilters && !searchInput}
                onClick={() => {
                  setSearchInput('');
                  updateParams({ search: '', companyId: '', status: '' });
                }}
                sx={{ flexShrink: 0 }}
              >
                {t('actions.clear')}
              </Button>
            </Stack>
          </FilterBar>
        }
        rows={data?.contacts ?? []}
        columns={columns}
        loading={isFetching}
        {...serverPaging(params, updateParams, data?.pagination)}
        {...serverSorting(params, updateParams)}
        emptyState={<EmptyState dense filtered={hasFilters} />}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete contact"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      >
        {deleting ? `${deleting.fullName} will be removed from ${deleting.company?.name ?? 'their company'}.` : ''}
      </ConfirmDialog>
    </Stack>
  );
}
