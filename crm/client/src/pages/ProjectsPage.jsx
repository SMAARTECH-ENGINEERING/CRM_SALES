import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import AdvancedDataTable from '../components/ui/AdvancedDataTable.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { FilterBar } from '../components/ui/FilterDrawer.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { LEAD_CONFIG, PROJECT_CONFIG } from '../api/leadConfig.api.js';
import ConfigChip from '../components/leads/ConfigChip.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import ProjectDialog from '../components/projects/ProjectDialog.jsx';
import ProjectProgress from '../components/projects/ProjectProgress.jsx';
import UserSelect from '../components/users/UserSelect.jsx';
import useListParams, { SEARCH_DEBOUNCE_MS, serverPaging, serverSorting, toApiParams } from '../hooks/useListParams.js';
import { useProjectsList } from '../hooks/useProjects.js';
import { EMPTY, formatAmount, formatDate } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const FILTER_KEYS = ['statusId', 'priorityId', 'memberId'];
const centered = { display: 'flex', alignItems: 'center', height: '100%' };

export default function ProjectsPage() {
  const { t } = useTranslation();
  const [params, updateParams] = useListParams(FILTER_KEYS);
  const [searchInput, setSearchInput] = useState(params.search);
  const [adding, setAdding] = useState(false);

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
  const { data, error, isFetching, refetch } = useProjectsList(apiParams);

  const columns = useMemo(
    () => [
      { field: 'projectNumber', headerName: t('fields.number'), width: 120 },
      {
        field: 'name',
        headerName: t('fields.project'),
        flex: 1.5,
        minWidth: 200,
        renderCell: ({ row }) => (
          <Link component={RouterLink} to={`/projects/${row.id}`} underline="hover" sx={{ fontWeight: 500 }}>
            {row.name}
          </Link>
        ),
      },
      {
        field: 'company',
        headerName: t('fields.company'),
        flex: 1,
        minWidth: 150,
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
        field: 'progress',
        headerName: t('fields.progress'),
        width: 150,
        sortable: false,
        renderCell: ({ row }) => (
          <Box sx={centered} style={{ width: '100%' }}>
            <ProjectProgress stats={row.stats} />
          </Box>
        ),
      },
      {
        field: 'openTasks',
        headerName: t('fields.openTasks'),
        width: 110,
        align: 'right',
        headerAlign: 'right',
        sortable: false,
        valueGetter: (value, row) => row.stats?.openTasks,
      },
      {
        field: 'projectManager',
        headerName: t('fields.manager'),
        width: 150,
        sortable: false,
        valueGetter: (value) => value?.fullName ?? EMPTY,
      },
      { field: 'expectedEndDate', headerName: t('fields.due'), width: 120, valueFormatter: (value) => formatDate(value) },
      {
        field: 'budget',
        headerName: t('fields.budget'),
        width: 120,
        align: 'right',
        headerAlign: 'right',
        valueFormatter: (value) => formatAmount(value),
      },
    ],
    [t]
  );

  const hasFilters = Boolean(params.search || FILTER_KEYS.some((key) => params[key]));
  const filterSx = { flex: 1, minWidth: 160 };

  return (
    <Stack spacing={2}>
      <PageHeader
        title={t('pages.projects.title')}
        subtitle={t('pages.projects.subtitle')}
        actions={
          <>
            <PermissionGate permission={PERMISSIONS.PROJECTS_CREATE}>
              <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
                {t('pages.projects.new')}
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
        tableId="projects"
        height="calc(100vh - 200px)"
        rowHref={(row) => `/projects/${row.id}`}
        toolbar={
          <FilterBar activeCount={FILTER_KEYS.filter((key) => params[key]).length}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
              <TextField
                label={t('fields.search')}
                placeholder="Number, name, description or notes"
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
              {/* Statuses and priorities are the configured lists, from the API. */}
              <LeadConfigSelect
                list={PROJECT_CONFIG.STATUSES}
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
              <UserSelect
                label={t('fields.managerOrMember')}
                value={params.memberId}
                onChange={(id) => updateParams({ memberId: id })}
                sx={{ ...filterSx, minWidth: 200 }}
              />
              <Button
                disabled={!hasFilters && !searchInput}
                onClick={() => {
                  setSearchInput('');
                  updateParams({ search: '', statusId: '', priorityId: '', memberId: '' });
                }}
                sx={{ flexShrink: 0 }}
              >
                {t('actions.clear')}
              </Button>
            </Stack>
          </FilterBar>
        }
        rows={data?.projects ?? []}
        columns={columns}
        loading={isFetching}
        {...serverPaging(params, updateParams, data?.pagination)}
        {...serverSorting(params, updateParams)}
        emptyState={<EmptyState dense filtered={hasFilters} />}
      />

      {adding && <ProjectDialog onClose={() => setAdding(false)} />}
    </Stack>
  );
}
