// Typography tokens: one family, one scale. Components use the variants
// (<Typography variant="h4">, theme.typography.table) - never a size of their own.

export const FONT_FAMILY = '"Inter", "Segoe UI", "Noto Sans", "Noto Sans Oriya", "Noto Sans Devanagari", "Nirmala UI", "Roboto", "Helvetica Neue", Arial, sans-serif';
export const FONT_FAMILY_MONO = '"JetBrains Mono", "Cascadia Mono", "Consolas", "Menlo", monospace';

export const DEFAULT_FONT_SIZE = 'medium';

// What the user chooses under "Text size". Every size in the app is multiplied
// by `scale` - the tokens change, the browser zoom does not.
export const FONT_SIZES = [
  { id: 'small', nameKey: 'fontSizes.small', scale: 0.93 },
  { id: 'medium', nameKey: 'fontSizes.medium', scale: 1 },
  { id: 'large', nameKey: 'fontSizes.large', scale: 1.1 },
  { id: 'xlarge', nameKey: 'fontSizes.xlarge', scale: 1.22 },
];

export const findFontSize = (id) => FONT_SIZES.find((size) => size.id === id) ?? FONT_SIZES.find((size) => size.id === DEFAULT_FONT_SIZE);

export const FONT_WEIGHTS = { regular: 400, medium: 500, semibold: 600, bold: 700 };

// [size in px at "medium", line height, weight, letter spacing]
const SCALE = {
  display: [36, 1.2, 700, '-0.02em'],
  h1: [28, 1.25, 700, '-0.015em'],
  h2: [24, 1.3, 700, '-0.01em'],
  h3: [20, 1.35, 600, '-0.005em'],
  // h4 is the page title.
  h4: [22, 1.3, 600, '-0.01em'],
  h5: [18, 1.4, 600, 0],
  h6: [16, 1.4, 600, 0],
  subtitle1: [15, 1.5, 600, 0],
  subtitle2: [14, 1.45, 600, 0],
  bodyLarge: [16, 1.55, 400, 0],
  // body1 is "Body Medium", body2 is "Body Small".
  body1: [14, 1.5, 400, 0],
  body2: [13, 1.5, 400, 0],
  caption: [12, 1.4, 400, '0.01em'],
  overline: [11, 1.6, 600, '0.08em'],
  button: [14, 1.5, 600, 0],
  table: [13, 1.45, 400, 0],
};

const ROOT_PX = 16;

export function typographyFor(fontSizeId) {
  const { scale } = findFontSize(fontSizeId);
  const rem = (px) => `${Math.round(((px * scale) / ROOT_PX) * 1000) / 1000}rem`;
  const variants = Object.fromEntries(
    Object.entries(SCALE).map(([name, [size, lineHeight, fontWeight, letterSpacing]]) => [name, { fontSize: rem(size), lineHeight, fontWeight, letterSpacing }])
  );
  return {
    fontFamily: FONT_FAMILY,
    fontFamilyMono: FONT_FAMILY_MONO,
    // MUI's own base, for the components that compute sizes from it.
    fontSize: 14 * scale,
    fontWeightRegular: FONT_WEIGHTS.regular,
    fontWeightMedium: FONT_WEIGHTS.medium,
    fontWeightBold: FONT_WEIGHTS.bold,
    scale,
    ...variants,
    overline: { ...variants.overline, textTransform: 'uppercase' },
    button: { ...variants.button, textTransform: 'none' },
  };
}
