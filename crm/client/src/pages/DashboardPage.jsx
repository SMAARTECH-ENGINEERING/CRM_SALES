import DashboardCustomizeOutlinedIcon from '@mui/icons-material/DashboardCustomizeOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ChartCard from '../components/dashboard/ChartCard.jsx';
import DashboardGrid, { CustomizeDashboardDialog, useDashboardLayout } from '../components/dashboard/DashboardGrid.jsx';
import StatTile from '../components/dashboard/StatTile.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { useDashboardSection } from '../hooks/useDashboard.js';
import usePermission from '../hooks/usePermission.js';
import { formatAmount, formatCompact, formatDate, formatDateTime, formatMonth } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';
import RecentDocuments from '../components/dashboard/RecentDocuments.jsx';

// The periods the API understands.
const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'This quarter' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
];

// The headline figures, in the order shown. Each is drawn from the summary
// response as it is: `value` picks what to show, `caption` the line under it.
// A figure the API marks unavailable (the user may not read that module) is
// left out - never shown as zero.
const TILES = [
  { key: 'totalLeads', label: 'Total leads', value: (m) => formatAmount(m.value), caption: () => 'All time', to: '/leads' },
  { key: 'newLeads', label: 'New leads', value: (m) => formatAmount(m.value), caption: () => 'Created in the period', to: '/leads' },
  { key: 'qualifiedLeads', label: 'Qualified leads', value: (m) => formatAmount(m.value), caption: () => 'Of those created in the period', to: '/leads' },
  { key: 'openOpportunities', label: 'Open opportunities', value: (m) => formatAmount(m.value), caption: () => 'Now', to: '/opportunities' },
  { key: 'pipelineValue', label: 'Pipeline value', value: (m) => formatCompact(m.value), caption: (m) => `${formatAmount(m.value)} in open deals`, to: '/opportunities' },
  { key: 'wonValue', label: 'Won value', value: (m) => formatCompact(m.value), caption: (m) => `${m.count} deal(s) won in the period`, to: '/opportunities' },
  { key: 'lostValue', label: 'Lost value', value: (m) => formatCompact(m.value), caption: (m) => `${m.count} deal(s) lost in the period`, to: '/opportunities' },
  { key: 'customers', label: 'Customers', value: (m) => formatAmount(m.value), caption: (m) => `${m.new} new in the period`, to: '/customers' },
  { key: 'pendingFollowUps', label: 'Pending follow-ups', value: (m) => formatAmount(m.value), caption: (m) => `${m.overdue} overdue` },
  { key: 'openTickets', label: 'Open tickets', value: (m) => formatAmount(m.value), caption: (m) => `${m.unassigned} unassigned`, to: '/tickets' },
  {
    key: 'pendingPayments',
    label: 'Pending payments',
    value: (m) => formatCompact(m.amount),
    caption: (m) => `${m.value} invoice(s), ${m.overdue} overdue (${formatAmount(m.overdueAmount)})`,
    to: '/payments',
  },
];

const count = (value) => formatAmount(value);
const SCOPE_TEXT = { all: 'All organizations', own: 'Records assigned to you' };

