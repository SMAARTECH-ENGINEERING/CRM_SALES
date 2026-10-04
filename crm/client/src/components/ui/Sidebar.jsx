import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import useNavigation from '../../hooks/useNavigation.js';

const OPEN_GROUPS_KEY = 'crm.sidebar.groups';

// Which groups the user opened or closed, kept in this browser.
function readChoices() {
  try {
    const value = JSON.parse(localStorage.getItem(OPEN_GROUPS_KEY) ?? '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

const isUnder = (pathname, item) => (item.to === '/' || item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`));

// The navigation list: groups of entries the user may see (see
// layouts/navigation.js). Each group is a drop-down: its heading opens and
// closes it. The group of the page being viewed is open; a group the user
// opened or closed stays that way. Collapsed (the narrow sidebar), it shows
// icons only, each with a tooltip, and every group is shown.
export default function Sidebar({ collapsed = false, onNavigate }) {
  const { t } = useTranslation();
  const { groups } = useNavigation();
  const { pathname } = useLocation();
  const [choices, setChoices] = useState(readChoices);

  const isOpen = (group) => choices[group.id] ?? group.items.some((item) => isUnder(pathname, item));
  function toggle(group) {
    const next = { ...choices, [group.id]: !isOpen(group) };
    setChoices(next);
    try {
      localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next));
    } catch {
      // Still applies until the page is closed.
    }
  }

  return (
    <Box component="nav" aria-label={t('nav.main')} sx={{ px: 1, py: 1, overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
      {groups.map((group, index) => (
        <Box key={group.id} sx={{ mb: 0.5 }}>
          {group.labelKey &&
            (collapsed ? (
              index > 0 && <Divider sx={{ my: 1 }} />
            ) : (
              <Typography variant="overline" component="h2" sx={{ display: 'block', m: 0, mt: 0.5 }}>
                <ButtonBase
                  aria-expanded={isOpen(group)}
                  aria-controls={`nav-group-${group.id}`}
                  onClick={() => toggle(group)}
                  sx={{
                    width: '100%',
                    justifyContent: 'space-between',
                    px: 1.5,
                    py: 1,
                    borderRadius: 1,
                    font: 'inherit',
                    letterSpacing: 'inherit',
                    textTransform: 'inherit',
                    color: 'text.secondary',
                    '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                    '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
                  }}
                >
                  <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t(group.labelKey)}
                  </Box>
                  <ExpandMoreIcon
                    fontSize="small"
                    sx={{ transform: isOpen(group) ? 'rotate(180deg)' : 'none', transition: (theme) => theme.transitions.create('transform', { duration: theme.transitions.duration.shortest }) }}
                  />
                </ButtonBase>
              </Typography>
            ))}
          {/* A group without a heading (the dashboard) and the narrow sidebar are always shown. */}
          <Collapse in={collapsed || !group.labelKey || isOpen(group)} id={`nav-group-${group.id}`}>
          <List disablePadding aria-label={group.labelKey ? t(group.labelKey) : undefined}>
            {group.items.map(({ id, labelKey, to, icon: Icon, end }) => {
              const label = t(labelKey);
              return (
                <ListItem key={id} disablePadding sx={{ mb: 0.25 }}>
                  <Tooltip title={collapsed ? label : ''} placement="right">
                    <ListItemButton
                      component={NavLink}
                      to={to}
                      end={end}
                      onClick={onNavigate}
                      aria-label={collapsed ? label : undefined}
                      sx={{
                        minHeight: 38,
                        py: 0.5,
                        px: collapsed ? 0 : 1.5,
                        justifyContent: collapsed ? 'center' : 'flex-start',
                        color: 'text.secondary',
                        '&.active': {
                          bgcolor: 'action.selected',
                          color: 'primary.main',
                          fontWeight: 600,
                          '& .MuiListItemIcon-root': { color: 'primary.main' },
                          '& .MuiListItemText-primary': { fontWeight: 600 },
                        },
                      }}
                    >
                      <ListItemIcon sx={{ minWidth: collapsed ? 0 : 34, color: 'inherit', justifyContent: 'center' }}>
                        <Icon fontSize="small" />
                      </ListItemIcon>
                      {!collapsed && <ListItemText primary={label} slotProps={{ primary: { noWrap: true, variant: 'body1' } }} />}
                    </ListItemButton>
                  </Tooltip>
                </ListItem>
              );
            })}
          </List>
          </Collapse>
        </Box>
      ))}
    </Box>
  );
}
