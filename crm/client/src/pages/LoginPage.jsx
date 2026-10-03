import { yupResolver } from '@hookform/resolvers/yup';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import * as yup from 'yup';
import LoadingScreen from '../components/LoadingScreen.jsx';
import LanguageSelector from '../components/ui/LanguageSelector.jsx';
import ThemeSelector from '../components/ui/ThemeSelector.jsx';
import useAuth from '../hooks/useAuth.js';
import { useBranding } from '../hooks/useSettings.js';
import env from '../utils/env.js';

const POINTS = ['pipeline', 'service', 'insight'];

// The sign-in page: the company's own branding beside the form (above it on a
// phone). Name and logo come from the settings; language and theme can be
// chosen before signing in.
export default function LoginPage() {
  const { t } = useTranslation();
  const { login, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const branding = useBranding();
  const [showPassword, setShowPassword] = useState(false);

  // The messages are in the language now showing.
  const schema = useMemo(
    () =>
      yup.object({
        email: yup.string().trim().required(t('login.emailRequired')).email(t('login.emailInvalid')),
        password: yup.string().required(t('login.passwordRequired')),
      }),
    [t]
  );
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: yupResolver(schema), defaultValues: { email: '', password: '' } });

  if (isLoading) return <LoadingScreen />;

  // Already signed in (or just signed in): go back to where the user was headed.
  if (isAuthenticated) {
    const from = location.state?.from;
    const target = from ? `${from.pathname}${from.search ?? ''}` : '/';
    return <Navigate to={target} replace />;
  }

  async function onSubmit(values) {
    try {
      await login(values);
    } catch (error) {
      // Field-level messages from the API where available, otherwise a form-level one.
      const fieldErrors = (error.errors ?? []).filter((e) => e.field in values);
      fieldErrors.forEach((e) => setError(e.field, { message: e.message }));
      if (!fieldErrors.length) setError('root', { message: error.message });
    }
  }

  const name = branding?.company?.name || env.appName;
  const logo = branding?.branding?.loginLogo || branding?.company?.logo;

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 5fr) minmax(0, 6fr)' }, bgcolor: 'background.paper' }}>
      {/* Branding */}
      <Box
        component="aside"
        sx={{
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          px: { xs: 3, sm: 6, lg: 10 },
          py: { xs: 4, md: 6 },
        }}
      >
        <Stack spacing={{ xs: 1.5, md: 3 }} sx={{ maxWidth: 460 }}>
          {logo && <Box component="img" src={logo} alt="" sx={{ height: { xs: 40, md: 56 }, maxWidth: 220, objectFit: 'contain', objectPosition: 'left', alignSelf: 'flex-start', bgcolor: 'common.white', borderRadius: 1, p: 0.5 }} />}
          <Typography variant="h2" component="p" sx={{ overflowWrap: 'anywhere' }}>
            {name}
          </Typography>
          <Typography variant="bodyLarge" sx={{ opacity: 0.9 }}>
            {t('app.tagline')}
          </Typography>
          <Stack component="ul" spacing={1.25} sx={{ listStyle: 'none', p: 0, m: 0, display: { xs: 'none', md: 'flex' } }}>
            {POINTS.map((point) => (
              <Stack key={point} component="li" direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                <CheckCircleOutlineIcon fontSize="small" />
                <Typography variant="body1">{t(`login.points.${point}`)}</Typography>
              </Stack>
            ))}
          </Stack>
        </Stack>
      </Box>

      {/* The form */}
      <Box component="main" sx={{ display: 'flex', flexDirection: 'column', px: { xs: 3, sm: 6 }, py: 2 }}>
        <Stack direction="row" sx={{ justifyContent: 'flex-end' }}>
          <LanguageSelector />
          <ThemeSelector />
        </Stack>
        <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', py: 3 }}>
          <Stack component="form" spacing={2.5} noValidate onSubmit={handleSubmit(onSubmit)} sx={{ width: '100%', maxWidth: 380 }}>
            <div>
              <Typography variant="h2" component="h1">
                {t('login.title')}
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mt: 0.5 }}>
                {t('login.subtitle', { name })}
              </Typography>
            </div>

            {errors.root && <Alert severity="error">{errors.root.message}</Alert>}

            <TextField
              label={t('login.email')}
              type="email"
              autoComplete="email"
              autoFocus
              size="medium"
              error={Boolean(errors.email)}
              helperText={errors.email?.message}
              {...register('email')}
            />

            <TextField
              label={t('login.password')}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              size="medium"
              error={Boolean(errors.password)}
              helperText={errors.password?.message}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton edge="end" size="small" aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')} onClick={() => setShowPassword((shown) => !shown)}>
                        {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
              {...register('password')}
            />

            <Button type="submit" variant="contained" size="large" loading={isSubmitting}>
              {t('login.title')}
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
