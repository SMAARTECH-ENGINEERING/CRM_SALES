import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import StatusChip from '../components/StatusChip.jsx';
import useNotify from '../hooks/useNotify.js';
import { useProduct, useProductMutations } from '../hooks/useProducts.js';
import { EMPTY, formatAmount, formatDateTime } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

function Field({ label, children }) {
  return (
    <div>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant="body1" component="div" sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
        {children || EMPTY}
      </Typography>
    </div>
  );
}

// Price including tax, and margin over cost - only where the figures exist.
function derived(product) {
  const { basePrice, costPrice, tax } = product;
  return {
    withTax: tax ? basePrice * (1 + tax.rate / 100) : null,
    margin: costPrice != null ? basePrice - costPrice : null,
    marginPercent: costPrice != null && basePrice > 0 ? ((basePrice - costPrice) / basePrice) * 100 : null,
  };
}

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { remove } = useProductMutations();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { data: product, error, isPending, refetch } = useProduct(id);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/products'));
  const backButton = (
    <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ alignSelf: 'flex-start' }}>
      Back to products
    </Button>
  );

  if (isPending) return <LoadingScreen />;

  if (error) {
    return (
      <Stack spacing={2}>
        {backButton}
        <Alert
          severity="error"
          action={
            error.status === 404 ? undefined : (
              <Button color="inherit" size="small" onClick={() => refetch()}>
                Retry
              </Button>
            )
          }
        >
          {error.message}
        </Alert>
      </Stack>
    );
  }

  const { withTax, margin, marginPercent } = derived(product);

  async function confirmDelete() {
    try {
      await remove.mutateAsync(product.id);
      notify.success(`${product.name} deleted`);
      navigate('/products', { replace: true });
    } catch (err) {
      notify.error(err.message);
      setConfirmingDelete(false);
    }
  }

  return (
    <Stack spacing={2}>
      {backButton}

      <Card>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
          >
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', minWidth: 0 }}>
              <Avatar src={product.image} alt="" variant="rounded" sx={{ width: 64, height: 64 }}>
                {product.name[0]?.toUpperCase()}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                  <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
                    {product.name}
                  </Typography>
                  <Chip size="small" label={product.sku} />
                  <StatusChip status={product.status} />
                  {product.category && <Chip size="small" variant="outlined" label={product.category.name} />}
                </Stack>
                <Typography color="text.secondary">
                  {formatAmount(product.basePrice)}
                  {product.unit ? ` per ${product.unit.symbol}` : ''}
                  {product.tax ? ` + ${product.tax.name} (${product.tax.rate}%)` : ''}
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={1}>
              <PermissionGate permission={PERMISSIONS.PRODUCTS_UPDATE}>
                <Button variant="contained" component={RouterLink} to={`/products/${product.id}/edit`}>
                  Edit
                </Button>
              </PermissionGate>
              <PermissionGate permission={PERMISSIONS.PRODUCTS_DELETE}>
                <Button variant="outlined" color="error" onClick={() => setConfirmingDelete(true)}>
                  Delete
                </Button>
              </PermissionGate>
            </Stack>
          </Stack>

          <Divider sx={{ my: 3 }} />

          <Box
            sx={{
              display: 'grid',
              gap: 3,
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' },
            }}
          >
            <Field label="SKU">{product.sku}</Field>
            <Field label="Category">{product.category?.name}</Field>
            <Field label="Unit">{product.unit && `${product.unit.name} (${product.unit.symbol})`}</Field>
            <Field label="Price (before tax)">{formatAmount(product.basePrice)}</Field>
            <Field label="Tax">{product.tax && `${product.tax.name} (${product.tax.rate}%)`}</Field>
            <Field label="Price including tax">{withTax != null && formatAmount(withTax)}</Field>
            <Field label="Cost price">{product.costPrice != null && formatAmount(product.costPrice)}</Field>
            <Field label="Margin">
              {margin != null &&
                `${formatAmount(margin)}${marginPercent != null ? ` (${formatAmount(marginPercent)}%)` : ''}`}
            </Field>
            <Field label="Organization">{product.organization?.name}</Field>
            <Field label="Created by">{product.createdByUser?.fullName}</Field>
            <Field label="Created">{formatDateTime(product.createdAt)}</Field>
            <Field label="Last updated">{formatDateTime(product.updatedAt)}</Field>
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Field label="Description">{product.description}</Field>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete product"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setConfirmingDelete(false)}
      >
        {`${product.name} (${product.sku}) will be removed from the catalogue. Its SKU cannot be used again.`}
      </ConfirmDialog>
    </Stack>
  );
}
