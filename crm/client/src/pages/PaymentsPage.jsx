import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import AdvancedDataTable from '../components/ui/AdvancedDataTable.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { FilterBar } from '../components/ui/FilterDrawer.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import { PAYMENT_CONFIG } from '../api/leadConfig.api.js';
import CompanySelect from '../components/companies/CompanySelect.jsx';
import ConfigChip from '../components/leads/ConfigChip.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import OverdueChip from '../components/payments/OverdueChip.jsx';
import PaymentDialog from '../components/payments/PaymentDialog.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import useListParams, { SEARCH_DEBOUNCE_MS, serverPaging, serverSorting, toApiParams } from '../hooks/useListParams.js';
import { usePaymentsList, usePaymentStats } from '../hooks/usePayments.js';
import { EMPTY, formatAmount, formatDate } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const FILTER_KEYS = ['state', 'paymentMethodId', 'companyId'];
const centered = { display: 'flex', alignItems: 'center', height: '100%', gap: 1 };

// The four filters. Each card shows the API's count and sum for that state;
// "overdue" is worked out by the API (not paid in full and past the due date).
const STATES = [
  { value: 'paid', label: 'Paid', figure: (stats) => stats.byCategory.paid, sum: 'paid', color: 'success.main' },
  { value: 'partially_paid', label: 'Partially paid', figure: (stats) => stats.byCategory.partially_paid, sum: 'remaining', color: 'info.main' },
  { value: 'unpaid', label: 'Unpaid', figure: (stats) => stats.byCategory.unpaid, sum: 'remaining', color: 'warning.main' },
  { value: 'overdue', label: 'Overdue', figure: (stats) => stats.overdue, sum: 'remaining', color: 'error.main' },
];
const SUM_CAPTION = { paid: 'received', remaining: 'outstanding' };

