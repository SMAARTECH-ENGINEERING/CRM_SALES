import { yupResolver } from '@hookform/resolvers/yup';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import * as yup from 'yup';
import { MASTER_DATA } from '../api/masterData.api.js';
import MasterDataSelect from '../components/companies/MasterDataSelect.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import { STATUS_OPTIONS } from '../components/StatusChip.jsx';
import { useCompany, useCompanyMutations } from '../hooks/useCompanies.js';
import { useUserOptions } from '../hooks/useMasterData.js';
import useNotify from '../hooks/useNotify.js';
import { applyApiErrors } from '../utils/validation.js';

const TEXT_FIELDS = [
  'name',
  'legalName',
  'email',
  'phone',
  'website',
  'address',
  'city',
  'state',
  'country',
  'postalCode',
  'gstNumber',
  'panNumber',
  'notes',
];
const REFERENCE_FIELDS = ['industryId', 'companyTypeId', 'organizationId', 'assignedTo'];
const ALL_FIELDS = [...TEXT_FIELDS, ...REFERENCE_FIELDS, 'status'];

const upper = (value) => (value ?? '').trim().toUpperCase();
// Optional text: empty is fine, otherwise it must match.
const optional = (pattern, message) => yup.string().trim().test('format', message, (v) => !v || pattern.test(v));

// Same rules as the API (server/src/validators/company.validator.js).
const schema = yup.object({
  name: yup.string().trim().required('Name is required').min(2, 'Must be at least 2 characters').max(200),
  legalName: yup.string().trim().max(200),
  email: yup.string().trim().email('Enter a valid email address').max(254),
  phone: optional(/^\+?[0-9\s\-()]{7,20}$/, 'Enter a valid phone number'),
  website: optional(/^https?:\/\/\S+$/, 'Must start with http:// or https://').max(2048),
  address: yup.string().trim().max(500),
  city: yup.string().trim().max(100),
  state: yup.string().trim().max(100),
  country: yup.string().trim().max(100),
  postalCode: optional(/^[A-Za-z0-9][A-Za-z0-9\s-]{2,11}$/, 'Enter a valid postal code'),
  gstNumber: yup
    .string()
    .transform(upper)
    .test('gstin', 'Enter a valid 15-character GSTIN', (v) => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v))
    .test('matches-pan', 'Characters 3-12 of the GSTIN must be the PAN', function matchesPan(v) {
      const pan = upper(this.parent.panNumber);
      return !v || !pan || v.slice(2, 12) === pan;
    }),
  panNumber: yup
    .string()
    .transform(upper)
    .test('pan', 'Enter a valid 10-character PAN', (v) => !v || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v)),
  notes: yup.string().trim().max(5000),
  status: yup.string().required(),
  industryId: yup.string(),
  companyTypeId: yup.string(),
  organizationId: yup.string(),
  assignedTo: yup.string(),
});

function Section({ title, children }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
          {title}
        </Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>{children}</Box>
      </CardContent>
    </Card>
  );
}

const FULL_WIDTH = { gridColumn: '1 / -1' };

