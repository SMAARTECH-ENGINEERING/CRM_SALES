import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import DonutLargeOutlinedIcon from '@mui/icons-material/DonutLargeOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import ShowChartOutlinedIcon from '@mui/icons-material/ShowChartOutlined';
import StackedLineChartOutlinedIcon from '@mui/icons-material/StackedLineChartOutlined';
import TableRowsOutlinedIcon from '@mui/icons-material/TableRowsOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { saveBlob } from '../../hooks/useQuotations.js';
import DashboardBarChart from './DashboardBarChart.jsx';

// The kinds of chart a card can offer, and the button for each.
const VIEW_ICONS = { bar: BarChartOutlinedIcon, column: BarChartOutlinedIcon, line: ShowChartOutlinedIcon, area: StackedLineChartOutlinedIcon, donut: DonutLargeOutlinedIcon, table: TableRowsOutlinedIcon };
const VIEW_NAMES = { bar: 'a chart', column: 'a chart', line: 'a line chart', area: 'an area chart', donut: 'a donut chart', table: 'a table' };

const csvCell = (value) => {
  const text = String(value ?? '');
  // Never let a spreadsheet read a value as a formula.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

// A titled chart of API rows, with the same rows as a table one click away -
// so no value is reachable only by hovering.
//
//  - `query`: the section's query (from useDashboardSection)
//  - `rows(data)`: picks the rows out of the response: [{ label, value, ...more }]
//  - `columns`: extra table columns, [{ header, cell: (row) => text, numeric }]
//  - `format(value)`: how the plotted value reads (a count, an amount)
//  - `types`: the chart kinds offered, first one shown: bar | column | line | area | donut
//
// The card can be opened full screen, and its rows downloaded as CSV.
export default function ChartCard({ title, subtitle, query, rows: pick, valueLabel, format, columns = [], upright = false, types, empty }) {
  const { t } = useTranslation();
  const kinds = types ?? [upright ? 'column' : 'bar'];
  const [view, setView] = useState(kinds[0]);
  const [fullscreen, setFullscreen] = useState(false);
  const { data, error, isPending, isPlaceholderData } = query;
  const rows = data ? pick(data) : [];
  const hasData = rows.some((row) => row.value > 0);

  function download() {
    const header = ['', valueLabel, ...columns.map((column) => column.header)];
    const lines = rows.map((row) => [row.label, row.value, ...columns.map((column) => column.cell(row))]);
    const csv = [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n');
    saveBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }), `${title}.csv`);
  }

  const table = (
    <Table size="small" aria-label={title}>
      <TableHead>
        <TableRow>
          <TableCell />
          <TableCell align="right">{valueLabel}</TableCell>
          {columns.map((column) => (
            <TableCell key={column.header} align={column.numeric === false ? 'left' : 'right'}>
              {column.header}
            </TableCell>
          ))}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key ?? row.label}>
            <TableCell component="th" scope="row">
              {row.label}
            </TableCell>
            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
              {format(row.value)}
            </TableCell>
            {columns.map((column) => (
              <TableCell key={column.header} align={column.numeric === false ? 'left' : 'right'} sx={{ fontVariantNumeric: 'tabular-nums' }}>
                {column.cell(row)}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  const body = (large) => (
    <>
      <Stack direction="row" spacing={1} sx={{ mb: 1, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2">
            {title}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {subtitle}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <ToggleButtonGroup size="small" exclusive value={view} onChange={(event, value) => value && setView(value)} aria-label={`${title}: chart or table`}>
            {[...kinds, 'table'].map((kind) => {
              const Icon = VIEW_ICONS[kind];
              return (
                <ToggleButton key={kind} value={kind} aria-label={`${title} as ${VIEW_NAMES[kind]}`} sx={{ p: 0.5 }}>
                  <Icon fontSize="small" />
                </ToggleButton>
              );
            })}
          </ToggleButtonGroup>
          <Tooltip title={t('dashboard.download')}>
            <span>
              <IconButton size="small" aria-label={`${t('dashboard.download')}: ${title}`} disabled={!hasData} onClick={download}>
                <FileDownloadOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={large ? t('dashboard.exitFullscreen') : t('dashboard.fullscreen')}>
            <IconButton size="small" aria-label={`${large ? t('dashboard.exitFullscreen') : t('dashboard.fullscreen')}: ${title}`} onClick={() => setFullscreen(!large)}>
              {large ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error.message}</Alert>}
      {isPending && <Skeleton variant="rounded" height={220} aria-label={`Loading ${title}`} />}
      {data && !hasData && <Alert severity="info">{empty ?? 'Nothing to show for this period.'}</Alert>}
      {/* While newer figures load the previous ones stay, dimmed - no jump, no flash. */}
      {data && hasData && (
        <Box sx={{ opacity: isPlaceholderData ? 0.5 : 1, transition: 'opacity 150ms', overflowX: 'auto' }}>
          {view === 'table' ? table : <DashboardBarChart rows={rows} name={valueLabel} format={format} type={view} height={large && view !== 'bar' ? Math.max(320, window.innerHeight - 220) : undefined} />}
        </Box>
      )}
    </>
  );

  return (
    <>
      <Card sx={{ height: '100%' }}>
        <CardContent>{body(false)}</CardContent>
      </Card>
      <Dialog fullScreen open={fullscreen} onClose={() => setFullscreen(false)} aria-label={title}>
        <Box sx={{ p: { xs: 2, sm: 3 } }}>{fullscreen && body(true)}</Box>
      </Dialog>
    </>
  );
}
