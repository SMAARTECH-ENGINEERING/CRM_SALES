import AddIcon from '@mui/icons-material/Add';
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
import usePermission from '../../hooks/usePermission.js';
import { useQuotationsList } from '../../hooks/useQuotations.js';
import { EMPTY, formatAmount, formatDate } from '../../utils/format.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import ConfigChip from '../leads/ConfigChip.jsx';
import LoadingScreen from '../LoadingScreen.jsx';
import PermissionGate from '../PermissionGate.jsx';

const PAGE_SIZE = 20;

// The Quotations section of a company page: GET /quotations?companyId=...
export default function CompanyQuotations({ companyId }) {
  const { can } = usePermission();
  const canRead = can(PERMISSIONS.QUOTATIONS_READ);
  const [page, setPage] = useState(1);
  const { data, error, isPending, refetch } = useQuotationsList(
    { companyId, page, limit: PAGE_SIZE, sortBy: 'createdAt', sortOrder: 'desc' },
    { enabled: canRead }
  );

  const addButton = (
    <PermissionGate permission={PERMISSIONS.QUOTATIONS_CREATE}>
      <Button
        variant="contained"
        size="small"
        startIcon={<AddIcon />}
        component={RouterLink}
        to={`/quotations/new?companyId=${companyId}`}
        sx={{ alignSelf: 'flex-start' }}
      >
        Add quotation
      </Button>
    </PermissionGate>
  );

  if (!canRead) {
    return (
      <Stack spacing={2}>
        {addButton}
        <Alert severity="warning">You do not have permission to view quotations.</Alert>
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

      {data.quotations.length === 0 ? (
        <Alert severity="info">This company has no quotations yet.</Alert>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Company quotations">
            <TableHead>
              <TableRow>
                <TableCell>Number</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Valid until</TableCell>
                <TableCell>Contact</TableCell>
                <TableCell align="right">Grand total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.quotations.map((quotation) => (
                <TableRow key={quotation.id} hover>
                  <TableCell>
                    <Link component={RouterLink} to={`/quotations/${quotation.id}`} underline="hover" sx={{ fontWeight: 500 }}>
                      {quotation.quotationNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ConfigChip value={quotation.status} />
                  </TableCell>
                  <TableCell>{formatDate(quotation.quotationDate)}</TableCell>
                  <TableCell>{formatDate(quotation.validUntil)}</TableCell>
                  <TableCell>{quotation.contact?.fullName ?? EMPTY}</TableCell>
                  <TableCell align="right">{formatAmount(quotation.grandTotal)}</TableCell>
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
