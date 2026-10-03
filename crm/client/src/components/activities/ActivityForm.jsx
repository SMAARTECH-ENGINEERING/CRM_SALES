import { yupResolver } from '@hookform/resolvers/yup';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { Controller, useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import { ACTIVITY_CONFIG } from '../../api/leadConfig.api.js';
import { useActivityMutations } from '../../hooks/useActivities.js';
import useNotify from '../../hooks/useNotify.js';
import { fromDateTimeInput, toDateTimeInput } from '../../utils/format.js';
import { applyApiErrors } from '../../utils/validation.js';
import LeadConfigSelect from '../leads/LeadConfigSelect.jsx';
import UserSelect from '../users/UserSelect.jsx';
import { PRIORITY_OPTIONS, WORK_STATUS_OPTIONS } from './options.js';

const FIELDS = ['typeId', 'subject', 'description', 'status', 'priority', 'dueDate', 'completedAt', 'assignedTo'];

// Same rules as the API (server/src/validators/activity.validator.js).
const schema = yup.object({
  typeId: yup.string().required('Choose a type'),
  subject: yup.string().trim().required('Subject is required').min(2, 'Must be at least 2 characters').max(200),
  description: yup.string().trim().max(5000),
  status: yup.string().required(),
  priority: yup.string().required(),
  dueDate: yup.string(),
  completedAt: yup.string().test('past', 'Cannot be in the future', (v) => !v || new Date(v) <= new Date()),
  assignedTo: yup.string(),
});

const FULL_WIDTH = { gridColumn: '1 / -1' };

// Logs or plans an activity. Works for any record:
//
//   <ActivityForm related={{ leadId }} onSaved={close} onCancel={close} />
//   <ActivityForm activity={activity} onSaved={close} onCancel={close} />      edit
//
//  - `related`: the record(s) a NEW activity is about - any of companyId,
//    contactId, leadId, opportunityId. The API fills in the company where the
//    others imply one.
//  - `activity`: an existing activity to edit (its relations are left as they are).
export default function ActivityForm({ related = {}, activity, onSaved, onCancel }) {
  const isCreate = !activity;
  const notify = useNotify();
  const { create, update } = useActivityMutations();

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      typeId: activity?.typeId ?? '',
      subject: activity?.subject ?? '',
      description: activity?.description ?? '',
      status: activity?.status ?? 'pending',
      priority: activity?.priority ?? 'medium',
      dueDate: toDateTimeInput(activity?.dueDate),
      completedAt: toDateTimeInput(activity?.completedAt),
      assignedTo: activity?.assignedTo ?? '',
    },
  });

  const status = useWatch({ control, name: 'status' });
  const completed = status === 'completed';

  async function onSubmit(values) {
    const data = {
      typeId: values.typeId,
      subject: values.subject,
      description: values.description,
      status: values.status,
      priority: values.priority,
      dueDate: fromDateTimeInput(values.dueDate) || null,
    };
    // Blank while completed means "now"; the server fills it in.
    if (completed && values.completedAt) data.completedAt = fromDateTimeInput(values.completedAt);
    // Blank means "me" on create; on edit the assignee is simply left as is.
    if (values.assignedTo) data.assignedTo = values.assignedTo;

    try {
      const response = isCreate
        ? await create.mutateAsync({ ...data, ...related })
        : await update.mutateAsync({ id: activity.id, data });
      notify.success(isCreate ? 'Activity saved' : 'Activity updated');
      onSaved?.(response.data.activity);
    } catch (error) {
      applyApiErrors(error, setError, FIELDS);
    }
  }

  const select = (name, label, options) => (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <TextField select label={label} error={Boolean(errors[name])} helperText={errors[name]?.message} {...field}>
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      )}
    />
  );

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={handleSubmit(onSubmit)}>
      {errors.root && <Alert severity="error">{errors.root.message}</Alert>}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        {/* Types are whatever administrators have configured, loaded from the API. */}
        <Controller
          name="typeId"
          control={control}
          render={({ field }) => (
            <LeadConfigSelect
              list={ACTIVITY_CONFIG.TYPES}
              label="Type"
              required
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              current={activity?.type}
              error={errors.typeId}
              helperText={errors.typeId?.message}
            />
          )}
        />
        {select('status', 'Status', WORK_STATUS_OPTIONS)}

        <TextField
          label="Subject"
          required
          autoFocus
          sx={FULL_WIDTH}
          error={Boolean(errors.subject)}
          helperText={errors.subject?.message}
          {...register('subject')}
        />
        <TextField
          label="Details"
          multiline
          minRows={2}
          sx={FULL_WIDTH}
          error={Boolean(errors.description)}
          helperText={errors.description?.message}
          {...register('description')}
        />

        {completed ? (
          <TextField
            label="Completed at"
            type="datetime-local"
            error={Boolean(errors.completedAt)}
            helperText={errors.completedAt?.message ?? 'Blank = now'}
            slotProps={{ inputLabel: { shrink: true } }}
            {...register('completedAt')}
          />
        ) : (
          <TextField
            label="Due"
            type="datetime-local"
            error={Boolean(errors.dueDate)}
            helperText={errors.dueDate?.message}
            slotProps={{ inputLabel: { shrink: true } }}
            {...register('dueDate')}
          />
        )}
        {select('priority', 'Priority', PRIORITY_OPTIONS)}

        <Controller
          name="assignedTo"
          control={control}
          render={({ field }) => (
            <UserSelect
              sx={FULL_WIDTH}
              label="Assigned to"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              current={activity?.assignedToUser}
              error={errors.assignedTo}
              helperText={errors.assignedTo?.message ?? (isCreate ? 'Blank = you' : undefined)}
            />
          )}
        />
      </Box>

      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" loading={isSubmitting}>
          {isCreate ? 'Save activity' : 'Save changes'}
        </Button>
      </Stack>
    </Stack>
  );
}
