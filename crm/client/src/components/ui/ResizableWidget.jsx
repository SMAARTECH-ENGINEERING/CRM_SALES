import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// A widget's width is a number of columns out of 12.
export const WIDGET_COLUMNS = 12;
export const WIDGET_MIN_SIZE = 3;
// The named sizes offered in the size menu.
export const WIDGET_SIZES = [
  { id: 'small', span: 4 },
  { id: 'medium', span: 6 },
  { id: 'large', span: 8 },
  { id: 'full', span: 12 },
];
export const clampWidgetSize = (size) => Math.min(WIDGET_COLUMNS, Math.max(WIDGET_MIN_SIZE, Math.round(Number(size) || WIDGET_COLUMNS)));

// One cell of a 12-column widget grid. Normally it is just its content at its
// width. While `editing` it gains a bar - a drag handle, earlier / later, a
// size menu, hide - and a right edge that can be dragged to resize it.
// Everything a pointer can do here, the buttons and the menu can do too.
export default function ResizableWidget({ id, title, size, editing, isFirst, isLast, onMove, onResize, onHide, onDragStart, onDragEnter, onDragEnd, dragging, children }) {
  const { t } = useTranslation();
  const cell = useRef(null);
  const [preview, setPreview] = useState(null);
  const span = preview ?? size;

  // How many columns the pointer's position amounts to.
  function sizeAt(clientX) {
    const grid = cell.current.parentElement.getBoundingClientRect();
    const left = cell.current.getBoundingClientRect().left;
    return clampWidgetSize(((clientX - left) / grid.width) * WIDGET_COLUMNS);
  }

  return (
    <Box
      ref={cell}
      data-widget={id}
      onDragEnter={editing ? () => onDragEnter(id) : undefined}
      onDragOver={editing ? (event) => event.preventDefault() : undefined}
      sx={{
        gridColumn: { xs: '1 / -1', md: `span ${span}` },
        minWidth: 0,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        opacity: dragging ? 0.4 : 1,
        ...(editing && { outline: '1px dashed', outlineColor: 'primary.main', outlineOffset: 3, borderRadius: 1 }),
      }}
    >
      {editing && (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mb: 0.5, minHeight: 36 }} role="toolbar" aria-label={title}>
          <Tooltip title={t('dashboard.drag', { name: title })}>
            <Box
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', id);
                onDragStart(id);
              }}
              onDragEnd={onDragEnd}
              sx={{ display: 'grid', placeItems: 'center', cursor: 'grab', color: 'text.secondary', '&:active': { cursor: 'grabbing' } }}
            >
              <DragIndicatorIcon fontSize="small" />
            </Box>
          </Tooltip>
          <Typography variant="subtitle2" noWrap sx={{ flex: 1, minWidth: 0 }}>
            {title}
          </Typography>
          <IconButton size="small" aria-label={t('dashboard.moveEarlier', { name: title })} disabled={isFirst} onClick={() => onMove(id, -1)}>
            <ArrowBackIcon fontSize="small" />
          </IconButton>
          <IconButton size="small" aria-label={t('dashboard.moveLater', { name: title })} disabled={isLast} onClick={() => onMove(id, 1)}>
            <ArrowForwardIcon fontSize="small" />
          </IconButton>
          <TextField
            select
            size="small"
            value={WIDGET_SIZES.some((option) => option.span === size) ? size : ''}
            onChange={(event) => onResize(id, Number(event.target.value))}
            slotProps={{ htmlInput: { 'aria-label': `${t('dashboard.widgetSize')}: ${title}` }, select: { displayEmpty: true, renderValue: (value) => (value ? t(`dashboard.sizes.${WIDGET_SIZES.find((option) => option.span === value).id}`) : `${size}/${WIDGET_COLUMNS}`) } }}
            sx={{ width: 128, display: { xs: 'none', md: 'inline-flex' } }}
          >
            {WIDGET_SIZES.map((option) => (
              <MenuItem key={option.id} value={option.span}>
                {t(`dashboard.sizes.${option.id}`)}
              </MenuItem>
            ))}
          </TextField>
          <Tooltip title={t('dashboard.hide', { name: title })}>
            <IconButton size="small" aria-label={t('dashboard.hide', { name: title })} onClick={() => onHide(id)}>
              <VisibilityOffOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      )}

      <Box sx={{ flex: 1, minWidth: 0, ...(editing && { pointerEvents: 'none', userSelect: 'none' }) }}>{children}</Box>

      {editing && (
        <Box
          role="separator"
          aria-orientation="vertical"
          aria-label={t('dashboard.resize', { name: title })}
          aria-valuemin={WIDGET_MIN_SIZE}
          aria-valuemax={WIDGET_COLUMNS}
          aria-valuenow={span}
          tabIndex={0}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture?.(event.pointerId);
            setPreview(size);
          }}
          onPointerMove={(event) => preview !== null && setPreview(sizeAt(event.clientX))}
          onPointerUp={(event) => {
            if (preview === null) return;
            const final = sizeAt(event.clientX);
            setPreview(null);
            if (final !== size) onResize(id, final);
          }}
          onPointerCancel={() => setPreview(null)}
          onKeyDown={(event) => {
            const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
            if (!step) return;
            event.preventDefault();
            onResize(id, clampWidgetSize(size + step));
          }}
          sx={{
            display: { xs: 'none', md: 'block' },
            position: 'absolute',
            top: 40,
            bottom: 0,
            right: -6,
            width: 12,
            cursor: 'ew-resize',
            touchAction: 'none',
            '&::after': { content: '""', position: 'absolute', top: '35%', bottom: '35%', left: 4, width: 4, borderRadius: 2, bgcolor: preview !== null ? 'primary.main' : 'divider' },
            '&:hover::after, &:focus-visible::after': { bgcolor: 'primary.main' },
            '&:focus-visible': { outline: 'none' },
          }}
        />
      )}
    </Box>
  );
}
