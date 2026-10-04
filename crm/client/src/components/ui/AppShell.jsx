import Box from '@mui/material/Box';
import Drawer from '@mui/material/Drawer';
import Link from '@mui/material/Link';
import Toolbar from '@mui/material/Toolbar';
import { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router-dom';
import { usePreferences } from '../../context/PreferencesContext.jsx';
import { useApplySettings } from '../../hooks/useSettings.js';
import ErrorBoundary from '../ErrorBoundary.jsx';
import useShortcuts from '../../hooks/useShortcuts.js';
import { LAYOUT } from '../../theme/spacing.js';
import AutoBreadcrumbs from './AutoBreadcrumbs.jsx';
import LoadingState from './LoadingState.jsx';
import QuickCreate from './QuickCreate.jsx';
import ShortcutsDialog from './ShortcutsDialog.jsx';
import Sidebar from './Sidebar.jsx';
import SidebarResizer from './SidebarResizer.jsx';
import Topbar from './Topbar.jsx';

const MAIN_ID = 'main-content';

// The frame around every signed-in page: top bar, sidebar, content.
//
//  - Desktop: the sidebar is always there - expanded (and resizable by its
//    edge) or collapsed to icons. Width and state are the user's preferences.
//  - Small screens: the sidebar is a drawer opened from the top bar.
export default function AppShell() {
  const { t, i18n } = useTranslation();
  const { pathname } = useLocation();
  const { preferences, update } = usePreferences();
  // Name, logo, date format, time zone and currency come from the settings.
  const { settings, ready } = useApplySettings();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [createAnchor, setCreateAnchor] = useState(null);
  // While the edge is being dragged; the preference is saved on release.
  const [dragWidth, setDragWidth] = useState(null);

  const collapsed = preferences.sidebarCollapsed;
  const width = collapsed ? LAYOUT.sidebar.collapsed : (dragWidth ?? preferences.sidebarWidth);
  const toggleSidebar = () => update({ sidebarCollapsed: !collapsed });

  useShortcuts({
    help: () => setShortcutsOpen(true),
    sidebar: toggleSidebar,
    // Opens whichever Create button is on screen.
    create: () => {
      const button = [...document.querySelectorAll('[data-quick-create]')].find((element) => element.offsetParent !== null);
      if (button) setCreateAnchor(button);
    },
  });

  const create = { anchor: createAnchor, onOpen: setCreateAnchor, onClose: () => setCreateAnchor(null) };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: 'background.default' }}>
      <Link
        href={`#${MAIN_ID}`}
        sx={{ position: 'fixed', top: 8, left: 8, zIndex: (theme) => theme.zIndex.tooltip, px: 2, py: 1, borderRadius: 1, bgcolor: 'background.paper', boxShadow: 4, transform: 'translateY(-200%)', '&:focus': { transform: 'none' } }}
      >
        {t('app.skipToContent')}
      </Link>

      <Topbar
        company={settings?.company}
        sidebarCollapsed={collapsed}
        onToggleSidebar={toggleSidebar}
        onOpenMobileNav={() => setMobileOpen(true)}
        onShortcuts={() => setShortcutsOpen(true)}
        createAnchor={create.anchor}
        onCreateOpen={create.onOpen}
        onCreateClose={create.onClose}
      />

      {/* Small screens: slides in over the page. Not mounted while closed. */}
      <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} sx={{ display: { md: 'none' }, '& .MuiDrawer-paper': { width: LAYOUT.sidebar.default, maxWidth: '85vw' } }}>
        <Toolbar variant="dense" sx={{ minHeight: LAYOUT.topbarHeight }} />
        <Sidebar onNavigate={() => setMobileOpen(false)} />
      </Drawer>

      {/* Medium screens and up: always visible. */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          width,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width,
            boxSizing: 'border-box',
            overflow: 'visible',
            display: 'flex',
            flexDirection: 'column',
            // Follows the pointer exactly while dragging; eases when collapsing.
            transition: (theme) => (dragWidth === null ? theme.transitions.create('width', { duration: theme.transitions.duration.shorter }) : 'none'),
          },
        }}
      >
        <Toolbar variant="dense" sx={{ minHeight: LAYOUT.topbarHeight, flexShrink: 0 }} />
        <Sidebar collapsed={collapsed} />
        {!collapsed && (
          <SidebarResizer
            width={width}
            onChange={setDragWidth}
            onCommit={(final) => {
              setDragWidth(null);
              update({ sidebarWidth: final });
            }}
          />
        )}
      </Drawer>

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Toolbar variant="dense" sx={{ minHeight: LAYOUT.topbarHeight }} />
        <Box component="main" id={MAIN_ID} tabIndex={-1} sx={{ flex: 1, width: '100%', maxWidth: LAYOUT.contentMaxWidth, mx: 'auto', px: { xs: 1.5, sm: 2.5, lg: 3 }, py: { xs: 2, sm: 2.5 }, outline: 'none' }}>
          {/* Keeps the shell on screen while a lazily loaded page arrives. A new
              language redraws the page, so every date and number follows it. */}
          <AutoBreadcrumbs />
          {/* A page that fails shows the error in its own area - the menus keep
              working, and going to another page clears it. */}
          <ErrorBoundary key={pathname} fullHeight={false}>
            <Suspense fallback={<LoadingState />}>{ready ? <Outlet key={i18n.language} /> : <LoadingState />}</Suspense>
          </ErrorBoundary>
        </Box>
      </Box>

      {/* Small screens: Create floats above the page. */}
      <QuickCreate variant="fab" {...create} sx={{ display: { md: 'none' } }} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </Box>
  );
}
