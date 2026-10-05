import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import RestoreOutlinedIcon from '@mui/icons-material/RestoreOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { useRef, useState } from 'react';
import { downloadDocument } from '../../../api/documents.api.js';
import { useDocumentMutations, useDocumentVersions } from '../../../hooks/useDocuments.js';
import useNotify from '../../../hooks/useNotify.js';
import usePermission from '../../../hooks/usePermission.js';
import { saveBlob } from '../../../hooks/useQuotations.js';
import { EMPTY, formatBytes, formatDateTime } from '../../../utils/format.js';
import { PERMISSIONS } from '../../../utils/permissions.js';

// Every version of a document, newest first: download any, restore an earlier
// one (as a new version - nothing is lost) or upload a new file.
export default function VersionsDialog({ document, onClose }) {
  const notify = useNotify();
  const { can } = usePermission();
  const versions = useDocumentVersions(document.id);
  const { saveVersion, restore } = useDocumentMutations();
  const input = useRef(null);
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState(null);
  const canUpdate = can(PERMISSIONS.DOCUMENTS_UPDATE);
  const canRestore = can(PERMISSIONS.DOCUMENTS_MANAGE_VERSIONS);

  async function save(version) {
    try {
      saveBlob(await downloadDocument(document.id, { version: version.version }), version.fileName);
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function upload(file) {
    setProgress(0);
    try {
      await saveVersion.mutateAsync({ id: document.id, file, note: note.trim(), onProgress: setProgress });
      setNote('');
      notify.success(`${file.name} saved as a new version`);
    } catch (err) {
      notify.error((err.errors ?? []).map((e) => e.message).join(', ') || err.message);
    } finally {
      setProgress(null);
    }
  }

  async function restoreVersion(version) {
    try {
      await restore.mutateAsync({ id: document.id, version: version.version });
      notify.success(`Version ${version.version} restored as the current version`);
    } catch (err) {
      notify.error(err.message);
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Versions of {document.fileName}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {canUpdate && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
              <TextField size="small" label="Note for the new version" value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} sx={{ flex: 1 }} />
              <input
                ref={input}
                type="file"
                hidden
                aria-label="Choose the new version"
                onChange={(event) => {
                  const [file] = event.target.files;
                  event.target.value = '';
                  if (file) upload(file);
                }}
              />
              <Button variant="outlined" startIcon={<CloudUploadOutlinedIcon />} onClick={() => input.current?.click()} loading={progress !== null}>
                Upload new version
              </Button>
            </Stack>
          )}
          {progress !== null && <LinearProgress variant="determinate" value={progress} aria-label="Upload progress" />}
          {versions.error && <Alert severity="error">{versions.error.message}</Alert>}
          {versions.isPending ? (
            <LinearProgress aria-label="Loading versions" />
          ) : (
            <List dense aria-label="Versions">
              {(versions.data ?? []).map((version) => (
                <ListItem
                  key={version.version}
                  divider
                  secondaryAction={
                    <Stack direction="row">
                      <Tooltip title="Download">
                        <IconButton aria-label={`Download version ${version.version}`} onClick={() => save(version)}>
                          <DownloadOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {!version.current && canRestore && (
                        <Tooltip title="Restore this version">
                          <IconButton aria-label={`Restore version ${version.version}`} onClick={() => restoreVersion(version)} disabled={restore.isPending}>
                            <RestoreOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Stack>
                  }
                  sx={{ pr: 12 }}
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <span>
                          v{version.version} · {version.fileName}
                        </span>
                        {version.current && <Chip size="small" color="primary" label="Current" />}
                      </Stack>
                    }
                    secondary={[formatDateTime(version.createdAt), version.uploadedBy?.fullName ?? EMPTY, formatBytes(version.fileSize), version.note].filter(Boolean).join(' · ')}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
