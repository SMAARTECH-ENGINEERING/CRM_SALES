import { createTheme } from '@mui/material/styles';
import { DEFAULT_THEME_ID, THEMES, findTheme, paletteFor } from './colors.js';
import { componentOverrides } from './componentOverrides.js';
import { shadowsFor } from './shadows.js';
import { BREAKPOINTS, RADIUS, SPACING_UNIT, TRANSITIONS, Z_INDEX } from './spacing.js';
import { DEFAULT_FONT_SIZE, FONT_SIZES, findFontSize, typographyFor } from './typography.js';

// Builds the MUI theme from the tokens for what the user chose: a colour theme
// and a text size. Light and dark are two colour schemes of the same theme, and
// which one shows is the user's mode (light / dark / system) - see App.jsx.

export const THEME_MODES = ['light', 'dark', 'system'];
export const DEFAULT_THEME_MODE = 'system';

export { DEFAULT_FONT_SIZE, DEFAULT_THEME_ID, FONT_SIZES, THEMES };

export const isThemeId = (id) => THEMES.some((theme) => theme.id === id);
export const isFontSize = (id) => FONT_SIZES.some((size) => size.id === id);
export const isThemeMode = (mode) => THEME_MODES.includes(mode);

const cache = new Map();

export function buildTheme({ themeId = DEFAULT_THEME_ID, fontSize = DEFAULT_FONT_SIZE } = {}) {
  const theme = findTheme(themeId);
  const size = findFontSize(fontSize);
  const key = `${theme.id}:${size.id}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      createTheme({
        // The scheme is switched with an attribute on <html>, so the user's
        // choice can differ from the operating system's.
        cssVariables: { colorSchemeSelector: 'data-color-scheme' },
        colorSchemes: {
          light: { palette: paletteFor(theme, 'light') },
          dark: { palette: paletteFor(theme, 'dark') },
        },
        spacing: SPACING_UNIT,
        breakpoints: { values: BREAKPOINTS },
        shape: { borderRadius: RADIUS.md },
        typography: typographyFor(size.id),
        shadows: shadowsFor(),
        zIndex: Z_INDEX,
        transitions: TRANSITIONS,
        components: componentOverrides(theme),
      })
    );
  }
  return cache.get(key);
}

// The two brand colours of a theme in a scheme, for the previews in the theme picker.
export function themeSwatch(themeId, scheme) {
  const theme = findTheme(themeId);
  const palette = paletteFor(theme, scheme);
  return { primary: palette.primary.main, secondary: palette.secondary.main, background: palette.background.default, surface: palette.background.paper, text: palette.text.primary, divider: palette.divider };
}
