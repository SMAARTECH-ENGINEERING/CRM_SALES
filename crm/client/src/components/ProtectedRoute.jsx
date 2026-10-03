import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';
import LoadingScreen from './LoadingScreen.jsx';

// Layout route: renders its child routes only for a signed-in user.
export default function ProtectedRoute() {
  const { isAuthenticated, isLoading, error, retry, logout } = useAuth();
  const location = useLocation();

  if (isLoading) return <LoadingScreen />;

  // A session exists but could not be verified - don't discard it, let the user retry.
  if (error) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 3 }}>
        <Stack spacing={2} sx={{ maxWidth: 420, width: '100%' }}>
          <Alert severity="error">{error.message}</Alert>
          <Stack direction="row" spacing={1}>
            <Button variant="contained" onClick={() => retry()}>
              Try again
            </Button>
            <Button onClick={logout}>Sign out</Button>
          </Stack>
        </Stack>
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
