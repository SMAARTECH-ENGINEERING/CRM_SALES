// The UI component library: everything a page is built from. Pages import
// from here (or from the file itself); they do not restyle these or build
// their own versions.

// The shell
export { default as AppShell } from './AppShell.jsx';
export { default as Sidebar } from './Sidebar.jsx';
export { default as Topbar } from './Topbar.jsx';
export { default as UserMenu } from './UserMenu.jsx';
export { default as QuickCreate } from './QuickCreate.jsx';
export { default as ThemeSelector, AppearancePanel } from './ThemeSelector.jsx';
export { default as LanguageSelector } from './LanguageSelector.jsx';
export { default as ShortcutsDialog } from './ShortcutsDialog.jsx';
export { default as PreferencesDialog } from './PreferencesDialog.jsx';
// The search box is also the command palette.
export { default as GlobalSearch, default as CommandPalette, default as SearchBar } from '../search/GlobalSearch.jsx';
export { default as NotificationCenter } from '../notifications/NotificationBell.jsx';

// A page
export { default as PageHeader, PageBreadcrumbs as Breadcrumbs } from './PageHeader.jsx';
export { default as EmptyState } from './EmptyState.jsx';
export { default as ErrorState } from './ErrorState.jsx';
export { default as ErrorPage } from './ErrorPage.jsx';
export { default as LoadingState } from './LoadingState.jsx';

// Data
export { default as AdvancedDataTable } from './AdvancedDataTable.jsx';
export { default as FilterDrawer, FilterBar } from './FilterDrawer.jsx';
export { default as StatusChip, PriorityChip, toneOf } from './StatusChip.jsx';
export { default as StatCard } from '../dashboard/StatTile.jsx';
export { default as ChartCard } from '../dashboard/ChartCard.jsx';
export { default as ResizableWidget } from './ResizableWidget.jsx';
export { default as ActivityTimeline } from '../EventTimeline.jsx';

// Dialogs and drawers
export { default as ConfirmDialog } from '../ConfirmDialog.jsx';
export { default as EntityDrawer, FormDialog, QuickView } from './EntityDrawer.jsx';
