import axiosClient from './axiosClient.js';

export function listContacts(params, { signal } = {}) {
  return axiosClient.get('/contacts', { params, signal });
}

// Names of contacts, for pickers. `params`: { companyId, search, limit } or { id }.
export function listContactOptions(params, { signal } = {}) {
  return axiosClient.get('/contacts/options', { params, signal });
}

export function getContact(id, { signal } = {}) {
  return axiosClient.get(`/contacts/${id}`, { signal });
}

export function createContact(data) {
  return axiosClient.post('/contacts', data);
}

export function updateContact(id, data) {
  return axiosClient.put(`/contacts/${id}`, data);
}

export function deleteContact(id) {
  return axiosClient.delete(`/contacts/${id}`);
}
