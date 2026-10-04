import { yupResolver } from '@hookform/resolvers/yup';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as yup from 'yup';
import { QUOTATION_CONFIG } from '../api/leadConfig.api.js';
import CompanySelect from '../components/companies/CompanySelect.jsx';
import ContactSelect from '../components/contacts/ContactSelect.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import OpportunitySelect from '../components/opportunities/OpportunitySelect.jsx';
import ProductSelect from '../components/products/ProductSelect.jsx';
import useNotify from '../hooks/useNotify.js';
import {
  useCompanyProfile,
  useQuotation,
  useQuotationCalculation,
  useQuotationMutations,
} from '../hooks/useQuotations.js';
import { EMPTY, formatAmount, toDateInput } from '../utils/format.js';
import { applyApiErrors } from '../utils/validation.js';

const FIELDS = [
  'companyId',
  'contactId',
  'opportunityId',
  'quotationDate',
  'validUntil',
  'items',
  'discountPercent',
  'notes',
  'termsAndConditions',
  'statusId',
];
// How long typing pauses before the server re-prices the quotation.
const RECALCULATE_MS = 400;

const optionalNumber = () =>
  yup
    .number()
    .transform((value, original) => (original === '' || original === null ? undefined : value))
    .typeError('Enter a number');
const percent = () => optionalNumber().min(0, 'Must be 0 or more').max(100, 'Must be at most 100');

// Same rules as the API (server/src/validators/quotation.validator.js).
// Totals are not part of the form: the server calculates them.
const schema = yup.object({
  companyId: yup.string().required('Customer is required'),
  quotationDate: yup.string(),
  validUntil: yup
    .string()
    .test('after', 'Must not be before the quotation date', function check(value) {
      const { quotationDate } = this.parent;
      return !value || !quotationDate || value >= quotationDate;
    }),
  items: yup
    .array()
    .of(
      yup.object({
        productId: yup.string().required('Choose a product'),
        description: yup.string().trim().max(1000),
        quantity: optionalNumber().required('Required').moreThan(0, 'Must be more than 0'),
        unitPrice: optionalNumber().min(0, 'Must be 0 or more'),
        discountPercent: percent(),
      })
    )
    .min(1, 'Add at least one product'),
  discountPercent: percent(),
  notes: yup.string().trim().max(5000),
  termsAndConditions: yup.string().trim().max(5000),
});

const emptyLine = () => ({ productId: '', product: null, description: '', quantity: 1, unitPrice: '', discountPercent: '' });

const number = (value) => (value === '' || value === null || value === undefined ? undefined : Number(value));

// What the server needs to price a line; incomplete lines are left out.
function toApiItems(items) {
  return items
    .filter((item) => item.productId && number(item.quantity) > 0)
    .map((item) => {
      const line = { productId: item.productId, quantity: number(item.quantity) };
      if (item.description?.trim()) line.description = item.description.trim();
      if (number(item.unitPrice) !== undefined) line.unitPrice = number(item.unitPrice);
      if (number(item.discountPercent) !== undefined) line.discountPercent = number(item.discountPercent);
      return line;
    });
}

// A value that only settles once it stops changing for `delay` ms.
function useSettled(value, delay) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

function Section({ title, children, action }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ mb: 2, alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" component="h2">
            {title}
          </Typography>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

const grid = { display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } };

function TotalRow({ label, value, strong }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
      <Typography color={strong ? 'text.primary' : 'text.secondary'} sx={{ fontWeight: strong ? 600 : 400 }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: strong ? 600 : 400 }} aria-label={label}>
        {value}
      </Typography>
    </Stack>
  );
}

