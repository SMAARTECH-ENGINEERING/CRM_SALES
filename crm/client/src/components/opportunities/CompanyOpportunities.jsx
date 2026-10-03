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
import { useOpportunitiesList } from '../../hooks/useOpportunities.js';
import usePermission from '../../hooks/usePermission.js';
import { EMPTY, formatAmount, formatDate } from '../../utils/format.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import ConfigChip from '../leads/ConfigChip.jsx';
import LoadingScreen from '../LoadingScreen.jsx';
import PermissionGate from '../PermissionGate.jsx';
import OpportunityStatusChip from './OpportunityStatusChip.jsx';

const PAGE_SIZE = 20;

// The Opportunities section of a company page: GET /opportunities?companyId=...
export default function CompanyOpportunities({ companyId }) {
  const { can } = usePermission();
  const canRead = can(PERMISSIONS.OPPORTUNITIES_READ);
  const [page, setPage] = useState(1);
  const { data, error, isPending, refetch } = useOpportunitiesList(
    { companyId, page, limit: PAGE_SIZE, sortBy: 'createdAt', sortOrder: 'desc' },
    { enabled: canRead }
  );

  const addButton = (
    <PermissionGate permission={PERMISSIONS.OPPORTUNITIES_CREATE}>
      <Button
        variant="contained"
        size="small"
        startIcon={<AddIcon />}
        component={RouterLink}
        to={`/opportunities/new?companyId=${companyId}`}
        sx={{ alignSelf: 'flex-start' }}
      >
        Add opportunity
      </Button>
    </PermissionGate>
  );

  if (!canRead) {
    return (
      <Stack spacing={2}>
        {addButton}
        <Alert severity="warning">You do not have permission to view opportunities.</Alert>
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

      {data.opportunities.length === 0 ? (
        <Alert severity="info">This company has no opportunities yet.</Alert>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Company opportunities">
            <TableHead>
              <TableRow>
                <TableCell>Number</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Stage</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Estimated value</TableCell>
                <TableCell>Expected close</TableCell>
                <TableCell>Assigned to</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.opportunities.map((opportunity) => (
                <TableRow key={opportunity.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{opportunity.opportunityNumber}</TableCell>
                  <TableCell>
                    <Link
                      component={RouterLink}
                      to={`/opportunities/${opportunity.id}`}
                      underline="hover"
                      sx={{ fontWeight: 500 }}
                    >
                      {opportunity.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ConfigChip value={opportunity.stage} />
                  </TableCell>
                  <TableCell>
                    <OpportunityStatusChip status={opportunity.status} />
                  </TableCell>
                  <TableCell align="right">{formatAmount(opportunity.estimatedValue)}</TableCell>
                  <TableCell>{formatDate(opportunity.expectedCloseDate)}</TableCell>
                  <TableCell>{opportunity.assignedToUser?.fullName ?? EMPTY}</TableCell>
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
