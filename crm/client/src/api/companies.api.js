import axiosClient from './axiosClient.js';

export function listCompanies(params, { signal } = {}) {
  return axiosClient.get('/companies', { params, signal });
}

// Code + name of companies, for pickers. `params`: { search, limit } or { id }.
export function listCompanyOptions(params, { signal } = {}) {
  return axiosClient.get('/companies/options', { params, signal });
}

export function getCompany(id, { signal } = {}) {
  return axiosClient.get(`/companies/${id}`, { signal });
}

export function createCompany(data) {
  return axiosClient.post('/companies', data);
}

export function updateCompany(id, data) {
  return axiosClient.put(`/companies/${id}`, data);
}

export function deleteCompany(id) {
  return axiosClient.delete(`/companies/${id}`);
}

// The detail page's sections: which exist, and how many records each holds.
export function getCompanySections(id, { signal } = {}) {
  return axiosClient.get(`/companies/${id}/sections`, { signal });
}

export function getCompanyTimeline(id, params, { signal } = {}) {
  return axiosClient.get(`/companies/${id}/timeline`, { params, signal });
}
