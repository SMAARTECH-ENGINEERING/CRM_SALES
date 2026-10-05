import axiosClient from './axiosClient.js';

// Importing companies and contacts from an Excel sheet (e.g. business cards
// collected at an expo).

// The sheet to fill in, as a file (Blob).
export function downloadContactsTemplate() {
  return axiosClient.get('/imports/contacts/template', { responseType: 'blob' });
}

// `dryRun: true` only says what would happen to each row; false imports.
// Returns { dryRun, rows, summary }.
export function importContacts(file, { dryRun }) {
  const form = new FormData();
  form.append('file', file);
  return axiosClient.post('/imports/contacts', form, { params: { dryRun } });
}
