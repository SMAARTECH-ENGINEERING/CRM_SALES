import CheckIcon from '@mui/icons-material/Check';
import ComputerOutlinedIcon from '@mui/icons-material/ComputerOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import IconButton from '@mui/material/IconButton';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import { useColorScheme } from '@mui/material/styles';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { resolveThemeId, usePreferences } from '../../context/PreferencesContext.jsx';
import { useBranding } from '../../hooks/useSettings.js';
import { TABLE_DENSITIES } from '../../theme/spacing.js';
import { FONT_SIZES, THEMES, THEME_MODES, themeSwatch } from '../../theme/themeManager.js';

const MODE_ICONS = { light: LightModeOutlinedIcon, dark: DarkModeOutlinedIcon, system: ComputerOutlinedIcon };

function Section({ title, children }) {
  return (
    <Box>
      <Typography variant="overline" color="text.secondary" component="h3" sx={{ display: 'block', mb: 0.75 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Choice({ label, value, options, onChange }) {
  return (
    <ToggleButtonGroup exclusive fullWidth size="small" color="primary" value={value} aria-label={label} onChange={(event, next) => next && onChange(next)}>
      {options.map(({ id, text, icon: Icon }) => (
        <ToggleButton key={id} value={id} sx={{ textTransform: 'none', gap: 0.75, py: 0.5 }}>
          {Icon && <Icon fontSize="small" />}
          {text}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

// A small picture of a theme: its surface, a title bar in its primary colour
// and two lines of "text" - in the colour scheme now showing.
function ThemePreview({ themeId, scheme }) {
  const swatch = themeSwatch(themeId, scheme);
  return (
    <Box aria-hidden sx={{ height: 44, borderRadius: 1, overflow: 'hidden', border: '1px solid', borderColor: swatch.divider, bgcolor: swatch.background, display: 'flex' }}>
      <Box sx={{ width: '28%', bgcolor: swatch.surface, borderRight: '1px solid', borderColor: swatch.divider, p: 0.5 }}>
        <Box sx={{ height: 4, borderRadius: 1, bgcolor: swatch.primary, mb: 0.5 }} />
        <Box sx={{ height: 3, borderRadius: 1, bgcolor: swatch.secondary, opacity: 0.6 }} />
      </Box>
      <Box sx={{ flex: 1, p: 0.5 }}>
        <Box sx={{ height: 8, width: '45%', borderRadius: 0.5, bgcolor: swatch.primary, mb: 0.5 }} />
        <Box sx={{ height: 3, width: '85%', borderRadius: 1, bgcolor: swatch.text, opacity: 0.55, mb: 0.5 }} />
        <Box sx={{ height: 3, width: '60%', borderRadius: 1, bgcolor: swatch.text, opacity: 0.3 }} />
      </Box>
    </Box>
  );
}

// Mode, colour theme, text size and table density - each applied the moment
// it is chosen, and remembered. Used in the top bar's popover and in Preferences.
export function AppearancePanel() {
  const { t } = useTranslation();
  const { preferences, update } = usePreferences();
  const branding = useBranding();
  const { mode, systemMode } = useColorScheme();
  const scheme = (mode === 'system' ? systemMode : mode) === 'dark' ? 'dark' : 'light';
  const current = resolveThemeId(preferences, branding?.branding?.theme);

  return (
    <Stack spacing={2}>
      <Section title={t('appearance.mode')}>
        <Choice
          label={t('appearance.mode')}
          value={preferences.themeMode}
          options={THEME_MODES.map((id) => ({ id, text: t(`modes.${id}`), icon: MODE_ICONS[id] }))}
          onChange={(themeMode) => update({ themeMode })}
        />
      </Section>

      <Section title={t('appearance.theme')}>
        <Box role="radiogroup" aria-label={t('appearance.chooseTheme')} sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))', gap: 1 }}>
          {THEMES.map((theme) => {
            const selected = theme.id === current;
            return (
              <ButtonBase
                key={theme.id}
                role="radio"
                aria-checked={selected}
                onClick={() => update({ theme: theme.id })}
                sx={{
                  display: 'block',
                  textAlign: 'left',
                  p: 0.75,
                  borderRadius: 1.5,
                  border: '2px solid',
                  borderColor: selected ? 'primary.main' : 'divider',
                  '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
                }}
              >
                <ThemePreview themeId={theme.id} scheme={scheme} />
                <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', mt: 0.5, minHeight: 20 }}>
                  <Typography variant="caption" noWrap sx={{ flex: 1, fontWeight: selected ? 600 : 400 }}>
                    {t(theme.nameKey)}
                  </Typography>
                  {selected && <CheckIcon color="primary" sx={{ fontSize: 16 }} titleAccess={t('appearance.selected')} />}
                </Stack>
              </ButtonBase>
            );
          })}
        </Box>
      </Section>

      <Section title={t('appearance.fontSize')}>
        <Choice label={t('appearance.fontSize')} value={preferences.fontSize} options={FONT_SIZES.map(({ id, nameKey }) => ({ id, text: t(nameKey) }))} onChange={(fontSize) => update({ fontSize })} />
      </Section>

      <Section title={t('appearance.density')}>
        <Choice
          label={t('appearance.density')}
          value={preferences.tableDensity}
          options={TABLE_DENSITIES.map(({ id, nameKey }) => ({ id, text: t(nameKey) }))}
          onChange={(tableDensity) => update({ tableDensity })}
        />
      </Section>
    </Stack>
  );
}

// The palette button in the top bar.
export default function ThemeSelector() {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState(null);

  return (
    <>
      <Tooltip title={t('topbar.theme')}>
        <IconButton color="inherit" aria-label={t('topbar.theme')} aria-haspopup="dialog" onClick={(event) => setAnchor(event.currentTarget)}>
          <PaletteOutlinedIcon />
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { 'aria-label': t('appearance.title'), sx: { width: 460, maxWidth: 'calc(100vw - 32px)', p: 2, mt: 1 } } }}
      >
        <AppearancePanel />
      </Popover>
    </>
  );
}
