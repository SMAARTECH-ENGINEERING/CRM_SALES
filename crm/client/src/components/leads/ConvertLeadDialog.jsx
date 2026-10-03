import { yupResolver } from '@hookform/resolvers/yup';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import { useLeadMutations } from '../../hooks/useLeads.js';
import useNotify from '../../hooks/useNotify.js';
import { toDateInput } from '../../utils/format.js';

// How the API names the field a duplicate was recognised by.
const MATCH_LABELS = {
  gstNumber: 'GST number',
  panNumber: 'PAN number',
  email: 'email',
  phone: 'phone number',
  alternatePhone: 'alternate phone number',
  website: 'website',
  name: 'name',
};

// API error field -> form field.
const ERROR_FIELDS = {
  'company.name': 'companyName',
  'company.email': 'companyEmail',
  'company.phone': 'companyPhone',
  'company.gstNumber': 'companyGst',
  'company.city': 'companyCity',
  gstNumber: 'companyGst',
  'contact.firstName': 'contactFirstName',
  'contact.lastName': 'contactLastName',
  'contact.email': 'contactEmail',
  'contact.phone': 'contactPhone',
  'opportunity.name': 'opportunityTitle',
  'opportunity.estimatedValue': 'opportunityValue',
  'opportunity.expectedCloseDate': 'opportunityCloseDate',
};

const optional = (pattern, message) => yup.string().trim().test('format', message, (v) => !v || pattern.test(v));
const PHONE = /^\+?[0-9\s\-()]{7,20}$/;

function buildSchema({ needsCompany }) {
  return yup.object({
    companyName: needsCompany
      ? yup.string().trim().required('Company name is required').min(2, 'Must be at least 2 characters').max(200)
      : yup.string(),
    companyEmail: yup.string().trim().email('Enter a valid email address'),
    companyPhone: optional(PHONE, 'Enter a valid phone number'),
    companyGst: yup
      .string()
      .transform((v) => (v ?? '').trim().toUpperCase())
      .test('gstin', 'Enter a valid 15-character GSTIN', (v) => !v || /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v)),
    companyCity: yup.string().trim().max(100),
    includeContact: yup.boolean(),
    contactFirstName: yup.string().trim().max(50).when('includeContact', {
      is: true,
      then: (s) => s.required('First name is required'),
    }),
    contactLastName: yup.string().trim().max(50).when('includeContact', {
      is: true,
      then: (s) => s.required('Last name is required'),
    }),
    contactEmail: yup.string().trim().email('Enter a valid email address'),
    contactPhone: optional(PHONE, 'Enter a valid phone number'),
    opportunityTitle: yup.string().trim().required('Name is required').min(2).max(200),
    opportunityValue: yup
      .number()
      .transform((value, original) => (original === '' ? undefined : value))
      .typeError('Enter a number')
      .min(0, 'Must be 0 or more'),
    opportunityCloseDate: yup.string(),
  });
}

const prune = (object) =>
  Object.fromEntries(Object.entries(object).filter(([, value]) => value !== '' && value !== undefined));

// The request body: company / contact details only where the lead has none.
export function buildConvertBody(values, lead) {
  const body = {};
  if (!lead.company) {
    body.company = prune({
      name: values.companyName,
      email: values.companyEmail,
      phone: values.companyPhone,
      gstNumber: values.companyGst,
      city: values.companyCity,
    });
  }
  if (!lead.contact && values.includeContact) {
    body.contact = prune({
      firstName: values.contactFirstName,
      lastName: values.contactLastName,
      email: values.contactEmail,
      phone: values.contactPhone,
    });
  }
  const opportunity = prune({
    name: values.opportunityTitle,
    estimatedValue: values.opportunityValue,
    expectedCloseDate: values.opportunityCloseDate,
  });
  if (Object.keys(opportunity).length) body.opportunity = opportunity;
  return body;
}

// One line of the review: what will happen to the company or the contact.
function PlanLine({ kind, step, nameOf }) {
  if (!step) {
    return <Alert severity="info">No {kind} will be attached.</Alert>;
  }
  if (step.action === 'linked') {
    return (
      <Alert severity="info">
        {kind === 'company' ? 'Company' : 'Contact'} <strong>{nameOf(step.record)}</strong> is already on this lead
        and will be used.
      </Alert>
    );
  }
  if (step.action === 'matched') {
    return (
      <Alert severity="warning">
        An existing {kind}, <strong>{nameOf(step.record)}</strong>, has the same{' '}
        {MATCH_LABELS[step.matchedBy] ?? step.matchedBy}. It will be linked - no new {kind} is created.
      </Alert>
    );
  }
  return <Alert severity="success">No existing {kind} matches. A new {kind} will be created.</Alert>;
}

const companyName = (record) => (record.companyCode ? `${record.name} (${record.companyCode})` : record.name);
const contactName = (record) => record.fullName ?? [record.firstName, record.lastName].filter(Boolean).join(' ');

