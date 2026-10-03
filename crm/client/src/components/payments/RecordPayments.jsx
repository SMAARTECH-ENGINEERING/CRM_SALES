import AddIcon from '@mui/icons-material/Add';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Pagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { usePaymentsList, usePaymentStats } from '../../hooks/usePayments.js';
import usePermission from '../../hooks/usePermission.js';
import { EMPTY, formatAmount, formatDate } from '../../utils/format.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import ConfigChip from '../leads/ConfigChip.jsx';
import LoadingScreen from '../LoadingScreen.jsx';
import PermissionGate from '../PermissionGate.jsx';
import OverdueChip from './OverdueChip.jsx';
import PaymentDialog from './PaymentDialog.jsx';
import ReceivePaymentDialog from './ReceivePaymentDialog.jsx';

const PAGE_SIZE = 20;

// The Payments section of a company, customer or order page:
//   <RecordPayments filter={{ companyId }} />   <RecordPayments filter={{ companyId, orderId }} />
// Every figure shown comes from the API.
export default function RecordPayments({ filter }) {
  const { can } = usePermission();
  const canRead = can(PERMISSIONS.PAYMENTS_READ);
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [receiving, setReceiving] = useState(null);
  const scope = filter.orderId ? { orderId: filter.orderId } : { companyId: filter.companyId };
  const { data, error, isPending, refetch } = usePaymentsList(
    { ...scope, page, limit: PAGE_SIZE, sortBy: 'createdAt', sortOrder: 'desc' },
    { enabled: canRead }
  );
  const stats = usePaymentStats(scope, { enabled: canRead });

  const addButton = (
    <PermissionGate permission={PERMISSIONS.PAYMENTS_CREATE}>
      <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)} sx={{ alignSelf: 'flex-start' }}>
        New payment
      </Button>
    </PermissionGate>
  );

  if (!canRead) {
    return (
      <Stack spacing={2}>
        {addButton}
        <Alert severity="warning">You do not have permission to view payments.</Alert>
      </Stack>
    );
  }
  if (isPending) return <LoadingScreen />;
  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }
      >
        {error.message}
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      {addButton}
      {stats.data && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }} aria-label="Payment totals">
          {stats.data.order && (
            <>
              <Chip variant="outlined" label={`Order total: ${formatAmount(stats.data.order.grandTotal)}`} />
              <Chip variant="outlined" label={`Still to invoice: ${formatAmount(stats.data.order.toInvoice)}`} />
            </>
          )}
          <Chip variant="outlined" label={`Invoiced: ${formatAmount(stats.data.totals.amount)}`} />
          <Chip variant="outlined" color="success" label={`Received: ${formatAmount(stats.data.totals.paid)}`} />
          <Chip variant="outlined" color="warning" label={`Outstanding: ${formatAmount(stats.data.totals.outstanding)}`} />
          {stats.data.overdue.count > 0 && (
            <Chip color="error" label={`Overdue: ${formatAmount(stats.data.overdue.remaining)} (${stats.data.overdue.count})`} />
          )}
        </Stack>
      )}
      {data.payments.length === 0 ? (
        <Alert severity="info">No payments yet.</Alert>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Payments">
            <TableHead>
              <TableRow>
                <TableCell>Invoice</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell align="right">Remaining</TableCell>
                <TableCell>Due</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {data.payments.map((payment) => (
                <TableRow key={payment.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Link component={RouterLink} to={`/payments/${payment.id}`} underline="hover" sx={{ fontWeight: 500 }}>
                      {payment.invoiceNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      <ConfigChip value={payment.status} />
                      <OverdueChip payment={payment} />
                    </Stack>
                  </TableCell>
                  <TableCell align="right">{formatAmount(payment.amount)}</TableCell>
                  <TableCell align="right">{formatAmount(payment.paidAmount)}</TableCell>
                  <TableCell align="right">{formatAmount(payment.remainingAmount)}</TableCell>
                  <TableCell>{payment.dueDate ? formatDate(payment.dueDate) : EMPTY}</TableCell>
                  <TableCell align="right">
                    {can(PERMISSIONS.PAYMENTS_UPDATE) && payment.remainingAmount > 0 && payment.status?.category !== 'cancelled' && (
                      <Button size="small" onClick={() => setReceiving(payment)}>
                        Record payment
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {data.pagination.totalPages > 1 && (
        <Pagination count={data.pagination.totalPages} page={page} onChange={(event, value) => setPage(value)} sx={{ alignSelf: 'center' }} />
      )}
      {adding && <PaymentDialog initial={filter} onClose={() => setAdding(false)} />}
      {receiving && <ReceivePaymentDialog payment={receiving} onClose={() => setReceiving(null)} />}
    </Stack>
  );
}
