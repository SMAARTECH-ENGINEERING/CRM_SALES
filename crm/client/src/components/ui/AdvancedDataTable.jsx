import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CloseIcon from '@mui/icons-material/Close';
import DensityMediumIcon from '@mui/icons-material/DensityMedium';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import ViewColumnOutlinedIcon from '@mui/icons-material/ViewColumnOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import TablePagination from '@mui/material/TablePagination';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { DataGrid, useGridApiRef } from '@mui/x-data-grid';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { usePreferences, useTablePreferences } from '../../context/PreferencesContext.jsx';
import { TABLE_DENSITIES } from '../../theme/spacing.js';
import { EMPTY } from '../../utils/format.js';
import EmptyState from './EmptyState.jsx';
import { QuickView } from './EntityDrawer.jsx';
import LoadingState from './LoadingState.jsx';

// Reused, so that "nothing saved" is the same object on every render: the
// grid redoes its column work whenever it is handed a new one.
const NONE = Object.freeze({});
const GRID_SX = { border: 0, borderRadius: 0, '--DataGrid-overlayHeight': '260px' };
const GRID_SLOT_PROPS = { loadingOverlay: { variant: 'linear-progress', noRowsVariant: 'skeleton' } };

const QUICK_FIELD = '__quick';
const isData = (column) => column.type !== 'actions' && !column.field.startsWith('__');

// A column's value for a row, as the grid would show it - for the card view.
function cellContent(column, row) {
  const raw = row[column.field];
  const value = column.valueGetter ? column.valueGetter(raw, row, column) : raw;
  if (column.renderCell) return column.renderCell({ row, value, field: column.field, id: row.id, colDef: column });
  const text = column.valueFormatter ? column.valueFormatter(value, row, column) : value;
  return text === null || text === undefined || text === '' ? EMPTY : String(text);
}

function ToolbarButton({ title, icon: Icon, ...props }) {
  return (
    <Tooltip title={title}>
      <IconButton size="small" aria-label={title} {...props}>
        <Icon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

// Choose which columns show, and in what order.
function ColumnsPopover({ anchor, onClose, columns, visibility, onToggle, onMove, onShowAll, onReset }) {
  const { t } = useTranslation();
  return (
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={onClose} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { 'aria-label': t('table.columnsTitle'), sx: { width: 300, maxWidth: 'calc(100vw - 32px)' } } }}>
      <Typography variant="subtitle2" component="h3" sx={{ px: 2, pt: 1.5 }}>
        {t('table.columnsTitle')}
      </Typography>
      <List dense sx={{ maxHeight: 360, overflowY: 'auto' }}>
        {columns.map((column, index) => {
          const name = column.headerName ?? column.field;
          return (
            <ListItem
              key={column.field}
              disablePadding
              sx={{ pl: 1, pr: 1 }}
              secondaryAction={
                <Stack direction="row">
                  <IconButton size="small" aria-label={t('table.moveUp', { name })} disabled={index === 0} onClick={() => onMove(index, -1)}>
                    <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                  <IconButton size="small" aria-label={t('table.moveDown', { name })} disabled={index === columns.length - 1} onClick={() => onMove(index, 1)}>
                    <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Stack>
              }
            >
              <Checkbox size="small" checked={visibility[column.field] !== false} onChange={() => onToggle(column.field)} slotProps={{ input: { 'aria-label': name } }} />
              <ListItemText primary={name} slotProps={{ primary: { noWrap: true } }} sx={{ pr: 7 }} />
            </ListItem>
          );
        })}
      </List>
      <Divider />
      <Stack direction="row" sx={{ p: 1, justifyContent: 'space-between' }}>
        <Button size="small" onClick={onShowAll}>
          {t('table.showAll')}
        </Button>
        <Button size="small" color="inherit" onClick={onReset}>
          {t('table.resetColumns')}
        </Button>
      </Stack>
    </Popover>
  );
}

