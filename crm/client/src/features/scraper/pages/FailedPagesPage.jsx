import Stack from '@mui/material/Stack';
import PagesTable from '../components/PagesTable.jsx';
import ScraperNav from '../components/ScraperNav.jsx';

// /scraper/failed - pages that could not be read, of every job, and why.
// Blocked sites are not retried: re-run the job later if the reason was temporary.
export default function FailedPagesPage() {
  return (
    <Stack spacing={2}>
      <ScraperNav subtitle="Pages that could not be read, and why. Sites that refused access are not retried automatically." />
      <PagesTable defaultStatus="failed" height="calc(100vh - 330px)" />
    </Stack>
  );
}
