import { yupResolver } from '@hookform/resolvers/yup';
import AddIcon from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import * as yup from 'yup';
import { useCreateMasterData, useMasterData } from '../../hooks/useMasterData.js';
import useNotify from '../../hooks/useNotify.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import { applyApiErrors } from '../../utils/validation.js';
import PermissionGate from '../PermissionGate.jsx';

const schema = yup.object({
  name: yup.string().trim().required('Name is required').min(2, 'Must be at least 2 characters').max(100),
});

function AddEntryDialog({ resource, label, onClose, onCreated }) {
  const notify = useNotify();
  const create = useCreateMasterData(resource);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: yupResolver(schema), defaultValues: { name: '' } });

  async function onSubmit(values, event) {
    // This dialog sits inside the company form: do not submit that one too.
    event?.stopPropagation();
    try {
      const response = await create.mutateAsync({ name: values.name });
      notify.success(`${response.data.item.name} added`);
      onCreated(response.data.item);
      onClose();
    } catch (error) {
      applyApiErrors(error, setError, ['name']);
    }
  }

  return (
    <Dialog open onClose={isSubmitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <form
        noValidate
        onSubmit={(event) => {
          event.stopPropagation();
          handleSubmit(onSubmit)(event);
        }}
      >
        <DialogTitle>Add {label.toLowerCase()}</DialogTitle>
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
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting}>
            Add
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

// A dropdown fed by one of the master-data lists, for use inside a
// react-hook-form form. Users with the permission also get a button to add an
// entry without leaving the form.
//  - `current`: the record's present value ({ id, name }), kept selectable even
//    if it has since been deactivated and is no longer in the list.
export default function MasterDataSelect({ control, name, label, resource, current, error }) {
  const { data, isPending, error: loadError } = useMasterData(resource);
  const [adding, setAdding] = useState(false);

  const options = data ?? [];
  const withCurrent = current && !options.some((o) => o.id === current.id) ? [current, ...options] : options;

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'flex-start' }}>
          <TextField
            select
            label={label}
            error={Boolean(error || loadError)}
            helperText={error?.message ?? loadError?.message}
            slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            {...field}
            // Until the list arrives there may be no option matching the value.
            value={isPending && !current ? '' : field.value}
          >
            <MenuItem value="">None</MenuItem>
            {withCurrent.map((option) => (
              <MenuItem key={option.id} value={option.id}>
                {option.name}
              </MenuItem>
            ))}
          </TextField>

          <PermissionGate permission={PERMISSIONS.COMPANIES_MANAGE_LOOKUPS}>
            <Tooltip title={`Add ${label.toLowerCase()}`}>
              <IconButton aria-label={`Add ${label.toLowerCase()}`} onClick={() => setAdding(true)}>
                <AddIcon />
              </IconButton>
            </Tooltip>
            {adding && (
              <AddEntryDialog
                resource={resource}
                label={label}
                onClose={() => setAdding(false)}
                onCreated={(item) => field.onChange(item.id)}
              />
            )}
          </PermissionGate>
        </Stack>
      )}
    />
  );
}