// /  - the dashboard. Nothing on it is worked out in the browser: the tiles and
// charts show what the five /dashboard endpoints return for the chosen period,
// and are fetched again every minute.
export default function DashboardPage() {
  const { t } = useTranslation();
  const { can } = usePermission();
  // Arranging the dashboard: moving, resizing and hiding its widgets.
  const [editing, setEditing] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState('month');
  const [range, setRange] = useState({ from: '', to: '' });
  const [organizationId, setOrganizationId] = useState('');
  const [pipelineId, setPipelineId] = useState('');

  // A custom period is only sent once both dates are in and in order.
  const customReady = Boolean(range.from && range.to && range.from <= range.to);
  const ready = period !== 'custom' || customReady;
  const params = useMemo(
    () => ({ period, ...(period === 'custom' ? range : {}), ...(organizationId ? { organizationId } : {}) }),
    [period, range, organizationId]
  );
  const opportunityParams = useMemo(() => ({ ...params, ...(pipelineId ? { pipelineId } : {}) }), [params, pipelineId]);

  const summary = useDashboardSection('summary', params, { enabled: ready });
  const leads = useDashboardSection('leads', params, { enabled: ready && can(PERMISSIONS.LEADS_READ) });
  const opportunities = useDashboardSection('opportunities', opportunityParams, { enabled: ready && can(PERMISSIONS.OPPORTUNITIES_READ) });
  const sales = useDashboardSection('sales', params, { enabled: ready && can(PERMISSIONS.ORDERS_READ) });
  const activities = useDashboardSection('activities', params, { enabled: ready && can(PERMISSIONS.ACTIVITIES_READ) });

  const scope = summary.data?.scope;
  const shown = summary.data?.period;
  const pipelines = opportunities.data?.pipelines ?? [];
  const tiles = summary.data ? TILES.filter((tile) => summary.data.metrics[tile.key]?.available) : [];
  const periodText = shown ? (shown.from === shown.to ? formatDate(shown.from) : `${formatDate(shown.from)} – ${formatDate(shown.to)}`) : '';

  // The widgets this user may see, each with its default width (in twelfths).
  // Their order, widths and which are hidden are the user's own - see DashboardGrid.
  const widgets = [];
  if (summary.data && tiles.length > 0) {
    widgets.push({
      id: 'figures',
      title: 'Key figures',
      size: 12,
      content: (
        <Box
          role="group"
          aria-label="Key figures"
          sx={{
            display: 'grid',
            gap: 2,
            // As many across as fit the widget's width.
            gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(auto-fill, minmax(190px, 1fr))' },
            opacity: summary.isPlaceholderData ? 0.5 : 1,
            transition: 'opacity 150ms',
          }}
        >
          {tiles.map((tile) => {
            const metric = summary.data.metrics[tile.key];
            return <StatTile key={tile.key} label={tile.label} value={tile.value(metric)} caption={tile.caption(metric)} to={tile.to} />;
          })}
        </Box>
      ),
    });
  }
  if (ready && can(PERMISSIONS.LEADS_READ)) {
    widgets.push({ id: 'leadsBySource', title: 'Leads by source', size: 6, content: (
        <ChartCard
          title="Leads by source"
          types={['bar', 'donut']}
          subtitle="Leads created in the period"
          query={leads}
          valueLabel="Leads"
          format={count}
          rows={(data) => data.bySource.map((row) => ({ key: row.id ?? 'none', label: row.name, value: row.count }))}
          empty="No leads were created in this period."
        />
    ) });
    widgets.push({ id: 'leadsByStatus', title: 'Leads by status', size: 6, content: (
        <ChartCard
          title="Leads by status"
          types={['bar', 'donut']}
          subtitle="Where the leads created in the period stand now"
          query={leads}
          valueLabel="Leads"
          format={count}
          rows={(data) => data.byStatus.map((row) => ({ key: row.id, label: row.name, value: row.count }))}
          empty="No leads were created in this period."
        />
    ) });
  }
  if (ready && can(PERMISSIONS.OPPORTUNITIES_READ)) {
    widgets.push({ id: 'pipeline', title: 'Opportunity pipeline', size: 12, content: (
        <ChartCard
          title="Opportunity pipeline"
          subtitle={
            opportunities.data
              ? `${opportunities.data.pipeline?.name ?? 'No pipeline'}: value of open deals by stage, now · win rate in the period ${
                  opportunities.data.totals.winRate === null ? 'n/a' : `${opportunities.data.totals.winRate}%`
                }`
              : 'Value of open deals by stage'
          }
          query={opportunities}
          valueLabel="Value"
          format={formatCompact}
          rows={(data) => data.stages.map((stage) => ({ key: stage.id, label: stage.name, value: stage.value, count: stage.count, weighted: stage.weightedValue }))}
          columns={[
            { header: 'Deals', cell: (row) => row.count },
            { header: 'Weighted', cell: (row) => formatAmount(row.weighted) },
          ]}
          empty="There are no open opportunities in this pipeline."
        />
    ) });
  }
  if (ready && can(PERMISSIONS.ORDERS_READ)) {
    widgets.push({ id: 'monthlySales', title: 'Monthly sales', size: 12, content: (
        <ChartCard
          title="Monthly sales"
          types={['column', 'line', 'area']}
          subtitle={sales.data ? `Order value by month, cancelled orders excluded · ${formatAmount(sales.data.totals.orderValue)} in the period` : 'Order value by month'}
          query={sales}
          valueLabel="Order value"
          format={formatCompact}
          upright
          rows={(data) => data.monthlySales.map((month) => ({ key: month.month, label: formatMonth(month.month), value: month.value, orders: month.orderCount }))}
          columns={[{ header: 'Orders', cell: (row) => row.orders }]}
          empty="No orders in these months."
        />
    ) });
    widgets.push({ id: 'salespeople', title: 'Salesperson performance', size: 6, content: (
        <ChartCard
          title="Salesperson performance"
          subtitle="Order value in the period, by the person the order is assigned to"
          query={sales}
          valueLabel="Order value"
          format={formatCompact}
          rows={(data) =>
            data.salespeople.map((row) => ({
              key: row.user?.id ?? 'none',
              label: row.user?.fullName ?? 'Unassigned',
              value: row.orderValue,
              orders: row.orderCount,
              wonCount: row.wonCount,
              wonValue: row.wonValue,
            }))
          }
          columns={[
            { header: 'Orders', cell: (row) => row.orders },
            { header: 'Deals won', cell: (row) => row.wonCount },
            { header: 'Won value', cell: (row) => formatAmount(row.wonValue) },
          ]}
          empty="No orders in this period."
        />
    ) });
    widgets.push({ id: 'products', title: 'Product performance', size: 6, content: (
        <ChartCard
          title="Product performance"
          subtitle="Top products by revenue in the period (before tax)"
          query={sales}
          valueLabel="Revenue"
          format={formatCompact}
          rows={(data) => data.products.map((row) => ({ key: row.productId, label: row.name, value: row.revenue, quantity: row.quantity, orders: row.orderCount }))}
          columns={[
            { header: 'Quantity', cell: (row) => formatAmount(row.quantity) },
            { header: 'Orders', cell: (row) => row.orders },
          ]}
          empty="No products were sold in this period."
        />
    ) });
  }
  if (ready && can(PERMISSIONS.ACTIVITIES_READ)) {
    widgets.push({ id: 'activitiesByType', title: 'Activities by type', size: 6, content: (
        <ChartCard
          title="Activities by type"
          types={['bar', 'donut']}
          subtitle={
            activities.data
              ? `${activities.data.totals.total} logged in the period · ${activities.data.totals.completed} completed, ${activities.data.totals.overdue} overdue now`
              : 'Activities logged in the period'
          }
          query={activities}
          valueLabel="Activities"
          format={count}
          rows={(data) => data.byType.map((row) => ({ key: row.id, label: row.name, value: row.count }))}
          empty="No activities were logged in this period."
        />
    ) });
    widgets.push({ id: 'activitiesByUser', title: 'Activities by person', size: 6, content: (
        <ChartCard
          title="Activities by person"
          subtitle="Logged in the period, by the person they are assigned to"
          query={activities}
          valueLabel="Activities"
          format={count}
          rows={(data) => data.byUser.map((row) => ({ key: row.user?.id ?? 'none', label: row.user?.fullName ?? 'Unassigned', value: row.count, completed: row.completed }))}
          columns={[{ header: 'Completed', cell: (row) => row.completed }]}
          empty="No activities were logged in this period."
        />
    ) });
  }
  if (can(PERMISSIONS.DOCUMENTS_READ)) widgets.push({ id: 'recentDocuments', title: 'Recent documents', size: 6, content: <RecentDocuments /> });
  const { layout, save, reset } = useDashboardLayout(widgets);

  return (
    <Stack spacing={2}>
      <PageHeader
        title={t('dashboard.title')}
        subtitle={scope ? `${scope.organization ? scope.organization.name : SCOPE_TEXT[scope.type]} · ${periodText}` : undefined}
        actions={
          <>
            {summary.data && (
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                Updated {formatDateTime(summary.data.generatedAt)}
              </Typography>
            )}
            <Tooltip title="Refresh now">
              <IconButton aria-label="Refresh the dashboard" onClick={() => queryClient.invalidateQueries({ queryKey: ['dashboard'] })}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
            {editing ? (
              <>
                <Button onClick={() => setChoosing(true)}>{t('dashboard.customizeTitle')}</Button>
                <Button variant="contained" onClick={() => setEditing(false)}>
                  {t('dashboard.done')}
                </Button>
              </>
            ) : (
              <Button variant="outlined" color="inherit" startIcon={<DashboardCustomizeOutlinedIcon />} onClick={() => setEditing(true)} sx={{ borderColor: 'divider' }}>
                {t('dashboard.customize')}
              </Button>
            )}
          </>
        }
      />

      {/* One row of filters; everything below is fetched for the same slice. */}
      <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', rowGap: 2, alignItems: 'center' }}>
        <ToggleButtonGroup size="small" exclusive value={period} onChange={(event, value) => value && setPeriod(value)} aria-label="Period">
          {PERIODS.map((option) => (
            <ToggleButton key={option.value} value={option.value}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {period === 'custom' &&
          ['from', 'to'].map((field) => (
            <TextField
              key={field}
              type="date"
              label={field === 'from' ? 'From' : 'To'}
              value={range[field]}
              onChange={(event) => setRange((current) => ({ ...current, [field]: event.target.value }))}
              error={Boolean(range.from && range.to && range.from > range.to)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ width: 170 }}
            />
          ))}
        {/* Offered only to users the API lets see more than one organization. */}
        {scope?.organizations.length > 0 && (
          <TextField
            select
            label="Organization"
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            sx={{ width: 220 }}
          >
            <MenuItem value="">All organizations</MenuItem>
            {scope.organizations.map((organization) => (
              <MenuItem key={organization.id} value={organization.id}>
                {organization.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        {pipelines.length > 1 && (
          <TextField
            select
            label="Pipeline"
            value={pipelineId || opportunities.data.pipeline?.id || ''}
            onChange={(event) => setPipelineId(event.target.value)}
            sx={{ width: 220 }}
          >
            {pipelines.map((pipeline) => (
              <MenuItem key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>

      {!ready && <Alert severity="info">Choose a start and an end date; the end must not be before the start.</Alert>}
      {summary.error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => summary.refetch()}>
              Retry
            </Button>
          }
        >
          {summary.error.message}
        </Alert>
      )}

      {ready && summary.isPending && <Skeleton variant="rounded" height={110} aria-label="Loading the figures" />}
      {summary.data && tiles.length === 0 && (
        <Alert severity="info">Your role can open the dashboard but cannot read any of the modules it reports on.</Alert>
      )}
      {editing && (
        <Alert severity="info" action={<Button color="inherit" size="small" onClick={reset}>{t('dashboard.reset')}</Button>}>
          {t('dashboard.customizeHint')}
        </Alert>
      )}

      {widgets.length > 0 && <DashboardGrid widgets={widgets} layout={layout} onChange={save} editing={editing} />}

      <CustomizeDashboardDialog
        open={choosing}
        onClose={() => setChoosing(false)}
        widgets={widgets}
        layout={layout}
        onChange={save}
        onReset={() => {
          reset();
          setChoosing(false);
        }}
      />
    </Stack>
  );
}
