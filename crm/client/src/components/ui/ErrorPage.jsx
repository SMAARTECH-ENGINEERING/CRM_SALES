import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import TravelExploreOutlinedIcon from '@mui/icons-material/TravelExploreOutlined';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

const ICONS = { 401: LockOutlinedIcon, 403: BlockOutlinedIcon, 404: TravelExploreOutlinedIcon, 500: ReportProblemOutlinedIcon };

// A whole-page message for 401, 403, 404 and 500: what happened, in plain
// words, and the ways out. It does not need the router (the error boundary
// shows it when the app itself has failed), so the buttons are plain links.
//   onRetry: shown as "Retry" (500);  fullHeight: when it is the whole window
export default function ErrorPage({ status = 404, description, onRetry, fullHeight = false }) {
  const { t } = useTranslation();
  const code = ICONS[status] ? status : 500;
  const Icon = ICONS[code];

  return (
    <Stack role="alert" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: fullHeight ? '100vh' : '60vh', p: 3 }}>
      <Box sx={{ width: 88, height: 88, borderRadius: '50%', bgcolor: 'surface.subtle', border: '1px solid', borderColor: 'divider', display: 'grid', placeItems: 'center', color: code === 404 ? 'text.secondary' : 'error.main' }}>
        <Icon sx={{ fontSize: 40 }} />
      </Box>
      <Typography variant="overline" color="text.secondary">
        {code}
      </Typography>
      <Typography variant="h3" component="h1">
        {t(`errors.${code}.title`)}
      </Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 460 }}>
        {description ?? t(`errors.${code}.description`)}
      </Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ pt: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
        {onRetry && (
          <Button variant="contained" onClick={onRetry}>
            {t('actions.retry')}
          </Button>
        )}
        {code === 401 ? (
          <Button variant="contained" href="/login">
            {t('actions.signIn')}
          </Button>
        ) : (
          <>
            <Button variant={onRetry ? 'outlined' : 'contained'} href="/">
              {t('actions.goToDashboard')}
            </Button>
            <Button variant="outlined" color="inherit" onClick={() => window.history.back()}>
              {t('actions.goBack')}
            </Button>
          </>
        )}
      </Stack>
    </Stack>
  );
}
