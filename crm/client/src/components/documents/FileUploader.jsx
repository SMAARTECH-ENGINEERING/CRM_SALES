import CloseIcon from '@mui/icons-material/Close';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useRef, useState } from 'react';
import { formatBytes } from '../../utils/format.js';

const typeAllowed = (type, allowedTypes) =>
  allowedTypes.some((allowed) => (allowed.endsWith('/*') ? type.startsWith(allowed.slice(0, -1)) : type === allowed));

// Why a file would be refused, or null. The same rules the API applies -
// checked here only to say so before uploading; the API checks again.
function problemOf(file, rules) {
  if (!rules) return null;
  if (file.size === 0) return 'The file is empty';
  if (rules.maxFileBytes && file.size > rules.maxFileBytes) return `Larger than ${formatBytes(rules.maxFileBytes)}`;
  if (rules.allowedTypes?.length && !typeAllowed(file.type, rules.allowedTypes)) return 'This type of file cannot be uploaded';
  return null;
}

// Picks files (button or drag and drop), shows what was picked and uploads
// them. It knows nothing about where they go:
//
//   <FileUploader rules={{ maxFileBytes, maxFiles, allowedTypes }} onUpload={(files, { onProgress }) => promise} />
//
//  - `rules`: the limits to show and pre-check (from the API); optional
//  - `onUpload(files, { onProgress })`: must return a promise; the picked
//    files are cleared when it resolves, and its error is shown when it rejects
//  - `initialFiles`: files already picked (dropped somewhere else)
//  - `ready`: false keeps the Upload button off (e.g. until a record is chosen)
export default function FileUploader({ onUpload, rules, disabled = false, ready = true, label = 'Upload files', hint, initialFiles }) {
  const input = useRef(null);
  const [files, setFiles] = useState(() => Array.from(initialFiles ?? []));
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);

  const uploading = progress !== null;
  const maxFiles = rules?.maxFiles;
  const tooMany = Boolean(maxFiles) && files.length > maxFiles;
  const problems = files.map((file) => problemOf(file, rules));
  const blocked = tooMany || problems.some(Boolean);

  function add(list) {
    setError(null);
    // The same file picked twice is taken once.
    setFiles((current) => {
      const seen = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      return [...current, ...Array.from(list).filter((file) => !seen.has(`${file.name}:${file.size}:${file.lastModified}`))];
    });
  }

  async function upload() {
    setError(null);
    setProgress(0);
    try {
      await onUpload(files, { onProgress: setProgress });
      setFiles([]);
    } catch (err) {
      setError((err.errors ?? []).map((e) => e.message).join(', ') || err.message);
    } finally {
      setProgress(null);
    }
  }

  const limits = rules
    ? [maxFiles ? `Up to ${maxFiles} file${maxFiles === 1 ? '' : 's'} at a time` : null, rules.maxFileBytes ? `${formatBytes(rules.maxFileBytes)} each` : null]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <Stack spacing={1.5}>
      <Box
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !uploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled && !uploading) add(event.dataTransfer.files);
        }}
        sx={{
          p: 2,
          border: '2px dashed',
          borderColor: dragging ? 'primary.main' : 'divider',
          borderRadius: 1,
          bgcolor: dragging ? 'action.hover' : 'transparent',
          textAlign: 'center',
        }}
      >
        <input
          ref={input}
          type="file"
          multiple={maxFiles !== 1}
          hidden
          accept={rules?.allowedTypes?.join(',')}
          aria-label="Choose files"
          onChange={(event) => {
            add(event.target.files);
            // So the same file can be picked again after being removed.
            event.target.value = '';
          }}
        />
        <Button startIcon={<CloudUploadOutlinedIcon />} onClick={() => input.current?.click()} disabled={disabled || uploading}>
          {label}
        </Button>
        <Typography variant="body2" color="text.secondary">
          or drop files here{limits ? `. ${limits}.` : ''}
        </Typography>
        {hint && (
          <Typography variant="caption" color="text.secondary">
            {hint}
          </Typography>
        )}
      </Box>

      {files.length > 0 && (
        <List dense disablePadding aria-label="Files to upload">
          {files.map((file, index) => (
            <ListItem
              key={`${file.name}:${file.size}:${file.lastModified}`}
              disableGutters
              secondaryAction={
                <IconButton
                  edge="end"
                  size="small"
                  aria-label={`Remove ${file.name}`}
                  disabled={uploading}
                  onClick={() => setFiles((current) => current.filter((entry) => entry !== file))}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              }
            >
              <ListItemText
                primary={file.name}
                secondary={problems[index] ?? formatBytes(file.size)}
                slotProps={{ secondary: { color: problems[index] ? 'error' : 'text.secondary' } }}
              />
            </ListItem>
          ))}
        </List>
      )}

      {tooMany && <Alert severity="warning">Remove some files: at most {maxFiles} can be uploaded at a time.</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {uploading && <LinearProgress variant="determinate" value={progress} aria-label="Upload progress" />}

      {files.length > 0 && (
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={upload} disabled={blocked || disabled || !ready} loading={uploading}>
            Upload {files.length} file{files.length === 1 ? '' : 's'}
          </Button>
          <Button onClick={() => setFiles([])} disabled={uploading}>
            Clear
          </Button>
        </Stack>
      )}
    </Stack>
  );
}
