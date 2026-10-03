import { useState } from 'react';
import { useLeadTimeline } from '../../hooks/useLeads.js';
import EventTimeline, { TIMELINE_PAGE_SIZE } from '../EventTimeline.jsx';

// The lead's history, loaded from GET /leads/:id/timeline.
export default function LeadTimeline({ leadId }) {
  const [page, setPage] = useState(1);
  const query = useLeadTimeline(leadId, { page, limit: TIMELINE_PAGE_SIZE });
  return <EventTimeline query={query} page={page} onPageChange={setPage} />;
}
