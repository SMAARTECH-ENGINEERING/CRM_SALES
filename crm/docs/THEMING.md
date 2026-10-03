# Theming

How the CRM looks is decided in one place: `client/src/theme/`. Pages and
components do not carry colours, font sizes or spacing of their own.

## Files

| File | What it holds |
| ---- | ------------- |
| `colors.js` | The colour themes (`THEMES`), the neutral surfaces, the status colours and the chart colours. **The only file where colours are written.** |
| `typography.js` | The font family, the type scale and the text sizes a user can choose. |
| `spacing.js` | The spacing unit, radii, breakpoints, the shell's sizes (top bar, sidebar limits), layers, motion and table densities. |
| `shadows.js` | The 25 elevation steps. |
| `componentOverrides.js` | How every MUI component looks: buttons, fields, tables, the data grid, dialogs, focus rings, reduced motion. |
| `themeManager.js` | `buildTheme({ themeId, fontSize })`: turns the tokens into an MUI theme. |
| `theme.js` | The default theme, for tests and anything rendered outside the app. |

## Colour themes

A theme is one entry in `THEMES`:

```js
{ id: 'emerald', nameKey: 'themes.emerald',
  light: { primary: '#07765a', secondary: '#4f6a61' },
  dark:  { primary: '#3dd6a3', secondary: '#9cbdb1' } }
```

Shipped: Professional Blue (default), Enterprise Indigo, Emerald, Ocean, Purple,
Slate, Warm and High Contrast.

**To add a theme:** add an entry to `THEMES`, and its name under `themes` in
each `client/src/i18n/locales/*/common.json`. Nothing else changes: the theme
picker, the preferences and the administrator's Branding setting all read the
list. `theme.test.js` then checks that the new theme builds and that its text
and primary colour are readable on its surfaces in both modes (contrast of at
least 7:1 and 4.5:1).

Surfaces, text, dividers and status colours are shared by all themes
(`NEUTRALS`, `STATUS`); a theme marked `highContrast` uses pure black and white
surfaces and heavier borders instead.

## Light, dark, system

Every theme has a light and a dark colour scheme. Which one shows is the user's
**mode**: Light, Dark, or System (follow the operating system). It is changed
from the palette button in the top bar, or under Preferences, and applies at
once. The scheme is switched by an attribute on `<html>`, so the user's choice
can differ from the operating system's.

In component code, use theme tokens so both schemes work:

```jsx
<Box sx={{ bgcolor: 'background.paper', color: 'text.secondary', borderColor: 'divider' }} />
<Box sx={{ bgcolor: 'surface.subtle' }} />   // the band behind table headers and toolbars
```

Never write a hex colour in a component.

## Text size

Users choose Small, Medium, Large or Extra large. This is **not** browser zoom:
`typographyFor(size)` multiplies every typography token by the size's scale, so
headings, body text, tables, buttons and captions all change together and the
layout stays intact.

The variants: `display`, `h1`–`h6` (`h4` is the page title), `subtitle1/2`,
`bodyLarge`, `body1` (body medium), `body2` (body small), `caption`,
`overline`, `button`, `table`. Use them through `<Typography variant="…">` or
`typography: 'caption'` in `sx` - never a font size.

## Charts

Charts take their colours from the theme (`palette.chart`), through
`useChartColors()` in `components/dashboard/DashboardBarChart.jsx`:

- `single` - a chart with one series uses the theme's primary colour, so it
  changes with the theme and the mode.
- `series` - parts of a whole (a donut) use a fixed, colour-blind-safe order of
  eight colours, stepped separately for dark surfaces. Past seven slices the
  rest are grouped as "Other".

## Who decides the theme

1. The user's own choice (Preferences), if they made one.
2. Otherwise the theme the administrator set under **Application settings →
   Branding**.
3. Otherwise the default.

The same Branding tab sets the logo on the sign-in page and the browser tab
icon. The company name and logo come from the Company tab. The sign-in page
gets these without a token from `GET /api/v1/settings/public`, which serves
nothing else.

## Accessibility built into the theme

- A visible focus ring on every button, link and list item.
- `prefers-reduced-motion` turns animations and transitions off.
- Status and priority are never colour alone: `StatusChip` and `PriorityChip`
  pair the colour with an icon and the text.
