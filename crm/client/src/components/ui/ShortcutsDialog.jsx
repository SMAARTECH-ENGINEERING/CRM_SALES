import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { SHORTCUTS, keyLabel } from '../../hooks/useShortcuts.js';

const GROUPS = ['general', 'navigation'];

function Keys({ keys }) {
  return (
    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
      {keys.map((key) => (
        <Box
          key={key}
          component="kbd"
          sx={{
            px: 0.75,
            minWidth: 24,
            textAlign: 'center',
            border: '1px solid',
            borderColor: 'divider',
            borderBottomWidth: 2,
            borderRadius: 1,
            bgcolor: 'surface.subtle',
            typography: 'caption',
            fontFamily: (theme) => theme.typography.fontFamilyMono,
          }}
        >
          {keyLabel(key)}
        </Box>
      ))}
    </Stack>
  );
}

// The list of keyboard shortcuts (see hooks/useShortcuts.js), opened with "?".
export default function ShortcutsDialog({ open, onClose }) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="shortcuts-title">
      <DialogTitle id="shortcuts-title" sx={{ pr: 6 }}>
        {t('shortcuts.title')}
        <IconButton aria-label={t('actions.close')} onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {GROUPS.map((group) => (
            <Box key={group}>
              <Typography variant="overline" color="text.secondary" component="h3">
                {t(`shortcuts.${group}`)}
              </Typography>
              <Stack component="dl" spacing={1} sx={{ m: 0, mt: 0.5 }}>
                {SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => (
                  <Stack key={shortcut.id} direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography component="dt" variant="body2">
                      {t(shortcut.labelKey)}
                    </Typography>
                    <Box component="dd" sx={{ m: 0 }}>
                      <Keys keys={shortcut.display} />
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
