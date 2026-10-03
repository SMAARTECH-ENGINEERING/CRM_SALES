import axiosClient from './axiosClient.js';

// `params`: { page, limit, search, status, accountManagerId, companyId, industryId,
// companyTypeId, organizationId, sinceFrom, sinceTo, sortBy, sortOrder }.
// Each customer carries `stats` (orders, value, last order, open opportunities)
// worked out by the API.
export function listCustomers(params, { signal } = {}) {
  return axiosClient.get('/customers', { params, signal });
}

export function getCustomer(id, { signal } = {}) {
  return axiosClient.get(`/customers/${id}`, { signal });
}

// The 360-degree view: { customer, sections: [{ key, label, available, count }], metrics }.
export function getCustomerSummary(id, { signal } = {}) {
  return axiosClient.get(`/customers/${id}/summary`, { signal });
}

export function getCustomerTimeline(id, params, { signal } = {}) {
  return axiosClient.get(`/customers/${id}/timeline`, { params, signal });
}

// `data`: { companyId, primaryContactId?, accountManagerId?, status?, customerSince?, notes? }.
// Company details are not sent: they stay on the company.
export function createCustomer(data) {
  return axiosClient.post('/customers', data);
}

export function updateCustomer(id, data) {
  return axiosClient.put(`/customers/${id}`, data);
}

// Removes the customer designation; the company and its records stay.
export function deleteCustomer(id) {
  return axiosClient.delete(`/customers/${id}`);
}
