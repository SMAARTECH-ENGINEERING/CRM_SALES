import CloseIcon from '@mui/icons-material/Close';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../../context/PreferencesContext.jsx';
import useAuth from '../../hooks/useAuth.js';
import { LANGUAGES } from '../../i18n/index.js';
import ConfirmDialog from '../ConfirmDialog.jsx';
import { AppearancePanel } from './ThemeSelector.jsx';

// Everything a user can set about how the app looks to them: language, mode,
// colour theme, text size, table density - and a way back to the defaults.
export default function PreferencesDialog({ open, onClose }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { preferences, update, reset } = usePreferences();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth aria-labelledby="preferences-title">
        <DialogTitle id="preferences-title" sx={{ pr: 6 }}>
          {t('preferences.title')}
          <IconButton aria-label={t('actions.close')} onClick={onClose} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <div>
              <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mb: 0.75 }}>
                {t('languages.label')}
              </Typography>
              <TextField select value={preferences.language} onChange={(event) => update({ language: event.target.value })} slotProps={{ htmlInput: { 'aria-label': t('languages.label') } }}>
                {LANGUAGES.map((language) => (
                  <MenuItem key={language.id} value={language.id} lang={language.locale || language.id}>
                    {language.name}
                  </MenuItem>
                ))}
              </TextField>
            </div>
            <AppearancePanel />
            <Alert severity="info" variant="outlined">
              {user ? t('preferences.saved') : t('preferences.savedLocal')}
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
          <Button color="inherit" onClick={() => setConfirming(true)}>
            {t('appearance.resetAll')}
          </Button>
          <Button variant="contained" onClick={onClose}>
            {t('actions.done')}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={confirming}
        title={t('appearance.resetAll')}
        confirmLabel={t('actions.reset')}
        confirmColor="warning"
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          reset();
          setConfirming(false);
        }}
      >
        {t('preferences.resetConfirm')}
      </ConfirmDialog>
    </>
  );
}
