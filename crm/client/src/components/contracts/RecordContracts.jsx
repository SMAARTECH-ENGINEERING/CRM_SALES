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
import { useContractsList } from '../../hooks/useContracts.js';
import usePermission from '../../hooks/usePermission.js';
import { EMPTY, formatAmount, formatDate } from '../../utils/format.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import ConfigChip from '../leads/ConfigChip.jsx';
import LoadingScreen from '../LoadingScreen.jsx';
import PermissionGate from '../PermissionGate.jsx';
import ContractDialog from './ContractDialog.jsx';
import ContractEndChip from './ContractEndChip.jsx';

const PAGE_SIZE = 20;

// The Contracts section of a company or customer page:  <RecordContracts companyId={...} />
export default function RecordContracts({ companyId }) {
  const { can } = usePermission();
  const canRead = can(PERMISSIONS.CONTRACTS_READ);
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const { data, error, isPending, refetch } = useContractsList(
    { companyId, page, limit: PAGE_SIZE, sortBy: 'endDate', sortOrder: 'desc' },
    { enabled: canRead }
  );

  const addButton = (
    <PermissionGate permission={PERMISSIONS.CONTRACTS_CREATE}>
      <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)} sx={{ alignSelf: 'flex-start' }}>
        New contract
      </Button>
    </PermissionGate>
  );

  if (!canRead) {
    return (
      <Stack spacing={2}>
        {addButton}
        <Alert severity="warning">You do not have permission to view contracts.</Alert>
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
      {data.contracts.length === 0 ? (
        <Alert severity="info">No contracts yet.</Alert>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Contracts">
            <TableHead>
              <TableRow>
                <TableCell>Number</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Period</TableCell>
                <TableCell>Ends</TableCell>
                <TableCell align="right">Amount</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.contracts.map((contract) => (
                <TableRow key={contract.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Link component={RouterLink} to={`/contracts/${contract.id}`} underline="hover" sx={{ fontWeight: 500 }}>
                      {contract.contractNumber}
                    </Link>
                  </TableCell>
                  <TableCell>{contract.contractType?.name ?? EMPTY}</TableCell>
                  <TableCell>
                    <ConfigChip value={contract.status} />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {formatDate(contract.startDate)} – {formatDate(contract.endDate)}
                  </TableCell>
                  <TableCell>
                    <ContractEndChip contract={contract} />
                  </TableCell>
                  <TableCell align="right">{formatAmount(contract.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {data.pagination.totalPages > 1 && (
        <Pagination count={data.pagination.totalPages} page={page} onChange={(event, value) => setPage(value)} sx={{ alignSelf: 'center' }} />
      )}
      {adding && <ContractDialog initialCompanyId={companyId} onClose={() => setAdding(false)} />}
    </Stack>
  );
}
