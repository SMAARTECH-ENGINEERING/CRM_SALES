import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../i18n/index.js';
import { normalizePreferences } from '../context/PreferencesContext.jsx';
import { LAYOUT, clampSidebarWidth } from './spacing.js';
import { FONT_SIZES, THEMES, buildTheme, themeSwatch } from './themeManager.js';

const keysOf = (object, prefix = '') =>
  Object.entries(object).flatMap(([key, value]) => (value && typeof value === 'object' ? keysOf(value, `${prefix}${key}.`) : [`${prefix}${key}`]));

// WCAG relative luminance and contrast ratio of two #rrggbb colours.
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('themes', () => {
  it('every theme builds, with a light and a dark scheme and chart colours in both', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(THEMES.length);
    for (const { id } of THEMES) {
      const theme = buildTheme({ themeId: id });
      for (const scheme of ['light', 'dark']) {
        const { palette } = theme.colorSchemes[scheme];
        expect(palette.chart.single).toBe(palette.primary.main);
        expect(palette.chart.series).toHaveLength(8);
        expect(palette.surface.subtle).toBeTruthy();
      }
    }
  });

  it('text and the primary colour are readable on their surfaces in every theme and mode', () => {
    for (const { id } of THEMES) {
      for (const scheme of ['light', 'dark']) {
        const swatch = themeSwatch(id, scheme);
        expect(contrast(swatch.text, swatch.surface), `${id} ${scheme} text`).toBeGreaterThanOrEqual(7);
        // Links and outlined buttons are drawn in the primary colour.
        expect(contrast(swatch.primary, swatch.surface), `${id} ${scheme} primary`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('an unknown theme or size falls back to the default; the same choice is built once', () => {
    expect(buildTheme({ themeId: 'no-such-theme', fontSize: 'huge' })).toBe(buildTheme());
    expect(buildTheme({ themeId: 'emerald' })).toBe(buildTheme({ themeId: 'emerald' }));
    expect(buildTheme({ themeId: 'emerald' })).not.toBe(buildTheme());
  });

  it('text size changes every typography token, not the page zoom', () => {
    const rem = (theme, variant) => parseFloat(theme.typography[variant].fontSize);
    const sizes = FONT_SIZES.map(({ id }) => buildTheme({ fontSize: id }));
    for (const variant of ['h4', 'body1', 'body2', 'caption', 'button', 'table', 'display', 'bodyLarge', 'overline']) {
      const values = sizes.map((theme) => rem(theme, variant));
      expect(values, variant).toEqual([...values].sort((a, b) => a - b));
      expect(new Set(values).size, variant).toBe(FONT_SIZES.length);
    }
    expect(rem(buildTheme({ fontSize: 'medium' }), 'body1')).toBe(0.875);
  });
});

describe('preferences', () => {
  it('whatever was stored is reduced to values this version understands', () => {
    expect(normalizePreferences(null)).toEqual(normalizePreferences({}));
    const clean = normalizePreferences({ theme: 'nope', themeMode: 'sepia', language: 'xx', fontSize: 9, sidebarWidth: 9999, sidebarCollapsed: 'yes', tableDensity: 'tiny', dashboardLayout: [{ id: 'a' }, 'junk', { size: 3 }], tableColumns: [] });
    expect(clean).toEqual({ theme: null, themeMode: 'system', language: 'en', fontSize: 'medium', sidebarWidth: LAYOUT.sidebar.max, sidebarCollapsed: false, tableDensity: 'standard', dashboardLayout: [{ id: 'a' }], tableColumns: {} });
    expect(normalizePreferences({ theme: 'ocean', themeMode: 'dark', language: 'od', fontSize: 'xlarge', sidebarWidth: 300, sidebarCollapsed: true, tableDensity: 'compact' })).toMatchObject({ theme: 'ocean', themeMode: 'dark', language: 'od', fontSize: 'xlarge', sidebarWidth: 300, sidebarCollapsed: true, tableDensity: 'compact' });
  });

  it('the sidebar width stays within its limits', () => {
    expect(clampSidebarWidth(10)).toBe(LAYOUT.sidebar.min);
    expect(clampSidebarWidth(5000)).toBe(LAYOUT.sidebar.max);
    expect(clampSidebarWidth('abc')).toBe(LAYOUT.sidebar.default);
    expect(clampSidebarWidth(301.6)).toBe(302);
  });
});

describe('languages', () => {
  it('every language has exactly the keys English has, each with text', () => {
    const [english, ...others] = LANGUAGES;
    const expected = keysOf(english.resources).sort();
    expect(LANGUAGES.map((language) => language.id)).toEqual(['en', 'od', 'hi']);
    for (const language of others) {
      expect(keysOf(language.resources).sort(), language.id).toEqual(expected);
      for (const key of expected) {
        const text = key.split('.').reduce((node, part) => node[part], language.resources);
        expect(typeof text === 'string' && text.trim().length > 0, `${language.id}: ${key}`).toBe(true);
      }
    }
  });

  it('placeholders survive translation', () => {
    const [english, ...others] = LANGUAGES;
    const placeholders = (text) => (text.match(/\{\{\w+\}\}/g) ?? []).sort();
    for (const key of keysOf(english.resources)) {
      const read = (resources) => key.split('.').reduce((node, part) => node[part], resources);
      for (const language of others) expect(placeholders(read(language.resources)), `${language.id}: ${key}`).toEqual(placeholders(read(english.resources)));
    }
  });
});
