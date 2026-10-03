import AddIcon from '@mui/icons-material/Add';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { DataGrid, GridActionsCellItem } from '@mui/x-data-grid';
import { useMemo, useState } from 'react';
import { CATALOG_CONFIG } from '../api/leadConfig.api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import LeadConfigDialog from '../components/leads/LeadConfigDialog.jsx';
import { useLeadConfig, useLeadConfigMutations } from '../hooks/useLeadConfig.js';
import useNotify from '../hooks/useNotify.js';
import { EMPTY } from '../utils/format.js';

// The column each list adds for its own field.
const EXTRA_COLUMNS = {
  skuPrefix: { field: 'skuPrefix', headerName: 'SKU prefix', width: 140, valueGetter: (value) => value || EMPTY },
  symbol: { field: 'symbol', headerName: 'Symbol', width: 120 },
  rate: {
    field: 'rate',
    headerName: 'Rate',
    width: 110,
    type: 'number',
    valueFormatter: (value) => (value == null ? EMPTY : `${value}%`),
  },
};

const DESCRIPTIONS = {
  [CATALOG_CONFIG.CATEGORIES.resource]: 'Groups of products. A category can set the prefix of the SKUs generated for its products.',
  [CATALOG_CONFIG.UNITS.resource]: 'What products are sold in: pieces, kilograms, hours and so on.',
  [CATALOG_CONFIG.TAXES.resource]: 'Tax rates that can be applied to products.',
};

// One catalogue list (categories, units or taxes) in a DataGrid. The values come
// from the API; the lists are small, so the grid sorts and pages them locally.
function CatalogList({ list }) {
  const notify = useNotify();
  const { data, error, isFetching, refetch } = useLeadConfig(list.resource);
  const { update, remove } = useLeadConfigMutations(list.resource);
  const [search, setSearch] = useState('');
  // null | { type: 'create' } | { type: 'edit' | 'delete', entry }
  const [dialog, setDialog] = useState(null);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter(
      (entry) =>
        !term ||
        [entry.name, entry.description, entry.symbol, entry.skuPrefix].some((value) =>
          String(value ?? '').toLowerCase().includes(term)
        )
    );
  }, [data, search]);

  async function setActive(entry, isActive) {
    try {
      await update.mutateAsync({ id: entry.id, data: { isActive } });
      notify.success(`${entry.name} ${isActive ? 'activated' : 'deactivated'}`);
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function confirmDelete() {
    const { entry } = dialog;
    try {
      await remove.mutateAsync(entry.id);
      notify.success(`${entry.name} deleted`);
    } catch (err) {
      notify.error(err.message);
    }
    setDialog(null);
  }

  const columns = [
    { field: 'name', headerName: 'Name', flex: 1, minWidth: 180 },
    ...list.fields.map((field) => EXTRA_COLUMNS[field]).filter(Boolean),
    {
      field: 'description',
      headerName: 'Description',
      flex: 1.5,
      minWidth: 200,
      sortable: false,
      valueGetter: (value) => value || EMPTY,
    },
    { field: 'sortOrder', headerName: 'Position', type: 'number', width: 110 },
    {
      field: 'isActive',
      headerName: 'Active',
      width: 100,
      renderCell: ({ row }) => (
        <Switch
          size="small"
          checked={row.isActive}
          disabled={update.isPending}
          onChange={(event) => setActive(row, event.target.checked)}
          slotProps={{ input: { 'aria-label': `${row.name} active` } }}
        />
      ),
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: 'Actions',
      width: 100,
      getActions: ({ row }) => [
        <GridActionsCellItem
          key="edit"
          icon={<EditOutlinedIcon />}
          label={`Edit ${row.name}`}
          onClick={() => setDialog({ type: 'edit', entry: row })}
        />,
        <GridActionsCellItem
          key="delete"
          icon={<DeleteOutlinedIcon />}
          label={`Delete ${row.name}`}
          onClick={() => setDialog({ type: 'delete', entry: row })}
        />,
      ],
    },
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <Typography variant="h4" component="h1">
            {list.title}
          </Typography>
          <Typography color="text.secondary">{DESCRIPTIONS[list.resource]}</Typography>
        </div>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setDialog({ type: 'create' })}
          sx={{ flexShrink: 0 }}
        >
          New {list.singular}
        </Button>
      </Stack>

      <TextField
        label="Search"
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
        sx={{ maxWidth: 420 }}
      />

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

      <Box sx={{ height: 'calc(100vh - 320px)', minHeight: 400, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          loading={isFetching}
          pageSizeOptions={[10, 25, 50]}
          initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
          disableColumnFilter
          disableRowSelectionOnClick
          localeText={{
            noRowsLabel: search ? `No ${list.title.toLowerCase()} match` : `No ${list.title.toLowerCase()} yet`,
          }}
        />
      </Box>

      {dialog?.type === 'create' && <LeadConfigDialog list={list} onClose={() => setDialog(null)} />}
      {dialog?.type === 'edit' && <LeadConfigDialog list={list} entry={dialog.entry} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog?.type === 'delete'}
        title={`Delete ${list.singular}`}
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDialog(null)}
      >
        {dialog?.entry
          ? `${dialog.entry.name} will be permanently deleted. If products use it, it cannot be deleted - deactivate it instead.`
          : ''}
      </ConfirmDialog>
    </Stack>
  );
}

// /categories, /units and /taxes
export const CategoriesPage = () => <CatalogList list={CATALOG_CONFIG.CATEGORIES} />;
export const UnitsPage = () => <CatalogList list={CATALOG_CONFIG.UNITS} />;
export const TaxesPage = () => <CatalogList list={CATALOG_CONFIG.TAXES} />;
