import KeyboardOutlinedIcon from '@mui/icons-material/KeyboardOutlined';
import LockResetOutlinedIcon from '@mui/icons-material/LockResetOutlined';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useAuth from '../../hooks/useAuth.js';
import usePermission from '../../hooks/usePermission.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import ChangePasswordDialog from './ChangePasswordDialog.jsx';
import PreferencesDialog from './PreferencesDialog.jsx';

const initials = (name) =>
  (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('');

// The account button in the top bar: a card with the signed-in user's name,
// designation and role, then their own actions - profile, preferences,
// keyboard shortcuts, change password, sign out.
export default function UserMenu({ onShortcuts }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { can } = usePermission();
  const [anchor, setAnchor] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [signingOut, setSigningOut] = useState(false);

  const close = () => setAnchor(null);
  const run = (action) => () => {
    close();
    action();
  };

  async function handleLogout() {
    setSigningOut(true);
    await logout();
  }

  const name = user?.fullName || t('topbar.accountFallback');
  const label = user?.fullName ? t('topbar.account', { name: user.fullName }) : t('topbar.accountFallback');
  const avatar = (size) => (
    <Avatar src={user?.profileImage || undefined} alt="" sx={{ width: size, height: size, fontSize: size / 2.4, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
      {initials(user?.fullName)}
    </Avatar>
  );
  const item = (Icon, text, onClick, props) => (
    <MenuItem onClick={onClick} {...props}>
      <ListItemIcon>
        <Icon fontSize="small" />
      </ListItemIcon>
      <ListItemText>{text}</ListItemText>
    </MenuItem>
  );

  return (
    <>
      <Tooltip title={name}>
        <IconButton aria-label={label} aria-haspopup="menu" onClick={(event) => setAnchor(event.currentTarget)} sx={{ p: 0.5 }}>
          {avatar(32)}
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { width: 280, maxWidth: 'calc(100vw - 32px)', mt: 1 } }, list: { 'aria-label': t('topbar.accountFallback') } }}
      >
        {/* Who is signed in. Not an action, so not a menu item. */}
        <Stack component="li" role="presentation" direction="row" spacing={1.5} sx={{ px: 2, py: 1.5, alignItems: 'center' }}>
          {avatar(44)}
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle1" noWrap>
              {name}
            </Typography>
            {user?.designation && (
              <Typography variant="body2" color="text.secondary" noWrap>
                {user.designation}
              </Typography>
            )}
            {user?.role?.name && (
              <Typography variant="caption" color="text.secondary" noWrap component="div">
                {user.role.name}
              </Typography>
            )}
          </Box>
        </Stack>
        <Divider component="li" sx={{ mb: 1 }} />
        {user?.id && can(PERMISSIONS.USERS_READ) && item(PersonOutlineIcon, t('userMenu.profile'), run(() => navigate(`/users/${user.id}`)))}
        {item(TuneOutlinedIcon, t('userMenu.preferences'), run(() => setDialog('preferences')))}
        {onShortcuts && item(KeyboardOutlinedIcon, t('userMenu.shortcuts'), run(onShortcuts))}
        {item(LockResetOutlinedIcon, t('userMenu.changePassword'), run(() => setDialog('password')))}
        <Divider component="li" />
        <MenuItem onClick={handleLogout} disabled={signingOut}>
          <ListItemIcon>{signingOut ? <CircularProgress size={18} /> : <LogoutIcon fontSize="small" />}</ListItemIcon>
          <ListItemText>{t('actions.signOut')}</ListItemText>
        </MenuItem>
      </Menu>

      <PreferencesDialog open={dialog === 'preferences'} onClose={() => setDialog(null)} />
      <ChangePasswordDialog open={dialog === 'password'} onClose={() => setDialog(null)} />
    </>
  );
}
