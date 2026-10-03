import MoreVertIcon from '@mui/icons-material/MoreVert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { formatAmount, formatDate } from '../../utils/format.js';
import ColorDot from '../leads/ColorDot.jsx';
import ConfigChip from '../leads/ConfigChip.jsx';

const COLUMN_WIDTH = 300;
const ACTIVE = 'active';
// What a stage means, shown when it is not an ordinary open stage.
const CLOSED_TYPES = { won: { label: 'Won', color: 'success' }, lost: { label: 'Lost', color: 'error' } };

function OpportunityCard({ opportunity, targets, canMove, dragging, onDragStart, onDragEnd, onMove }) {
  const [anchor, setAnchor] = useState(null);

  return (
    <Paper
      variant="outlined"
      component="li"
      draggable={canMove}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', opportunity.id);
        onDragStart(opportunity);
      }}
      onDragEnd={onDragEnd}
      aria-label={`${opportunity.opportunityNumber} ${opportunity.name}`}
      sx={{ p: 1.5, listStyle: 'none', cursor: canMove ? 'grab' : 'default', opacity: dragging ? 0.4 : 1 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Link
            component={RouterLink}
            to={`/opportunities/${opportunity.id}`}
            underline="hover"
            draggable={false}
            sx={{ fontWeight: 600, wordBreak: 'break-word' }}
          >
            {opportunity.name}
          </Link>
          <Typography variant="caption" color="text.secondary" component="div">
            {opportunity.opportunityNumber}
            {opportunity.company ? ` · ${opportunity.company.name}` : ''}
          </Typography>
        </Box>
        {/* The same move without dragging: for keyboards and touch screens. */}
        {canMove && targets.length > 0 && (
          <>
            <Tooltip title="Move to another stage">
              <IconButton
                size="small"
                aria-label={`Move ${opportunity.opportunityNumber}`}
                onClick={(event) => setAnchor(event.currentTarget)}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
              {targets.map((stage) => (
                <MenuItem
                  key={stage.id}
                  onClick={() => {
                    setAnchor(null);
                    onMove(opportunity, stage);
                  }}
                >
                  Move to {stage.name}
                </MenuItem>
              ))}
            </Menu>
          </>
        )}
      </Stack>

      <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {formatAmount(opportunity.estimatedValue)}
        </Typography>
        {opportunity.probability != null && (
          <Typography variant="caption" color="text.secondary">
            {opportunity.probability}%
          </Typography>
        )}
      </Stack>
      <Stack direction="row" spacing={0.5} sx={{ mt: 1, alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
        <ConfigChip value={opportunity.priority} />
        {opportunity.expectedCloseDate && (
          <Chip size="small" variant="outlined" label={`Close ${formatDate(opportunity.expectedCloseDate)}`} />
        )}
      </Stack>
      <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
        {opportunity.assignedToUser ? opportunity.assignedToUser.fullName : 'Unassigned'}
      </Typography>
    </Paper>
  );
}

// A pipeline as columns. Everything shown - the columns, their order, names,
// colours and totals - comes from `columns`, as returned by GET /opportunities/board.
//
//   <KanbanBoard columns={board.columns} canMove onMove={(opportunity, stage) => ...} />
export default function KanbanBoard({ columns, canMove = false, onMove }) {
  // The card being dragged. The ref is what the drop logic reads; the state only
  // dims the card, and is set a tick later because re-rendering the dragged
  // element inside "dragstart" makes some browsers cancel the drag.
  const draggedRef = useRef(null);
  const [draggedId, setDraggedId] = useState(null);
  const [overStageId, setOverStageId] = useState(null);

  // A card may be dropped on any other active stage; the API has the final say.
  const accepts = (stage) => {
    const card = draggedRef.current;
    return Boolean(card) && stage.status === ACTIVE && stage.id !== card.stageId;
  };
  const startDragging = (opportunity) => {
    draggedRef.current = opportunity;
    setTimeout(() => setDraggedId(draggedRef.current?.id ?? null), 0);
  };
  const stopDragging = () => {
    draggedRef.current = null;
    setDraggedId(null);
    setOverStageId(null);
  };

  return (
    <Box sx={{ overflowX: 'auto', pb: 1 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', minWidth: 'min-content' }}>
        {columns.map(({ stage, total, totalValue, opportunities }) => {
          const closed = CLOSED_TYPES[stage.type];
          const targets = columns
            .map((column) => column.stage)
            .filter((other) => other.id !== stage.id && other.status === ACTIVE);

          return (
            <Paper
              key={stage.id}
              component="section"
              aria-label={stage.name}
              data-stage-id={stage.id}
              onDragOver={(event) => {
                if (!accepts(stage)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                if (overStageId !== stage.id) setOverStageId(stage.id);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) setOverStageId(null);
              }}
              onDrop={(event) => {
                if (!accepts(stage)) return;
                event.preventDefault();
                const card = draggedRef.current;
                stopDragging();
                onMove(card, stage);
              }}
              sx={{
                width: COLUMN_WIDTH,
                flexShrink: 0,
                bgcolor: 'action.hover',
                borderTop: 3,
                borderColor: stage.color ?? 'divider',
                outline: overStageId === stage.id ? 2 : 0,
                outlineStyle: 'dashed',
                outlineColor: 'primary.main',
                opacity: stage.status === ACTIVE ? 1 : 0.7,
              }}
            >
              <Box sx={{ p: 1.5, pb: 1 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  {stage.color && <ColorDot color={stage.color} />}
                  <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600, flexGrow: 1, minWidth: 0 }} noWrap>
                    {stage.name}
                  </Typography>
                  <Chip size="small" label={total} aria-label={`${total} opportunities`} />
                </Stack>
                <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
                    {formatAmount(totalValue)} · {stage.probability}%
                  </Typography>
                  {closed && <Chip size="small" variant="outlined" color={closed.color} label={closed.label} />}
                  {stage.status !== ACTIVE && <Chip size="small" variant="outlined" label="Inactive" />}
                </Stack>
              </Box>

              <Stack component="ul" spacing={1} sx={{ p: 1.5, pt: 0.5, m: 0, minHeight: 80 }}>
                {opportunities.map((opportunity) => (
                  <OpportunityCard
                    key={opportunity.id}
                    opportunity={opportunity}
                    targets={targets}
                    canMove={canMove}
                    dragging={draggedId === opportunity.id}
                    onDragStart={startDragging}
                    onDragEnd={stopDragging}
                    onMove={onMove}
                  />
                ))}
                {opportunities.length === 0 && (
                  <Typography component="li" variant="body2" color="text.secondary" sx={{ listStyle: 'none', py: 2, textAlign: 'center' }}>
                    No opportunities
                  </Typography>
                )}
                {total > opportunities.length && opportunities.length > 0 && (
                  <Typography component="li" variant="caption" color="text.secondary" sx={{ listStyle: 'none', textAlign: 'center' }}>
                    Showing {opportunities.length} of {total}
                  </Typography>
                )}
              </Stack>
            </Paper>
          );
        })}
      </Stack>
    </Box>
  );
}
