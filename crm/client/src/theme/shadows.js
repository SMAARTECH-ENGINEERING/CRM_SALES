// Elevation tokens. Flat by default: surfaces are separated by borders, and
// shadows are kept for things that float (menus, dialogs, drawers).

const layer = (y, blur, alpha) => `0 ${y}px ${blur}px rgba(16, 24, 40, ${alpha})`;

// MUI expects 25 entries (elevation 0-24).
export function shadowsFor() {
  const steps = [
    'none',
    layer(1, 2, 0.06),
    `${layer(1, 3, 0.08)}, ${layer(1, 2, 0.04)}`,
    `${layer(2, 6, 0.08)}, ${layer(1, 2, 0.04)}`,
    `${layer(4, 10, 0.09)}, ${layer(2, 4, 0.04)}`,
    `${layer(6, 14, 0.1)}, ${layer(2, 4, 0.05)}`,
    `${layer(8, 20, 0.11)}, ${layer(3, 6, 0.05)}`,
    `${layer(12, 28, 0.12)}, ${layer(4, 8, 0.05)}`,
    `${layer(16, 36, 0.14)}, ${layer(6, 12, 0.06)}`,
  ];
  const last = `${layer(24, 48, 0.18)}, ${layer(8, 16, 0.08)}`;
  return Array.from({ length: 25 }, (_, index) => steps[index] ?? last);
}
