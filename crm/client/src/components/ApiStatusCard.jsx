import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import useHealth from '../hooks/useHealth.js';
import env from '../utils/env.js';

// Live view of GET /health - proves the client/API wiring end to end.
export default function ApiStatusCard() {
  const { data, error, isPending, isFetching, refetch } = useHealth();

  return (
    <Card>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="h6">API status</Typography>
            {isPending ? (
              <Skeleton variant="rounded" width={88} height={24} />
            ) : (
              <Chip
                size="small"
                color={error ? 'error' : 'success'}
                label={error ? 'Unavailable' : 'Connected'}
              />
            )}
          </Stack>

          <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-all' }}>
            {env.apiBaseUrl}
          </Typography>

          {isPending && <Skeleton variant="text" width="60%" />}
          {data && <Alert severity="success">{data.message}</Alert>}
          {error && <Alert severity="error">{error.message}</Alert>}

          <div>
            <Button variant="outlined" size="small" onClick={() => refetch()} loading={isFetching}>
              Check again
            </Button>
          </div>
        </Stack>
      </CardContent>
    </Card>
  );
}
