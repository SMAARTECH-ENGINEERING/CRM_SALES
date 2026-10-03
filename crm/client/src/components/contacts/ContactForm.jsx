import { yupResolver } from '@hookform/resolvers/yup';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { Controller, useForm } from 'react-hook-form';
import * as yup from 'yup';
import { useContactMutations } from '../../hooks/useContacts.js';
import useNotify from '../../hooks/useNotify.js';
import { applyApiErrors } from '../../utils/validation.js';
import CompanySelect from '../companies/CompanySelect.jsx';
import { STATUS_OPTIONS } from '../StatusChip.jsx';

// How a contact prefers to be reached, and the detail each option relies on.
export const CONTACT_METHOD_OPTIONS = [
  { value: 'email', label: 'Email', needs: 'email' },
  { value: 'phone', label: 'Phone call', needs: 'phone' },
  { value: 'whatsapp', label: 'WhatsApp', needs: 'phone' },
  { value: 'sms', label: 'SMS', needs: 'phone' },
];

const FIELDS = [
  'firstName',
  'lastName',
  'companyId',
  'designation',
  'department',
  'email',
  'phone',
  'alternatePhone',
  'preferredContactMethod',
  'status',
  'notes',
];

const phone = () =>
  yup
    .string()
    .trim()
    .test('phone', 'Enter a valid phone number', (v) => !v || /^\+?[0-9\s\-()]{7,20}$/.test(v));

// Same rules as the API (server/src/validators/contact.validator.js).
const schema = yup.object({
  firstName: yup.string().trim().required('First name is required').max(50),
  lastName: yup.string().trim().required('Last name is required').max(50),
  companyId: yup.string().required('Select a company'),
  designation: yup.string().trim().max(100),
  department: yup.string().trim().max(100),
  email: yup.string().trim().email('Enter a valid email address').max(254),
  phone: phone(),
  alternatePhone: phone(),
  preferredContactMethod: yup.string().test('usable', function usable(value) {
    const option = CONTACT_METHOD_OPTIONS.find((o) => o.value === value);
    if (!option || this.parent[option.needs]?.trim()) return true;
    return this.createError({
      message: `Add ${option.needs === 'email' ? 'an email' : 'a phone number'} to use ${option.label}`,
    });
  }),
  status: yup.string().required(),
  notes: yup.string().trim().max(5000),
});

const FULL_WIDTH = { gridColumn: '1 / -1' };

// Create when `contact` is absent, edit otherwise. Used as a page (new contact)
// and inside a dialog (edit).
//  - `initialCompanyId`: preselects the company on create.
export default function ContactForm({ contact, initialCompanyId = '', onSaved, onCancel }) {
  const isCreate = !contact;
  const notify = useNotify();
  const { create, update } = useContactMutations();

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      ...Object.fromEntries(FIELDS.map((field) => [field, contact?.[field] ?? ''])),
      companyId: contact?.companyId ?? initialCompanyId,
      status: contact?.status ?? 'active',
    },
  });

  async function onSubmit(values) {
    try {
      const response = isCreate
        ? await create.mutateAsync(values)
        : await update.mutateAsync({ id: contact.id, data: values });
      notify.success(isCreate ? 'Contact created' : 'Contact updated');
      onSaved(response.data.contact);
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

  const select = (name, label, options, emptyLabel) => (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <TextField
          select
          label={label}
          error={Boolean(errors[name])}
          helperText={errors[name]?.message}
          slotProps={emptyLabel ? { select: { displayEmpty: true }, inputLabel: { shrink: true } } : undefined}
          {...field}
        >
          {emptyLabel && <MenuItem value="">{emptyLabel}</MenuItem>}
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
        {text('firstName', 'First name', { required: true, autoFocus: true })}
        {text('lastName', 'Last name', { required: true })}

        <Controller
          name="companyId"
          control={control}
          render={({ field }) => (
            <CompanySelect
              sx={FULL_WIDTH}
              required
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              current={contact?.company}
              error={errors.companyId}
              helperText={errors.companyId?.message}
            />
          )}
        />

        {text('designation', 'Designation')}
        {text('department', 'Department')}
        {text('email', 'Email', { type: 'email' })}
        {text('phone', 'Phone', { type: 'tel' })}
        {text('alternatePhone', 'Alternate phone', { type: 'tel' })}
        {select('preferredContactMethod', 'Preferred contact method', CONTACT_METHOD_OPTIONS, 'No preference')}
        {select('status', 'Status', STATUS_OPTIONS)}
        {text('notes', 'Notes', { multiline: true, minRows: 3, sx: FULL_WIDTH })}
      </Box>

      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
        <Button onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" loading={isSubmitting}>
          {isCreate ? 'Create contact' : 'Save changes'}
        </Button>
      </Stack>
    </Stack>
  );
}
