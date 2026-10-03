import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import LoadingScreen from '../components/LoadingScreen.jsx';
import UserDialogs, { useUserActions } from '../components/users/UserDialogs.jsx';
import UserStatusChip from '../components/users/UserStatusChip.jsx';
import { useUser } from '../hooks/useUsers.js';
import { EMPTY, formatDateTime, initials } from '../utils/format.js';

function Field({ label, children }) {
  return (
    <div>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant="body1" component="div" sx={{ wordBreak: 'break-word' }}>
        {children || EMPTY}
      </Typography>
    </div>
  );
}

export default function UserDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const actionsFor = useUserActions();
  const [dialog, setDialog] = useState(null);
  const { data: user, error, isPending, refetch } = useUser(id);

  // Returns to the list with its filters intact when we came from it.
  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/users'));

  const backButton = (
    <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ alignSelf: 'flex-start' }}>
      Back to users
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

  const allowed = actionsFor(user);
  const open = (type) => () => setDialog({ type, user });
  const active = user.status === 'active';

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
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', minWidth: 0 }}>
              <Avatar src={user.profileImage} alt="" sx={{ width: 64, height: 64 }}>
                {initials(user)}
              </Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
                    {user.fullName}
                  </Typography>
                  <UserStatusChip status={user.status} />
                </Stack>
                <Typography color="text.secondary" noWrap>
                  {[user.designation, user.department?.name].filter(Boolean).join(' · ') || user.email}
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              {allowed.edit && (
                <Button variant="contained" onClick={open('edit')}>
                  Edit
                </Button>
              )}
              {allowed.status && (
                <Button variant="outlined" color={active ? 'warning' : 'primary'} onClick={open('status')}>
                  {active ? 'Deactivate' : 'Activate'}
                </Button>
              )}
              {allowed.reset && (
                <Button variant="outlined" onClick={open('reset')}>
                  Reset password
                </Button>
              )}
              {allowed.remove && (
                <Button variant="outlined" color="error" onClick={open('delete')}>
                  Delete
                </Button>
              )}
            </Stack>
          </Stack>

          <Divider sx={{ my: 3 }} />

          <Box
            sx={{
              display: 'grid',
              gap: 3,
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' },
            }}
          >
            <Field label="First name">{user.firstName}</Field>
            <Field label="Last name">{user.lastName}</Field>
            <Field label="Email">{user.email}</Field>
            <Field label="Phone">{user.phone}</Field>
            <Field label="Role">{user.role?.name}</Field>
            <Field label="Department">{user.department?.name}</Field>
            <Field label="Designation">{user.designation}</Field>
            <Field label="Last login">{formatDateTime(user.lastLogin)}</Field>
            <Field label="Created">{formatDateTime(user.createdAt)}</Field>
            <Field label="Created by">{user.createdByUser?.fullName}</Field>
            <Field label="Last updated">{formatDateTime(user.updatedAt)}</Field>
          </Box>
        </CardContent>
      </Card>

      <UserDialogs
        dialog={dialog}
        onClose={() => setDialog(null)}
        onDeleted={() => navigate('/users', { replace: true })}
      />
    </Stack>
  );
}
