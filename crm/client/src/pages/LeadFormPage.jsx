import { yupResolver } from '@hookform/resolvers/yup';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as yup from 'yup';
import { LEAD_CONFIG } from '../api/leadConfig.api.js';
import { MASTER_DATA } from '../api/masterData.api.js';
import CompanySelect from '../components/companies/CompanySelect.jsx';
import MasterDataSelect from '../components/companies/MasterDataSelect.jsx';
import ContactSelect from '../components/contacts/ContactSelect.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import UserSelect from '../components/users/UserSelect.jsx';
import { useLead, useLeadMutations } from '../hooks/useLeads.js';
import useNotify from '../hooks/useNotify.js';
import { toDateInput } from '../utils/format.js';
import { applyApiErrors } from '../utils/validation.js';

const FIELDS = [
  'title',
  'description',
  'companyId',
  'contactId',
  'sourceId',
  'statusId',
  'priorityId',
  'estimatedValue',
  'assignedTo',
  'expectedCloseDate',
  'organizationId',
  'tags',
  'notes',
];

// Same rules as the API (server/src/validators/lead.validator.js).
const schema = yup.object({
  title: yup.string().trim().required('Title is required').min(2, 'Must be at least 2 characters').max(200),
  description: yup.string().trim().max(5000),
  estimatedValue: yup
    .number()
    .transform((value, original) => (original === '' ? undefined : value))
    .typeError('Enter a number')
    .min(0, 'Must be 0 or more'),
  expectedCloseDate: yup.string(),
  notes: yup.string().trim().max(5000),
  tags: yup
    .array()
    .of(yup.string().trim().max(30, 'Each tag can be up to 30 characters'))
    .max(20, 'Up to 20 tags'),
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

function LeadForm({ lead, initialCompanyId = '' }) {
  const isCreate = !lead;
  const navigate = useNavigate();
  const notify = useNotify();
  const { create, update } = useLeadMutations();

  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      title: lead?.title ?? '',
      description: lead?.description ?? '',
      companyId: lead?.companyId ?? initialCompanyId,
      contactId: lead?.contactId ?? '',
      sourceId: lead?.sourceId ?? '',
      statusId: lead?.statusId ?? '',
      priorityId: lead?.priorityId ?? '',
      estimatedValue: lead?.estimatedValue ?? '',
      assignedTo: lead?.assignedTo ?? '',
      expectedCloseDate: toDateInput(lead?.expectedCloseDate),
      organizationId: lead?.organizationId ?? '',
      tags: lead?.tags ?? [],
      notes: lead?.notes ?? '',
    },
  });

  const companyId = useWatch({ control, name: 'companyId' });
  const cancel = () => navigate(isCreate ? '/leads' : `/leads/${lead.id}`);

  async function onSubmit(values) {
    const data = {
      title: values.title,
      description: values.description,
      companyId: values.companyId || null,
      contactId: values.contactId || null,
      sourceId: values.sourceId || null,
      priorityId: values.priorityId || null,
      organizationId: values.organizationId || null,
      estimatedValue: values.estimatedValue ?? null,
      expectedCloseDate: values.expectedCloseDate || null,
      tags: values.tags,
      notes: values.notes,
    };
    // Status and assignment are set here only on create; afterwards they are
    // changed from the lead's page, where each has its own permission.
    if (isCreate) {
      if (values.statusId) data.statusId = values.statusId;
      if (values.assignedTo) data.assignedTo = values.assignedTo;
    }

    try {
      const response = isCreate
        ? await create.mutateAsync(data)
        : await update.mutateAsync({ id: lead.id, data });
      const saved = response.data.lead;
      notify.success(isCreate ? `Lead ${saved.leadNumber} created` : 'Lead updated');
      navigate(`/leads/${saved.id}`, { replace: true });
    } catch (error) {
      applyApiErrors(error, setError, FIELDS);
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

  // Source, status and priority options are the configured values, from the API.
  const configSelect = (name, label, list, current, props = {}) => (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <LeadConfigSelect
          list={list}
          label={label}
          value={field.value}
          onChange={field.onChange}
          onBlur={field.onBlur}
          current={current}
          error={errors[name]}
          helperText={errors[name]?.message}
          {...props}
        />
      )}
    />
  );

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={handleSubmit(onSubmit)}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Typography variant="h4" component="h1">
            {isCreate ? 'New lead' : 'Edit lead'}
          </Typography>
          {!isCreate && <Chip label={lead.leadNumber} />}
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button onClick={cancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting}>
            {isCreate ? 'Create lead' : 'Save changes'}
          </Button>
        </Stack>
      </Stack>

      {isCreate && <Alert severity="info">The lead number is generated automatically when the lead is created.</Alert>}
      {errors.root && <Alert severity="error">{errors.root.message}</Alert>}
      {Object.keys(errors).some((key) => key !== 'root') && (
        <Alert severity="error">Some fields need attention. They are marked below.</Alert>
      )}

      <Section title="Lead">
        {text('title', 'Title', { required: true, autoFocus: isCreate, sx: FULL_WIDTH })}
        {text('description', 'Description', { multiline: true, minRows: 2, sx: FULL_WIDTH })}
        {configSelect('sourceId', 'Source', LEAD_CONFIG.SOURCES, lead?.source)}
        {configSelect('priorityId', 'Priority', LEAD_CONFIG.PRIORITIES, lead?.priority, { selectDefault: isCreate })}
        {isCreate &&
          configSelect('statusId', 'Status', LEAD_CONFIG.STATUSES, undefined, { selectDefault: true, required: true })}
        {text('estimatedValue', 'Estimated value', { type: 'number', slotProps: { htmlInput: { min: 0, step: 'any' } } })}
        {text('expectedCloseDate', 'Expected close date', { type: 'date', slotProps: { inputLabel: { shrink: true } } })}
      </Section>

      <Section title="Company and contact">
        <Controller
          name="companyId"
          control={control}
          render={({ field }) => (
            <CompanySelect
              value={field.value}
              onChange={(id) => {
                field.onChange(id);
                // A contact belongs to one company, so it cannot carry over.
                setValue('contactId', '');
              }}
              onBlur={field.onBlur}
              current={lead?.company}
              error={errors.companyId}
              helperText={errors.companyId?.message ?? 'Optional - can be added when the lead is converted'}
            />
          )}
        />
        <Controller
          name="contactId"
          control={control}
          render={({ field }) => (
            <ContactSelect
              companyId={companyId}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              current={lead?.contact && lead.companyId === companyId ? lead.contact : undefined}
              error={errors.contactId}
              helperText={errors.contactId?.message}
            />
          )}
        />
      </Section>

      <Section title="Ownership">
        {isCreate && (
          <Controller
            name="assignedTo"
            control={control}
            render={({ field }) => (
              <UserSelect
                label="Assigned to"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                error={errors.assignedTo}
                helperText={errors.assignedTo?.message}
              />
            )}
          />
        )}
        <MasterDataSelect
          control={control}
          name="organizationId"
          label="Organization"
          resource={MASTER_DATA.ORGANIZATIONS}
          current={lead?.organization}
          error={errors.organizationId}
        />
      </Section>

      <Section title="Tags and notes">
        <Controller
          name="tags"
          control={control}
          render={({ field }) => (
            <Autocomplete
              multiple
              freeSolo
              options={[]}
              sx={FULL_WIDTH}
              value={field.value}
              // Trim, drop blanks, and treat "VIP" and "vip" as the same tag.
              onChange={(event, values) => {
                const seen = new Set();
                field.onChange(
                  values
                    .map((value) => value.trim())
                    .filter((value) => value && !seen.has(value.toLowerCase()) && seen.add(value.toLowerCase()))
                );
              }}
              onBlur={field.onBlur}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Tags"
                  placeholder="Type a tag and press Enter"
                  error={Boolean(errors.tags)}
                  helperText={errors.tags?.message ?? errors.tags?.find?.(Boolean)?.message}
                />
              )}
            />
          )}
        />
        {text('notes', 'Notes', { multiline: true, minRows: 3, sx: FULL_WIDTH })}
      </Section>
    </Stack>
  );
}

// /leads/new (optionally ?companyId=<id>) and /leads/:id/edit
export default function LeadFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: lead, error, isPending } = useLead(id);

  if (!id) return <LeadForm initialCompanyId={searchParams.get('companyId') ?? ''} />;
  if (isPending) return <LoadingScreen />;
  if (error) {
    return (
      <Stack spacing={2}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/leads')} sx={{ alignSelf: 'flex-start' }}>
          Back to leads
        </Button>
        <Alert severity="error">{error.message}</Alert>
      </Stack>
    );
  }

  // Keyed so the form starts from this record's values.
  return <LeadForm key={lead.id} lead={lead} />;
}
