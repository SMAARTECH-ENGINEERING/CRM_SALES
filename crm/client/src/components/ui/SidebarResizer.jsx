import Box from '@mui/material/Box';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LAYOUT, clampSidebarWidth } from '../../theme/spacing.js';

// The draggable right edge of the sidebar. Dragging changes the width as it
// goes (onChange) and reports the final width when released (onCommit). With
// the keyboard: Left / Right change it in steps, Home / End jump to the limits.
// Double-click puts it back to the default.
export default function SidebarResizer({ width, onChange, onCommit }) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const start = useRef(null);
  const { min, max, default: initial } = LAYOUT.sidebar;

  function onPointerDown(event) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    start.current = { x: event.clientX, width };
    setDragging(true);
  }
  function onPointerMove(event) {
    if (!start.current) return;
    onChange(clampSidebarWidth(start.current.width + event.clientX - start.current.x));
  }
  function onPointerUp(event) {
    if (!start.current) return;
    const final = clampSidebarWidth(start.current.width + event.clientX - start.current.x);
    start.current = null;
    setDragging(false);
    onCommit(final);
  }
  function onKeyDown(event) {
    const next = { ArrowLeft: width - LAYOUT.sidebarStep, ArrowRight: width + LAYOUT.sidebarStep, Home: min, End: max }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onCommit(clampSidebarWidth(next));
  }

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label={t('sidebar.resize')}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      title={t('sidebar.resizeHint')}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={() => onCommit(initial)}
      onKeyDown={onKeyDown}
      sx={{
        position: 'absolute',
        top: 0,
        right: -3,
        bottom: 0,
        width: 7,
        zIndex: 1,
        cursor: 'col-resize',
        touchAction: 'none',
        '&::after': {
          content: '""',
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 2,
          width: 3,
          bgcolor: dragging ? 'primary.main' : 'transparent',
          transition: (theme) => theme.transitions.create('background-color', { duration: theme.transitions.duration.shortest }),
        },
        '&:hover::after, &:focus-visible::after': { bgcolor: 'primary.main' },
        '&:focus-visible': { outline: 'none' },
      }}
    />
  );
}
