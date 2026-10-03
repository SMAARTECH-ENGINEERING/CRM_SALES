import axiosClient from './axiosClient.js';

// Application settings. Every signed-in user gets the part the screens need
// (company name, logo, currency, date format, time zone, upload limits);
// those who manage settings get all of it, plus `meta` with the choices.
export function getSettings({ signal } = {}) {
  return axiosClient.get('/settings', { signal });
}

// `data`: { <group>: { <field>: value } } - only what is sent changes.
// '' or null puts a setting back to its default.
export function updateSettings(data) {
  return axiosClient.put('/settings', data);
}

// Our own company details, printed on quotations.
export function getCompanyProfile({ signal } = {}) {
  return axiosClient.get('/settings/company', { signal });
}

// Only the fields sent are changed; '' clears one.
export function updateCompanyProfile(data) {
  return axiosClient.put('/settings/company', data);
}

// What the sign-in page needs before anyone has signed in: the company's
// name and logo, and the branding (theme, sign-in logo, tab icon).
export function getPublicSettings({ signal } = {}) {
  return axiosClient.get('/settings/public', { signal, skipAuth: true });
}
