import { yupResolver } from '@hookform/resolvers/yup';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { Controller, useForm } from 'react-hook-form';
import * as yup from 'yup';
import useNotify from '../../hooks/useNotify.js';
import { useRoleActions, useRoleMutations } from '../../hooks/useRoles.js';
import { applyApiErrors } from '../../utils/validation.js';
import { USER_STATUS_OPTIONS } from '../users/UserStatusChip.jsx';

const schema = yup.object({
  name: yup.string().trim().required('Name is required').min(2, 'Must be at least 2 characters').max(100),
  description: yup.string().trim().max(500),
  status: yup.string().required(),
});

// Create when `role` is absent, edit otherwise. Permissions are edited on the
// role's page, not here. Mount it only while open.
export default function RoleFormDialog({ role, onClose, onCreated }) {
  const isCreate = !role;
  const notify = useNotify();
  const actionsFor = useRoleActions();
  const { create, update } = useRoleMutations();
  const canChangeStatus = isCreate || actionsFor(role).changeStatus;

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      name: role?.name ?? '',
      description: role?.description ?? '',
      status: role?.status ?? 'active',
    },
  });

  async function onSubmit(values) {
    const data = { name: values.name, description: values.description };
    if (canChangeStatus) data.status = values.status;

    try {
      if (isCreate) {
        const response = await create.mutateAsync(data);
        notify.success('Role created');
        onClose();
        onCreated?.(response.data.role);
      } else {
        await update.mutateAsync({ id: role.id, data });
        notify.success('Role updated');
        onClose();
      }
    } catch (error) {
      applyApiErrors(error, setError, ['name', 'description', 'status']);
    }
  }

  return (
    <Dialog open onClose={isSubmitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>{isCreate ? 'New role' : 'Edit role'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {errors.root && <Alert severity="error">{errors.root.message}</Alert>}
            <TextField
              label="Name"
              required
              autoFocus
              error={Boolean(errors.name)}
              helperText={errors.name?.message}
              {...register('name')}
            />
            <TextField
              label="Description"
              multiline
              minRows={2}
              error={Boolean(errors.description)}
              helperText={errors.description?.message}
              {...register('description')}
            />
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <TextField
                  select
                  label="Status"
                  disabled={!canChangeStatus}
                  helperText={
                    !canChangeStatus && role?.isSystem
                      ? 'System roles are always active'
                      : 'An inactive role grants no permissions and cannot be assigned'
                  }
                  {...field}
                >
                  {USER_STATUS_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting}>
            {isCreate ? 'Create role' : 'Save changes'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
