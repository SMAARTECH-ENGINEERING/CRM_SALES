import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import MenuOpenIcon from '@mui/icons-material/MenuOpen';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { LAYOUT } from '../../theme/spacing.js';
import env from '../../utils/env.js';
import NotificationBell from '../notifications/NotificationBell.jsx';
import GlobalSearch from '../search/GlobalSearch.jsx';
import LanguageSelector from './LanguageSelector.jsx';
import QuickCreate from './QuickCreate.jsx';
import ThemeSelector from './ThemeSelector.jsx';
import UserMenu from './UserMenu.jsx';

// The top bar: sidebar toggle and brand on the left, search in the middle,
// then create, notifications, help, language, theme and the account.
// On small screens help, language and theme move into the account's
// Preferences, and Create becomes a floating button (see AppShell).
export default function Topbar({ company, sidebarCollapsed, onToggleSidebar, onOpenMobileNav, onShortcuts, createAnchor, onCreateOpen, onCreateClose }) {
  const { t } = useTranslation();
  const name = company?.name || env.appName;
  const wide = { display: { xs: 'none', md: 'inline-flex' } };

  return (
    <AppBar position="fixed" sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar variant="dense" sx={{ gap: { xs: 0.5, sm: 1 }, minHeight: LAYOUT.topbarHeight, px: { xs: 1, sm: 2 } }}>
        {/* Small screens: opens the navigation as a drawer. */}
        <IconButton edge="start" aria-label={t('sidebar.open')} onClick={onOpenMobileNav} sx={{ display: { md: 'none' } }}>
          <MenuIcon />
        </IconButton>
        {/* Larger screens: collapses the sidebar to icons, or expands it. */}
        <Tooltip title={sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}>
          <IconButton
            edge="start"
            aria-label={sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')}
            aria-expanded={!sidebarCollapsed}
            aria-keyshortcuts="Control+\\"
            onClick={onToggleSidebar}
            sx={wide}
          >
            {sidebarCollapsed ? <MenuIcon /> : <MenuOpenIcon />}
          </IconButton>
        </Tooltip>

        <Link
          component={RouterLink}
          to="/"
          variant="h6"
          color="text.primary"
          underline="none"
          sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flexShrink: { xs: 1, md: 0 }, maxWidth: { xs: 44, sm: 200, lg: 280 }, mr: { md: 2 } }}
        >
          {company?.logo && <Box component="img" src={company.logo} alt="" sx={{ height: 28, maxWidth: 120, objectFit: 'contain' }} />}
          {/* The company's own name once it is set; the build-time name until then. */}
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: { xs: 'none', sm: 'block' } }}>
            {name}
          </Box>
        </Link>

        <GlobalSearch />
        <Box sx={{ flex: { xs: 0, md: 1 } }} />

        <QuickCreate anchor={createAnchor} onOpen={onCreateOpen} onClose={onCreateClose} sx={wide} />
        {/* Opens the real-time connection, so it is mounted exactly once. */}
        <NotificationBell />
        <Tooltip title={t('topbar.help')}>
          <IconButton color="inherit" aria-label={t('topbar.help')} aria-keyshortcuts="?" onClick={onShortcuts} sx={wide}>
            <HelpOutlineIcon />
          </IconButton>
        </Tooltip>
        <Box sx={wide}>
          <LanguageSelector />
        </Box>
        <Box sx={wide}>
          <ThemeSelector />
        </Box>
        <UserMenu onShortcuts={onShortcuts} />
      </Toolbar>
    </AppBar>
  );
}
