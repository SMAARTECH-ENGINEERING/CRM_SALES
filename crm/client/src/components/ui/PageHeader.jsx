import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

// "Dashboard / Companies / Acme": where this page is. `items` are
// { label, to }; the last one is the page itself and is not a link. The
// dashboard is always the first step.
export function PageBreadcrumbs({ items = [] }) {
  const { t } = useTranslation();
  const trail = [{ label: t('nav.dashboard'), to: '/' }, ...items];
  return (
    <Breadcrumbs aria-label="Breadcrumb" separator={<NavigateNextIcon sx={{ fontSize: 16 }} />} sx={{ mb: 0.5 }}>
      {trail.map((item, index) =>
        index === trail.length - 1 || !item.to ? (
          <Typography key={index} variant="body2" color="text.primary" aria-current={index === trail.length - 1 ? 'page' : undefined} noWrap sx={{ maxWidth: 280 }}>
            {item.label}
          </Typography>
        ) : (
          <Link key={index} component={RouterLink} to={item.to} color="text.secondary" variant="body2">
            {item.label}
          </Link>
        )
      )}
    </Breadcrumbs>
  );
}

// The top of every page: where you are (breadcrumbs), what you are looking at
// (title, subtitle, and `meta` such as a status chip), and what you can do
// (`actions`, on the right - the primary one last).
//   back: true goes one step back in history; a path goes there.
export default function PageHeader({ title, subtitle, breadcrumbs, actions, back, meta, children }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Box component="header" sx={{ mb: 0.5 }}>
      {breadcrumbs && <PageBreadcrumbs items={breadcrumbs} />}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.5, sm: 2 }} sx={{ alignItems: { sm: 'flex-start' }, justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
          {back && (
            <Tooltip title={t('actions.back')}>
              <IconButton size="small" aria-label={t('actions.back')} onClick={() => (back === true ? navigate(-1) : navigate(back))} sx={{ mt: 0.25 }}>
                <ArrowBackIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Typography variant="h4" component="h1" sx={{ overflowWrap: 'anywhere' }}>
                {title}
              </Typography>
              {meta}
            </Stack>
            {subtitle && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                {subtitle}
              </Typography>
            )}
          </Box>
        </Stack>
        {actions && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
            {actions}
          </Stack>
        )}
      </Stack>
      {children}
    </Box>
  );
}
