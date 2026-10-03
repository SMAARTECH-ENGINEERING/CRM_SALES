import { keepPreviousData, useQuery } from '@tanstack/react-query';
import * as dashboardApi from '../api/dashboard.api.js';

// The dashboard keeps itself current: every section is fetched again on this
// interval, and when the window regains focus.
export const DASHBOARD_REFRESH_MS = 60 * 1000;

const SECTIONS = {
  summary: dashboardApi.getDashboardSummary,
  sales: dashboardApi.getDashboardSales,
  leads: dashboardApi.getDashboardLeads,
  opportunities: dashboardApi.getDashboardOpportunities,
  activities: dashboardApi.getDashboardActivities,
};

// One section of the dashboard for the chosen filters. While new figures load,
// the previous ones stay on screen (isPlaceholderData) rather than blanking.
export function useDashboardSection(section, params, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['dashboard', section, params],
    queryFn: ({ signal }) => SECTIONS[section](params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    refetchInterval: DASHBOARD_REFRESH_MS,
    refetchOnWindowFocus: true,
    enabled,
  });
}
