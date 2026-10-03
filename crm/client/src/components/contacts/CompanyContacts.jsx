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
import { useContactsList } from '../../hooks/useContacts.js';
import usePermission from '../../hooks/usePermission.js';
import { EMPTY } from '../../utils/format.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import LoadingScreen from '../LoadingScreen.jsx';
import PermissionGate from '../PermissionGate.jsx';
import StatusChip from '../StatusChip.jsx';

const PAGE_SIZE = 20;

// The Contacts section of a company page: GET /contacts?companyId=...
export default function CompanyContacts({ companyId }) {
  const { can } = usePermission();
  const canRead = can(PERMISSIONS.CONTACTS_READ);
  const [page, setPage] = useState(1);
  const { data, error, isPending, refetch } = useContactsList(
    { companyId, page, limit: PAGE_SIZE, sortBy: 'firstName', sortOrder: 'asc' },
    { enabled: canRead }
  );

  const addButton = (
    <PermissionGate permission={PERMISSIONS.CONTACTS_CREATE}>
      <Button
        variant="contained"
        size="small"
        startIcon={<AddIcon />}
        component={RouterLink}
        to={`/contacts/new?companyId=${companyId}`}
        sx={{ alignSelf: 'flex-start' }}
      >
        Add contact
      </Button>
    </PermissionGate>
  );

  if (!canRead) {
    return (
      <Stack spacing={2}>
        {addButton}
        <Alert severity="warning">You do not have permission to view contacts.</Alert>
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

      {data.contacts.length === 0 ? (
        <Alert severity="info">This company has no contacts yet.</Alert>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Company contacts">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Designation</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Phone</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.contacts.map((contact) => (
                <TableRow key={contact.id} hover>
                  <TableCell>
                    <Link component={RouterLink} to={`/contacts/${contact.id}`} underline="hover" sx={{ fontWeight: 500 }}>
                      {contact.fullName}
                    </Link>
                  </TableCell>
                  <TableCell>{contact.designation || EMPTY}</TableCell>
                  <TableCell>{contact.email || EMPTY}</TableCell>
                  <TableCell>{contact.phone || EMPTY}</TableCell>
                  <TableCell>
                    <StatusChip status={contact.status} />
                  </TableCell>
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
