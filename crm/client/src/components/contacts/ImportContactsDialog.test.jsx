import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadContactsTemplate, importContacts } from '../../api/imports.api.js';
import { renderAs } from '../../test/renderWithProviders.jsx';
import { ImportContactsButton } from './ImportContactsDialog.jsx';

vi.mock('../../api/imports.api.js');
vi.mock('../../hooks/useQuotations.js', () => ({ saveBlob: vi.fn() }));

const ROWS = [
  { rowNumber: 2, company: { name: 'Maa Tarini FPO' }, contact: { name: 'Ramesh Behera', email: 'ramesh@tarini.example.com' }, companyAction: 'new', contactAction: 'new', problems: [] },
  { rowNumber: 3, company: { name: 'Hirakud Growers', code: 'CO-000004' }, contact: { name: 'Anita Mishra', email: '' }, companyAction: 'existing', contactAction: 'existing', problems: [] },
  { rowNumber: 4, company: { name: 'Kalinga Agro' }, contact: { name: 'Prakash', email: '' }, companyAction: 'none', contactAction: 'none', problems: ['Last name: is required'] },
];
const SUMMARY = { rows: 3, companiesNew: 1, companiesExisting: 1, contactsNew: 1, contactsExisting: 1, rowsWithProblems: 1 };
const FILE = new File(['PK'], 'expo-cards.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

beforeEach(() => {
  vi.clearAllMocks();
  downloadContactsTemplate.mockResolvedValue(new Blob(['x']));
  importContacts.mockImplementation(async (file, { dryRun }) => ({ data: { dryRun, rows: ROWS, summary: SUMMARY } }));
});
afterEach(cleanup);

describe('Import from Excel', () => {
  it('is offered only to someone who may create companies and contacts', () => {
    renderAs(<ImportContactsButton />, { permissions: ['contacts.create'] });
    expect(screen.queryByRole('button', { name: 'Import' })).toBeNull();
  });

  it('downloads the template, previews every row, then imports', async () => {
    renderAs(<ImportContactsButton />, { permissions: ['contacts.create', 'companies.create'] });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Import companies and contacts from Excel' }));

    fireEvent.click(dialog.getByRole('button', { name: 'Download Excel template' }));
    await waitFor(() => expect(downloadContactsTemplate).toHaveBeenCalled());
    // Nothing to import before a file is chosen.
    expect(dialog.getByRole('button', { name: 'Import 0 contacts' }).disabled).toBe(true);

    fireEvent.change(dialog.getByLabelText('Choose Excel file'), { target: { files: [FILE] } });
    await waitFor(() => expect(importContacts).toHaveBeenCalledWith(FILE, { dryRun: true }));
    expect(await dialog.findByText(/Nothing has been saved yet/)).toBeTruthy();
    const rows = within(dialog.getByRole('table', { name: 'Rows of the file' }));
    expect(rows.getByText('New company')).toBeTruthy();
    expect(rows.getByText('Already in CRM · CO-000004')).toBeTruthy();
    expect(rows.getByText('Already a contact')).toBeTruthy();
    expect(rows.getByText('Last name: is required')).toBeTruthy();

    fireEvent.click(dialog.getByRole('button', { name: 'Import 1 contact' }));
    await waitFor(() => expect(importContacts).toHaveBeenLastCalledWith(FILE, { dryRun: false }));
    expect(await dialog.findByText(/Imported: 1 new companies and 1 new contacts/)).toBeTruthy();
  });

  it('shows why a file was refused', async () => {
    importContacts.mockRejectedValue({ message: 'The sheet is missing required columns.', errors: [{ field: 'file', message: 'Missing column: First name' }] });
    renderAs(<ImportContactsButton />, { permissions: ['contacts.create', 'companies.create'] });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Choose Excel file'), { target: { files: [FILE] } });
    expect(await dialog.findByText('Missing column: First name')).toBeTruthy();
  });
});
