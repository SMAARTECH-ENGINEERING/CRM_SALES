import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ConfigChip from '../../../components/leads/ConfigChip.jsx';
import LoadingState from '../../../components/ui/LoadingState.jsx';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { useDocument, useDocumentFile, useDocumentVersions } from '../../../hooks/useDocuments.js';
import usePermission from '../../../hooks/usePermission.js';
import { saveBlob } from '../../../hooks/useQuotations.js';
import { entityPath } from '../../../utils/entityPaths.js';
import { EMPTY, formatBytes, formatDateTime } from '../../../utils/format.js';
import { PERMISSIONS } from '../../../utils/permissions.js';
import DocumentActionsMenu from '../components/DocumentActions.jsx';
import FileKindIcon from '../components/FileKindIcon.jsx';
import PrintDialog from '../components/PrintDialog.jsx';
import { CAN, kindOf } from '../lib/fileKinds.js';
import FilePreview from '../viewers/FilePreview.jsx';

// /documents/:id - a document to read, print and download, with its details;
// ?version=N shows an earlier version.
export default function DocumentViewerPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { can } = usePermission();
  const document = useDocument(id);
  const versions = useDocumentVersions(id, { enabled: (document.data?.versionCount ?? 1) > 1 });
  const requested = Number(searchParams.get('version')) || null;
  const version = requested ?? document.data?.version;
  const file = useDocumentFile(id, { version, enabled: Boolean(version) });
  const [page, setPage] = useState(0);
  const [sheets, setSheets] = useState(null);
  const [printing, setPrinting] = useState(false);
  const doc = document.data;
  const shown = versions.data?.find((v) => v.version === version) ?? (doc ? { fileName: doc.fileName, fileType: doc.fileType, fileSize: doc.fileSize } : null);
  // The same object while the same file is shown - the print preview is rebuilt when it changes.
  const loaded = useMemo(() => (file.data && shown ? { fileName: shown.fileName, fileType: shown.fileType, bytes: file.data.bytes } : null), [file.data, shown?.fileName, shown?.fileType]); // eslint-disable-line react-hooks/exhaustive-deps

  if (document.isPending) return <LoadingState />;
  if (document.error) {
    return (
      <Stack spacing={2}>
        <PageHeader title="Document" back="/documents" />
        <Alert severity={document.error.status === 404 ? 'info' : 'error'}>{document.error.status === 404 ? 'This document does not exist or was deleted.' : document.error.message}</Alert>
      </Stack>
    );
  }

  const isOld = version !== doc.version;
  const kind = kindOf(shown);
  const canEdit = !isOld && can(PERMISSIONS.DOCUMENTS_UPDATE) && (CAN.editPdf(kind) || CAN.editSheet(kind));

  return (
    <Stack spacing={2} sx={{ height: { md: 'calc(100vh - 120px)' } }}>
      <PageHeader
        back="/documents"
       
        title={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }} component="span">
            <FileKindIcon document={shown} fontSize="medium" decorative />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{shown.fileName}</span>
          </Stack>
        }
        meta={
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            {doc.status && <ConfigChip value={doc.status} />}
            {doc.documentType && <Chip size="small" variant="outlined" label={doc.documentType.name} />}
            <Chip size="small" color={isOld ? 'warning' : 'default'} label={isOld ? `Viewing v${version} (current is v${doc.version})` : `v${doc.version}`} />
          </Stack>
        }
        actions={
          <>
            {canEdit && (
              <Button variant="outlined" startIcon={<EditNoteOutlinedIcon />} onClick={() => navigate(`/documents/${doc.id}/edit`)}>
                Edit
              </Button>
            )}
            {CAN.print(kind) && (
              <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => setPrinting(true)} disabled={!loaded}>
                Print
              </Button>
            )}
            <Button variant="contained" startIcon={<DownloadOutlinedIcon />} onClick={() => file.data && saveBlob(file.data.blob, shown.fileName)} disabled={!file.data}>
              Download
            </Button>
            <DocumentActionsMenu document={doc} exclude={['open', 'download', 'print', 'editPdf', 'editSheet']} onDeleted={() => navigate('/documents')} />
          </>
        }
      />

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ alignItems: { md: 'center' }, color: 'text.secondary', flexWrap: 'wrap' }}>
        <Typography variant="body2">
          {doc.entity ? (
            <>
              Belongs to{' '}
              <Link component={RouterLink} to={entityPath(doc.entity.type, doc.entity.id) ?? '/documents'}>
                {doc.relatedLabel || doc.entity.label}
              </Link>
            </>
          ) : (
            `Belonged to a deleted ${doc.entityType}`
          )}
          {' · '}
          {formatBytes(shown.fileSize)} · Saved {formatDateTime(doc.updatedAt)} by {doc.updatedByUser?.fullName ?? doc.uploadedByUser?.fullName ?? EMPTY}
        </Typography>
        {doc.versionCount > 1 && versions.data && (
          <TextField
            select
            size="small"
            fullWidth={false}
            label="Version"
            value={version}
            onChange={(event) => setSearchParams(Number(event.target.value) === doc.version ? {} : { version: event.target.value }, { replace: true })}
            sx={{ minWidth: 220, ml: { md: 'auto' } }}
          >
            {versions.data.map((v) => (
              <MenuItem key={v.version} value={v.version}>
                v{v.version} · {formatDateTime(v.createdAt)}
                {v.current ? ' (current)' : ''}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>

      <Paper variant="outlined" sx={{ flex: 1, minHeight: { xs: 480, md: 0 }, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {file.error ? (
          <Alert severity="error" sx={{ m: 2 }}>
            {file.error.message}
          </Alert>
        ) : !loaded ? (
          <LoadingState />
        ) : (
          <FilePreview file={loaded} onPageChange={setPage} onSheets={setSheets} />
        )}
      </Paper>

      {printing && loaded && <PrintDialog open file={loaded} currentPage={page} sheets={sheets} onClose={() => setPrinting(false)} />}
    </Stack>
  );
}