export default function PaymentsPage() {
  const { t } = useTranslation();
  const [params, updateParams] = useListParams(FILTER_KEYS);
  const [searchInput, setSearchInput] = useState(params.search);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const value = searchInput.trim();
    if (value === params.search) return undefined;
    const timer = setTimeout(() => updateParams({ search: value }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const apiParams = useMemo(() => toApiParams(params), [JSON.stringify(params)]);
  const { data, error, isFetching, refetch } = usePaymentsList(apiParams);
  const stats = usePaymentStats(params.companyId ? { companyId: params.companyId } : {});

  const columns = useMemo(
    () => [
      {
        field: 'invoiceNumber',
        headerName: t('fields.invoice'),
        width: 140,
        renderCell: ({ row }) => (
          <Link component={RouterLink} to={`/payments/${row.id}`} underline="hover" sx={{ fontWeight: 500 }}>
            {row.invoiceNumber}
          </Link>
        ),
      },
      { field: 'company', headerName: t('fields.company'), flex: 1.2, minWidth: 170, sortable: false, valueGetter: (value) => value?.name ?? EMPTY },
      { field: 'order', headerName: t('fields.order'), width: 120, sortable: false, valueGetter: (value) => value?.orderNumber ?? EMPTY },
      {
        field: 'status',
        headerName: t('fields.status'),
        width: 270,
        sortable: false,
        renderCell: ({ row }) => (
          <Box sx={centered}>
            {row.status ? <ConfigChip value={row.status} /> : EMPTY}
            <OverdueChip payment={row} />
          </Box>
        ),
      },
      { field: 'amount', headerName: t('fields.amount'), width: 120, align: 'right', headerAlign: 'right', valueFormatter: (value) => formatAmount(value) },
      { field: 'paidAmount', headerName: t('fields.paid'), width: 120, align: 'right', headerAlign: 'right', valueFormatter: (value) => formatAmount(value) },
      {
        field: 'remainingAmount',
        headerName: t('fields.remaining'),
        width: 120,
        align: 'right',
        headerAlign: 'right',
        valueFormatter: (value) => formatAmount(value),
      },
      { field: 'dueDate', headerName: t('fields.due'), width: 115, valueFormatter: (value) => (value ? formatDate(value) : EMPTY) },
      { field: 'paymentDate', headerName: t('fields.paidOn'), width: 115, valueFormatter: (value) => (value ? formatDate(value) : EMPTY) },
      { field: 'paymentMethod', headerName: t('fields.method'), width: 130, sortable: false, valueGetter: (value) => value?.name ?? EMPTY },
    ],
    []
  );

  const hasFilters = Boolean(params.search || FILTER_KEYS.some((key) => params[key]));
  const filterSx = { flex: 1, minWidth: 170 };

  return (
    <Stack spacing={2}>
      <PageHeader
        title={t('pages.payments.title')}
        subtitle={stats.data ? `Outstanding ${formatAmount(stats.data.totals.outstanding)} of ${formatAmount(stats.data.totals.amount)} invoiced` : t('pages.payments.subtitle')}
        actions={
          <PermissionGate permission={PERMISSIONS.PAYMENTS_CREATE}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
              {t('pages.payments.new')}
            </Button>
          </PermissionGate>
        }
      />

      {/* Paid / Partially paid / Unpaid / Overdue: figures from the API; a click filters the list. */}
      {stats.data && (
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }} role="group" aria-label="Payment filters">
          {STATES.map((state) => {
            const figure = state.figure(stats.data);
            const selected = params.state === state.value;
            return (
              <Card key={state.value} variant="outlined" sx={{ borderColor: selected ? 'primary.main' : 'divider', borderWidth: selected ? 2 : 1 }}>
                <CardActionArea
                  aria-pressed={selected}
                  aria-label={`${state.label}: ${figure.count}`}
                  onClick={() => updateParams({ state: selected ? '' : state.value })}
                >
                  <CardContent>
                    <Typography variant="body2" sx={{ color: state.color, fontWeight: 600 }}>
                      {state.label}
                    </Typography>
                    <Typography variant="h5" component="p" sx={{ fontWeight: 600 }}>
                      {figure.count}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatAmount(figure[state.sum])} {SUM_CAPTION[state.sum]}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            );
          })}
        </Box>
      )}

      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              {t('actions.retry')}
            </Button>
          }
        >
          {error.message}
        </Alert>
      )}

      <AdvancedDataTable
        tableId="payments"
        height="calc(100vh - 320px)"
        rowHref={(row) => `/payments/${row.id}`}
        toolbar={
          <FilterBar activeCount={FILTER_KEYS.filter((key) => params[key]).length}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
              <TextField
                label={t('fields.search')}
                placeholder="Invoice number or notes"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{ flex: 2 }}
              />
              <CompanySelect label={t('fields.company')} value={params.companyId} onChange={(companyId) => updateParams({ companyId })} sx={filterSx} />
              <LeadConfigSelect
                list={PAYMENT_CONFIG.METHODS}
                label={t('fields.method')}
                emptyLabel={t('fields.allMethods')}
                value={params.paymentMethodId}
                onChange={(paymentMethodId) => updateParams({ paymentMethodId })}
                sx={filterSx}
              />
              <Button
                disabled={!hasFilters && !searchInput}
                onClick={() => {
                  setSearchInput('');
                  updateParams({ search: '', state: '', paymentMethodId: '', companyId: '' });
                }}
                sx={{ flexShrink: 0 }}
              >
                {t('actions.clear')}
              </Button>
            </Stack>
          </FilterBar>
        }
        rows={data?.payments ?? []}
        columns={columns}
        loading={isFetching}
        {...serverPaging(params, updateParams, data?.pagination)}
        {...serverSorting(params, updateParams)}
        emptyState={<EmptyState dense filtered={hasFilters} />}
      />

      {adding && <PaymentDialog onClose={() => setAdding(false)} />}
    </Stack>
  );
}
