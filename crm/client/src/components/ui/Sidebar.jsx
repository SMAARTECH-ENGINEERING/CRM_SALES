import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import useNavigation from '../../hooks/useNavigation.js';

// The navigation list: groups of entries the user may see (see
// layouts/navigation.js). Collapsed, it shows icons only, each with a tooltip.
export default function Sidebar({ collapsed = false, onNavigate }) {
  const { t } = useTranslation();
  const { groups } = useNavigation();

  return (
    <Box component="nav" aria-label={t('nav.main')} sx={{ px: 1, py: 1, overflowY: 'auto', overflowX: 'hidden', flex: 1 }}>
      {groups.map((group, index) => (
        <Box key={group.id} sx={{ mb: 0.5 }}>
          {group.labelKey &&
            (collapsed ? (
              index > 0 && <Divider sx={{ my: 1 }} />
            ) : (
              <Typography variant="overline" component="h2" color="text.secondary" noWrap sx={{ display: 'block', px: 1.5, pt: 1.5, pb: 0.5 }}>
                {t(group.labelKey)}
              </Typography>
            ))}
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
        </Box>
      ))}
    </Box>
  );
}
