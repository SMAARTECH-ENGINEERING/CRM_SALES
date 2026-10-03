import CheckIcon from '@mui/icons-material/Check';
import LanguageOutlinedIcon from '@mui/icons-material/LanguageOutlined';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../../context/PreferencesContext.jsx';
import { LANGUAGES } from '../../i18n/index.js';

// The languages as menu items: each named in its own language, the current one
// ticked. Also used inside the user menu on small screens.
export function LanguageItems({ onChosen }) {
  const { preferences, update } = usePreferences();
  return LANGUAGES.map((language) => {
    const selected = language.id === preferences.language;
    return (
      <MenuItem
        key={language.id}
        role="menuitemradio"
        aria-checked={selected}
        selected={selected}
        lang={language.locale || language.id}
        onClick={() => {
          update({ language: language.id });
          onChosen?.();
        }}
      >
        <ListItemIcon>{selected && <CheckIcon fontSize="small" />}</ListItemIcon>
        <ListItemText>{language.name}</ListItemText>
      </MenuItem>
    );
  });
}

// The globe button in the top bar. Choosing a language changes the whole
// interface at once, without reloading, and is remembered.
export default function LanguageSelector() {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState(null);
  const close = () => setAnchor(null);

  return (
    <>
      <Tooltip title={t('topbar.language')}>
        <IconButton color="inherit" aria-label={t('topbar.language')} aria-haspopup="menu" onClick={(event) => setAnchor(event.currentTarget)}>
          <LanguageOutlinedIcon />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ list: { 'aria-label': t('topbar.language') } }}
      >
        <LanguageItems onChosen={close} />
      </Menu>
    </>
  );
}
