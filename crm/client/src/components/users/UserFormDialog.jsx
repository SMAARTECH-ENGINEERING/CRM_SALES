import { yupResolver } from '@hookform/resolvers/yup';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import * as yup from 'yup';
import useAuth from '../../hooks/useAuth.js';
import { MASTER_DATA } from '../../api/masterData.api.js';
import { useDepartments, useRoleOptions } from '../../hooks/useLookups.js';
import { useMasterData } from '../../hooks/useMasterData.js';
import useNotify from '../../hooks/useNotify.js';
import usePermission from '../../hooks/usePermission.js';
import { useUserMutations } from '../../hooks/useUsers.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import { applyApiErrors, strongPassword } from '../../utils/validation.js';

const FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'password',
  'roleId',
  'departmentId',
  'organizationId',
  'designation',
  'profileImage',
];

function buildSchema(isCreate) {
  return yup.object({
    firstName: yup.string().trim().required('First name is required').max(50),
    lastName: yup.string().trim().required('Last name is required').max(50),
    email: yup.string().trim().required('Email is required').email('Enter a valid email address'),
    phone: yup
      .string()
      .trim()
      .matches(/^$|^\+?[0-9\s\-()]{7,20}$/, 'Enter a valid phone number'),
    password: isCreate ? strongPassword : yup.string().strip(),
    roleId: yup.string(),
    departmentId: yup.string(),
    organizationId: yup.string(),
    designation: yup.string().trim().max(100),
    profileImage: yup
      .string()
      .trim()
      .max(2048)
      .matches(/^$|^https?:\/\/\S+$/, 'Enter a valid http(s) URL'),
  });
}

// Create when `user` is absent, edit otherwise. Mount it only while open so the
// form always starts from fresh values.
export default function UserFormDialog({ user, onClose }) {
  const isCreate = !user;
  const { user: currentUser } = useAuth();
  const { can, covers } = usePermission();
  const notify = useNotify();
  const { create, update } = useUserMutations();
  const roles = useRoleOptions();
  const departments = useDepartments();
  const organizations = useMasterData(MASTER_DATA.ORGANIZATIONS);

  const isSelf = user?.id === currentUser?.id;
  const canAssignRole = can(PERMISSIONS.USERS_ASSIGN_ROLE) && !isSelf;

  // Only roles the signed-in user is allowed to hand out (the API enforces this too).
  const assignableRoles = useMemo(
    () => (roles.data ?? []).filter((role) => role.status === 'active' && covers(role)),
    [roles.data, covers]
  );

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(buildSchema(isCreate)),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      password: '',
      roleId: user?.roleId ?? '',
      departmentId: user?.departmentId ?? '',
      organizationId: user?.organizationId ?? '',
      designation: user?.designation ?? '',
      profileImage: user?.profileImage ?? '',
    },
  });

  async function onSubmit(values) {
    const { roleId, departmentId, organizationId, ...rest } = values;
    const data = { ...rest, departmentId: departmentId || null, organizationId: organizationId || null };
    // The role is sent only when the user may assign one and actually chose/changed it.
    if (canAssignRole && roleId && roleId !== user?.roleId) data.roleId = roleId;

    try {
      if (isCreate) {
        await create.mutateAsync(data);
        notify.success('User created');
      } else {
        await update.mutateAsync({ id: user.id, data });
        notify.success('User updated');
      }
      onClose();
    } catch (error) {
      applyApiErrors(error, setError, FIELDS);
    }
  }

  const text = (name, label, props = {}) => (
    <TextField
      label={label}
      error={Boolean(errors[name])}
      helperText={errors[name]?.message}
      {...register(name)}
      {...props}
    />
  );

  const select = (name, label, options, emptyLabel, props = {}) => (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <TextField
          select
          label={label}
          error={Boolean(errors[name])}
          helperText={errors[name]?.message}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          {...field}
          {...props}
        >
          <MenuItem value="">{emptyLabel}</MenuItem>
          {options.map((option) => (
            <MenuItem key={option.id} value={option.id}>
              {option.name}
            </MenuItem>
          ))}
        </TextField>
      )}
    />
  );

  // While the lists load, keep the user's current values selectable.
  const roleOptions = roles.data ? assignableRoles : user?.role ? [user.role] : [];
  const currentRoleMissing = user?.role && !roleOptions.some((r) => r.id === user.role.id);
  const departmentOptions = departments.data ?? (user?.department ? [user.department] : []);
  const organizationOptions = organizations.data ?? (user?.organization ? [user.organization] : []);

  return (
    <Dialog open onClose={isSubmitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>{isCreate ? 'New user' : 'Edit user'}</DialogTitle>
        <DialogContent>
          {errors.root && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {errors.root.message}
            </Alert>
          )}
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              pt: 1,
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            }}
          >
            {text('firstName', 'First name', { autoFocus: true, required: true })}
            {text('lastName', 'Last name', { required: true })}
            {text('email', 'Email', { type: 'email', required: true, autoComplete: 'off' })}
            {text('phone', 'Phone', { type: 'tel' })}
            {isCreate &&
              text('password', 'Password', {
                type: 'password',
                required: true,
                autoComplete: 'new-password',
                helperText:
                  errors.password?.message ??
                  '8+ characters with upper and lower case, a number and a symbol',
                sx: { gridColumn: '1 / -1' },
              })}
            {select(
              'roleId',
              'Role',
              currentRoleMissing ? [user.role, ...roleOptions] : roleOptions,
              isCreate ? 'Default role' : 'Unchanged',
              {
                disabled: !canAssignRole,
                helperText:
                  errors.roleId?.message ??
                  (isSelf
                    ? 'You cannot change your own role'
                    : !canAssignRole
                      ? 'You do not have permission to assign roles'
                      : undefined),
              }
            )}
            {select('departmentId', 'Department', departmentOptions, 'None')}
            {select('organizationId', 'Organization', organizationOptions, 'None', {
              helperText: errors.organizationId?.message ?? 'Their dashboard covers this organization (unless their role sees all)',
            })}
            {text('designation', 'Designation')}
            {text('profileImage', 'Profile image URL', { type: 'url' })}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting}>
            {isCreate ? 'Create user' : 'Save changes'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
