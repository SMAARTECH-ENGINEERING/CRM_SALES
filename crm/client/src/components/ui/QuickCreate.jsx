import AddIcon from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Fab from '@mui/material/Fab';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useNavigation from '../../hooks/useNavigation.js';

// "+ Create": the records this user may create (see layouts/navigation.js).
// Not shown at all to someone who may create nothing. `variant`: the button in
// the top bar, or the floating button on small screens. The menu is opened by
// the parent (`anchor`), so the keyboard shortcut can open it too.
export default function QuickCreate({ variant = 'button', anchor, onOpen, onClose, sx }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { createItems } = useNavigation();
  if (!createItems.length) return null;

  const label = t('quickCreate.label');
  const props = { 'aria-label': label, 'aria-haspopup': 'menu', 'data-quick-create': variant, onClick: (event) => onOpen(event.currentTarget) };

  return (
    <>
      {variant === 'fab' ? (
        <Fab color="primary" size="medium" {...props} sx={{ position: 'fixed', right: 16, bottom: 16, ...sx }}>
          <AddIcon />
        </Fab>
      ) : (
        <Button variant="contained" size="small" startIcon={<AddIcon />} {...props} sx={{ flexShrink: 0, ...sx }}>
          {label}
        </Button>
      )}
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor) && anchor.dataset?.quickCreate === variant}
        onClose={onClose}
        anchorOrigin={{ vertical: variant === 'fab' ? 'top' : 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: variant === 'fab' ? 'bottom' : 'top', horizontal: 'right' }}
        slotProps={{ list: { 'aria-label': label } }}
      >
        {createItems.map(({ id, labelKey, to, icon: Icon }) => (
          <MenuItem
            key={id}
            onClick={() => {
              onClose();
              navigate(to);
            }}
          >
            <ListItemIcon>
              <Icon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t(labelKey)}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
