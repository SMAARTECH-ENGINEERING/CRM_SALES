import { RADIUS } from './spacing.js';

// How every MUI component looks in this app. Pages do not restyle components;
// what should look the same everywhere is decided here.
export function componentOverrides({ highContrast = false } = {}) {
  const focusRing = (theme) => ({ outline: `2px solid ${theme.vars.palette.primary.main}`, outlineOffset: 2 });
  const border = (theme) => `${highContrast ? 2 : 1}px solid ${theme.vars.palette.divider}`;

  return {
    MuiCssBaseline: {
      styleOverrides: (theme) => ({
        body: { fontSize: theme.typography.body1.fontSize },
        // Keyboard focus is always visible.
        'a:focus-visible': focusRing(theme),
        // Motion is decoration: none of it for people who asked for less.
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': { animationDuration: '0.01ms !important', animationIterationCount: '1 !important', transitionDuration: '0.01ms !important', scrollBehavior: 'auto !important' },
        },
      }),
    },
    MuiTypography: { defaultProps: { variantMapping: { display: 'h1', bodyLarge: 'p', table: 'span' } } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: ({ theme }) => ({ borderRadius: RADIUS.md, '&:focus-visible': focusRing(theme) }) },
    },
    MuiIconButton: { styleOverrides: { root: ({ theme }) => ({ '&:focus-visible': focusRing(theme) }) } },
    MuiTextField: { defaultProps: { size: 'small', fullWidth: true } },
    MuiFormControl: { defaultProps: { size: 'small' } },
    MuiCard: { defaultProps: { variant: 'outlined' } },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: ({ theme }) => ({ border: border(theme) }),
      },
    },
    MuiAppBar: { defaultProps: { elevation: 0, color: 'default' } },
    MuiTooltip: {
      defaultProps: { arrow: true, enterDelay: 400 },
      styleOverrides: { tooltip: ({ theme }) => ({ fontSize: theme.typography.caption.fontSize }) },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
    MuiTab: { styleOverrides: { root: ({ theme }) => ({ textTransform: 'none', fontWeight: 600, minHeight: 44, fontSize: theme.typography.body1.fontSize }) } },
    MuiTabs: { styleOverrides: { root: { minHeight: 44 } } },
    MuiDialogTitle: { styleOverrides: { root: ({ theme }) => ({ ...theme.typography.h5 }) } },
    MuiListItemButton: {
      styleOverrides: { root: ({ theme }) => ({ borderRadius: RADIUS.md, '&:focus-visible': { ...focusRing(theme), outlineOffset: -2 } }) },
    },
    MuiMenuItem: { styleOverrides: { root: ({ theme }) => ({ fontSize: theme.typography.body1.fontSize }) } },
    MuiTableCell: {
      styleOverrides: {
        root: ({ theme }) => ({ fontSize: theme.typography.table.fontSize, borderBottom: border(theme) }),
        head: ({ theme }) => ({ fontWeight: 600, color: theme.vars.palette.text.secondary, backgroundColor: theme.vars.palette.surface.subtle }),
      },
    },
    MuiDataGrid: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontSize: theme.typography.table.fontSize,
          borderColor: theme.vars.palette.divider,
          backgroundColor: theme.vars.palette.background.paper,
          '--DataGrid-t-header-background-base': theme.vars.palette.surface.subtle,
          '--DataGrid-t-color-border-base': theme.vars.palette.divider,
          '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 600, color: theme.vars.palette.text.secondary },
          '& .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus-within': { outlineOffset: -2 },
          '& .MuiDataGrid-row:hover': { backgroundColor: theme.vars.palette.action.hover },
        }),
      },
    },
    MuiAlert: { styleOverrides: { root: { alignItems: 'center' } } },
    MuiBreadcrumbs: { styleOverrides: { root: ({ theme }) => ({ fontSize: theme.typography.body2.fontSize }) } },
    MuiLink: { defaultProps: { underline: 'hover' } },
    MuiDrawer: { styleOverrides: { paper: ({ theme }) => ({ borderColor: theme.vars.palette.divider }) } },
  };
}
