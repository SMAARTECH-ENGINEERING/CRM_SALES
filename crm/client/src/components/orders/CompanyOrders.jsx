import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
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
import { useOrdersList } from '../../hooks/useOrders.js';
import usePermission from '../../hooks/usePermission.js';
import { EMPTY, formatAmount, formatDate } from '../../utils/format.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import ConfigChip from '../leads/ConfigChip.jsx';
import LoadingScreen from '../LoadingScreen.jsx';

const PAGE_SIZE = 20;

// The Orders section of a company page: GET /orders?companyId=...
export default function CompanyOrders({ companyId }) {
  const { can } = usePermission();
  const canRead = can(PERMISSIONS.ORDERS_READ);
  const [page, setPage] = useState(1);
  const { data, error, isPending, refetch } = useOrdersList(
    { companyId, page, limit: PAGE_SIZE, sortBy: 'createdAt', sortOrder: 'desc' },
    { enabled: canRead }
  );

  if (!canRead) return <Alert severity="warning">You do not have permission to view orders.</Alert>;
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
      {data.orders.length === 0 ? (
        <Alert severity="info">
          This company has no orders yet. Orders are created from an accepted quotation.
        </Alert>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Company orders">
            <TableHead>
              <TableRow>
                <TableCell>Number</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Order date</TableCell>
                <TableCell>Delivery</TableCell>
                <TableCell>Quotation</TableCell>
                <TableCell align="right">Grand total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.orders.map((order) => (
                <TableRow key={order.id} hover>
                  <TableCell>
                    <Link component={RouterLink} to={`/orders/${order.id}`} underline="hover" sx={{ fontWeight: 500 }}>
                      {order.orderNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ConfigChip value={order.status} />
                  </TableCell>
                  <TableCell>{formatDate(order.orderDate)}</TableCell>
                  <TableCell>{formatDate(order.deliveryDate)}</TableCell>
                  <TableCell>{order.quotation?.quotationNumber ?? EMPTY}</TableCell>
                  <TableCell align="right">{formatAmount(order.grandTotal)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {data.pagination.totalPages > 1 && (
        <Pagination
          count={data.pagination.totalPages}
          page={page}
          onChange={(event, value) => setPage(value)}
          sx={{ alignSelf: 'center' }}
        />
      )}
    </Stack>
  );
}
