import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Pagination from '@mui/material/Pagination';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tooltip from '@mui/material/Tooltip';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import useAuth from '../../hooks/useAuth.js';
import { useDocumentConfig, useDocumentMutations, useDocumentsList } from '../../hooks/useDocuments.js';
import useNotify from '../../hooks/useNotify.js';
import usePermission from '../../hooks/usePermission.js';
import { saveBlob } from '../../hooks/useQuotations.js';
import { entityPath } from '../../utils/entityPaths.js';
import { EMPTY, formatBytes, formatDateTime } from '../../utils/format.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import ConfirmDialog from '../ConfirmDialog.jsx';
import LoadingScreen from '../LoadingScreen.jsx';
import FileUploader from './FileUploader.jsx';

const PAGE_SIZE = 20;


// The documents of one record, with upload, download and delete:
//
//   <DocumentList entityType="quotation" entityId={quotation.id} />
//
// Without entityType / entityId it lists every document the user may see,
// with a "Belongs to" column and no uploader. `search` narrows by file name.
// What may be uploaded comes from the API; so does every row.
export default function DocumentList({ entityType, entityId, search = '' }) {
  const { user } = useAuth();
  const { can } = usePermission();
  const notify = useNotify();
  const canRead = can(PERMISSIONS.DOCUMENTS_READ);
  const canUpload = can(PERMISSIONS.DOCUMENTS_CREATE);
  const scoped = Boolean(entityType && entityId);
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState(null);
  const { upload, download, remove } = useDocumentMutations();

  const { data, error, isPending, refetch } = useDocumentsList(
    { ...(scoped ? { entityType, entityId } : {}), ...(search ? { search } : {}), page, limit: PAGE_SIZE, sortBy: 'createdAt', sortOrder: 'desc' },
    { enabled: canRead }
  );
  const config = useDocumentConfig({ enabled: scoped && canUpload });

  const uploader = scoped && canUpload && (
    <FileUploader
      rules={config.data}
      onUpload={async (files, { onProgress }) => {
        const response = await upload.mutateAsync({ entityType, entityId, files, field: config.data?.field, onProgress });
        notify.success(`${response.data.documents.length} document(s) uploaded`);
      }}
    />
  );

  async function save(document) {
    try {
      saveBlob(await download.mutateAsync(document.id), document.fileName);
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function confirmDelete() {
    try {
      await remove.mutateAsync(deleting.id);
      notify.success(`${deleting.fileName} deleted`);
    } catch (err) {
      notify.error(err.message);
    }
    setDeleting(null);
  }

  if (!canRead) {
    return (
      <Stack spacing={2}>
        {uploader}
        <Alert severity="warning">You do not have permission to view documents.</Alert>
      </Stack>
    );
  }
  if (isPending) return <LoadingScreen />;
  if (error) {
    return (
      <Alert
        severity={error.status === 403 ? 'warning' : 'error'}
        action={
          error.status === 403 ? undefined : (
            <Button color="inherit" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          )
        }
      >
        {error.message}
      </Alert>
    );
  }

  // Your own uploads, or any with documents.delete - the API decides again.
  const canDelete = (document) => can(PERMISSIONS.DOCUMENTS_DELETE) || (canUpload && document.uploadedBy === user.id);

  return (
    <Stack spacing={2}>
      {uploader}
      {data.documents.length === 0 ? (
        <Alert severity="info">{search ? 'No documents match.' : 'No documents yet.'}</Alert>
      ) : (
        <TableContainer>
          <Table size="small" aria-label="Documents">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                {!scoped && <TableCell>Belongs to</TableCell>}
                <TableCell>Type</TableCell>
                <TableCell align="right">Size</TableCell>
                <TableCell>Uploaded by</TableCell>
                <TableCell>Uploaded</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.documents.map((document) => (
                <TableRow key={document.id} hover>
                  <TableCell sx={{ wordBreak: 'break-word' }}>
                    <Link component="button" type="button" underline="hover" onClick={() => save(document)} sx={{ fontWeight: 500, textAlign: 'left' }}>
                      {document.fileName}
                    </Link>
                  </TableCell>
                  {!scoped && (
                    <TableCell>
                      {document.entity ? (
                        <Link component={RouterLink} to={entityPath(document.entity.type, document.entity.id)} underline="hover">
                          {document.entity.label}
                        </Link>
                      ) : (
                        `A deleted ${document.entityType}`
                      )}
                    </TableCell>
                  )}
                  <TableCell sx={{ color: 'text.secondary', wordBreak: 'break-word' }}>{document.fileType}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    {formatBytes(document.fileSize)}
                  </TableCell>
                  <TableCell>{document.uploadedByUser?.fullName ?? EMPTY}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(document.createdAt)}</TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Download">
                      <IconButton size="small" aria-label={`Download ${document.fileName}`} onClick={() => save(document)}>
                        <DownloadOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    {canDelete(document) && (
                      <Tooltip title="Delete">
                        <IconButton size="small" aria-label={`Delete ${document.fileName}`} onClick={() => setDeleting(document)}>
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {data.pagination.totalPages > 1 && (
        <Pagination count={data.pagination.totalPages} page={page} onChange={(event, value) => setPage(value)} sx={{ alignSelf: 'center' }} />
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete document"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDeleting(null)}
      >
        {deleting ? `${deleting.fileName} will be deleted for everyone. This cannot be undone.` : ''}
      </ConfirmDialog>
    </Stack>
  );
}
