import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import LoadingScreen from '../components/LoadingScreen.jsx';
import KanbanBoard from '../components/opportunities/KanbanBoard.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import UserSelect from '../components/users/UserSelect.jsx';
import useListParams, { SEARCH_DEBOUNCE_MS } from '../hooks/useListParams.js';
import useNotify from '../hooks/useNotify.js';
import { useOpportunityBoard, useOpportunityMutations } from '../hooks/useOpportunities.js';
import usePermission from '../hooks/usePermission.js';
import { usePipelines } from '../hooks/usePipelines.js';
import { formatAmount } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const FILTER_KEYS = ['pipelineId', 'assignedTo'];
// Cards per column: the first screenful, then the most the API returns at once.
const CARDS = 50;
const MAX_CARDS = 100;

export default function OpportunitiesPage() {
  const notify = useNotify();
  const { can } = usePermission();
  const { move } = useOpportunityMutations();
  const [params, updateParams] = useListParams(FILTER_KEYS);
  const [searchInput, setSearchInput] = useState(params.search);
  const [cards, setCards] = useState(CARDS);

  // Debounce typing so each keystroke does not hit the API.
  useEffect(() => {
    const value = searchInput.trim();
    if (value === params.search) return undefined;
    const timer = setTimeout(() => updateParams({ search: value }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // No pipeline chosen: the API shows the default one.
  const boardParams = useMemo(() => {
    const query = { limit: cards };
    if (params.pipelineId) query.pipelineId = params.pipelineId;
    if (params.assignedTo) query.assignedTo = params.assignedTo;
    if (params.search) query.search = params.search;
    return query;
  }, [params.pipelineId, params.assignedTo, params.search, cards]);

  const pipelines = usePipelines();
  const { data: board, error, isPending, isFetching, refetch } = useOpportunityBoard(boardParams);

  async function moveTo(opportunity, stage) {
    if (opportunity.stageId === stage.id) return;
    try {
      await move.mutateAsync({ id: opportunity.id, stageId: stage.id });
      notify.success(`${opportunity.opportunityNumber} moved to ${stage.name}`);
    } catch (err) {
      // The card has already been put back where it was.
      notify.error(err.message);
    }
  }

  const columns = board?.columns ?? [];
  const total = columns.reduce((count, column) => count + column.total, 0);
  const totalValue = columns.reduce((sum, column) => sum + column.totalValue, 0);
  const truncated = columns.some((column) => column.total > column.opportunities.length);
  const canManage = can(PERMISSIONS.PIPELINES_MANAGE);
  const managePipelines = canManage && (
    <Button color="inherit" size="small" component={RouterLink} to="/pipelines">
      Manage pipelines
    </Button>
  );

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
      >
        <div>
          <Typography variant="h4" component="h1">
            Opportunities
          </Typography>
          <Typography color="text.secondary">
            {board?.pipeline
              ? `${board.pipeline.name} · ${total} ${total === 1 ? 'opportunity' : 'opportunities'} · ${formatAmount(totalValue)}`
              : 'Deals moving through your sales pipeline'}
          </Typography>
        </div>
        <PermissionGate permission={PERMISSIONS.OPPORTUNITIES_CREATE}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            component={RouterLink}
            to={board?.pipeline ? `/opportunities/new?pipelineId=${board.pipeline.id}` : '/opportunities/new'}
          >
            New opportunity
          </Button>
        </PermissionGate>
      </Stack>

      <Paper sx={{ p: 2 }}>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' } }}>
          {/* The pipelines are whatever has been set up; none is named in this code. */}
          <TextField
            select
            size="small"
            label="Pipeline"
            value={board?.pipeline?.id ?? ''}
            onChange={(event) => updateParams({ pipelineId: event.target.value })}
            disabled={!pipelines.data?.length}
            helperText={pipelines.error?.message}
            error={Boolean(pipelines.error)}
          >
            {(pipelines.data ?? []).map((pipeline) => (
              <MenuItem key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
                {pipeline.isDefault ? ' (default)' : ''}
                {pipeline.status === 'active' ? '' : ' (inactive)'}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Search"
            placeholder="Name, number or notes"
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
          />
          <UserSelect
            label="Assigned to"
            value={params.assignedTo}
            onChange={(id) => updateParams({ assignedTo: id })}
          />
        </Box>
      </Paper>

      {isFetching && !isPending && <LinearProgress aria-label="Refreshing the board" />}

      {isPending && <LoadingScreen />}
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

      {board && !board.pipeline && (
        <Alert severity="info" action={managePipelines}>
          No pipeline has been set up yet. Opportunities need a pipeline with at least one stage.
        </Alert>
      )}
      {board?.pipeline && columns.length === 0 && (
        <Alert severity="info" action={managePipelines}>
          {board.pipeline.name} has no stages yet. Add stages to see its board.
        </Alert>
      )}

      {columns.length > 0 && (
        <KanbanBoard columns={columns} canMove={can(PERMISSIONS.OPPORTUNITIES_UPDATE)} onMove={moveTo} />
      )}

      {truncated && (
        <Alert
          severity="info"
          action={
            cards < MAX_CARDS ? (
              <Button color="inherit" size="small" onClick={() => setCards(MAX_CARDS)}>
                Show more
              </Button>
            ) : undefined
          }
        >
          Some stages hold more opportunities than are shown. The counts and values above each column include all of
          them{cards < MAX_CARDS ? '.' : '; search or filter by owner to narrow the board.'}
        </Alert>
      )}
    </Stack>
  );
}
