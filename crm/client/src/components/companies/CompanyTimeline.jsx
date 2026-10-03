import { useState } from 'react';
import { useCompanyTimeline } from '../../hooks/useCompanies.js';
import EventTimeline, { TIMELINE_PAGE_SIZE } from '../EventTimeline.jsx';

// The company's history, loaded from GET /companies/:id/timeline.
export default function CompanyTimeline({ companyId }) {
  const [page, setPage] = useState(1);
  const query = useCompanyTimeline(companyId, { page, limit: TIMELINE_PAGE_SIZE });
  return <EventTimeline query={query} page={page} onPageChange={setPage} />;
}
