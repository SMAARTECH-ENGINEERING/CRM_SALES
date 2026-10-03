import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlineOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

// Something could not be loaded. Says so in plain words - the API's own
// message when there is one, never a stack trace - and offers to try again.
//   inline (default) - a bar above the content it belongs to
//   block            - in place of the content
export default function ErrorState({ error, title, description, onRetry, variant = 'inline' }) {
  const { t } = useTranslation();
  const message = description ?? error?.message ?? t('states.errorDescription');
  const retry = onRetry && (
    <Button color="inherit" size="small" onClick={() => onRetry()}>
      {t('actions.retry')}
    </Button>
  );

  if (variant === 'inline') {
    return (
      <Alert severity="error" action={retry}>
        {message}
      </Alert>
    );
  }
  return (
    <Stack role="alert" spacing={1} sx={{ alignItems: 'center', textAlign: 'center', py: 6, px: 2 }}>
      <Box sx={{ width: 56, height: 56, borderRadius: '50%', bgcolor: 'surface.subtle', display: 'grid', placeItems: 'center', color: 'error.main' }}>
        <ErrorOutlineIcon />
      </Box>
      <Typography variant="h6" component="p">
        {title ?? t('states.errorTitle')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
        {message}
      </Typography>
      {onRetry && (
        <Button variant="outlined" onClick={() => onRetry()} sx={{ mt: 1 }}>
          {t('actions.retry')}
        </Button>
      )}
    </Stack>
  );
}
