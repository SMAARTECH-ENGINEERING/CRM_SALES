import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { EMPTY } from '../../utils/format.js';

// A project's progress as the API reports it (done tasks out of tasks that
// count; null when there are none). Nothing is worked out here.
export default function ProjectProgress({ stats }) {
  if (stats?.progress == null) return <Typography variant="body2" color="text.secondary">{EMPTY}</Typography>;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
      <LinearProgress variant="determinate" value={stats.progress} sx={{ flexGrow: 1, height: 6, borderRadius: 3 }} aria-label="Progress" />
      <Typography variant="body2" sx={{ minWidth: 36, textAlign: 'right' }}>
        {stats.progress}%
      </Typography>
    </Box>
  );
}
