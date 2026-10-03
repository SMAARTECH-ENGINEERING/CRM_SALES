import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LoadingScreen from '../components/LoadingScreen.jsx';
import PermissionMatrix from '../components/roles/PermissionMatrix.jsx';
import RoleDialogs from '../components/roles/RoleDialogs.jsx';
import UserStatusChip from '../components/users/UserStatusChip.jsx';
import useNotify from '../hooks/useNotify.js';
import usePermission from '../hooks/usePermission.js';
import { usePermissionCatalogue, useRole, useRoleActions, useRoleMutations } from '../hooks/useRoles.js';

const sameSet = (a, b) => a.size === b.size && [...a].every((key) => b.has(key));

export default function RoleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const actionsFor = useRoleActions();
  const { setPermissions } = useRoleMutations();
  const [dialog, setDialog] = useState(null);

  const { data: role, error, isPending, refetch } = useRole(id);
  const catalogue = usePermissionCatalogue();

  // What the server has, and what is ticked on screen.
  const saved = useMemo(() => new Set((role?.permissions ?? []).map((p) => p.key)), [role]);
  const [selected, setSelected] = useState(saved);
  useEffect(() => setSelected(saved), [saved]);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/roles'));
  const backButton = (
    <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ alignSelf: 'flex-start' }}>
      Back to roles
    </Button>
  );

  if (isPending) return <LoadingScreen />;

  if (error) {
    return (
      <Stack spacing={2}>
        {backButton}
        <Alert
          severity="error"
          action={
            error.status === 404 ? undefined : (
              <Button color="inherit" size="small" onClick={() => refetch()}>
                Retry
              </Button>
            )
          }
        >
          {error.message}
        </Alert>
      </Stack>
    );
  }

  const allowed = actionsFor(role);
  const dirty = !sameSet(selected, saved);

  async function savePermissions() {
    try {
      await setPermissions.mutateAsync({ id: role.id, permissions: [...selected] });
      notify.success('Permissions updated');
    } catch (err) {
      notify.error(err.message);
    }
  }

  // A full-access role is shown with everything ticked.
  const shown = role.isSuperAdmin ? new Set((catalogue.data ?? []).map((p) => p.key)) : selected;

  return (
    <Stack spacing={2}>
      {backButton}

      <Card>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
          >
            <div>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
                  {role.name}
                </Typography>
                <UserStatusChip status={role.status} />
                {role.isSystem && <Chip size="small" label="System" />}
                {role.isDefault && <Chip size="small" variant="outlined" label="Default for new users" />}
              </Stack>
              <Typography color="text.secondary">
                {role.description || 'No description'} · {role.userCount} user{role.userCount === 1 ? '' : 's'}
              </Typography>
            </div>

            <Stack direction="row" spacing={1}>
              {allowed.edit && (
                <Button variant="contained" onClick={() => setDialog({ type: 'edit', role })}>
                  Edit
                </Button>
              )}
              {allowed.remove && (
                <Button variant="outlined" color="error" onClick={() => setDialog({ type: 'delete', role })}>
                  Delete
                </Button>
              )}
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Stack
              direction="row"
              spacing={2}
              sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 1 }}
            >
              <Typography variant="h6">Permissions</Typography>
              {allowed.assignPermissions && (
                <Stack direction="row" spacing={1}>
                  <Button disabled={!dirty || setPermissions.isPending} onClick={() => setSelected(saved)}>
                    Discard
                  </Button>
                  <Button
                    variant="contained"
                    disabled={!dirty}
                    loading={setPermissions.isPending}
                    onClick={savePermissions}
                  >
                    Save permissions
                  </Button>
                </Stack>
              )}
            </Stack>

            {role.isSuperAdmin && (
              <Alert severity="info">
                This role has full access: it holds every permission, including ones added in the
                future, and its permissions cannot be edited.
              </Alert>
            )}
            {role.status !== 'active' && (
              <Alert severity="warning">This role is inactive, so it currently grants nothing.</Alert>
            )}

            {catalogue.isPending && <LoadingScreen />}
            {catalogue.error && <Alert severity="error">{catalogue.error.message}</Alert>}
            {catalogue.data && (
              <PermissionMatrix
                catalogue={catalogue.data}
                selected={shown}
                onChange={setSelected}
                readOnly={!allowed.assignPermissions}
                // A permission can only be granted (or taken away) by someone who holds it.
                canGrant={can}
              />
            )}
          </Stack>
        </CardContent>
      </Card>

      <RoleDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        onDeleted={() => navigate('/roles', { replace: true })}
      />
    </Stack>
  );
}
