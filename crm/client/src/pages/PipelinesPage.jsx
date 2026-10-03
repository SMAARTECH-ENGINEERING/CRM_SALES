import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ColorDot from '../components/leads/ColorDot.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import { PipelineDialog, STAGE_TYPES, StageDialog } from '../components/opportunities/PipelineDialogs.jsx';
import StatusChip from '../components/StatusChip.jsx';
import useNotify from '../hooks/useNotify.js';
import { usePipelineMutations, usePipelines, usePipelineStages } from '../hooks/usePipelines.js';
import { EMPTY } from '../utils/format.js';

const typeLabel = (type) => STAGE_TYPES.find((option) => option.value === type)?.label ?? type;

function Stages({ pipeline }) {
  const notify = useNotify();
  const { reorderStages, removeStage } = usePipelineMutations();
  const { data: stages, error, isPending, refetch } = usePipelineStages(pipeline.id);
  // null | { stage } (edit) | { create: true } | { remove: stage }
  const [dialog, setDialog] = useState(null);

  if (isPending) return <LoadingScreen />;
  if (error) {
    return (
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
    );
  }

  // Swaps a stage with its neighbour and sends the pipeline's complete new order.
  async function shift(index, offset) {
    const ids = stages.map((stage) => stage.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    try {
      await reorderStages.mutateAsync({ pipelineId: pipeline.id, stageIds: ids });
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function confirmRemove() {
    const { remove: stage } = dialog;
    try {
      await removeStage.mutateAsync(stage.id);
      notify.success(`${stage.name} deleted`);
    } catch (err) {
      notify.error(err.message);
    }
    setDialog(null);
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" component="h2">
          Stages of {pipeline.name}
        </Typography>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setDialog({ create: true })}>
          Add stage
        </Button>
      </Stack>

      {stages.length === 0 ? (
        <Alert severity="info">This pipeline has no stages yet. Add the first one to make its board usable.</Alert>
      ) : (
        <TableContainer>
          <Table size="small" aria-label={`Stages of ${pipeline.name}`}>
            <TableHead>
              <TableRow>
                <TableCell>Order</TableCell>
                <TableCell>Stage</TableCell>
                <TableCell align="right">Probability</TableCell>
                <TableCell>Meaning</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stages.map((stage, index) => (
                <TableRow key={stage.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {stage.order}
                    <Tooltip title="Move earlier">
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`Move ${stage.name} earlier`}
                          disabled={index === 0 || reorderStages.isPending}
                          onClick={() => shift(index, -1)}
                        >
                          <ArrowUpwardIcon fontSize="inherit" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Move later">
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`Move ${stage.name} later`}
                          disabled={index === stages.length - 1 || reorderStages.isPending}
                          onClick={() => shift(index, 1)}
                        >
                          <ArrowDownwardIcon fontSize="inherit" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      {stage.color && <ColorDot color={stage.color} />}
                      <div>
                        <Typography variant="body2" sx={{ fontWeight: 500 }}>
                          {stage.name}
                        </Typography>
                        {stage.description && (
                          <Typography variant="caption" color="text.secondary">
                            {stage.description}
                          </Typography>
                        )}
                      </div>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">{stage.probability}%</TableCell>
                  <TableCell>{typeLabel(stage.type)}</TableCell>
                  <TableCell>
                    <StatusChip status={stage.status} />
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Edit">
                      <IconButton size="small" aria-label={`Edit ${stage.name}`} onClick={() => setDialog({ stage })}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton
                        size="small"
                        aria-label={`Delete ${stage.name}`}
                        onClick={() => setDialog({ remove: stage })}
                      >
                        <DeleteOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {dialog?.create && <StageDialog pipeline={pipeline} onClose={() => setDialog(null)} />}
      {dialog?.stage && <StageDialog pipeline={pipeline} stage={dialog.stage} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={Boolean(dialog?.remove)}
        title="Delete stage"
        confirmLabel="Delete"
        confirmColor="error"
        loading={removeStage.isPending}
        onConfirm={confirmRemove}
        onClose={() => setDialog(null)}
      >
        {`${dialog?.remove?.name ?? ''} will be removed from ${pipeline.name}. A stage that still holds opportunities cannot be deleted - deactivate it instead.`}
      </ConfirmDialog>
    </Stack>
  );
}

// Pipelines and their stages are data: everything on this screen comes from,
// and is saved through, the API.
export default function PipelinesPage() {
  const notify = useNotify();
  const { removePipeline } = usePipelineMutations();
  const { data: pipelines, error, isPending, refetch } = usePipelines();
  const [searchParams, setSearchParams] = useSearchParams();
  // null | { create: true } | { edit: pipeline } | { remove: pipeline }
  const [dialog, setDialog] = useState(null);

  if (isPending) return <LoadingScreen />;
  if (error) {
    return (
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
    );
  }

  const select = (id) => setSearchParams(id ? { pipelineId: id } : {}, { replace: true });
  const selected = pipelines.find((pipeline) => pipeline.id === searchParams.get('pipelineId')) ?? pipelines[0];

  async function confirmRemove() {
    const { remove: pipeline } = dialog;
    try {
      await removePipeline.mutateAsync(pipeline.id);
      notify.success(`${pipeline.name} deleted`);
      select('');
    } catch (err) {
      notify.error(err.message);
    }
    setDialog(null);
  }

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
      >
        <div>
          <Typography variant="h4" component="h1">
            Pipelines
          </Typography>
          <Typography color="text.secondary">Sales processes and the stages opportunities move through</Typography>
        </div>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog({ create: true })}>
          Add pipeline
        </Button>
      </Stack>

      {pipelines.length === 0 ? (
        <Alert severity="info">No pipelines yet. Add one, then give it stages.</Alert>
      ) : (
        <Box sx={{ display: 'grid', gap: 2, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: '320px 1fr' } }}>
          <Card>
            <List disablePadding aria-label="Pipelines">
              {pipelines.map((pipeline) => (
                <ListItemButton
                  key={pipeline.id}
                  selected={pipeline.id === selected.id}
                  onClick={() => select(pipeline.id)}
                  divider
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                        <span>{pipeline.name}</span>
                        {pipeline.isDefault && <Chip size="small" color="primary" label="Default" />}
                        {pipeline.status !== 'active' && <StatusChip status={pipeline.status} />}
                      </Stack>
                    }
                    secondary={`${pipeline.stageCount} stage(s) · ${pipeline.opportunityCount} opportunity(ies)`}
                    slotProps={{ primary: { component: 'div' } }}
                  />
                </ListItemButton>
              ))}
            </List>
          </Card>

          <Card>
            <CardContent>
              <Stack spacing={2}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
                >
                  <Typography color="text.secondary">{selected.description || EMPTY}</Typography>
                  <Stack direction="row" spacing={1}>
                    <Button size="small" component={RouterLink} to={`/opportunities?pipelineId=${selected.id}`}>
                      Open board
                    </Button>
                    <Button size="small" variant="outlined" onClick={() => setDialog({ edit: selected })}>
                      Edit pipeline
                    </Button>
                    <Button size="small" variant="outlined" color="error" onClick={() => setDialog({ remove: selected })}>
                      Delete
                    </Button>
                  </Stack>
                </Stack>
                {/* Keyed so each pipeline's stage list starts fresh. */}
                <Stages key={selected.id} pipeline={selected} />
              </Stack>
            </CardContent>
          </Card>
        </Box>
      )}

      {dialog?.create && (
        <PipelineDialog onClose={() => setDialog(null)} onSaved={(pipeline) => select(pipeline.id)} />
      )}
      {dialog?.edit && <PipelineDialog pipeline={dialog.edit} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={Boolean(dialog?.remove)}
        title="Delete pipeline"
        confirmLabel="Delete"
        confirmColor="error"
        loading={removePipeline.isPending}
        onConfirm={confirmRemove}
        onClose={() => setDialog(null)}
      >
        {`${dialog?.remove?.name ?? ''} and its stages will be removed. A pipeline that still holds opportunities cannot be deleted - deactivate it instead.`}
      </ConfirmDialog>
    </Stack>
  );
}
