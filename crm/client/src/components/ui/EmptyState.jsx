import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import SearchOffOutlinedIcon from '@mui/icons-material/SearchOffOutlined';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

// Shown instead of a blank area. Two cases, with their own words:
//   nothing exists yet          -> say so, and offer to create (`action`)
//   a search / filter found none -> `filtered`: suggest changing it
export default function EmptyState({ filtered = false, title, description, action, icon: Icon, dense = false }) {
  const { t } = useTranslation();
  const Glyph = Icon ?? (filtered ? SearchOffOutlinedIcon : InboxOutlinedIcon);
  return (
    <Stack spacing={1} sx={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', height: '100%', py: dense ? 3 : 6, px: 2 }}>
      <Box sx={{ width: 56, height: 56, borderRadius: '50%', bgcolor: 'surface.subtle', display: 'grid', placeItems: 'center', color: 'text.secondary' }}>
        <Glyph />
      </Box>
      <Typography variant="h6" component="p">
        {title ?? t(filtered ? 'states.noResultsTitle' : 'states.emptyTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
        {description ?? t(filtered ? 'states.noResultsDescription' : 'states.emptyDescription')}
      </Typography>
      {action && <Box sx={{ pt: 1 }}>{action}</Box>}
    </Stack>
  );
}
