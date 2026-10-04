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
import { LEAD_CONFIG } from '../api/leadConfig.api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ConfigChip from '../components/leads/ConfigChip.jsx';
import LeadBulkActions from '../components/leads/LeadBulkActions.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import { useLeadMutations, useLeadsList } from '../hooks/useLeads.js';
import useListParams, { SEARCH_DEBOUNCE_MS, serverPaging, serverSorting, toApiParams } from '../hooks/useListParams.js';
import useNotify from '../hooks/useNotify.js';
import usePermission from '../hooks/usePermission.js';
import { EMPTY, formatAmount, formatDate, formatDateTime } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const FILTER_KEYS = ['statusId', 'priorityId', 'sourceId', 'converted'];

const CONVERTED_OPTIONS = [
  { value: 'false', label: 'Not converted' },
  { value: 'true', label: 'Converted' },
];

const centered = { display: 'flex', alignItems: 'center', height: '100%' };

export default function LeadsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const { remove } = useLeadMutations();
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
  const { data, error, isFetching, refetch } = useLeadsList(apiParams);

  const canEdit = can(PERMISSIONS.LEADS_UPDATE);
  const canDelete = can(PERMISSIONS.LEADS_DELETE);
  // Rows can be selected only by someone who may do something with several at once.
  const canBulk = canDelete || canEdit || can(PERMISSIONS.LEADS_ASSIGN);

  const columns = useMemo(
    () => [
      { field: 'leadNumber', headerName: t('fields.number'), width: 130 },
      {
        field: 'title',
        headerName: t('fields.lead'),
        flex: 1.5,
        minWidth: 220,
        renderCell: ({ row }) => (
          <Link component={RouterLink} to={`/leads/${row.id}`} underline="hover" sx={{ fontWeight: 500 }}>
            {row.title}
          </Link>
        ),
      },
      {
        field: 'company',
        headerName: t('fields.company'),
        flex: 1,
        minWidth: 170,
        sortable: false,
        valueGetter: (value) => value?.name ?? EMPTY,
      },
      {
        field: 'status',
        headerName: t('fields.status'),
        width: 170,
        sortable: false,
        renderCell: ({ row }) => (
          <Box sx={{ ...centered, gap: 0.5 }}>
            <ConfigChip value={row.status} />
            {row.isConverted && <Chip size="small" color="success" label={t('fields.converted')} />}
          </Box>
        ),
      },
      {
        field: 'priority',
        headerName: t('fields.priority'),
        width: 130,
        sortable: false,
        renderCell: ({ value }) => (
          <Box sx={centered}>{value ? <ConfigChip value={value} /> : EMPTY}</Box>
        ),
      },
      {
        field: 'assignedToUser',
        headerName: t('fields.assignedTo'),
        width: 160,
        sortable: false,
        valueGetter: (value) => value?.fullName ?? EMPTY,
      },
      {
        field: 'estimatedValue',
        headerName: t('fields.estValue'),
        width: 130,
        align: 'right',
        headerAlign: 'right',
        valueFormatter: (value) => formatAmount(value),
      },
      {
        field: 'expectedCloseDate',
        headerName: t('fields.expectedClose'),
        width: 150,
        valueFormatter: (value) => formatDate(value),
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
              onClick={() => navigate(`/leads/${row.id}`)}
            />,
            canEdit && (
              <GridActionsCellItem
                key="edit"
                showInMenu
                icon={<EditOutlinedIcon />}
                label={t('fields.edit')}
                onClick={() => navigate(`/leads/${row.id}/edit`)}
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
      notify.success(`${deleting.leadNumber} deleted`);
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
        title={t('pages.leads.title')}
        subtitle={t('pages.leads.subtitle')}
        actions={
          <>
            <PermissionGate permission={PERMISSIONS.LEADS_CREATE}>
              <Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to="/leads/new">
                {t('pages.leads.new')}
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
        tableId="leads"
        height="calc(100vh - 200px)"
        rowHref={(row) => `/leads/${row.id}`}
        bulkActions={canBulk ? (selected) => <LeadBulkActions {...selected} /> : undefined}
        toolbar={
          <FilterBar activeCount={FILTER_KEYS.filter((key) => params[key]).length}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
              <TextField
                label={t('fields.search')}
                placeholder="Number, title, description or tag"
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
              {/* The options of these three filters are the configured values, from the API. */}
              <LeadConfigSelect
                list={LEAD_CONFIG.STATUSES}
                label={t('fields.status')}
                emptyLabel={t('fields.allStatuses')}
                value={params.statusId}
                onChange={(statusId) => updateParams({ statusId })}
                sx={filterSx}
              />
              <LeadConfigSelect
                list={LEAD_CONFIG.PRIORITIES}
                label={t('fields.priority')}
                emptyLabel={t('fields.allPriorities')}
                value={params.priorityId}
                onChange={(priorityId) => updateParams({ priorityId })}
                sx={filterSx}
              />
              <LeadConfigSelect
                list={LEAD_CONFIG.SOURCES}
                label={t('fields.source')}
                emptyLabel={t('fields.allSources')}
                value={params.sourceId}
                onChange={(sourceId) => updateParams({ sourceId })}
                sx={filterSx}
              />
              <TextField
                select
                label={t('fields.conversion')}
                value={params.converted}
                onChange={(event) => updateParams({ converted: event.target.value })}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                sx={filterSx}
              >
                <MenuItem value="">All leads</MenuItem>
                {CONVERTED_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              <Button
                disabled={!hasFilters && !searchInput}
                onClick={() => {
                  setSearchInput('');
                  updateParams({ search: '', statusId: '', priorityId: '', sourceId: '', converted: '' });
                }}
                sx={{ flexShrink: 0 }}
              >
                {t('actions.clear')}
              </Button>
            </Stack>
          </FilterBar>
        }
        rows={data?.leads ?? []}
        columns={columns}
        loading={isFetching}
        {...serverPaging(params, updateParams, data?.pagination)}
        {...serverSorting(params, updateParams)}
        emptyState={<EmptyState dense filtered={hasFilters} />}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete lead"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      >
        {deleting ? `${deleting.leadNumber} - ${deleting.title} will be removed from the CRM.` : ''}
      </ConfirmDialog>
    </Stack>
  );
}
