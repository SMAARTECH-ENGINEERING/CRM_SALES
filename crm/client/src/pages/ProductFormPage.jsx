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
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';
import * as yup from 'yup';
import { CATALOG_CONFIG } from '../api/leadConfig.api.js';
import { MASTER_DATA } from '../api/masterData.api.js';
import { checkSku } from '../api/products.api.js';
import MasterDataSelect from '../components/companies/MasterDataSelect.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import { STATUS_OPTIONS } from '../components/StatusChip.jsx';
import useNotify from '../hooks/useNotify.js';
import { useProduct, useProductMutations } from '../hooks/useProducts.js';
import { applyApiErrors } from '../utils/validation.js';

const FIELDS = [
  'sku',
  'name',
  'description',
  'categoryId',
  'unitId',
  'basePrice',
  'costPrice',
  'taxId',
  'status',
  'image',
  'organizationId',
];

const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,39}$/;
const SKU_RULE = '2-40 characters: letters, digits, dot, dash or underscore, starting with a letter or digit';

const money = (message) =>
  yup
    .number()
    .transform((value, original) => (original === '' ? undefined : value))
    .typeError('Enter a number')
    .min(0, message);

// Same rules as the API (server/src/validators/product.validator.js).
const schema = yup.object({
  sku: yup
    .string()
    .transform((value) => (value ?? '').trim().toUpperCase())
    .test('format', SKU_RULE, (v) => !v || SKU_PATTERN.test(v)),
  name: yup.string().trim().required('Name is required').min(2, 'Must be at least 2 characters').max(200),
  description: yup.string().trim().max(5000),
  basePrice: money('Must be 0 or more').required('Price is required'),
  costPrice: money('Must be 0 or more'),
  status: yup.string().required(),
  image: yup
    .string()
    .trim()
    .max(2048)
    .test('url', 'Must start with http:// or https://', (v) => !v || /^https?:\/\/\S+$/.test(v)),
  categoryId: yup.string(),
  unitId: yup.string(),
  taxId: yup.string(),
  organizationId: yup.string(),
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

function ProductForm({ product }) {
  const isCreate = !product;
  const navigate = useNavigate();
  const notify = useNotify();
  const { create, update } = useProductMutations();
  // What the API says about a hand-entered SKU: null | { sku, available }
  const [skuCheck, setSkuCheck] = useState(null);

  const {
    control,
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      sku: product?.sku ?? '',
      name: product?.name ?? '',
      description: product?.description ?? '',
      categoryId: product?.categoryId ?? '',
      unitId: product?.unitId ?? '',
      basePrice: product?.basePrice ?? '',
      costPrice: product?.costPrice ?? '',
      taxId: product?.taxId ?? '',
      status: product?.status ?? 'active',
      image: product?.image ?? '',
      organizationId: product?.organizationId ?? '',
    },
  });

  const cancel = () => navigate(isCreate ? '/products' : `/products/${product.id}`);

  // On leaving the field, ask the API whether a hand-entered SKU is free.
  async function verifySku() {
    const value = getValues('sku').trim().toUpperCase();
    if (!value || !SKU_PATTERN.test(value)) {
      setSkuCheck(null);
      return;
    }
    try {
      const response = await checkSku(value);
      setSkuCheck(response.data);
    } catch {
      // Not being able to check is not an error to the user: saving checks again.
      setSkuCheck(null);
    }
  }

  async function onSubmit(values) {
    const data = {
      name: values.name,
      description: values.description,
      categoryId: values.categoryId || null,
      unitId: values.unitId || null,
      taxId: values.taxId || null,
      organizationId: values.organizationId || null,
      basePrice: values.basePrice,
      costPrice: values.costPrice ?? null,
      status: values.status,
      image: values.image,
    };
    // The SKU is set once, on create: blank asks the server to generate it.
    if (isCreate && values.sku) data.sku = values.sku;

    try {
      const response = isCreate
        ? await create.mutateAsync(data)
        : await update.mutateAsync({ id: product.id, data });
      const saved = response.data.product;
      notify.success(isCreate ? `${saved.name} created as ${saved.sku}` : 'Product updated');
      navigate(`/products/${saved.id}`, { replace: true });
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

  // Category, unit and tax options are the configured values, from the API.
  const catalogSelect = (name, label, list, current, optionLabel) => (
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
          optionLabel={optionLabel}
          error={errors[name]}
          helperText={errors[name]?.message}
        />
      )}
    />
  );

  let skuHelp = 'Leave blank to generate one automatically';
  if (errors.sku) skuHelp = errors.sku.message;
  else if (skuCheck) skuHelp = skuCheck.available ? `${skuCheck.sku} is available` : `${skuCheck.sku} is already in use`;
  const skuField = register('sku');

  return (
    <Stack component="form" spacing={2} noValidate onSubmit={handleSubmit(onSubmit)}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Typography variant="h4" component="h1">
            {isCreate ? 'New product' : 'Edit product'}
          </Typography>
          {!isCreate && <Chip label={product.sku} />}
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button onClick={cancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isSubmitting}>
            {isCreate ? 'Create product' : 'Save changes'}
          </Button>
        </Stack>
      </Stack>

      {errors.root && <Alert severity="error">{errors.root.message}</Alert>}
      {Object.keys(errors).some((key) => key !== 'root') && (
        <Alert severity="error">Some fields need attention. They are marked below.</Alert>
      )}

      <Section title="Product">
        {text('name', 'Name', { required: true, autoFocus: isCreate })}
        {isCreate ? (
          <TextField
            label="SKU"
            error={Boolean(errors.sku) || skuCheck?.available === false}
            helperText={skuHelp}
            slotProps={{ htmlInput: { style: { textTransform: 'uppercase' } } }}
            {...skuField}
            onChange={(event) => {
              setSkuCheck(null);
              skuField.onChange(event);
            }}
            onBlur={(event) => {
              skuField.onBlur(event);
              verifySku();
            }}
          />
        ) : (
          <TextField label="SKU" value={product.sku} disabled helperText="The SKU cannot be changed" />
        )}
        {text('description', 'Description', { multiline: true, minRows: 2, sx: FULL_WIDTH })}
        {catalogSelect('categoryId', 'Category', CATALOG_CONFIG.CATEGORIES, product?.category)}
        {catalogSelect('unitId', 'Unit', CATALOG_CONFIG.UNITS, product?.unit, (unit) => `${unit.name} (${unit.symbol})`)}
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
        <MasterDataSelect
          control={control}
          name="organizationId"
          label="Organization"
          resource={MASTER_DATA.ORGANIZATIONS}
          current={product?.organization}
          error={errors.organizationId}
        />
      </Section>

      <Section title="Pricing">
        {text('basePrice', 'Price', {
          type: 'number',
          required: true,
          helperText: errors.basePrice?.message ?? 'Selling price before tax',
          slotProps: { htmlInput: { min: 0, step: 'any' } },
        })}
        {text('costPrice', 'Cost price', {
          type: 'number',
          helperText: errors.costPrice?.message ?? 'What it costs you (optional)',
          slotProps: { htmlInput: { min: 0, step: 'any' } },
        })}
        {catalogSelect('taxId', 'Tax', CATALOG_CONFIG.TAXES, product?.tax, (tax) => `${tax.name} (${tax.rate}%)`)}
      </Section>

      <Section title="Image">
        {text('image', 'Image URL', { type: 'url', placeholder: 'https://', sx: FULL_WIDTH })}
      </Section>
    </Stack>
  );
}

// /products/new and /products/:id/edit
export default function ProductFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: product, error, isPending } = useProduct(id);

  if (!id) return <ProductForm />;
  if (isPending) return <LoadingScreen />;
  if (error) {
    return (
      <Stack spacing={2}>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/products')} sx={{ alignSelf: 'flex-start' }}>
          Back to products
        </Button>
        <Alert severity="error">{error.message}</Alert>
      </Stack>
    );
  }

  // Keyed so the form starts from this record's values.
  return <ProductForm key={product.id} product={product} />;
}
