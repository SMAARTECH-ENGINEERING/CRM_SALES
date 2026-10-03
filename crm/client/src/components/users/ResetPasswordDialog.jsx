import { yupResolver } from '@hookform/resolvers/yup';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import useNotify from '../../hooks/useNotify.js';
import { useUserMutations } from '../../hooks/useUsers.js';
import { applyApiErrors, strongPassword } from '../../utils/validation.js';

const schema = yup.object({
  newPassword: strongPassword,
  confirmPassword: yup
    .string()
    .required('Confirm the new password')
    .oneOf([yup.ref('newPassword')], 'Passwords do not match'),
});

export default function ResetPasswordDialog({ user, onClose }) {
  const notify = useNotify();
  const { resetPassword } = useUserMutations();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });

  async function onSubmit({ newPassword }) {
    try {
      await resetPassword.mutateAsync({ id: user.id, newPassword });
      notify.success(`Password reset for ${user.fullName}`);
      onClose();
    } catch (error) {
      applyApiErrors(error, setError, ['newPassword']);
    }
  }

  return (
    <Dialog open onClose={isSubmitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>Reset password</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <DialogContentText>
              Set a new password for {user.fullName}. They will be signed out everywhere and must
              use the new password to sign in.
            </DialogContentText>
            {errors.root && <Alert severity="error">{errors.root.message}</Alert>}
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              autoFocus
              error={Boolean(errors.newPassword)}
              helperText={
                errors.newPassword?.message ??
                '8+ characters with upper and lower case, a number and a symbol'
              }
              {...register('newPassword')}
            />
            <TextField
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              error={Boolean(errors.confirmPassword)}
              helperText={errors.confirmPassword?.message}
              {...register('confirmPassword')}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting}>
            Reset password
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
