// Colour tokens. This is the only file where colours are written down.
//
// A theme is one entry in THEMES: an id, a name (an i18n key), and the brand
// colours for light and dark. Everything else - surfaces, text, status colours,
// chart colours - is shared and comes from the functions below. To add a theme,
// add an entry; nothing else in the app changes.

export const DEFAULT_THEME_ID = 'professional-blue';

export const THEMES = [
  { id: 'professional-blue', nameKey: 'themes.professionalBlue', light: { primary: '#1763d1', secondary: '#526176' }, dark: { primary: '#6aa9ff', secondary: '#9fb0c7' } },
  { id: 'enterprise-indigo', nameKey: 'themes.enterpriseIndigo', light: { primary: '#4541c9', secondary: '#5b5f7a' }, dark: { primary: '#9a9cff', secondary: '#a9adc9' } },
  { id: 'emerald', nameKey: 'themes.emerald', light: { primary: '#07765a', secondary: '#4f6a61' }, dark: { primary: '#3dd6a3', secondary: '#9cbdb1' } },
  { id: 'ocean', nameKey: 'themes.ocean', light: { primary: '#0b6f8a', secondary: '#4d6873' }, dark: { primary: '#4cc9e6', secondary: '#9bbac4' } },
  { id: 'purple', nameKey: 'themes.purple', light: { primary: '#7a2fc4', secondary: '#665a78' }, dark: { primary: '#c491ff', secondary: '#b7abc8' } },
  { id: 'slate', nameKey: 'themes.slate', light: { primary: '#35465c', secondary: '#64748b' }, dark: { primary: '#a8b8cf', secondary: '#8493a8' } },
  { id: 'warm', nameKey: 'themes.warm', light: { primary: '#a8510a', secondary: '#75604c' }, dark: { primary: '#f5a94e', secondary: '#c9b29b' } },
  {
    id: 'high-contrast',
    nameKey: 'themes.highContrast',
    highContrast: true,
    light: { primary: '#0a2a8f', secondary: '#1f1f1f' },
    dark: { primary: '#ffd83d', secondary: '#f2f2f2' },
  },
];

export const findTheme = (id) => THEMES.find((theme) => theme.id === id) ?? THEMES.find((theme) => theme.id === DEFAULT_THEME_ID);

// Surfaces, text and lines.
const NEUTRALS = {
  light: {
    background: { default: '#f3f5f8', paper: '#ffffff' },
    text: { primary: '#141a23', secondary: '#525c6b', disabled: '#98a1ae' },
    divider: '#dfe3ea',
    // The band behind table headers, toolbars and the sidebar's active item.
    subtle: '#f6f8fb',
  },
  dark: {
    background: { default: '#0e1217', paper: '#161b22' },
    text: { primary: '#e8ecf2', secondary: '#a3adbb', disabled: '#6b7584' },
    divider: '#2a313c',
    subtle: '#1b212a',
  },
};

const HIGH_CONTRAST_NEUTRALS = {
  light: {
    background: { default: '#ffffff', paper: '#ffffff' },
    text: { primary: '#000000', secondary: '#1f1f1f', disabled: '#5c5c5c' },
    divider: '#000000',
    subtle: '#f0f0f0',
  },
  dark: {
    background: { default: '#000000', paper: '#000000' },
    text: { primary: '#ffffff', secondary: '#f2f2f2', disabled: '#b0b0b0' },
    divider: '#ffffff',
    subtle: '#1a1a1a',
  },
};

// States. Reserved for meaning something: never used as a series colour.
const STATUS = {
  light: { success: '#177245', warning: '#a15c00', error: '#c62828', info: '#0b6aa8' },
  dark: { success: '#4cc38a', warning: '#f2b34c', error: '#ff7b72', info: '#62b6f0' },
};

// Chart series, in a fixed order (a validated colour-blind-safe set; the dark
// column is the same hues stepped for a dark surface). A chart with one series
// uses the theme's primary colour instead - see chartColors().
const SERIES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
};

// The MUI palette for one colour scheme of one theme.
export function paletteFor(theme, scheme) {
  const neutrals = (theme.highContrast ? HIGH_CONTRAST_NEUTRALS : NEUTRALS)[scheme];
  const brand = theme[scheme];
  return {
    primary: { main: brand.primary },
    secondary: { main: brand.secondary },
    success: { main: STATUS[scheme].success },
    warning: { main: STATUS[scheme].warning },
    error: { main: STATUS[scheme].error },
    info: { main: STATUS[scheme].info },
    background: neutrals.background,
    text: neutrals.text,
    divider: neutrals.divider,
    // Extra tokens, used as theme.vars.palette.surface.subtle and so on.
    surface: { subtle: neutrals.subtle },
    chart: { single: brand.primary, series: SERIES[scheme], grid: neutrals.divider },
  };
}
