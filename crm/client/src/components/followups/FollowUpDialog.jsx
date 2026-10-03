import { yupResolver } from '@hookform/resolvers/yup';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { Controller, useForm } from 'react-hook-form';
import * as yup from 'yup';
import { useFollowUpMutations } from '../../hooks/useActivities.js';
import useNotify from '../../hooks/useNotify.js';
import { fromDateTimeInput, toDateTimeInput } from '../../utils/format.js';
import { applyApiErrors } from '../../utils/validation.js';
import { PRIORITY_OPTIONS } from '../activities/options.js';
import UserSelect from '../users/UserSelect.jsx';

const TITLES = { create: 'Add follow-up', edit: 'Edit follow-up', reschedule: 'Reschedule follow-up' };
const SUBMIT = { create: 'Add follow-up', edit: 'Save changes', reschedule: 'Reschedule' };
const DONE = { create: 'Follow-up added', edit: 'Follow-up updated', reschedule: 'Follow-up rescheduled' };

// Same rules as the API (server/src/validators/activity.validator.js).
function buildSchema(mode) {
  const dates = {
    dueDate: yup.string().required('Choose when it is due'),
    reminderDate: yup.string().test('before-due', 'The reminder cannot be after the due date', function beforeDue(value) {
      const due = this.parent.dueDate;
      return !value || !due || new Date(value) <= new Date(due);
    }),
  };
  if (mode === 'reschedule') return yup.object(dates);
  return yup.object({
    title: yup.string().trim().required('Say what needs doing').min(2, 'Must be at least 2 characters').max(300),
    description: yup.string().trim().max(5000),
    priority: yup.string().required(),
    assignedTo: yup.string(),
    ...dates,
  });
}

// One dialog for the three things done to a follow-up. Works for any record:
//
//   <FollowUpDialog relatedType="lead" relatedId={lead.id} onClose={close} />          add
//   <FollowUpDialog followUp={followUp} onClose={close} />                              edit
//   <FollowUpDialog followUp={followUp} mode="reschedule" onClose={close} />            new dates only
//
// `relatedType` is one of company | contact | lead | opportunity. Mount it only while open.
export default function FollowUpDialog({ relatedType, relatedId, followUp, mode = followUp ? 'edit' : 'create', onClose }) {
  const notify = useNotify();
  const { create, update, reschedule } = useFollowUpMutations();
  const full = mode !== 'reschedule';

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(buildSchema(mode)),
    defaultValues: {
      title: followUp?.title ?? '',
      description: followUp?.description ?? '',
      priority: followUp?.priority ?? 'medium',
      assignedTo: followUp?.assignedTo ?? '',
      dueDate: toDateTimeInput(followUp?.dueDate),
      reminderDate: toDateTimeInput(followUp?.reminderDate),
    },
  });

  async function onSubmit(values) {
    const dates = { dueDate: fromDateTimeInput(values.dueDate), reminderDate: fromDateTimeInput(values.reminderDate) || null };
    const details = { title: values.title, description: values.description, priority: values.priority };
    // Blank means "me" on create; on edit the assignee is simply left as is.
    if (values.assignedTo) details.assignedTo = values.assignedTo;

    try {
      if (mode === 'reschedule') await reschedule.mutateAsync({ id: followUp.id, data: dates });
      else if (mode === 'edit') await update.mutateAsync({ id: followUp.id, data: { ...details, ...dates } });
      else await create.mutateAsync({ ...details, ...dates, relatedType, relatedId });
      notify.success(DONE[mode]);
      onClose();
    } catch (error) {
      applyApiErrors(error, setError, ['title', 'description', 'priority', 'assignedTo', 'dueDate', 'reminderDate']);
    }
  }

  const dateField = (name, label, props = {}) => (
    <TextField
      label={label}
      type="datetime-local"
      error={Boolean(errors[name])}
      helperText={errors[name]?.message}
      slotProps={{ inputLabel: { shrink: true } }}
      {...register(name)}
      {...props}
    />
  );

  return (
    <Dialog open onClose={isSubmitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>{TITLES[mode]}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {errors.root && <Alert severity="error">{errors.root.message}</Alert>}
            {!full && <DialogContentText>{followUp.title}</DialogContentText>}

            {full && (
              <TextField
                label="What needs doing"
                required
                autoFocus
                error={Boolean(errors.title)}
                helperText={errors.title?.message}
                {...register('title')}
              />
            )}
            {full && (
              <TextField
                label="Details"
                multiline
                minRows={2}
                error={Boolean(errors.description)}
                helperText={errors.description?.message}
                {...register('description')}
              />
            )}

            {dateField('dueDate', 'Due', { required: true, autoFocus: !full })}
            {dateField('reminderDate', 'Remind me', {
              helperText: errors.reminderDate?.message ?? 'Optional; on or before the due date',
            })}

            {full && (
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <TextField select label="Priority" {...field}>
                    {PRIORITY_OPTIONS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            )}
            {full && (
              <Controller
                name="assignedTo"
                control={control}
                render={({ field }) => (
                  <UserSelect
                    label="Who"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    current={followUp?.assignedToUser}
                    error={errors.assignedTo}
                    helperText={errors.assignedTo?.message ?? (mode === 'create' ? 'Blank = you' : undefined)}
                  />
                )}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting}>
            {SUBMIT[mode]}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
