import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listVersions, restoreVersion, updateDocument } from '../../../api/documents.api.js';
import { listLeadConfig } from '../../../api/leadConfig.api.js';
import { renderAs } from '../../../test/renderWithProviders.jsx';
import DocumentActionsMenu from './DocumentActions.jsx';

vi.mock('../../../api/documents.api.js');
vi.mock('../../../api/leadConfig.api.js', async (original) => ({ ...(await original()), listLeadConfig: vi.fn() }));

const PDF = { id: 'd1', fileName: 'QUO-000018.pdf', fileType: 'application/pdf', fileSize: 2048, version: 2, versionCount: 2, uploadedBy: 'user-1', uploadedByUser: { id: 'user-1', fullName: 'Test Person' }, documentType: { id: 't1', name: 'Quotation' }, status: { id: 's1', name: 'Draft' } };
const SHEET = { ...PDF, id: 'd2', fileName: 'boq.xlsx', fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };

const openMenu = async (document) => {
  fireEvent.click(screen.getByLabelText(`Actions for ${document.fileName}`));
  return within(await screen.findByRole('menu'));
};
const labels = (menu) => menu.getAllByRole('menuitem').map((item) => item.textContent);

afterEach(cleanup);
beforeEach(() => {
  listLeadConfig.mockResolvedValue({ data: { items: [{ id: 't1', name: 'Quotation', isActive: true }, { id: 's1', name: 'Draft', isActive: true, isDefault: true }] } });
});

describe('DocumentActionsMenu', () => {
  it('offers what the kind of file allows and the user may do', async () => {
    renderAs(<DocumentActionsMenu document={PDF} />, { permissions: ['documents.read', 'documents.update', 'documents.create'] });
    expect(labels(await openMenu(PDF))).toEqual(['Open', 'Edit PDF', 'Convert to Excel', 'Download', 'Print', 'Rename, type and status', 'Versions (2)', 'Delete']);
    cleanup();

    renderAs(<DocumentActionsMenu document={SHEET} />, { permissions: ['documents.read'] });
    // A reader: no editing, renaming or deleting; a spreadsheet converts to PDF.
    expect(labels(await openMenu(SHEET))).toEqual(['Open', 'Convert to PDF', 'Download', 'Print', 'Versions (2)']);
  });

  it('renames keeping the extension, and sets the type and status', async () => {
    updateDocument.mockResolvedValue({ data: { document: PDF } });
    renderAs(<DocumentActionsMenu document={PDF} />, { permissions: ['documents.read', 'documents.update'] });
    fireEvent.click((await openMenu(PDF)).getByRole('menuitem', { name: 'Rename, type and status' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('.pdf')).toBeTruthy();
    fireEvent.change(dialog.getByLabelText(/Name/), { target: { value: 'QUO-000018 signed' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateDocument).toHaveBeenCalledWith('d1', { fileName: 'QUO-000018 signed.pdf' }));
  });

  it('lists the versions and restores an earlier one only with documents.manageVersions', async () => {
    listVersions.mockResolvedValue({
      data: {
        versions: [
          { version: 2, fileName: 'QUO-000018.pdf', fileSize: 2048, createdAt: '2031-01-02T10:00:00Z', uploadedBy: { fullName: 'Test Person' }, current: true },
          { version: 1, fileName: 'QUO-000018.pdf', fileSize: 1024, createdAt: '2031-01-01T10:00:00Z', uploadedBy: { fullName: 'Test Person' }, note: 'Edited in the PDF editor', current: false },
        ],
      },
    });
    restoreVersion.mockResolvedValue({ data: { document: { ...PDF, version: 3 } } });
    renderAs(<DocumentActionsMenu document={PDF} />, { permissions: ['documents.read', 'documents.update', 'documents.manageVersions'] });
    fireEvent.click((await openMenu(PDF)).getByRole('menuitem', { name: 'Versions (2)' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(await dialog.findByText(/Edited in the PDF editor/)).toBeTruthy();
    expect(dialog.queryByLabelText('Restore version 2')).toBeNull();
    fireEvent.click(dialog.getByLabelText('Restore version 1'));
    await waitFor(() => expect(restoreVersion).toHaveBeenCalledWith('d1', 1));
    cleanup();

    renderAs(<DocumentActionsMenu document={PDF} />, { permissions: ['documents.read'] });
    fireEvent.click((await openMenu(PDF)).getByRole('menuitem', { name: 'Versions (2)' }));
    const readOnly = within(await screen.findByRole('dialog'));
    await readOnly.findByText(/Edited in the PDF editor/);
    expect(readOnly.queryByLabelText('Restore version 1')).toBeNull();
    expect(readOnly.queryByRole('button', { name: 'Upload new version' })).toBeNull();
  });
});
