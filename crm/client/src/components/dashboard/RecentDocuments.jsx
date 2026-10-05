import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';
import FileKindIcon from '../../features/documents/components/FileKindIcon.jsx';
import { useDocumentsList } from '../../hooks/useDocuments.js';
import { formatRelative } from '../../utils/format.js';

const PARAMS = { limit: 6, sortBy: 'updatedAt', sortOrder: 'desc' };

// The documents most recently uploaded or saved, of the records this user can see.
export default function RecentDocuments() {
  const { data, error, isPending } = useDocumentsList(PARAMS);
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="h6" component="h2">
            Recent documents
          </Typography>
          <Button size="small" component={RouterLink} to="/documents">
            All documents
          </Button>
        </Stack>
        {isPending && <LinearProgress aria-label="Loading documents" />}
        {error && <Alert severity="error">{error.message}</Alert>}
        {data?.documents.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No documents yet. Upload them from a record&apos;s Documents tab or the Documents page.
          </Typography>
        )}
        <List dense disablePadding>
          {(data?.documents ?? []).map((document) => (
            <ListItemButton key={document.id} component={RouterLink} to={`/documents/${document.id}`} sx={{ borderRadius: 1 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <FileKindIcon document={document} />
              </ListItemIcon>
              <ListItemText
                primary={document.fileName}
                secondary={[document.relatedLabel || document.entity?.label, `v${document.version ?? 1}`, formatRelative(document.updatedAt)].filter(Boolean).join(' · ')}
                slotProps={{ primary: { noWrap: true }, secondary: { noWrap: true } }}
              />
            </ListItemButton>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}
