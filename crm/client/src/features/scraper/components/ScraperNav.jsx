import AddIcon from '@mui/icons-material/Add';
import Button from '@mui/material/Button';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import PermissionGate from '../../../components/PermissionGate.jsx';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { PERMISSIONS } from '../../../utils/permissions.js';

// The scraper's sections. Results, Duplicates and Imported are the same list
// with different filters.
export const SECTIONS = [
  { value: 'jobs', label: 'Jobs', to: '/scraper' },
  { value: 'results', label: 'Results', to: '/scraper/results' },
  { value: 'duplicates', label: 'Duplicates', to: '/scraper/results?duplicates=true' },
  { value: 'imported', label: 'Imported', to: '/scraper/results?importStatus=imported' },
  { value: 'failed', label: 'Failed pages', to: '/scraper/failed' },
];

function current(location) {
  const query = new URLSearchParams(location.search);
  if (location.pathname.startsWith('/scraper/failed')) return 'failed';
  if (location.pathname.startsWith('/scraper/results')) return query.get('duplicates') === 'true' ? 'duplicates' : query.get('importStatus') === 'imported' ? 'imported' : 'results';
  return 'jobs';
}

export default function ScraperNav({ subtitle }) {
  const location = useLocation();
  return (
    <>
      <PageHeader
        title="Web Data Scraper"
        subtitle={subtitle ?? 'Collect public business details from websites, review them, then import what you approve into Companies, Contacts and Leads.'}
        actions={
          <PermissionGate permission={PERMISSIONS.SCRAPER_CREATE}>
            <Button variant="contained" startIcon={<AddIcon />} component={RouterLink} to="/scraper/new">
              New scraping job
            </Button>
          </PermissionGate>
        }
      />
      <Tabs value={current(location)} variant="scrollable" allowScrollButtonsMobile aria-label="Scraper sections" sx={{ borderBottom: 1, borderColor: 'divider' }}>
        {SECTIONS.map((section) => (
          <Tab key={section.value} value={section.value} label={section.label} component={RouterLink} to={section.to} />
        ))}
      </Tabs>
    </>
  );
}