function CompanyForm({ company }) {
  const isCreate = !company;
  const navigate = useNavigate();
  const notify = useNotify();
  const { create, update } = useCompanyMutations();
  const users = useUserOptions();

  const {
    control,
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      ...Object.fromEntries([...TEXT_FIELDS, ...REFERENCE_FIELDS].map((field) => [field, company?.[field] ?? ''])),
      status: company?.status ?? 'active',
    },
  });

  const cancel = () => navigate(isCreate ? '/companies' : `/companies/${company.id}`);

  async function onSubmit(values) {
    // References are sent as null when empty; empty text clears the field.
    const data = { ...values };
    for (const field of REFERENCE_FIELDS) data[field] = values[field] || null;

    try {
      const response = isCreate
        ? await create.mutateAsync(data)
        : await update.mutateAsync({ id: company.id, data });
      const saved = response.data.company;
      notify.success(isCreate ? `${saved.name} created as ${saved.companyCode}` : 'Company updated');
      navigate(`/companies/${saved.id}`, { replace: true });
    } catch (error) {
      applyApiErrors(error, setError, ALL_FIELDS);
      window.scrollTo({ top: 0, behavior: 'smooth' });
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

  // The current assignee stays selectable even if no longer in the list (e.g. deactivated).
  const userOptions = users.data ?? [];
  const assignee = company?.assignedToUser;
  const assignable =
    assignee && !userOptions.some((u) => u.id === assignee.id) ? [assignee, ...userOptions] : userOptions;

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={handleSubmit(onSubmit)}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Typography variant="h4" component="h1">
            {isCreate ? 'New company' : 'Edit company'}
          </Typography>
          {!isCreate && <Chip label={company.companyCode} />}
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button onClick={cancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting}>
            {isCreate ? 'Create company' : 'Save changes'}
          </Button>
        </Stack>
      </Stack>

      {isCreate && (
        <Alert severity="info">The company code is generated automatically when the company is created.</Alert>
      )}
      {errors.root && <Alert severity="error">{errors.root.message}</Alert>}
      {Object.keys(errors).some((key) => key !== 'root') && (
        <Alert severity="error">Some fields need attention. They are marked below.</Alert>
      )}

      <Section title="Company">
        {text('name', 'Name', { required: true, autoFocus: isCreate })}
        {text('legalName', 'Legal name')}
        <MasterDataSelect
          control={control}
          name="industryId"
          label="Industry"
          resource={MASTER_DATA.INDUSTRIES}
          current={company?.industry}
          error={errors.industryId}
        />
        <MasterDataSelect
          control={control}
          name="companyTypeId"
          label="Company type"
          resource={MASTER_DATA.COMPANY_TYPES}
          current={company?.companyType}
          error={errors.companyTypeId}
        />
        <Controller
          name="status"
          control={control}
          render={({ field }) => (
            <TextField select label="Status" error={Boolean(errors.status)} helperText={errors.status?.message} {...field}>
              {STATUS_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          )}
        />
        {text('website', 'Website', { type: 'url', placeholder: 'https://' })}
      </Section>

      <Section title="Contact">
        {text('email', 'Email', { type: 'email' })}
        {text('phone', 'Phone', { type: 'tel' })}
      </Section>

      <Section title="Address">
        {text('address', 'Address', { multiline: true, minRows: 2, sx: FULL_WIDTH })}
        {text('city', 'City')}
        {text('state', 'State')}
        {text('country', 'Country')}
        {text('postalCode', 'Postal code')}
      </Section>

      <Section title="Tax">
        {text('gstNumber', 'GST number', { slotProps: { htmlInput: { style: { textTransform: 'uppercase' } } } })}
        {text('panNumber', 'PAN number', { slotProps: { htmlInput: { style: { textTransform: 'uppercase' } } } })}
      </Section>

      <Section title="Ownership">
        <Controller
          name="assignedTo"
          control={control}
          render={({ field }) => (
            <Autocomplete
              options={assignable}
              loading={users.isPending}
              getOptionLabel={(option) => option.fullName ?? ''}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              value={assignable.find((option) => option.id === field.value) ?? null}
              onChange={(event, option) => field.onChange(option?.id ?? '')}
              onBlur={field.onBlur}
              renderOption={(props, option) => (
                <li {...props} key={option.id}>
                  <div>
                    <Typography variant="body2">{option.fullName}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.email}
                    </Typography>
                  </div>
                </li>
              )}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Assigned to"
                  error={Boolean(errors.assignedTo || users.error)}
                  helperText={errors.assignedTo?.message ?? users.error?.message}
                />
              )}
            />
          )}
        />
        <MasterDataSelect
          control={control}
          name="organizationId"
          label="Organization"
          resource={MASTER_DATA.ORGANIZATIONS}
          current={company?.organization}
          error={errors.organizationId}
        />
      </Section>

      <Section title="Notes">{text('notes', 'Notes', { multiline: true, minRows: 3, sx: FULL_WIDTH })}</Section>
    </Stack>
  );
}

// /companies/new and /companies/:id/edit
export default function CompanyFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: company, error, isPending } = useCompany(id);

  if (!id) return <CompanyForm />;
  if (isPending) return <LoadingScreen />;
  if (error) {
    return (
      <Stack spacing={2}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/companies')} sx={{ alignSelf: 'flex-start' }}>
          Back to companies
        </Button>
        <Alert severity="error">{error.message}</Alert>
      </Stack>
    );
  }

  // Keyed so the form starts from this record's values.
  return <CompanyForm key={company.id} company={company} />;
}
