import Stack from '@mui/material/Stack';
import ResultsTable from '../components/ResultsTable.jsx';
import ScraperNav from '../components/ScraperNav.jsx';

// /scraper/results - the results of every job (Duplicates and Imported are
// this list with a filter set).
export default function ScrapedResultsPage() {
  return (
    <Stack spacing={2}>
      <ScraperNav />
      <ResultsTable height="calc(100vh - 330px)" />
    </Stack>
  );
}
