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
import { useProjectsList } from '../../hooks/useProjects.js';
import { EMPTY, formatDate } from '../../utils/format.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import ConfigChip from '../leads/ConfigChip.jsx';
import LoadingScreen from '../LoadingScreen.jsx';
import PermissionGate from '../PermissionGate.jsx';
import ProjectDialog from './ProjectDialog.jsx';
import ProjectProgress from './ProjectProgress.jsx';

const PAGE_SIZE = 20;

// The Projects section of a company or customer page: GET /projects?companyId=...
export default function CompanyProjects({ companyId }) {
  const { can } = usePermission();
  const canRead = can(PERMISSIONS.PROJECTS_READ);
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const { data, error, isPending, refetch } = useProjectsList(
    { companyId, page, limit: PAGE_SIZE, sortBy: 'createdAt', sortOrder: 'desc' },
    { enabled: canRead }
  );

  const addButton = (
    <PermissionGate permission={PERMISSIONS.PROJECTS_CREATE}>
      <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setAdding(true)} sx={{ alignSelf: 'flex-start' }}>
        Add project
      </Button>
    </PermissionGate>
  );

  if (!canRead) {
    return (
      <Stack spacing={2}>
        {addButton}
        <Alert severity="warning">You do not have permission to view projects.</Alert>
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
      {data.projects.length === 0 ? (
        <Alert severity="info">This company has no projects yet.</Alert>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Company projects">
            <TableHead>
              <TableRow>
                <TableCell>Number</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{ minWidth: 140 }}>Progress</TableCell>
                <TableCell>Manager</TableCell>
                <TableCell>Due</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.projects.map((project) => (
                <TableRow key={project.id} hover>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{project.projectNumber}</TableCell>
                  <TableCell>
                    <Link component={RouterLink} to={`/projects/${project.id}`} underline="hover" sx={{ fontWeight: 500 }}>
                      {project.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <ConfigChip value={project.status} />
                  </TableCell>
                  <TableCell>
                    <ProjectProgress stats={project.stats} />
                  </TableCell>
                  <TableCell>{project.projectManager?.fullName ?? EMPTY}</TableCell>
                  <TableCell>{formatDate(project.expectedEndDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {data.pagination.totalPages > 1 && (
        <Pagination count={data.pagination.totalPages} page={page} onChange={(event, value) => setPage(value)} sx={{ alignSelf: 'center' }} />
      )}
      {adding && <ProjectDialog initialCompanyId={companyId} onClose={() => setAdding(false)} />}
    </Stack>
  );
}
