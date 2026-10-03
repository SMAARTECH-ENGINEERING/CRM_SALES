import CloseIcon from '@mui/icons-material/Close';
import FilterListIcon from '@mui/icons-material/FilterList';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Children, cloneElement, isValidElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LAYOUT } from '../../theme/spacing.js';

// A panel of filters: at the right edge on a desktop, a sheet from the bottom
// on a phone. Filters apply as they are changed (lists are filtered by the
// API, and show the result behind the panel), so the footer is "Clear" and "Done".
export default function FilterDrawer({ open, onClose, onClear, clearDisabled, title, children }) {
  const { t } = useTranslation();
  const isPhone = useMediaQuery((theme) => theme.breakpoints.down('sm'));
  const heading = title ?? t('filters.title');

  return (
    <Drawer
      anchor={isPhone ? 'bottom' : 'right'}
      open={open}
      onClose={onClose}
      sx={{ zIndex: (theme) => theme.zIndex.modal }}
      slotProps={{
        paper: {
          'aria-label': heading,
          sx: isPhone ? { maxHeight: '88dvh', borderTopLeftRadius: 16, borderTopRightRadius: 16 } : { width: LAYOUT.filterDrawerWidth, maxWidth: '100vw' },
        },
      }}
    >
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}>
        <Typography variant="h6" component="h2">
          {heading}
        </Typography>
        <IconButton aria-label={t('actions.close')} onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Stack>
      <Divider />
      <Stack spacing={2} sx={{ p: 2, flex: 1, overflowY: 'auto' }}>
        {children}
      </Stack>
      <Divider />
      <Stack direction="row" spacing={1} sx={{ p: 2, justifyContent: 'flex-end' }}>
        {onClear && (
          <Button onClick={onClear} disabled={clearDisabled}>
            {t('actions.clear')}
          </Button>
        )}
        <Button variant="contained" onClick={onClose}>
          {t('actions.apply')}
        </Button>
      </Stack>
    </Drawer>
  );
}

// The filter row of a list page. Its content is one row of controls:
//
//   <FilterBar activeCount={2}>
//     <Stack>
//       <TextField label="Search" ... />      first: the search, always on the page
//       <Select ... /> <Select ... />         then: the filters, shown in the drawer
//       <Button onClick={clear}>Clear</Button> last: clears search and filters
//     </Stack>
//   </FilterBar>
//
// The search stays on the page; a "Filters" button (with the number in use)
// opens the rest in a FilterDrawer.
export function FilterBar({ activeCount = 0, children }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const row = Children.only(children);
  const controls = Children.toArray(row.props.children).filter(isValidElement);
  const search = controls[0];
  const clear = controls.length > 1 ? controls.at(-1) : null;
  const filters = controls.slice(1, -1);
  // In the drawer each filter takes the full width.
  const stacked = filters.map((control) => cloneElement(control, { sx: { ...control.props.sx, flex: 'none', minWidth: 0, width: '100%' } }));

  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Box sx={{ flex: 1, minWidth: 0, maxWidth: 520 }}>{search && cloneElement(search, { sx: { ...search.props.sx, flex: 'none' } })}</Box>
      {filters.length > 0 && (
        <Badge badgeContent={activeCount} color="primary" overlap="rectangular">
          <Button variant="outlined" color="inherit" startIcon={<FilterListIcon />} aria-haspopup="dialog" aria-label={activeCount ? `${t('filters.title')}: ${t('filters.active', { count: activeCount })}` : t('filters.title')} onClick={() => setOpen(true)} sx={{ borderColor: 'divider', height: 40 }}>
            {t('filters.title')}
          </Button>
        </Badge>
      )}
      {clear && (activeCount > 0 || !clear.props.disabled) && cloneElement(clear, { sx: { ...clear.props.sx, display: { xs: 'none', sm: 'inline-flex' } } })}
      <FilterDrawer open={open} onClose={() => setOpen(false)} onClear={clear?.props.onClick} clearDisabled={clear?.props.disabled}>
        {stacked}
      </FilterDrawer>
    </Stack>
  );
}
