import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteDocument, downloadDocument, getDocumentConfig, listDocuments, uploadDocuments } from '../../api/documents.api.js';
import { makeUser, renderAs } from '../../test/renderWithProviders.jsx';
import DocumentList from './DocumentList.jsx';
import FileUploader from './FileUploader.jsx';

vi.mock('../../api/documents.api.js');

const RULES = { field: 'files', maxFileBytes: 1024, maxFiles: 2, allowedTypes: ['application/pdf', 'image/*'] };
const file = (name, type, size = 100) => {
  const made = new File(['x'.repeat(size)], name, { type });
  return made;
};
const pick = (files) => fireEvent.change(screen.getByLabelText('Choose files'), { target: { files } });
const page = (documents) => ({ data: { documents, pagination: { page: 1, limit: 20, total: documents.length, totalPages: 1 } } });
const DOCS = [
  { id: 'd1', fileName: 'Contract draft.pdf', fileType: 'application/pdf', fileSize: 3145728, uploadedBy: 'user-1', uploadedByUser: { fullName: 'Test User' }, entityType: 'quotation', entityId: 'q1', entity: { type: 'quotation', id: 'q1', label: 'QUO-000007' }, createdAt: '2031-01-01T09:00:00.000Z' },
  { id: 'd2', fileName: 'site photo.png', fileType: 'image/png', fileSize: 2048, uploadedBy: 'someone-else', uploadedByUser: { fullName: 'Ada Admin' }, entityType: 'quotation', entityId: 'q1', entity: null, createdAt: '2031-01-02T09:00:00.000Z' },
];

afterEach(cleanup);

describe('FileUploader', () => {
  it('shows the limits it was given and uploads what was picked', async () => {
    const onUpload = vi.fn().mockResolvedValue();
    renderAs(<FileUploader rules={RULES} onUpload={onUpload} />, { permissions: [] });
    expect(screen.getByText(/Up to 2 files at a time, 1 KB each/)).toBeTruthy();
    const pdf = file('quote.pdf', 'application/pdf');
    pick([pdf]);
    expect(within(screen.getByRole('list', { name: 'Files to upload' })).getByText('quote.pdf')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Upload 1 file' }));
    await waitFor(() => expect(onUpload).toHaveBeenCalledWith([pdf], expect.objectContaining({ onProgress: expect.any(Function) })));
    // Cleared once the upload succeeds.
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Files to upload' })).toBeNull());
  });

  it('says why a file would be refused and does not send it', () => {
    const onUpload = vi.fn();
    renderAs(<FileUploader rules={RULES} onUpload={onUpload} />, { permissions: [] });
    pick([file('huge.pdf', 'application/pdf', 5000), file('tool.exe', 'application/x-msdownload')]);
    expect(screen.getByText('Larger than 1 KB')).toBeTruthy();
    expect(screen.getByText('This type of file cannot be uploaded')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload 2 files' }).disabled).toBe(true);

    // Removing the bad ones, then picking too many.
    fireEvent.click(screen.getByLabelText('Remove huge.pdf'));
    fireEvent.click(screen.getByLabelText('Remove tool.exe'));
    pick([file('a.png', 'image/png'), file('b.png', 'image/png'), file('c.png', 'image/png')]);
    expect(screen.getByText(/at most 2 can be uploaded/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload 3 files' }).disabled).toBe(true);
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('shows what the API said when the upload is refused, and keeps the files', async () => {
    const onUpload = vi.fn().mockRejectedValue({ message: 'Refused', errors: [{ field: 'files', message: 'The content of the file does not match its type: quote.pdf' }] });
    renderAs(<FileUploader rules={RULES} onUpload={onUpload} />, { permissions: [] });
    pick([file('quote.pdf', 'application/pdf')]);
    fireEvent.click(screen.getByRole('button', { name: 'Upload 1 file' }));
    expect(await screen.findByText(/does not match its type/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload 1 file' })).toBeTruthy();
  });
});

describe('DocumentList', () => {
  beforeEach(() => {
    listDocuments.mockResolvedValue(page(DOCS));
    getDocumentConfig.mockResolvedValue({ data: RULES });
  });

  it('lists the documents of a record as the API returns them; a reader has no uploader or delete', async () => {
    renderAs(<DocumentList entityType="quotation" entityId="q1" />, { permissions: ['documents.read'] });
    const table = within(await screen.findByRole('table', { name: 'Documents' }));
    expect(listDocuments).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'quotation', entityId: 'q1' }), expect.anything());
    expect(table.getByText('Contract draft.pdf')).toBeTruthy();
    expect(table.getByText('3.0 MB')).toBeTruthy();
    expect(table.getByText('Ada Admin')).toBeTruthy();
    expect(table.queryByText('Belongs to')).toBeNull();
    expect(screen.queryByLabelText('Choose files')).toBeNull();
    expect(screen.queryByLabelText('Delete Contract draft.pdf')).toBeNull();
    expect(getDocumentConfig).not.toHaveBeenCalled();
  });

  it('uploads to the record through the API, using its rules', async () => {
    uploadDocuments.mockResolvedValue({ data: { documents: [DOCS[0]] } });
    renderAs(<DocumentList entityType="quotation" entityId="q1" />, { permissions: ['documents.read', 'documents.create'] });
    await screen.findByText(/Up to 2 files at a time/);
    const pdf = file('quote.pdf', 'application/pdf');
    pick([pdf]);
    fireEvent.click(screen.getByRole('button', { name: 'Upload 1 file' }));
    await waitFor(() => expect(uploadDocuments).toHaveBeenCalled());
    expect(uploadDocuments.mock.calls[0][0]).toMatchObject({ entityType: 'quotation', entityId: 'q1', files: [pdf], field: 'files' });
  });

  it('downloads through the API; an uploader can delete only their own', async () => {
    downloadDocument.mockResolvedValue(new Blob(['pdf']));
    deleteDocument.mockResolvedValue({});
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const user = makeUser(['documents.read', 'documents.create']);
    renderAs(<DocumentList entityType="quotation" entityId="q1" />, { permissions: ['documents.read', 'documents.create'], user: { ...user, id: 'user-1' } });
    await screen.findByRole('table', { name: 'Documents' });

    fireEvent.click(screen.getByLabelText('Download site photo.png'));
    await waitFor(() => expect(downloadDocument).toHaveBeenCalledWith('d2'));

    expect(screen.queryByLabelText('Delete site photo.png')).toBeNull();
    fireEvent.click(screen.getByLabelText('Delete Contract draft.pdf'));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('d1'));
  });

  it('without a record it lists everything with what each belongs to', async () => {
    renderAs(<DocumentList />, { permissions: ['documents.read', 'documents.create', 'documents.delete'] });
    const table = within(await screen.findByRole('table', { name: 'Documents' }));
    expect(table.getByRole('link', { name: 'QUO-000007' }).getAttribute('href')).toBe('/quotations/q1');
    expect(table.getByText('A deleted quotation')).toBeTruthy();
    expect(screen.queryByLabelText('Choose files')).toBeNull();
    // documents.delete: any document.
    expect(screen.getByLabelText('Delete site photo.png')).toBeTruthy();
  });
});
