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
import { useTicketsList } from '../../hooks/useTickets.js';
import { formatDateTime } from '../../utils/format.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import ConfigChip from '../leads/ConfigChip.jsx';
import LoadingScreen from '../LoadingScreen.jsx';
import PermissionGate from '../PermissionGate.jsx';
import TicketDialog from './TicketDialog.jsx';

const PAGE_SIZE = 20;

// The Tickets section of a company, customer or project page:
//   <RecordTickets filter={{ companyId }} />   <RecordTickets filter={{ projectId }} companyId={...} />
export default function RecordTickets({ filter, companyId }) {
  const { can } = usePermission();
  const canRead = can(PERMISSIONS.TICKETS_READ);
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const { data, error, isPending, refetch } = useTicketsList(
    { ...filter, page, limit: PAGE_SIZE, sortBy: 'lastActivityAt', sortOrder: 'desc' },
    { enabled: canRead }
  );

  const addButton = (
    <PermissionGate permission={PERMISSIONS.TICKETS_CREATE}>
      <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)} sx={{ alignSelf: 'flex-start' }}>
        New ticket
      </Button>
    </PermissionGate>
  );

  if (!canRead) {
    return (
      <Stack spacing={2}>
        {addButton}
        <Alert severity="warning">You do not have permission to view tickets.</Alert>
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
      {data.tickets.length === 0 ? (
        <Alert severity="info">No tickets yet.</Alert>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Tickets">
            <TableHead>
              <TableRow>
                <TableCell>Number</TableCell>
                <TableCell>Subject</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Priority</TableCell>
                <TableCell>Assigned to</TableCell>
                <TableCell>Last activity</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.tickets.map((ticket) => (
                <TableRow key={ticket.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{ticket.ticketNumber}</TableCell>
                  <TableCell>
                    <Link component={RouterLink} to={`/tickets/${ticket.id}`} underline="hover" sx={{ fontWeight: 500 }}>
                      {ticket.subject}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ConfigChip value={ticket.status} />
                  </TableCell>
                  <TableCell>
                    <ConfigChip value={ticket.priority} />
                  </TableCell>
                  <TableCell>{ticket.assignedToUser?.fullName ?? 'Unassigned'}</TableCell>
                  <TableCell>{formatDateTime(ticket.lastActivityAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {data.pagination.totalPages > 1 && (
        <Pagination count={data.pagination.totalPages} page={page} onChange={(event, value) => setPage(value)} sx={{ alignSelf: 'center' }} />
      )}
      {adding && (
        <TicketDialog initial={{ companyId: companyId ?? filter.companyId, projectId: filter.projectId }} onClose={() => setAdding(false)} />
      )}
    </Stack>
  );
}
