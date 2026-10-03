import AddIcon from '@mui/icons-material/Add';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchIcon from '@mui/icons-material/Search';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DataGrid, GridActionsCellItem } from '@mui/x-data-grid';
import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import PermissionGate from '../components/PermissionGate.jsx';
import RoleDialogs from '../components/roles/RoleDialogs.jsx';
import UserStatusChip, { USER_STATUS_OPTIONS } from '../components/users/UserStatusChip.jsx';
import { useRoleActions, useRolesList } from '../hooks/useRoles.js';
import { EMPTY } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

// Roles are few, so one page (the API maximum) is loaded and the grid sorts,
// filters and pages it locally.
const LIST_PARAMS = { limit: 100, sortBy: 'name', sortOrder: 'asc' };

export default function RolesPage() {
  const navigate = useNavigate();
  const actionsFor = useRoleActions();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dialog, setDialog] = useState(null);
  const { data: roles, error, isFetching, refetch } = useRolesList(LIST_PARAMS);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (roles ?? []).filter(
      (role) =>
        (!status || role.status === status) &&
        (!term || `${role.name} ${role.description ?? ''}`.toLowerCase().includes(term))
    );
  }, [roles, search, status]);

  const columns = [
    {
      field: 'name',
      headerName: 'Role',
      flex: 1,
      minWidth: 180,
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', height: '100%' }}>
          <Link component={RouterLink} to={`/roles/${row.id}`} underline="hover" sx={{ fontWeight: 500 }}>
            {row.name}
          </Link>
          {row.isSystem && <Chip size="small" label="System" />}
          {row.isDefault && <Chip size="small" variant="outlined" label="Default" />}
        </Stack>
      ),
    },
    {
      field: 'description',
      headerName: 'Description',
      flex: 1.5,
      minWidth: 200,
      sortable: false,
      valueGetter: (value) => value || EMPTY,
    },
    {
      field: 'permissions',
      headerName: 'Permissions',
      width: 130,
      valueGetter: (value, row) => (row.isSuperAdmin ? 'All' : (value?.length ?? 0)),
      sortComparator: (a, b) => (a === 'All' ? Infinity : a) - (b === 'All' ? Infinity : b),
    },
    { field: 'userCount', headerName: 'Users', type: 'number', width: 100 },
    {
      field: 'status',
      headerName: 'Status',
      width: 120,
      renderCell: ({ value }) => <UserStatusChip status={value} />,
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 80,
      getActions: ({ row }) => {
        const allowed = actionsFor(row);
        return [
          <GridActionsCellItem
            key="view"
            showInMenu
            icon={<VisibilityOutlinedIcon />}
            label="View details"
            onClick={() => navigate(`/roles/${row.id}`)}
          />,
          allowed.edit && (
            <GridActionsCellItem
              key="edit"
              showInMenu
              icon={<EditOutlinedIcon />}
              label="Edit"
              onClick={() => setDialog({ type: 'edit', role: row })}
            />
          ),
          allowed.remove && (
            <GridActionsCellItem
              key="delete"
              showInMenu
              icon={<DeleteOutlinedIcon />}
              label="Delete"
              onClick={() => setDialog({ type: 'delete', role: row })}
            />
          ),
        ].filter(Boolean);
      },
    },
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h4" component="h1">
          Roles
        </Typography>
        <PermissionGate permission={PERMISSIONS.ROLES_CREATE}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ type: 'create' })}>
            New role
          </Button>
        </PermissionGate>
      </Stack>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Search"
            placeholder="Name or description"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
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
            label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
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

      <Box sx={{ height: 'calc(100vh - 300px)', minHeight: 420, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={isFetching}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          disableColumnFilter
          disableRowSelectionOnClick
          localeText={{ noRowsLabel: search || status ? 'No roles match these filters' : 'No roles yet' }}
        />
      </Box>

      <RoleDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        // Straight to the new role's page, where its permissions are chosen.
        onCreated={(role) => navigate(`/roles/${role.id}`)}
      />
    </Stack>
  );
}