function QuotationForm({ quotation, initial = {} }) {
  const isCreate = !quotation;
  const navigate = useNavigate();
  const notify = useNotify();
  const { create, update } = useQuotationMutations();
  const profile = useCompanyProfile({ enabled: isCreate });

  const {
    control,
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      companyId: quotation?.companyId ?? initial.companyId ?? '',
      contactId: quotation?.contactId ?? '',
      opportunityId: quotation?.opportunityId ?? initial.opportunityId ?? '',
      quotationDate: toDateInput(quotation?.quotationDate),
      validUntil: toDateInput(quotation?.validUntil),
      statusId: '',
      items: quotation
        ? quotation.items.map((item) => ({
            productId: item.productId,
            product: { id: item.productId, name: item.name, sku: item.sku, basePrice: item.unitPrice },
            description: item.description ?? '',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent || '',
          }))
        : [emptyLine()],
      discountPercent: quotation?.discountPercent || '',
      notes: quotation?.notes ?? '',
      termsAndConditions: quotation?.termsAndConditions ?? '',
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  // New quotations start with the default terms from the company profile.
  const defaultTerms = profile.data?.quotationTerms;
  useEffect(() => {
    if (isCreate && defaultTerms && !getValues('termsAndConditions')) setValue('termsAndConditions', defaultTerms);
  }, [isCreate, defaultTerms, getValues, setValue]);

  const companyId = useWatch({ control, name: 'companyId' });
  const items = useWatch({ control, name: 'items' });
  const discountPercent = useWatch({ control, name: 'discountPercent' });

  // The server prices whatever is complete; the totals below are its answer.
  const payload = useMemo(() => {
    const apiItems = toApiItems(items ?? []);
    if (!apiItems.length) return null;
    const discount = number(discountPercent);
    if (discount !== undefined && (discount < 0 || discount > 100)) return null;
    return { items: apiItems, discountPercent: discount ?? 0, ...(quotation ? { quotationId: quotation.id } : {}) };
  }, [items, discountPercent, quotation]);
  const settled = useSettled(payload, RECALCULATE_MS);
  const calculation = useQuotationCalculation(settled);
  const totals = payload ? calculation.data : null;
  const pricing = payload !== settled || calculation.isFetching;

  // The server's line for form line `index` (incomplete lines have none).
  const pricedLines = useMemo(() => {
    const map = new Map();
    let next = 0;
    (items ?? []).forEach((item, index) => {
      if (item.productId && number(item.quantity) > 0) map.set(index, totals?.items?.[next++]);
    });
    return map;
  }, [items, totals]);

  const cancel = () => navigate(isCreate ? '/quotations' : `/quotations/${quotation.id}`);

  async function onSubmit(values) {
    const data = {
      companyId: values.companyId,
      contactId: values.contactId || null,
      opportunityId: values.opportunityId || null,
      items: toApiItems(values.items),
      discountPercent: values.discountPercent ?? 0,
      notes: values.notes,
      termsAndConditions: values.termsAndConditions,
    };
    if (values.quotationDate) data.quotationDate = values.quotationDate;
    if (values.validUntil) data.validUntil = values.validUntil;
    else if (!isCreate) data.validUntil = null;
    // The status is chosen here only on create; afterwards it has its own control.
    if (isCreate && values.statusId) data.statusId = values.statusId;

    try {
      const response = isCreate
        ? await create.mutateAsync(data)
        : await update.mutateAsync({ id: quotation.id, data });
      const saved = response.data.quotation;
      notify.success(isCreate ? `Quotation ${saved.quotationNumber} created` : 'Quotation updated');
      navigate(`/quotations/${saved.id}`, { replace: true });
    } catch (error) {
      // Line errors arrive as "items.2.productId"; show them on that line.
      for (const e of error.errors ?? []) {
        if (/^items\.\d+\./.test(e.field)) setError(e.field, { message: e.message });
      }
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

  const itemError = (index, field) => errors.items?.[index]?.[field];
  const numberInput = (index, field, label, props = {}) => (
    <TextField
      label={label}
      type="number"
      size="small"
      error={Boolean(itemError(index, field))}
      helperText={itemError(index, field)?.message}
      {...register(`items.${index}.${field}`)}
      {...props}
    />
  );

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={handleSubmit(onSubmit)}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Typography variant="h4" component="h1">
            {isCreate ? 'New quotation' : 'Edit quotation'}
          </Typography>
          {!isCreate && <Chip label={quotation.quotationNumber} />}
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button onClick={cancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting}>
            {isCreate ? 'Create quotation' : 'Save changes'}
          </Button>
        </Stack>
      </Stack>

      {isCreate && (
        <Alert severity="info">
          The quotation number is generated when it is created. Prices, tax and totals are worked out by the server
          from the products.
        </Alert>
      )}
      {errors.root && <Alert severity="error">{errors.root.message}</Alert>}
      {Object.keys(errors).some((key) => key !== 'root') && (
        <Alert severity="error">Some fields need attention. They are marked below.</Alert>
      )}

      <Section title="Customer">
        <Box sx={grid}>
          <Controller
            name="companyId"
            control={control}
            render={({ field }) => (
              <CompanySelect
                label="Customer"
                required
                value={field.value}
                onChange={(id) => {
                  field.onChange(id);
                  // Contacts and opportunities belong to one company, so they cannot carry over.
                  setValue('contactId', '');
                  setValue('opportunityId', '');
                }}
                onBlur={field.onBlur}
                current={quotation?.company}
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
                current={quotation?.contact && quotation.companyId === companyId ? quotation.contact : undefined}
                error={errors.contactId}
                helperText={errors.contactId?.message}
              />
            )}
          />
          <Controller
            name="opportunityId"
            control={control}
            render={({ field }) => (
              <OpportunitySelect
                companyId={companyId}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                current={quotation?.opportunity && quotation.companyId === companyId ? quotation.opportunity : undefined}
                error={errors.opportunityId}
                helperText={errors.opportunityId?.message}
              />
            )}
          />
          {isCreate && (
            <Controller
              name="statusId"
              control={control}
              render={({ field }) => (
                <LeadConfigSelect
                  list={QUOTATION_CONFIG.STATUSES}
                  label="Status"
                  required
                  selectDefault
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.statusId}
                  helperText={errors.statusId?.message}
                />
              )}
            />
          )}
          {text('quotationDate', 'Quotation date', {
            type: 'date',
            slotProps: { inputLabel: { shrink: true } },
            helperText: errors.quotationDate?.message ?? (isCreate ? 'Blank: today' : undefined),
          })}
          {text('validUntil', 'Valid until', {
            type: 'date',
            slotProps: { inputLabel: { shrink: true } },
            helperText:
              errors.validUntil?.message ??
              (isCreate && profile.data
                ? `Blank: ${profile.data.quotationValidityDays} days after the quotation date`
                : undefined),
          })}
        </Box>
      </Section>

      <Section
        title="Products"
        action={
          <Button size="small" startIcon={<AddIcon />} onClick={() => append(emptyLine())}>
            Add product
          </Button>
        }
      >
        {errors.items?.message && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {errors.items.message}
          </Alert>
        )}
        <Stack spacing={2}>
          {fields.map((field, index) => {
            const priced = pricedLines.get(index);
            return (
              <Box
                key={field.id}
                component="fieldset"
                aria-label={`Line ${index + 1}`}
                sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 2, m: 0 }}
              >
                <Box
                  sx={{
                    display: 'grid',
                    gap: 1.5,
                    alignItems: 'start',
                    gridTemplateColumns: { xs: '1fr 1fr', md: 'minmax(220px, 3fr) 1fr 1.3fr 1fr auto' },
                  }}
                >
                  <Controller
                    name={`items.${index}.productId`}
                    control={control}
                    render={({ field: productField }) => (
                      <ProductSelect
                        sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}
                        required
                        value={productField.value}
                        current={items?.[index]?.product}
                        onChange={(id, product) => {
                          productField.onChange(id);
                          setValue(`items.${index}.product`, product ?? null);
                          // Starts at the product's price; it can then be changed.
                          setValue(`items.${index}.unitPrice`, product ? product.basePrice : '');
                        }}
                        onBlur={productField.onBlur}
                        error={itemError(index, 'productId')}
                        helperText={itemError(index, 'productId')?.message}
                      />
                    )}
                  />
                  {numberInput(index, 'quantity', 'Quantity', { required: true, slotProps: { htmlInput: { min: 0, step: 'any' } } })}
                  {numberInput(index, 'unitPrice', 'Unit price', { slotProps: { htmlInput: { min: 0, step: 'any' } } })}
                  {numberInput(index, 'discountPercent', 'Discount %', { slotProps: { htmlInput: { min: 0, max: 100, step: 'any' } } })}
                  <Tooltip title="Remove line">
                    <span>
                      <IconButton
                        aria-label={`Remove line ${index + 1}`}
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                        sx={{ mt: 0.5 }}
                      >
                        <DeleteOutlinedIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <TextField
                    label="Description"
                    size="small"
                    placeholder="Optional, printed under the product name"
                    sx={{ gridColumn: '1 / -1' }}
                    error={Boolean(itemError(index, 'description'))}
                    helperText={itemError(index, 'description')?.message}
                    {...register(`items.${index}.description`)}
                  />
                </Box>
                <Stack direction="row" spacing={3} sx={{ mt: 1, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <Typography variant="body2" color="text.secondary">
                    Tax: {priced ? `${priced.taxName ? `${priced.taxName} · ` : ''}${priced.taxRate}%` : EMPTY}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Line discount: {priced ? formatAmount(priced.discount) : EMPTY}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500 }} aria-label={`Line ${index + 1} amount`}>
                    Amount: {priced ? formatAmount(priced.total) : EMPTY}
                  </Typography>
                </Stack>
              </Box>
            );
          })}
        </Stack>
      </Section>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '3fr 2fr' }, alignItems: 'start' }}>
        <Section title="Terms and notes">
          <Stack spacing={2}>
            {text('termsAndConditions', 'Terms and conditions', {
              multiline: true,
              minRows: 4,
              helperText: errors.termsAndConditions?.message ?? 'Printed on the PDF',
            })}
            {text('notes', 'Notes', { multiline: true, minRows: 2, helperText: errors.notes?.message ?? 'Printed on the PDF' })}
          </Stack>
        </Section>

        <Section title="Totals">
          <Stack spacing={1.5}>
            {text('discountPercent', 'Overall discount %', {
              type: 'number',
              size: 'small',
              slotProps: { htmlInput: { min: 0, max: 100, step: 'any' } },
              helperText: errors.discountPercent?.message ?? 'Applied to the subtotal, before tax',
            })}
            {pricing && payload ? <LinearProgress aria-label="Calculating totals" /> : <Box sx={{ height: 4 }} />}
            {calculation.error && payload && <Alert severity="error">{calculation.error.message}</Alert>}
            <TotalRow label="Subtotal" value={totals ? formatAmount(totals.subtotal) : EMPTY} />
            <TotalRow label="Discount" value={totals ? `- ${formatAmount(totals.discount)}` : EMPTY} />
            <TotalRow label="Tax" value={totals ? formatAmount(totals.tax) : EMPTY} />
            <TotalRow label="Grand total" value={totals ? formatAmount(totals.grandTotal) : EMPTY} strong />
            <Typography variant="caption" color="text.secondary">
              Calculated by the server from the current product prices and taxes; the same calculation is applied
              when you save.
            </Typography>
          </Stack>
        </Section>
      </Box>
    </Stack>
  );
}

// /quotations/new (optionally ?companyId=&opportunityId=) and /quotations/:id/edit
export default function QuotationFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: quotation, error, isPending } = useQuotation(id);

  if (!id) {
    return (
      <QuotationForm
        initial={{
          companyId: searchParams.get('companyId') ?? '',
          opportunityId: searchParams.get('opportunityId') ?? '',
        }}
      />
    );
  }
  if (isPending) return <LoadingScreen />;
  if (error) {
    return (
      <Stack spacing={2}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/quotations')} sx={{ alignSelf: 'flex-start' }}>
          Back to quotations
        </Button>
        <Alert severity="error">{error.message}</Alert>
      </Stack>
    );
  }
  if (quotation.status && ['accepted', 'rejected'].includes(quotation.status.category)) {
    return (
      <Stack spacing={2}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(`/quotations/${quotation.id}`)} sx={{ alignSelf: 'flex-start' }}>
          Back to the quotation
        </Button>
        <Alert severity="warning">
          {quotation.quotationNumber} is {quotation.status.name.toLowerCase()} and cannot be edited. Change its status
          first.
        </Alert>
      </Stack>
    );
  }

  // Keyed so the form starts from this record's values.
  return <QuotationForm key={quotation.id} quotation={quotation} />;
}
