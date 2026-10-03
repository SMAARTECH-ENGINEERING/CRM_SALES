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
import { useLeadsList } from '../../hooks/useLeads.js';
import usePermission from '../../hooks/usePermission.js';
import { EMPTY, formatAmount, formatDate } from '../../utils/format.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import LoadingScreen from '../LoadingScreen.jsx';
import PermissionGate from '../PermissionGate.jsx';
import ConfigChip from './ConfigChip.jsx';

const PAGE_SIZE = 20;

// The Leads section of a company page: GET /leads?companyId=...
export default function CompanyLeads({ companyId }) {
  const { can } = usePermission();
  const canRead = can(PERMISSIONS.LEADS_READ);
  const [page, setPage] = useState(1);
  const { data, error, isPending, refetch } = useLeadsList(
    { companyId, page, limit: PAGE_SIZE, sortBy: 'createdAt', sortOrder: 'desc' },
    { enabled: canRead }
  );

  const addButton = (
    <PermissionGate permission={PERMISSIONS.LEADS_CREATE}>
      <Button
        variant="contained"
        size="small"
        startIcon={<AddIcon />}
        component={RouterLink}
        to={`/leads/new?companyId=${companyId}`}
        sx={{ alignSelf: 'flex-start' }}
      >
        Add lead
      </Button>
    </PermissionGate>
  );

  if (!canRead) {
    return (
      <Stack spacing={2}>
        {addButton}
        <Alert severity="warning">You do not have permission to view leads.</Alert>
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

      {data.leads.length === 0 ? (
        <Alert severity="info">This company has no leads yet.</Alert>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Company leads">
            <TableHead>
              <TableRow>
                <TableCell>Number</TableCell>
                <TableCell>Title</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Estimated value</TableCell>
                <TableCell>Expected close</TableCell>
                <TableCell>Assigned to</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.leads.map((lead) => (
                <TableRow key={lead.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{lead.leadNumber}</TableCell>
                  <TableCell>
                    <Link component={RouterLink} to={`/leads/${lead.id}`} underline="hover" sx={{ fontWeight: 500 }}>
                      {lead.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ConfigChip value={lead.status} />
                  </TableCell>
                  <TableCell align="right">{formatAmount(lead.estimatedValue)}</TableCell>
                  <TableCell>{formatDate(lead.expectedCloseDate)}</TableCell>
                  <TableCell>{lead.assignedToUser?.fullName ?? EMPTY}</TableCell>
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
