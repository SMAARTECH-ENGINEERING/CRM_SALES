import axiosClient from './axiosClient.js';

// The simple named lists companies refer to. The value is the API path.
export const MASTER_DATA = Object.freeze({
  INDUSTRIES: 'industries',
  COMPANY_TYPES: 'company-types',
  ORGANIZATIONS: 'organizations',
});

export function listMasterData(resource, { signal } = {}) {
  return axiosClient.get(`/${resource}`, { signal });
}

export function createMasterData(resource, data) {
  return axiosClient.post(`/${resource}`, data);
}
