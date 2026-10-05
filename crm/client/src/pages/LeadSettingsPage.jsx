import AddIcon from '@mui/icons-material/Add';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ACTIVITY_CONFIG,
  CONTRACT_CONFIG,
  DOCUMENT_CONFIG,
  LEAD_CONFIG,
  PAYMENT_CONFIG,
  ORDER_CONFIG,
  PROJECT_CONFIG,
  QUOTATION_CONFIG,
  TICKET_CONFIG,
} from '../api/leadConfig.api.js';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ColorDot from '../components/leads/ColorDot.jsx';
import LeadConfigDialog, { STATUS_CATEGORIES } from '../components/leads/LeadConfigDialog.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import { useLeadConfig, useLeadConfigMutations } from '../hooks/useLeadConfig.js';
import useNotify from '../hooks/useNotify.js';
import usePermission from '../hooks/usePermission.js';
import { EMPTY } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

// Every managed list, with the permission needed to manage it.
const LISTS = [
  ...Object.values(LEAD_CONFIG).map((list) => ({
    ...list,
    title: `Lead ${list.title.toLowerCase()}`,
    permission: PERMISSIONS.LEAD_CONFIG_MANAGE,
  })),
  { ...ACTIVITY_CONFIG.TYPES, permission: PERMISSIONS.ACTIVITIES_MANAGE_TYPES },
  { ...QUOTATION_CONFIG.STATUSES, permission: PERMISSIONS.QUOTATIONS_MANAGE_STATUSES },
  { ...ORDER_CONFIG.STATUSES, permission: PERMISSIONS.ORDERS_MANAGE_STATUSES },
  { ...PROJECT_CONFIG.STATUSES, permission: PERMISSIONS.PROJECTS_MANAGE_STATUSES },
  { ...PROJECT_CONFIG.TASK_STATUSES, permission: PERMISSIONS.PROJECTS_MANAGE_STATUSES },
  ...Object.values(TICKET_CONFIG).map((list) => ({ ...list, permission: PERMISSIONS.TICKETS_MANAGE_SETTINGS })),
  ...Object.values(CONTRACT_CONFIG).map((list) => ({ ...list, permission: PERMISSIONS.CONTRACTS_MANAGE_SETTINGS })),
  ...Object.values(PAYMENT_CONFIG).map((list) => ({ ...list, permission: PERMISSIONS.PAYMENTS_MANAGE_SETTINGS })),
  ...Object.values(DOCUMENT_CONFIG).map((list) => ({ ...list, permission: PERMISSIONS.DOCUMENTS_MANAGE_SETTINGS })),
];

const categoryLabel = (list, value) =>
  (list.categories ?? STATUS_CATEGORIES).find((c) => c.value === value)?.label ?? value;

