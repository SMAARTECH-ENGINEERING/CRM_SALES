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
import { useLeadConfigMutations } from '../../hooks/useLeadConfig.js';
import useNotify from '../../hooks/useNotify.js';
import { applyApiErrors } from '../../utils/validation.js';
import ColorDot from './ColorDot.jsx';

// What a status means for the pipeline - a fixed classification, not a status name.
export const STATUS_CATEGORIES = [
  { value: 'open', label: 'Open', hint: 'Still being worked' },
  { value: 'won', label: 'Won', hint: 'Closed successfully' },
  { value: 'lost', label: 'Lost', hint: 'Closed without business' },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

function buildSchema(list) {
  const shape = {
    name: yup.string().trim().required('Name is required').min(2, 'Must be at least 2 characters').max(60),
    description: yup.string().trim().max(300),
    isActive: yup.boolean(),
    // Optional: left blank, a new value goes to the end of the list.
    sortOrder: yup
      .number()
      .transform((value, original) => (original === '' ? undefined : value))
      .typeError('Enter a whole number')
      .integer('Must be a whole number')
      .min(0, 'Must be 0 or more')
      .max(100000),
  };
  if (list.fields.includes('color')) {
    shape.color = yup.string().trim().test('hex', 'Use a hex colour such as #1976d2', (v) => !v || HEX.test(v));
  }
  if (list.fields.includes('category')) shape.category = yup.string().required();
  if (list.fields.includes('level')) {
    shape.level = yup
      .number()
      .typeError('Enter a number from 1 to 100')
      .integer('Must be a whole number')
      .min(1, 'Must be at least 1')
      .max(100, 'Must be at most 100')
      .required();
  }
  if (list.fields.includes('symbol')) {
    shape.symbol = yup.string().trim().required('Symbol is required').max(15, 'Must be at most 15 characters');
  }
  if (list.fields.includes('rate')) {
    shape.rate = yup
      .number()
      .typeError('Enter a percentage from 0 to 100')
      .min(0, 'Must be 0 or more')
      .max(100, 'Must be at most 100')
      .required();
  }
  if (list.fields.includes('skuPrefix')) {
    shape.skuPrefix = yup
      .string()
      .transform((value) => (value ?? '').trim().toUpperCase())
      .test('prefix', 'Use 1-10 letters or digits', (v) => !v || /^[A-Z0-9]{1,10}$/.test(v));
  }
  if (list.fields.includes('months')) {
    // Optional: blank for a one-time charge.
    shape.months = yup
      .number()
      .transform((value, original) => (original === '' || original == null ? null : value))
      .nullable()
      .typeError('Enter a whole number of months')
      .integer('Must be a whole number')
      .min(1, 'Must be at least 1')
      .max(120, 'Must be at most 120');
  }
  if (list.fields.includes('daysBefore')) {
    shape.daysBefore = yup
      .number()
      .typeError('Enter a number of days from 0 to 365')
      .integer('Must be a whole number')
      .min(0, 'Must be 0 or more')
      .max(365, 'Must be at most 365')
      .required();
  }
  if (list.fields.includes('isQualified')) shape.isQualified = yup.boolean();
  if (list.hasDefault) shape.isDefault = yup.boolean();
  return yup.object(shape);
}

// Create when `entry` is absent, edit otherwise. Mount it only while open.
export default function LeadConfigDialog({ list, entry, onClose }) {
  const isCreate = !entry;
  const notify = useNotify();
  const { create, update } = useLeadConfigMutations(list.resource);
  const has = (field) => list.fields.includes(field);
  // What a status can mean: the list's own set, or the lead one.
  const categories = list.categories ?? STATUS_CATEGORIES;

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(buildSchema(list)),
    defaultValues: {
      name: entry?.name ?? '',
      description: entry?.description ?? '',
      isActive: entry?.isActive ?? true,
      sortOrder: entry?.sortOrder ?? '',
      color: entry?.color ?? '',
      category: entry?.category ?? categories[0].value,
      level: entry?.level ?? '',
      symbol: entry?.symbol ?? '',
      rate: entry?.rate ?? '',
      skuPrefix: entry?.skuPrefix ?? '',
      months: entry?.months ?? '',
      daysBefore: entry?.daysBefore ?? '',
      isQualified: entry?.isQualified ?? false,
      isDefault: entry?.isDefault ?? false,
    },
  });

  const color = useWatch({ control, name: 'color' });
  const isDefault = useWatch({ control, name: 'isDefault' });
  // The current default can only be replaced by choosing another one.
  const lockedDefault = Boolean(entry?.isDefault);

  async function onSubmit(values) {
    // Only this list's fields are sent.
    const data = { name: values.name, description: values.description, isActive: values.isActive };
    if (values.sortOrder !== undefined) data.sortOrder = values.sortOrder;
    for (const field of list.fields) data[field] = values[field];
    if (list.hasDefault && !lockedDefault) data.isDefault = values.isDefault;

    try {
      if (isCreate) await create.mutateAsync(data);
      else await update.mutateAsync({ id: entry.id, data });
      notify.success(`${values.name} ${isCreate ? 'added' : 'updated'}`);
      onClose();
    } catch (error) {
      applyApiErrors(error, setError, Object.keys(data));
    }
  }

  const toggle = (name, label, props = {}) => (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <FormControlLabel
          label={label}
          control={<Switch checked={Boolean(field.value)} onChange={(e) => field.onChange(e.target.checked)} {...props} />}
        />
      )}
    />
  );

  return (
    <Dialog open onClose={isSubmitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>{isCreate ? `Add ${list.singular}` : `Edit ${list.singular}`}</DialogTitle>
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

            {has('category') && (
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <TextField
                    select
                    label="Meaning"
                    error={Boolean(errors.category)}
                    helperText={errors.category?.message ?? 'What this status means, whatever it is called'}
                    {...field}
                  >
                    {categories.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label} - {option.hint}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            )}

            {has('level') && (
              <TextField
                label="Level"
                type="number"
                required
                error={Boolean(errors.level)}
                helperText={errors.level?.message ?? 'Urgency rank from 1 to 100; higher is more urgent'}
                slotProps={{ htmlInput: { min: 1, max: 100 } }}
                {...register('level')}
              />
            )}

            {has('symbol') && (
              <TextField
                label="Symbol"
                required
                error={Boolean(errors.symbol)}
                helperText={errors.symbol?.message ?? 'Short form shown next to quantities, e.g. kg'}
                {...register('symbol')}
              />
            )}

            {has('rate') && (
              <TextField
                label="Rate (%)"
                type="number"
                required
                error={Boolean(errors.rate)}
                helperText={errors.rate?.message ?? 'A percentage: 18 means 18%'}
                slotProps={{ htmlInput: { min: 0, max: 100, step: 'any' } }}
                {...register('rate')}
              />
            )}

            {has('skuPrefix') && (
              <TextField
                label="SKU prefix"
                error={Boolean(errors.skuPrefix)}
                helperText={
                  errors.skuPrefix?.message ??
                  'Optional. Generated SKUs for products in this category start with it, e.g. ELEC-000012'
                }
                slotProps={{ htmlInput: { style: { textTransform: 'uppercase' } } }}
                {...register('skuPrefix')}
              />
            )}

            {has('months') && (
              <TextField
                label="Months per cycle"
                type="number"
                error={Boolean(errors.months)}
                helperText={errors.months?.message ?? 'Length of one billing cycle. Leave blank for a one-time charge.'}
                slotProps={{ htmlInput: { min: 1, max: 120 } }}
                {...register('months')}
              />
            )}

            {has('daysBefore') && (
              <TextField
                label="Days before the end date"
                type="number"
                required
                error={Boolean(errors.daysBefore)}
                helperText={
                  errors.daysBefore?.message ??
                  'Active contracts get a reminder this many days before they end (0 = on the end date)'
                }
                slotProps={{ htmlInput: { min: 0, max: 365 } }}
                {...register('daysBefore')}
              />
            )}

            {has('color') && (
              <TextField
                label="Colour"
                placeholder="#1976d2"
                error={Boolean(errors.color)}
                helperText={errors.color?.message ?? 'Optional hex colour for chips and lists'}
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
            )}

            <TextField
              label="Position"
              type="number"
              error={Boolean(errors.sortOrder)}
              helperText={
                errors.sortOrder?.message ??
                (isCreate ? 'Lower numbers appear first. Leave blank to add at the end.' : 'Lower numbers appear first')
              }
              slotProps={{ htmlInput: { min: 0 } }}
              {...register('sortOrder')}
            />

            {has('isQualified') && toggle('isQualified', 'Counts as a qualified lead (dashboard and reports)')}
            {list.hasDefault &&
              toggle('isDefault', lockedDefault ? 'Default (make another one the default to change)' : (list.defaultLabel ?? 'Default for new leads'), {
                disabled: lockedDefault,
              })}
            {toggle('isActive', isDefault ? 'Active (the default is always active)' : 'Active', { disabled: Boolean(isDefault) })}
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