// The rows as cards, for a phone: the first column is the card's title, the
// next few are label / value lines. A card opens the record.
function CardList({ rows, columns, rowHref, loading, empty, pagination }) {
  const [title, ...rest] = columns.filter(isData);
  const details = rest.slice(0, 6);
  return (
    <Box>
      {loading && <LinearProgress aria-hidden />}
      {rows.length === 0 && !loading && empty}
      {rows.length === 0 && loading && <LoadingState variant="table" rows={5} />}
      <Stack spacing={1} role="list" sx={{ mt: 1 }}>
        {rows.map((row) => {
          const href = rowHref?.(row);
          const heading = title ? cellContent({ ...title, renderCell: undefined }, row) : row.id;
          return (
            <Card key={row.id} role="listitem" sx={{ p: 1.5 }}>
              <Typography variant="subtitle2" component="div" sx={{ mb: 0.5, overflowWrap: 'anywhere' }}>
                {href ? (
                  <Link component={RouterLink} to={href} color="inherit" underline="hover">
                    {heading}
                  </Link>
                ) : (
                  heading
                )}
              </Typography>
              <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'minmax(96px, auto) 1fr', columnGap: 1.5, rowGap: 0.5, alignItems: 'center' }}>
                {details.map((column) => (
                  <Box key={column.field} sx={{ display: 'contents' }}>
                    <Typography component="dt" variant="caption" color="text.secondary">
                      {column.headerName}
                    </Typography>
                    <Typography component="dd" variant="body2" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
                      {cellContent(column, row)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Card>
          );
        })}
      </Stack>
      {pagination}
    </Box>
  );
}

// The table every list in the app uses: a DataGrid with a toolbar and the
// user's own arrangement of it.
//
//   tableId      names the table, so its columns are remembered per user
//   toolbar      what sits at the left of the toolbar (a search box, counts)
//   bulkActions  ({ ids, clear }) => buttons; turns on row selection
//   rowHref      (row) => where a row leads; makes the phone cards links
//   emptyState   <EmptyState ... /> for "nothing here"
//
// Everything else is passed to DataGrid. Users can resize, hide, show and
// reorder columns, change the density, go full screen and download what is
// shown as CSV. Widths, order, visibility and density are saved.
// On a phone the rows are shown as cards instead of a wide table.
export default function AdvancedDataTable({ tableId, columns, rows, toolbar, bulkActions, rowHref, emptyState, loading, sx, height = 'calc(100vh - 290px)', minHeight = 420, ...gridProps }) {
  const { t } = useTranslation();
  const apiRef = useGridApiRef();
  const { preferences, update } = usePreferences();
  const [saved, save] = useTablePreferences(tableId);
  const isPhone = useMediaQuery((theme) => theme.breakpoints.down('sm'));
  const [columnsAnchor, setColumnsAnchor] = useState(null);
  const [densityAnchor, setDensityAnchor] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [selection, setSelection] = useState([]);
  // The row being looked at in the quick view.
  const [peek, setPeek] = useState(null);

  const visibility = saved?.visibility ?? NONE;
  const widths = saved?.widths ?? NONE;
  const order = saved?.order;

  // The columns in the user's order, at the user's widths.
  const arranged = useMemo(() => {
    const position = (column) => {
      const index = order ? order.indexOf(column.field) : -1;
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    const data = columns.filter(isData);
    const sorted = order ? [...data].sort((a, b) => position(a) - position(b)) : data;
    const sized = sorted.map((column) => (widths[column.field] ? { ...column, width: widths[column.field], flex: undefined } : column));
    // A quick look at a row, first; actions stay at the end, whatever the order.
    const quick = rowHref
      ? [
          {
            field: QUICK_FIELD,
            headerName: '',
            width: 44,
            sortable: false,
            resizable: false,
            disableColumnMenu: true,
            disableExport: true,
            hideable: false,
            renderHeader: () => null,
            renderCell: ({ row }) => (
              <Tooltip title={t('table.quickView')}>
                <IconButton size="small" aria-label={t('table.quickView')} onClick={() => setPeek(row)}>
                  <VisibilityOutlinedIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            ),
          },
        ]
      : [];
    return [...quick, ...sized, ...columns.filter((column) => !isData(column))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, order, widths, Boolean(rowHref), t]);
  const dataColumns = arranged.filter(isData);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKeyDown = (event) => event.key === 'Escape' && setFullscreen(false);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullscreen]);

  function move(index, by) {
    const fields = dataColumns.map((column) => column.field);
    const [field] = fields.splice(index, 1);
    fields.splice(index + by, 0, field);
    save({ order: fields });
  }

  const empty = emptyState ?? <EmptyState dense />;
  // The overlay component stays the same one; what it shows is read when it renders.
  const emptyRef = useRef(empty);
  emptyRef.current = empty;
  const slots = useMemo(() => {
    const Empty = () => emptyRef.current;
    return { noRowsOverlay: Empty, noResultsOverlay: Empty };
  }, []);
  // The grid's own words, in the user's language. A count of -1 is "not known yet".
  const displayedRows = ({ from, to, count }) => (count === -1 ? `${from}–${to}` : t('table.pageOf', { from, to, count }));
  const localeText = useMemo(
    () => ({ paginationRowsPerPage: t('table.rowsPerPage'), paginationDisplayedRows: displayedRows, noRowsLabel: t('table.noRows') }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );
  const clearSelection = () => setSelection([]);
  const selectable = Boolean(bulkActions);
  const selectionModel = useMemo(() => (selectable ? { type: 'include', ids: new Set(selection) } : undefined), [selectable, selection]);
  const selecting = Boolean(bulkActions) && selection.length > 0;

  const tools = (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
      {!isPhone && tableId && <ToolbarButton title={t('table.columns')} icon={ViewColumnOutlinedIcon} aria-haspopup="dialog" onClick={(event) => setColumnsAnchor(event.currentTarget)} />}
      {!isPhone && <ToolbarButton title={t('table.density')} icon={DensityMediumIcon} aria-haspopup="menu" onClick={(event) => setDensityAnchor(event.currentTarget)} />}
      {!isPhone && <ToolbarButton title={t('table.exportCsv')} icon={FileDownloadOutlinedIcon} disabled={!rows.length} onClick={() => apiRef.current?.exportDataAsCsv({ utf8WithBom: true })} />}
      <ToolbarButton title={fullscreen ? t('table.exitFullscreen') : t('table.fullscreen')} icon={fullscreen ? FullscreenExitIcon : FullscreenIcon} aria-pressed={fullscreen} onClick={() => setFullscreen((on) => !on)} />
    </Stack>
  );

  const bar = selecting ? (
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', px: 1.5, py: 0.75, bgcolor: 'action.selected' }} role="toolbar" aria-label={t('table.selected', { count: selection.length })}>
      <Typography variant="subtitle2" sx={{ mr: 1 }}>
        {t('table.selected', { count: selection.length })}
      </Typography>
      {bulkActions({ ids: selection, clear: clearSelection })}
      <Box sx={{ flex: 1 }} />
      <ToolbarButton title={t('table.clearSelection')} icon={CloseIcon} onClick={clearSelection} />
    </Stack>
  ) : (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1.5, py: 0.75, minHeight: 46 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>{toolbar}</Box>
      {tools}
    </Stack>
  );

  // Paging for the card view, driven by the same props as the grid's own.
  const { paginationModel, onPaginationModelChange, rowCount, pageSizeOptions } = gridProps;
  const cardPagination = paginationModel && (
    <TablePagination
      component="div"
      count={rowCount ?? rows.length}
      page={paginationModel.page}
      rowsPerPage={paginationModel.pageSize}
      rowsPerPageOptions={pageSizeOptions ?? []}
      labelRowsPerPage=""
      labelDisplayedRows={displayedRows}
      onPageChange={(event, page) => onPaginationModelChange?.({ page, pageSize: paginationModel.pageSize })}
      onRowsPerPageChange={(event) => onPaginationModelChange?.({ page: 0, pageSize: Number(event.target.value) })}
    />
  );

  return (
    <Paper
      variant="outlined"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        ...(fullscreen
          ? { position: 'fixed', inset: 0, zIndex: (theme) => theme.zIndex.modal, borderRadius: 0, height: '100dvh' }
          : isPhone
            ? { border: 0, bgcolor: 'transparent' }
            : { height, minHeight }),
        ...sx,
      }}
    >
      {bar}
      {!isPhone && <Divider />}
      {isPhone && !fullscreen ? (
        <CardList rows={rows} columns={arranged.filter((column) => visibility[column.field] !== false)} rowHref={rowHref} loading={loading} empty={empty} pagination={cardPagination} />
      ) : (
        <Box sx={{ flex: 1, minHeight: 0 }}>
          <DataGrid
            apiRef={apiRef}
            rows={rows}
            columns={arranged}
            loading={loading}
            density={preferences.tableDensity}
            columnVisibilityModel={visibility}
            onColumnVisibilityModelChange={(model) => save({ visibility: model })}
            onColumnWidthChange={({ colDef, width }) => save({ widths: { ...widths, [colDef.field]: Math.round(width) } })}
            checkboxSelection={Boolean(bulkActions)}
            rowSelectionModel={selectionModel}
            onRowSelectionModelChange={
              bulkActions
                ? (model) => setSelection(model.type === 'exclude' ? rows.map((row) => row.id).filter((id) => !model.ids.has(id)) : [...model.ids])
                : undefined
            }
            keepNonExistentRowsSelected={false}
            disableColumnFilter
            disableRowSelectionOnClick
            slots={slots}
            slotProps={GRID_SLOT_PROPS}
            localeText={localeText}
            sx={GRID_SX}
            {...gridProps}
          />
        </Box>
      )}

      {peek && (
        <QuickView
          open
          onClose={() => setPeek(null)}
          title={dataColumns[0] ? cellContent({ ...dataColumns[0], renderCell: undefined }, peek) : peek.id}
          fields={dataColumns.slice(1).map((column) => ({ label: column.headerName, value: cellContent(column, peek) }))}
          href={rowHref?.(peek)}
        />
      )}
      <ColumnsPopover
        anchor={columnsAnchor}
        onClose={() => setColumnsAnchor(null)}
        columns={dataColumns}
        visibility={visibility}
        onToggle={(field) => save({ visibility: { ...visibility, [field]: visibility[field] === false } })}
        onMove={move}
        onShowAll={() => save({ visibility: {} })}
        onReset={() => save(null)}
      />
      <Menu anchorEl={densityAnchor} open={Boolean(densityAnchor)} onClose={() => setDensityAnchor(null)} slotProps={{ list: { 'aria-label': t('table.density') } }}>
        {TABLE_DENSITIES.map((density) => (
          <MenuItem
            key={density.id}
            role="menuitemradio"
            aria-checked={density.id === preferences.tableDensity}
            selected={density.id === preferences.tableDensity}
            onClick={() => {
              update({ tableDensity: density.id });
              setDensityAnchor(null);
            }}
          >
            {t(density.nameKey)}
          </MenuItem>
        ))}
      </Menu>
    </Paper>
  );
}