// One list (sources, statuses or priorities): its values come from the API.
function LeadConfigList({ list }) {
  const notify = useNotify();
  const { data, error, isPending, refetch } = useLeadConfig(list.resource);
  const { update, remove } = useLeadConfigMutations(list.resource);
  // null, { type: 'create' }, { type: 'edit', entry } or { type: 'delete', entry }
  const [dialog, setDialog] = useState(null);
  const has = (field) => list.fields.includes(field);

  async function change(entry, data, done) {
    try {
      await update.mutateAsync({ id: entry.id, data });
      notify.success(done);
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

  return (
    <Stack spacing={2}>
      <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={() => setDialog({ type: 'create' })}
        sx={{ alignSelf: 'flex-start' }}
      >
        Add {list.singular}
      </Button>

      {data.length === 0 ? (
        <Alert severity="info">
          No {list.title.toLowerCase()} yet. Add one, or run the seed script to load the initial values.
        </Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" aria-label={list.title}>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Description</TableCell>
                {has('category') && <TableCell>Meaning</TableCell>}
                {has('level') && <TableCell align="right">Level</TableCell>}
                {has('isQualified') && <TableCell>Qualified</TableCell>}
                {has('months') && <TableCell align="right">Months per cycle</TableCell>}
                {has('daysBefore') && <TableCell align="right">Days before end</TableCell>}
                {list.hasDefault && <TableCell>Default</TableCell>}
                <TableCell>Active</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((entry) => (
                <TableRow key={entry.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <ColorDot color={entry.color} />
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {entry.name}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{entry.description || EMPTY}</TableCell>
                  {has('category') && <TableCell>{categoryLabel(list, entry.category)}</TableCell>}
                  {has('level') && <TableCell align="right">{entry.level}</TableCell>}
                  {has('isQualified') && <TableCell>{entry.isQualified ? 'Yes' : EMPTY}</TableCell>}
                  {has('months') && <TableCell align="right">{entry.months ?? 'One-time'}</TableCell>}
                  {has('daysBefore') && <TableCell align="right">{entry.daysBefore}</TableCell>}
                  {list.hasDefault && (
                    <TableCell>
                      {entry.isDefault ? (
                        <Chip size="small" color="primary" label="Default" />
                      ) : (
                        <Button
                          size="small"
                          disabled={!entry.isActive || update.isPending}
                          onClick={() => change(entry, { isDefault: true }, `${entry.name} is now the default`)}
                        >
                          Make default
                        </Button>
                      )}
                    </TableCell>
                  )}
                  <TableCell>
                    <Tooltip title={entry.isDefault ? 'The default is always active' : ''}>
                      <span>
                        <Switch
                          size="small"
                          checked={entry.isActive}
                          disabled={entry.isDefault || update.isPending}
                          onChange={(event) =>
                            change(
                              entry,
                              { isActive: event.target.checked },
                              `${entry.name} ${event.target.checked ? 'activated' : 'deactivated'}`
                            )
                          }
                          slotProps={{ input: { 'aria-label': `${entry.name} active` } }}
                        />
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <IconButton
                      size="small"
                      aria-label={`Edit ${entry.name}`}
                      onClick={() => setDialog({ type: 'edit', entry })}
                    >
                      <EditOutlinedIcon fontSize="small" />
                    </IconButton>
                    <Tooltip title={entry.isDefault ? 'Make another one the default before deleting this' : ''}>
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`Delete ${entry.name}`}
                          disabled={entry.isDefault}
                          onClick={() => setDialog({ type: 'delete', entry })}
                        >
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {dialog?.type === 'create' && <LeadConfigDialog list={list} onClose={() => setDialog(null)} />}
      {dialog?.type === 'edit' && (
        <LeadConfigDialog list={list} entry={dialog.entry} onClose={() => setDialog(null)} />
      )}
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
          ? `${dialog.entry.name} will be permanently deleted. To keep it on existing records but stop offering it, deactivate it instead.`
          : ''}
      </ConfirmDialog>
    </Stack>
  );
}

// /settings - administrators manage the values that lead and activity forms
// offer. Each list is a tab, shown only to users allowed to manage it.
export default function LeadSettingsPage() {
  const { can } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  const lists = LISTS.filter((entry) => can(entry.permission));
  const requested = searchParams.get('tab');
  const list = lists.find((entry) => entry.resource === requested) ?? lists[0];

  if (!list) return <Alert severity="warning">You do not have permission to manage any settings.</Alert>;

  return (
    <Stack spacing={2}>
      <div>
        <Typography variant="h4" component="h1">
          Settings
        </Typography>
        <Typography color="text.secondary">
          The values offered on lead, activity, quotation, order, project, ticket, contract and payment forms, and when contract
          expiry reminders go out. Changes apply immediately.
        </Typography>
      </div>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={list.resource}
          onChange={(event, value) => setSearchParams({ tab: value }, { replace: true })}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Configuration lists"
        >
          {lists.map((entry) => (
            <Tab key={entry.resource} value={entry.resource} label={entry.title} />
          ))}
        </Tabs>
      </Box>

      {/* Keyed so each list keeps its own dialog state. */}
      <LeadConfigList key={list.resource} list={list} />
    </Stack>
  );
}
