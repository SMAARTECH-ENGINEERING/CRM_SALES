import AddIcon from '@mui/icons-material/Add';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LockResetIcon from '@mui/icons-material/LockReset';
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
import UserDialogs, { useUserActions } from '../components/users/UserDialogs.jsx';
import UserStatusChip, { USER_STATUS_OPTIONS } from '../components/users/UserStatusChip.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import useListParams, { SEARCH_DEBOUNCE_MS, serverPaging, serverSorting, toApiParams } from '../hooks/useListParams.js';
import { useRoleOptions } from '../hooks/useLookups.js';
import { useUsersList } from '../hooks/useUsers.js';
import { EMPTY, formatDateTime } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const FILTER_KEYS = ['status', 'roleId'];

export default function UsersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const actionsFor = useUserActions();
  const [params, updateParams] = useListParams(FILTER_KEYS);
  const [searchInput, setSearchInput] = useState(params.search);
  const [dialog, setDialog] = useState(null);
  const roles = useRoleOptions();

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
  const { data, error, isFetching, refetch } = useUsersList(apiParams);

  const columns = useMemo(
    () => [
      {
        field: 'firstName',
        headerName: t('fields.name'),
        flex: 1.2,
        minWidth: 170,
        renderCell: ({ row }) => (
          <Link component={RouterLink} to={`/users/${row.id}`} underline="hover" sx={{ fontWeight: 500 }}>
            {row.fullName}
          </Link>
        ),
      },
      { field: 'email', headerName: t('fields.email'), flex: 1.4, minWidth: 200 },
      {
        field: 'phone',
        headerName: t('fields.phone'),
        width: 150,
        sortable: false,
        valueGetter: (value) => value || EMPTY,
      },
      {
        field: 'role',
        headerName: t('fields.role'),
        width: 150,
        sortable: false,
        valueGetter: (value) => value?.name ?? EMPTY,
      },
      {
        field: 'department',
        headerName: t('fields.department'),
        width: 150,
        sortable: false,
        valueGetter: (value) => value?.name ?? EMPTY,
      },
      {
        field: 'designation',
        headerName: t('fields.designation'),
        width: 160,
        valueGetter: (value) => value || EMPTY,
      },
      {
        field: 'status',
        headerName: t('fields.status'),
        width: 120,
        renderCell: ({ value }) => <UserStatusChip status={value} />,
      },
      {
        field: 'lastLogin',
        headerName: t('fields.lastLogin'),
        width: 180,
        valueFormatter: (value) => formatDateTime(value),
      },
      {
        field: 'actions',
        type: 'actions',
        headerName: t('fields.actions'),
        width: 80,
        getActions: ({ row }) => {
          const allowed = actionsFor(row);
          const open = (type) => () => setDialog({ type, user: row });
          const active = row.status === 'active';
          return [
            <GridActionsCellItem
              key="view"
              showInMenu
              icon={<VisibilityOutlinedIcon />}
              label={t('fields.viewDetails')}
              onClick={() => navigate(`/users/${row.id}`)}
            />,
            allowed.edit && (
              <GridActionsCellItem key="edit" showInMenu icon={<EditOutlinedIcon />} label={t('fields.edit')} onClick={open('edit')} />
            ),
            allowed.status && (
              <GridActionsCellItem
                key="status"
                showInMenu
                icon={active ? <BlockIcon /> : <CheckCircleOutlineIcon />}
                label={active ? 'Deactivate' : 'Activate'}
                onClick={open('status')}
              />
            ),
            allowed.reset && (
              <GridActionsCellItem
                key="reset"
                showInMenu
                icon={<LockResetIcon />}
                label={t('fields.resetPassword')}
                onClick={open('reset')}
              />
            ),
            allowed.remove && (
              <GridActionsCellItem
                key="delete"
                showInMenu
                icon={<DeleteOutlineIcon />}
                label={t('fields.delete')}
                onClick={open('delete')}
              />
            ),
          ].filter(Boolean);
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actionsFor, navigate]
  );

  const hasFilters = Boolean(params.search || params.status || params.roleId);

  return (
    <Stack spacing={2}>
      <PageHeader
        title={t('pages.users.title')}
        subtitle={t('pages.users.subtitle')}
        actions={
          <>
            <PermissionGate permission={PERMISSIONS.USERS_CREATE}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ type: 'create' })}>
                {t('pages.users.new')}
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
        tableId="users"
        height="calc(100vh - 200px)"
        rowHref={(row) => `/users/${row.id}`}
        toolbar={
          <FilterBar activeCount={FILTER_KEYS.filter((key) => params[key]).length}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label={t('fields.search')}
                placeholder="Name, email, phone or designation"
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
                sx={{ flex: 1, minWidth: 150 }}
              >
                <MenuItem value="">All statuses</MenuItem>
                {USER_STATUS_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label={t('fields.role')}
                // Until the roles load there is no matching option to select.
                value={roles.data ? params.roleId : ''}
                onChange={(event) => updateParams({ roleId: event.target.value })}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                sx={{ flex: 1, minWidth: 150 }}
              >
                <MenuItem value="">All roles</MenuItem>
                {(roles.data ?? []).map((role) => (
                  <MenuItem key={role.id} value={role.id}>
                    {role.name}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                disabled={!hasFilters && !searchInput}
                onClick={() => {
                  setSearchInput('');
                  updateParams({ search: '', status: '', roleId: '' });
                }}
                sx={{ flexShrink: 0 }}
              >
                {t('actions.clear')}
              </Button>
            </Stack>
          </FilterBar>
        }
        rows={data?.users ?? []}
        columns={columns}
        loading={isFetching}
        {...serverPaging(params, updateParams, data?.pagination)}
        {...serverSorting(params, updateParams)}
        emptyState={<EmptyState dense filtered={hasFilters} />}
      />

      <UserDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </Stack>
  );
}
