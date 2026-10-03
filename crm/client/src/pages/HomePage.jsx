import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ApiStatusCard from '../components/ApiStatusCard.jsx';
import env from '../utils/env.js';

export default function HomePage() {
  return (
    <Stack spacing={3} sx={{ maxWidth: 560 }}>
      <div>
        <Typography variant="h4" component="h1" gutterBottom>
          {env.appName}
        </Typography>
        <Typography color="text.secondary">
          The foundation is in place. Business modules are added on top of this shell.
        </Typography>
      </div>
      <ApiStatusCard />
    </Stack>
  );
}
