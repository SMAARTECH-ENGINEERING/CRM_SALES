import { yupResolver } from '@hookform/resolvers/yup';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { Controller, useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import useNotify from '../../hooks/useNotify.js';
import { usePipelineMutations } from '../../hooks/usePipelines.js';
import { applyApiErrors } from '../../utils/validation.js';
import ColorDot from '../leads/ColorDot.jsx';

// What reaching a stage means for the deal - a fixed classification, not a stage name.
export const STAGE_TYPES = [
  { value: 'open', label: 'Open', hint: 'Still being worked' },
  { value: 'won', label: 'Won', hint: 'Deal closed successfully' },
  { value: 'lost', label: 'Lost', hint: 'Deal closed without business' },
];

const HEX = /^#[0-9a-fA-F]{6}$/;
const ACTIVE = 'active';
const INACTIVE = 'inactive';

function Toggle({ control, name, label, disabled }) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <FormControlLabel
          label={label}
          control={
            <Switch checked={Boolean(field.value)} onChange={(e) => field.onChange(e.target.checked)} disabled={disabled} />
          }
        />
      )}
    />
  );
}

const pipelineSchema = yup.object({
  name: yup.string().trim().required('Name is required').min(2, 'Must be at least 2 characters').max(80),
  description: yup.string().trim().max(300),
  isDefault: yup.boolean(),
  isActive: yup.boolean(),
});

// Create when `pipeline` is absent, edit otherwise. Mount it only while open.
export function PipelineDialog({ pipeline, onClose, onSaved }) {
  const isCreate = !pipeline;
  const notify = useNotify();
  const { createPipeline, updatePipeline } = usePipelineMutations();
  // The current default can only be replaced by choosing another one.
  const lockedDefault = Boolean(pipeline?.isDefault);

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(pipelineSchema),
    defaultValues: {
      name: pipeline?.name ?? '',
      description: pipeline?.description ?? '',
      isDefault: pipeline?.isDefault ?? false,
      isActive: (pipeline?.status ?? ACTIVE) === ACTIVE,
    },
  });
  const isDefault = useWatch({ control, name: 'isDefault' });

  async function onSubmit(values) {
    const data = {
      name: values.name,
      description: values.description,
      status: values.isActive || values.isDefault ? ACTIVE : INACTIVE,
    };
    if (!lockedDefault) data.isDefault = values.isDefault;

    try {
      const response = isCreate
        ? await createPipeline.mutateAsync(data)
        : await updatePipeline.mutateAsync({ id: pipeline.id, data });
      notify.success(`${values.name} ${isCreate ? 'added' : 'updated'}`);
      onSaved?.(response.data.pipeline);
      onClose();
    } catch (error) {
      applyApiErrors(error, setError, ['name', 'description', 'isDefault', 'status']);
    }
  }

  return (
    <Dialog open onClose={isSubmitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>{isCreate ? 'Add pipeline' : 'Edit pipeline'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {errors.root && <Alert severity="error">{errors.root.message}</Alert>}
            {errors.status && <Alert severity="error">{errors.status.message}</Alert>}
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
            <Toggle
              control={control}
              name="isDefault"
              label={lockedDefault ? 'Default (make another one the default to change)' : 'Default for new opportunities'}
              disabled={lockedDefault}
            />
            <Toggle
              control={control}
              name="isActive"
              label={isDefault ? 'Active (the default is always active)' : 'Active'}
              disabled={Boolean(isDefault)}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting}>
            {isCreate ? 'Add' : 'Save changes'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

const stageSchema = yup.object({
  name: yup.string().trim().required('Name is required').min(2, 'Must be at least 2 characters').max(60),
  description: yup.string().trim().max(300),
  probability: yup
    .number()
    .typeError('Enter a percentage from 0 to 100')
    .integer('Must be a whole number')
    .min(0, 'Must be 0 or more')
    .max(100, 'Must be at most 100')
    .required(),
  color: yup.string().trim().test('hex', 'Use a hex colour such as #1976d2', (v) => !v || HEX.test(v)),
  type: yup.string().required(),
  isActive: yup.boolean(),
});

// Create a stage in `pipeline` when `stage` is absent, edit it otherwise.
// Position is not edited here: stages are moved on the Pipelines screen.
export function StageDialog({ pipeline, stage, onClose }) {
  const isCreate = !stage;
  const notify = useNotify();
  const { createStage, updateStage } = usePipelineMutations();

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(stageSchema),
    defaultValues: {
      name: stage?.name ?? '',
      description: stage?.description ?? '',
      probability: stage?.probability ?? '',
      color: stage?.color ?? '',
      type: stage?.type ?? 'open',
      isActive: (stage?.status ?? ACTIVE) === ACTIVE,
    },
  });
  const color = useWatch({ control, name: 'color' });

  async function onSubmit(values) {
    const data = {
      name: values.name,
      description: values.description,
      probability: values.probability,
      color: values.color,
      type: values.type,
      status: values.isActive ? ACTIVE : INACTIVE,
    };

    try {
      if (isCreate) await createStage.mutateAsync({ ...data, pipelineId: pipeline.id });
      else await updateStage.mutateAsync({ id: stage.id, data });
      notify.success(`${values.name} ${isCreate ? 'added' : 'updated'}`);
      onClose();
    } catch (error) {
      applyApiErrors(error, setError, Object.keys(data));
    }
  }

  return (
    <Dialog open onClose={isSubmitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>{isCreate ? `Add stage to ${pipeline.name}` : 'Edit stage'}</DialogTitle>
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
            <TextField
              label="Probability (%)"
              type="number"
              required
              error={Boolean(errors.probability)}
              helperText={errors.probability?.message ?? 'Chance of winning given to opportunities entering this stage'}
              slotProps={{ htmlInput: { min: 0, max: 100, step: 1 } }}
              {...register('probability')}
            />
            <Controller
              name="type"
              control={control}
              render={({ field }) => (
                <TextField
                  select
                  label="Meaning"
                  error={Boolean(errors.type)}
                  helperText={errors.type?.message ?? 'Opportunities in this stage take this status'}
                  {...field}
                >
                  {STAGE_TYPES.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label} - {option.hint}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
            <TextField
              label="Colour"
              placeholder="#1976d2"
              error={Boolean(errors.color)}
              helperText={errors.color?.message ?? 'Optional hex colour for the board column'}
              slotProps={{
                input: {
                  startAdornment: HEX.test(color ?? '') ? (
                    <InputAdornment position="start">
                      <ColorDot color={color} size={16} />
                    </InputAdornment>
                  ) : undefined,
                },
              }}
              {...register('color')}
            />
            <Toggle control={control} name="isActive" label="Active (opportunities can be moved into it)" />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting}>
            {isCreate ? 'Add' : 'Save changes'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