// Converting is two steps: review (the API reports, without changing anything,
// which existing records would be linked and what would be created), then convert.
// Mount it only while open.
export default function ConvertLeadDialog({ lead, onClose, onConverted }) {
  const notify = useNotify();
  const { preview, convert } = useLeadMutations();
  const [plan, setPlan] = useState(null);
  const needsCompany = !lead.company;

  const {
    control,
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(buildSchema({ needsCompany })),
    defaultValues: {
      companyName: '',
      companyEmail: '',
      companyPhone: '',
      companyGst: '',
      companyCity: '',
      includeContact: false,
      contactFirstName: '',
      contactLastName: '',
      contactEmail: '',
      contactPhone: '',
      opportunityTitle: lead.title ?? '',
      opportunityValue: lead.estimatedValue ?? '',
      opportunityCloseDate: toDateInput(lead.expectedCloseDate),
    },
  });

  const includeContact = useWatch({ control, name: 'includeContact' });

  // A review describes the details as they were; any edit makes it stale.
  useEffect(() => {
    const subscription = watch(() => setPlan(null));
    return () => subscription.unsubscribe();
  }, [watch]);

  function showApiError(error) {
    const mapped = (error.errors ?? []).filter((e) => ERROR_FIELDS[e.field]);
    mapped.forEach((e) => setError(ERROR_FIELDS[e.field], { message: e.message }));
    if (!mapped.length) {
      const details = (error.errors ?? []).map((e) => e.message).join('; ');
      setError('root', { message: details || error.message });
    }
  }

  async function review(values) {
    try {
      const response = await preview.mutateAsync({ id: lead.id, data: buildConvertBody(values, lead) });
      setPlan(response.data);
    } catch (error) {
      showApiError(error);
    }
  }

  async function confirm(values) {
    try {
      const response = await convert.mutateAsync({ id: lead.id, data: buildConvertBody(values, lead) });
      const { opportunity, company, contact } = response.data;
      notify.success(
        [
          `Converted to opportunity ${opportunity.opportunityNumber}`,
          `company ${company.action}`,
          contact ? `contact ${contact.action}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      );
      onConverted?.(response.data);
      onClose();
    } catch (error) {
      setPlan(null);
      showApiError(error);
    }
  }

  const busy = preview.isPending || convert.isPending;
  const text = (name, label, props = {}) => (
    <TextField
      label={label}
      error={Boolean(errors[name])}
      helperText={errors[name]?.message}
      {...register(name)}
      {...props}
    />
  );
  const grid = { display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <form noValidate onSubmit={handleSubmit(plan ? confirm : review)}>
        <DialogTitle>Convert {lead.leadNumber}</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ pt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Converting creates an opportunity and links it to a company and, optionally, a contact. Existing
              records are reused rather than duplicated.
            </Typography>
            {errors.root && <Alert severity="error">{errors.root.message}</Alert>}

            <section>
              <Typography variant="subtitle2" gutterBottom>
                Company
              </Typography>
              {needsCompany ? (
                <Box sx={grid}>
                  {text('companyName', 'Company name', { required: true, autoFocus: true, sx: { gridColumn: '1 / -1' } })}
                  {text('companyEmail', 'Email', { type: 'email' })}
                  {text('companyPhone', 'Phone', { type: 'tel' })}
                  {text('companyGst', 'GST number')}
                  {text('companyCity', 'City')}
                </Box>
              ) : (
                <Typography>{companyName(lead.company)}</Typography>
              )}
            </section>

            <section>
              <Typography variant="subtitle2" gutterBottom>
                Contact
              </Typography>
              {lead.contact ? (
                <Typography>{contactName(lead.contact)}</Typography>
              ) : (
                <>
                  <FormControlLabel
                    label="Add a contact person"
                    control={<Switch {...register('includeContact')} checked={Boolean(includeContact)} />}
                  />
                  {includeContact && (
                    <Box sx={{ ...grid, mt: 1 }}>
                      {text('contactFirstName', 'First name', { required: true })}
                      {text('contactLastName', 'Last name', { required: true })}
                      {text('contactEmail', 'Email', { type: 'email' })}
                      {text('contactPhone', 'Phone', { type: 'tel' })}
                    </Box>
                  )}
                </>
              )}
            </section>

            <section>
              <Typography variant="subtitle2" gutterBottom>
                Opportunity
              </Typography>
              <Box sx={grid}>
                {text('opportunityTitle', 'Name', { required: true, sx: { gridColumn: '1 / -1' } })}
                {text('opportunityValue', 'Estimated value', { type: 'number', slotProps: { htmlInput: { min: 0, step: 'any' } } })}
                {text('opportunityCloseDate', 'Expected close date', {
                  type: 'date',
                  slotProps: { inputLabel: { shrink: true } },
                })}
              </Box>
            </section>

            {plan && (
              <Stack spacing={1} role="region" aria-label="What will happen">
                <Typography variant="subtitle2">What will happen</Typography>
                <PlanLine kind="company" step={plan.company} nameOf={companyName} />
                <PlanLine kind="contact" step={plan.contact} nameOf={contactName} />
                <Alert severity="success">A new opportunity will be created.</Alert>
                <Alert severity="info">
                  {plan.status
                    ? `The lead's status will change to ${plan.status.name}.`
                    : 'No active "won" status is configured, so the lead keeps its current status.'}
                </Alert>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {plan ? (
            <Button type="submit" variant="contained" color="success" loading={convert.isPending}>
              Convert lead
            </Button>
          ) : (
            <Button type="submit" variant="contained" loading={preview.isPending}>
              Review
            </Button>
          )}
        </DialogActions>
      </form>
    </Dialog>
  );
}
