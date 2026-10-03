import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import LoadingScreen from '../components/LoadingScreen.jsx';
import { groupByModule } from '../components/roles/PermissionMatrix.jsx';
import { usePermissionCatalogue } from '../hooks/useRoles.js';
import { EMPTY } from '../utils/format.js';

// Read-only view of every permission that exists. Permissions are granted to
// roles on a role's page.
export default function PermissionsPage() {
  const { data, error, isPending, refetch } = usePermissionCatalogue();
  const [search, setSearch] = useState('');

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = (data ?? []).filter(
      (p) => !term || `${p.key} ${p.description ?? ''}`.toLowerCase().includes(term)
    );
    return groupByModule(matches);
  }, [data, search]);

  return (
    <Stack spacing={2}>
      <div>
        <Typography variant="h4" component="h1">
          Permissions
        </Typography>
        <Typography color="text.secondary">
          Everything a role can be allowed to do. Grant these to roles from the Roles screen.
        </Typography>
      </div>

      <TextField
        label="Search"
        placeholder="Key or description"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
        sx={{ maxWidth: 420 }}
      />

      {isPending && <LoadingScreen />}
      {error && (
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
      )}
      {data && groups.length === 0 && <Alert severity="info">No permissions match your search.</Alert>}

      {groups.map(([module, permissions]) => (
        <TableContainer key={module} component={Paper} variant="outlined">
          <Table size="small" aria-label={`${module} permissions`}>
            <TableHead>
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>
                    {module}
                  </Typography>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ width: '30%' }}>Key</TableCell>
                <TableCell sx={{ width: '20%' }}>Action</TableCell>
                <TableCell>Description</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {permissions.map((permission) => (
                <TableRow key={permission.key}>
                  <TableCell sx={{ fontFamily: 'monospace' }}>{permission.key}</TableCell>
                  <TableCell>{permission.action}</TableCell>
                  <TableCell>{permission.description || EMPTY}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ))}
    </Stack>
  );
}
