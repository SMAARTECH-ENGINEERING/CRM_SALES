import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { changePassword } from '../../api/auth.api.js';
import useNotify from '../../hooks/useNotify.js';
import tokenStorage from '../../utils/tokenStorage.js';

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

// The signed-in user changes their own password. The API issues new tokens
// and revokes the old ones, so this window stays signed in and others do not.
export default function ChangePasswordDialog({ open, onClose }) {
  const { t } = useTranslation();
  const notify = useNotify();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: EMPTY });

  function close() {
    reset(EMPTY);
    onClose();
  }

  async function onSubmit({ currentPassword, newPassword }) {
    try {
      const response = await changePassword({ currentPassword, newPassword });
      const { accessToken, refreshToken } = response.data ?? {};
      if (accessToken && refreshToken) tokenStorage.setTokens({ accessToken, refreshToken });
      notify.success(t('password.changed'));
      close();
    } catch (error) {
      // The API's own words, next to the field where it names one.
      const fieldErrors = (error.errors ?? []).filter((e) => e.field in EMPTY);
      fieldErrors.forEach((e) => setError(e.field, { message: e.message }));
      if (!fieldErrors.length) setError('root', { message: error.message });
    }
  }

  const required = { required: t('password.required') };
  const field = (name, label, autoComplete, rules = required) => (
    <TextField
      label={label}
      type="password"
      autoComplete={autoComplete}
      error={Boolean(errors[name])}
      helperText={errors[name]?.message}
      {...register(name, rules)}
    />
  );

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : close} maxWidth="xs" fullWidth aria-labelledby="change-password-title">
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle id="change-password-title">{t('password.title')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {errors.root && <Alert severity="error">{errors.root.message}</Alert>}
            {field('currentPassword', t('password.current'), 'current-password')}
            {field('newPassword', t('password.new'), 'new-password')}
            {field('confirmPassword', t('password.confirm'), 'new-password', {
              ...required,
              validate: (value) => value === getValues('newPassword') || t('password.mismatch'),
            })}
            <Typography variant="caption" color="text.secondary">
              {t('password.hint')}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={close} disabled={isSubmitting}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting}>
            {t('actions.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
