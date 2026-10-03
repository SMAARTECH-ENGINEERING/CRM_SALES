import { yupResolver } from '@hookform/resolvers/yup';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as yup from 'yup';
import { LEAD_CONFIG } from '../api/leadConfig.api.js';
import CompanySelect from '../components/companies/CompanySelect.jsx';
import ContactSelect from '../components/contacts/ContactSelect.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import UserSelect from '../components/users/UserSelect.jsx';
import useNotify from '../hooks/useNotify.js';
import { useOpportunity, useOpportunityMutations } from '../hooks/useOpportunities.js';
import { usePipelines, usePipelineStages } from '../hooks/usePipelines.js';
import { toDateInput } from '../utils/format.js';
import { applyApiErrors } from '../utils/validation.js';

const FIELDS = [
  'name',
  'companyId',
  'contactId',
  'pipelineId',
  'stageId',
  'estimatedValue',
  'probability',
  'expectedCloseDate',
  'priorityId',
  'assignedTo',
  'notes',
];

const optionalNumber = () =>
  yup
    .number()
    .transform((value, original) => (original === '' ? undefined : value))
    .typeError('Enter a number');

// Same rules as the API (server/src/validators/opportunity.validator.js).
const schema = yup.object({
  name: yup.string().trim().required('Name is required').min(2, 'Must be at least 2 characters').max(200),
  companyId: yup.string().required('Company is required'),
  estimatedValue: optionalNumber().min(0, 'Must be 0 or more'),
  probability: optionalNumber().integer('Must be a whole number').min(0, 'Must be 0 or more').max(100, 'Must be at most 100'),
  expectedCloseDate: yup.string(),
  notes: yup.string().trim().max(5000),
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

// Where a new opportunity starts. Both lists are the active pipelines and
// stages as configured; leaving them alone means "the default pipeline" and
// "its first stage", which the API resolves.
function StartingStage({ control, errors, setValue }) {
  const pipelineId = useWatch({ control, name: 'pipelineId' });
  const pipelines = usePipelines({ status: 'active' });
  const list = pipelines.data ?? [];
  const effectivePipeline = list.find((p) => p.id === pipelineId) ?? list.find((p) => p.isDefault);
  const stages = usePipelineStages(effectivePipeline?.id, { status: 'active' });
  const stageList = stages.data ?? [];

  return (
    <>
      <Controller
        name="pipelineId"
        control={control}
        render={({ field }) => (
          <TextField
            select
            label="Pipeline"
            error={Boolean(errors.pipelineId || pipelines.error)}
            helperText={errors.pipelineId?.message ?? pipelines.error?.message}
            {...field}
            // Until the list arrives the stored id is not an option yet.
            value={list.some((p) => p.id === field.value) ? field.value : ''}
            onChange={(event) => {
              field.onChange(event.target.value);
              // A stage belongs to one pipeline, so it cannot carry over.
              setValue('stageId', '');
            }}
          >
            <MenuItem value="">Default pipeline</MenuItem>
            {list.map((pipeline) => (
              <MenuItem key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
                {pipeline.isDefault ? ' (default)' : ''}
              </MenuItem>
            ))}
          </TextField>
        )}
      />
      <Controller
        name="stageId"
        control={control}
        render={({ field }) => (
          <TextField
            select
            label="Stage"
            error={Boolean(errors.stageId || stages.error)}
            helperText={
              errors.stageId?.message ??
              stages.error?.message ??
              (effectivePipeline && stages.data && stageList.length === 0
                ? 'This pipeline has no active stage yet'
                : undefined)
            }
            {...field}
            value={stageList.some((s) => s.id === field.value) ? field.value : ''}
          >
            <MenuItem value="">First stage</MenuItem>
            {stageList.map((stage) => (
              <MenuItem key={stage.id} value={stage.id}>
                {stage.name} ({stage.probability}%)
              </MenuItem>
            ))}
          </TextField>
        )}
      />
    </>
  );
}

function OpportunityForm({ opportunity, initial = {} }) {
  const isCreate = !opportunity;
  const navigate = useNavigate();
  const notify = useNotify();
  const { create, update } = useOpportunityMutations();

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
      name: opportunity?.name ?? '',
      companyId: opportunity?.companyId ?? initial.companyId ?? '',
      contactId: opportunity?.contactId ?? '',
      pipelineId: initial.pipelineId ?? '',
      stageId: '',
      estimatedValue: opportunity?.estimatedValue ?? '',
      probability: opportunity?.probability ?? '',
      expectedCloseDate: toDateInput(opportunity?.expectedCloseDate),
      priorityId: opportunity?.priorityId ?? '',
      assignedTo: '',
      notes: opportunity?.notes ?? '',
    },
  });

  const companyId = useWatch({ control, name: 'companyId' });
  const cancel = () => navigate(isCreate ? '/opportunities' : `/opportunities/${opportunity.id}`);

  async function onSubmit(values) {
    const data = {
      name: values.name,
      companyId: values.companyId,
      contactId: values.contactId || null,
      priorityId: values.priorityId || null,
      estimatedValue: values.estimatedValue ?? null,
      expectedCloseDate: values.expectedCloseDate || null,
      notes: values.notes,
    };
    if (values.probability !== undefined) data.probability = values.probability;
    // Stage and assignment are set here only on create; afterwards they are
    // changed from the board or the opportunity's page.
    if (isCreate) {
      if (values.pipelineId) data.pipelineId = values.pipelineId;
      if (values.stageId) data.stageId = values.stageId;
      if (values.assignedTo) data.assignedTo = values.assignedTo;
    }

    try {
      const response = isCreate
        ? await create.mutateAsync(data)
        : await update.mutateAsync({ id: opportunity.id, data });
      const saved = response.data.opportunity;
      notify.success(isCreate ? `Opportunity ${saved.opportunityNumber} created` : 'Opportunity updated');
      navigate(`/opportunities/${saved.id}`, { replace: true });
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

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={handleSubmit(onSubmit)}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Typography variant="h4" component="h1">
            {isCreate ? 'New opportunity' : 'Edit opportunity'}
          </Typography>
          {!isCreate && <Chip label={opportunity.opportunityNumber} />}
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button onClick={cancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting}>
            {isCreate ? 'Create opportunity' : 'Save changes'}
          </Button>
        </Stack>
      </Stack>

      {isCreate && (
        <Alert severity="info">The opportunity number is generated automatically when the opportunity is created.</Alert>
      )}
      {errors.root && <Alert severity="error">{errors.root.message}</Alert>}
      {Object.keys(errors).some((key) => key !== 'root') && (
        <Alert severity="error">Some fields need attention. They are marked below.</Alert>
      )}

      <Section title="Opportunity">
        {text('name', 'Name', { required: true, autoFocus: isCreate, sx: FULL_WIDTH })}
        {isCreate && <StartingStage control={control} errors={errors} setValue={setValue} />}
        {text('estimatedValue', 'Estimated value', { type: 'number', slotProps: { htmlInput: { min: 0, step: 'any' } } })}
        {text('probability', 'Probability (%)', {
          type: 'number',
          slotProps: { htmlInput: { min: 0, max: 100, step: 1 } },
          helperText:
            errors.probability?.message ??
            (isCreate ? "Leave blank to use the stage's probability" : 'Moving to another stage resets it'),
        })}
        {text('expectedCloseDate', 'Expected close date', { type: 'date', slotProps: { inputLabel: { shrink: true } } })}
        <Controller
          name="priorityId"
          control={control}
          render={({ field }) => (
            <LeadConfigSelect
              list={LEAD_CONFIG.PRIORITIES}
              label="Priority"
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              current={opportunity?.priority}
              selectDefault={isCreate}
              error={errors.priorityId}
              helperText={errors.priorityId?.message}
            />
          )}
        />
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
              current={opportunity?.company}
              required
              error={errors.companyId}
              helperText={errors.companyId?.message}
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
              current={opportunity?.contact && opportunity.companyId === companyId ? opportunity.contact : undefined}
              error={errors.contactId}
              helperText={errors.contactId?.message}
            />
          )}
        />
      </Section>

      <Section title={isCreate ? 'Ownership and notes' : 'Notes'}>
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
        {text('notes', 'Notes', { multiline: true, minRows: 3, sx: FULL_WIDTH })}
      </Section>
    </Stack>
  );
}

// /opportunities/new (optionally ?companyId=<id>&pipelineId=<id>) and /opportunities/:id/edit
export default function OpportunityFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: opportunity, error, isPending } = useOpportunity(id);

  if (!id) {
    return (
      <OpportunityForm
        initial={{ companyId: searchParams.get('companyId') ?? '', pipelineId: searchParams.get('pipelineId') ?? '' }}
      />
    );
  }
  if (isPending) return <LoadingScreen />;
  if (error) {
    return (
      <Stack spacing={2}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/opportunities')} sx={{ alignSelf: 'flex-start' }}>
          Back to opportunities
        </Button>
        <Alert severity="error">{error.message}</Alert>
      </Stack>
    );
  }

  // Keyed so the form starts from this record's values.
  return <OpportunityForm key={opportunity.id} opportunity={opportunity} />;
}
