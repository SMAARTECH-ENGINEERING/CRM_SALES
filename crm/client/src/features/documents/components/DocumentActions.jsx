import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import HistoryOutlinedIcon from '@mui/icons-material/HistoryOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from '../../../components/ConfirmDialog.jsx';
import { downloadDocument } from '../../../api/documents.api.js';
import useAuth from '../../../hooks/useAuth.js';
import { useDocumentMutations } from '../../../hooks/useDocuments.js';
import useNotify from '../../../hooks/useNotify.js';
import usePermission from '../../../hooks/usePermission.js';
import { saveBlob } from '../../../hooks/useQuotations.js';
import { PERMISSIONS } from '../../../utils/permissions.js';
import { CAN, kindOf } from '../lib/fileKinds.js';
import DocumentDetailsDialog from './DocumentDetailsDialog.jsx';
import PrintDialog from './PrintDialog.jsx';
import VersionsDialog from './VersionsDialog.jsx';

// What can be done with a document, as far as this user may and this kind of
// file allows. Used in lists (a "more" menu) and on the document's own page.
export function useDocumentActions(document, { onDeleted } = {}) {
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useAuth();
  const { can } = usePermission();
  const { remove } = useDocumentMutations();
  const [dialog, setDialog] = useState(null);
  const [printFile, setPrintFile] = useState(null);
  const kind = kindOf(document);
  const canUpdate = can(PERMISSIONS.DOCUMENTS_UPDATE);
  const canCreate = can(PERMISSIONS.DOCUMENTS_CREATE);
  const canDelete = can(PERMISSIONS.DOCUMENTS_DELETE) || (canCreate && (document.uploadedByUser?.id ?? document.uploadedBy) === user?.id);

  async function download() {
    try {
      saveBlob(await downloadDocument(document.id), document.fileName);
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function print() {
    try {
      const blob = await downloadDocument(document.id);
      setPrintFile({ fileName: document.fileName, fileType: document.fileType, bytes: new Uint8Array(await blob.arrayBuffer()) });
    } catch (err) {
      notify.error(err.message);
    }
  }

  async function confirmDelete() {
    try {
      await remove.mutateAsync(document.id);
      notify.success(`${document.fileName} deleted`);
      setDialog(null);
      onDeleted?.();
    } catch (err) {
      notify.error(err.message);
      setDialog(null);
    }
  }

  const actions = [
    { id: 'open', label: 'Open', icon: OpenInNewOutlinedIcon, run: () => navigate(`/documents/${document.id}`), show: CAN.preview(kind) },
    { id: 'editPdf', label: 'Edit PDF', icon: EditNoteOutlinedIcon, run: () => navigate(`/documents/${document.id}/edit`), show: canUpdate && CAN.editPdf(kind) },
    { id: 'editSheet', label: 'Edit spreadsheet', icon: EditNoteOutlinedIcon, run: () => navigate(`/documents/${document.id}/edit`), show: canUpdate && CAN.editSheet(kind) },
    { id: 'toExcel', label: 'Convert to Excel', icon: TableChartOutlinedIcon, run: () => navigate(`/documents/${document.id}/to-excel`), show: CAN.toExcel(kind) },
    { id: 'toPdf', label: 'Convert to PDF', icon: PictureAsPdfOutlinedIcon, run: () => navigate(`/documents/${document.id}/to-pdf`), show: CAN.toPdf(kind) },
    { id: 'download', label: 'Download', icon: DownloadOutlinedIcon, run: download, show: true },
    { id: 'print', label: 'Print', icon: PrintOutlinedIcon, run: print, show: CAN.print(kind) },
    { id: 'details', label: 'Rename, type and status', icon: EditOutlinedIcon, run: () => setDialog('details'), show: canUpdate, divider: true },
    { id: 'versions', label: `Versions (${document.versionCount ?? 1})`, icon: HistoryOutlinedIcon, run: () => setDialog('versions'), show: true },
    { id: 'delete', label: 'Delete', icon: DeleteOutlinedIcon, run: () => setDialog('delete'), show: canDelete, danger: true, divider: true },
  ].filter((action) => action.show);

  const dialogs = (
    <>
      {dialog === 'details' && <DocumentDetailsDialog document={document} onClose={() => setDialog(null)} />}
      {dialog === 'versions' && <VersionsDialog document={document} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Delete document"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDialog(null)}
      >
        {`${document.fileName} and all its versions will be deleted for everyone. This cannot be undone.`}
      </ConfirmDialog>
      {printFile && <PrintDialog open file={printFile} onClose={() => setPrintFile(null)} />}
    </>
  );

  return { actions, dialogs };
}

// A "more" button with every action in a menu.
export default function DocumentActionsMenu({ document, exclude = [], onDeleted }) {
  const [anchor, setAnchor] = useState(null);
  const { actions, dialogs } = useDocumentActions(document, { onDeleted });
  const shown = actions.filter((a) => !exclude.includes(a.id));

  return (
    <>
      <IconButton size="small" aria-label={`Actions for ${document.fileName}`} aria-haspopup="menu" onClick={(event) => setAnchor(event.currentTarget)}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {shown.flatMap((action, index) => [
          action.divider && index > 0 ? <Divider key={`${action.id}-divider`} /> : null,
          <MenuItem
            key={action.id}
            onClick={() => {
              setAnchor(null);
              action.run();
            }}
            sx={action.danger ? { color: 'error.main' } : undefined}
          >
            <ListItemIcon sx={action.danger ? { color: 'error.main' } : undefined}>
              <action.icon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{action.label}</ListItemText>
          </MenuItem>,
        ])}
      </Menu>
      {dialogs}
    </>
  );
}
