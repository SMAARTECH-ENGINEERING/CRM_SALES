import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { LAYOUT } from '../../theme/spacing.js';

// A panel from the right edge for a secondary task - a quick look at a record,
// a short form - without leaving the page behind it. Full width on a phone.
export default function EntityDrawer({ open, onClose, title, subtitle, actions, children, width = LAYOUT.drawerWidth }) {
  const { t } = useTranslation();
  return (
    <Drawer anchor="right" open={open} onClose={onClose} sx={{ zIndex: (theme) => theme.zIndex.modal }} slotProps={{ paper: { 'aria-label': typeof title === 'string' ? title : undefined, sx: { width, maxWidth: '100vw' } } }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between', px: 2, py: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" component="h2" sx={{ overflowWrap: 'anywhere' }}>
            {title}
          </Typography>
          {subtitle && (
            <Typography variant="body2" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <IconButton aria-label={t('actions.close')} onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Stack>
      <Divider />
      <Box sx={{ p: 2, flex: 1, overflowY: 'auto' }}>{children}</Box>
      {actions && (
        <>
          <Divider />
          <Stack direction="row" spacing={1} sx={{ p: 2, justifyContent: 'flex-end' }}>
            {actions}
          </Stack>
        </>
      )}
    </Drawer>
  );
}

// A record at a glance: its fields as label / value lines, and the way to its
// full page. `fields`: [{ label, value }] - values as the page already shows them.
export function QuickView({ open, onClose, title, subtitle, fields = [], href }) {
  const { t } = useTranslation();
  return (
    <EntityDrawer
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      actions={
        href && (
          <Button variant="contained" component={RouterLink} to={href} endIcon={<OpenInNewIcon />} onClick={onClose}>
            {t('actions.openFullPage')}
          </Button>
        )
      }
    >
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'minmax(110px, auto) 1fr', columnGap: 2, rowGap: 1.25, alignItems: 'center' }}>
        {fields.map((field) => (
          <Box key={field.label} sx={{ display: 'contents' }}>
            <Typography component="dt" variant="body2" color="text.secondary">
              {field.label}
            </Typography>
            <Typography component="dd" variant="body1" sx={{ m: 0, minWidth: 0, overflowWrap: 'anywhere' }}>
              {field.value}
            </Typography>
          </Box>
        ))}
      </Box>
    </EntityDrawer>
  );
}

// A dialog around a form: a title, the fields, Cancel and a submit button that
// shows it is working. `onSubmit` is the form's submit handler.
export function FormDialog({ open, onClose, title, children, onSubmit, submitLabel, submitting = false, maxWidth = 'sm' }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth={maxWidth} fullWidth>
      <form noValidate onSubmit={onSubmit}>
        <DialogTitle>{title}</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>{children}</DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={submitting}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" variant="contained" loading={submitting}>
            {submitLabel ?? t('actions.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
