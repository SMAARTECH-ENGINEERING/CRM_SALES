import axiosClient from './axiosClient.js';

// Every dashboard figure comes from these five endpoints. `params`:
// { period: today | week | month | quarter | year | custom, from, to, organizationId }
// (and pipelineId for opportunities). Each response repeats the period and the
// scope it covers.
const section = (name) => (params, { signal } = {}) => axiosClient.get(`/dashboard/${name}`, { params, signal });

export const getDashboardSummary = section('summary');
export const getDashboardSales = section('sales');
export const getDashboardLeads = section('leads');
export const getDashboardOpportunities = section('opportunities');
export const getDashboardActivities = section('activities');
