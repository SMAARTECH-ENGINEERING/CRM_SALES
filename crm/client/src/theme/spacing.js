// Layout tokens: spacing, radius, sizes of the shell, layers, motion.

// theme.spacing(1) = 8px. Components space themselves in these units.
export const SPACING_UNIT = 8;

export const RADIUS = { sm: 4, md: 8, lg: 12, pill: 999 };

export const BREAKPOINTS = { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1536 };

// The application shell.
export const LAYOUT = {
  topbarHeight: 56,
  sidebar: { min: 220, default: 280, max: 420, collapsed: 64 },
  // Where a drag of the sidebar edge lands when the keyboard is used instead.
  sidebarStep: 20,
  contentMaxWidth: 1920,
  drawerWidth: 420,
  filterDrawerWidth: 360,
};

export const clampSidebarWidth = (width) => Math.min(LAYOUT.sidebar.max, Math.max(LAYOUT.sidebar.min, Math.round(Number(width) || LAYOUT.sidebar.default)));

export const Z_INDEX = { mobileStepper: 1000, fab: 1050, speedDial: 1050, appBar: 1100, drawer: 1200, modal: 1300, snackbar: 1400, tooltip: 1500 };

export const TRANSITIONS = {
  duration: { shortest: 120, shorter: 160, short: 200, standard: 220, complex: 300, enteringScreen: 200, leavingScreen: 160 },
};

// Table density: what the user chooses, and what it means for a DataGrid.
export const DEFAULT_TABLE_DENSITY = 'standard';
export const TABLE_DENSITIES = [
  { id: 'compact', nameKey: 'density.compact' },
  { id: 'standard', nameKey: 'density.standard' },
  { id: 'comfortable', nameKey: 'density.comfortable' },
];
