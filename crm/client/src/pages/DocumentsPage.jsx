import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { DOCUMENT_CONFIG } from '../api/leadConfig.api.js';
import CompanySelect from '../components/companies/CompanySelect.jsx';
import ConfigChip from '../components/leads/ConfigChip.jsx';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import AdvancedDataTable from '../components/ui/AdvancedDataTable.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { FilterBar } from '../components/ui/FilterDrawer.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import UserSelect from '../components/users/UserSelect.jsx';
import DocumentActionsMenu from '../features/documents/components/DocumentActions.jsx';
import FileKindIcon from '../features/documents/components/FileKindIcon.jsx';
import UploadDocumentsDialog from '../features/documents/components/UploadDocumentsDialog.jsx';
import { useDocumentsList } from '../hooks/useDocuments.js';
import useListParams, { SEARCH_DEBOUNCE_MS, serverPaging, serverSorting, toApiParams } from '../hooks/useListParams.js';
import usePermission from '../hooks/usePermission.js';
import { entityPath } from '../utils/entityPaths.js';
import { EMPTY, formatBytes, formatDateTime } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const FILTER_KEYS = ['kind', 'documentTypeId', 'statusId', 'uploadedBy', 'companyId', 'from', 'to'];
const KINDS = [
  { value: 'pdf', label: 'PDF' },
  { value: 'excel', label: 'Excel / CSV' },
  { value: 'word', label: 'Word' },
  { value: 'image', label: 'Images' },
  { value: 'other', label: 'Other files' },
];
const centered = { display: 'flex', alignItems: 'center', height: '100%', gap: 1, minWidth: 0 };

// /documents - every document the signed-in user may see: search and filter,
// open, edit, convert, print, version and upload (pick or drop files anywhere
// on the page, then choose the record they belong to).
export default function DocumentsPage() {
  const { t } = useTranslation();
  const { can } = usePermission();
  const [params, updateParams] = useListParams(FILTER_KEYS);
  const [searchInput, setSearchInput] = useState(params.search);
  const [uploading, setUploading] = useState(null);
  const [dragging, setDragging] = useState(false);
  const canUpload = can(PERMISSIONS.DOCUMENTS_CREATE);

  useEffect(() => {
    const value = searchInput.trim();
    if (value === params.search) return undefined;
    const timer = setTimeout(() => updateParams({ search: value }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const apiParams = useMemo(
    () => toApiParams({ ...params, sortBy: params.sortBy || 'updatedAt' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(params)]
  );
  const { data, error, isFetching, refetch } = useDocumentsList(apiParams);
  const rangeValid = !params.from || !params.to || params.from <= params.to;

  const columns = useMemo(
    () => [
      {
        field: 'fileName',
        headerName: t('fields.name'),
        flex: 1.6,
        minWidth: 220,
        renderCell: ({ row }) => (
          <Box sx={centered}>
            <FileKindIcon document={row} />
            <Link component={RouterLink} to={`/documents/${row.id}`} underline="hover" sx={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {row.fileName}
            </Link>
          </Box>
        ),
      },
      {
        field: 'entity',
        headerName: 'Belongs to',
        flex: 1.3,
        minWidth: 200,
        sortable: false,
        renderCell: ({ row }) =>
          row.entity ? (
            <Box sx={centered}>
              <Link component={RouterLink} to={entityPath(row.entity.type, row.entity.id) ?? '#'} underline="hover" color="text.primary" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.relatedLabel}>
                {row.relatedLabel || row.entity.label}
              </Link>
            </Box>
          ) : (
            `A deleted ${row.entityType}`
          ),
      },
      { field: 'documentType', headerName: t('fields.type'), width: 160, sortable: false, valueGetter: (value) => value?.name ?? EMPTY },
      {
        field: 'status',
        headerName: t('fields.status'),
        width: 120,
        sortable: false,
        renderCell: ({ value }) => <Box sx={centered}>{value ? <ConfigChip value={value} /> : EMPTY}</Box>,
      },
      { field: 'version', headerName: 'Ver.', width: 70, align: 'right', headerAlign: 'right', sortable: false, valueFormatter: (value) => `v${value ?? 1}` },
      { field: 'fileSize', headerName: 'Size', width: 95, align: 'right', headerAlign: 'right', valueFormatter: (value) => formatBytes(value) },
      { field: 'updatedByUser', headerName: 'Last saved by', width: 150, sortable: false, valueGetter: (value, row) => value?.fullName ?? row.uploadedByUser?.fullName ?? EMPTY },
      { field: 'updatedAt', headerName: 'Updated', width: 160, valueFormatter: (value) => formatDateTime(value) },
      {
        field: 'actions',
        headerName: '',
        width: 60,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: ({ row }) => (
          <Box sx={centered}>
            <DocumentActionsMenu document={row} />
          </Box>
        ),
      },
    ],
    [t]
  );

  const hasFilters = Boolean(params.search || FILTER_KEYS.some((key) => params[key]));
  const filterSx = { flex: 1, minWidth: 150 };

  // Files dropped anywhere on the page go to the upload dialog.
  const dropHandlers = canUpload
    ? {
        onDragOver: (event) => {
          if (![...event.dataTransfer.types].includes('Files')) return;
          event.preventDefault();
          setDragging(true);
        },
        onDragLeave: (event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        },
        onDrop: (event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          setDragging(false);
          setUploading({ files: [...event.dataTransfer.files] });
        },
      }
    : {};

  return (
    <Stack spacing={2} {...dropHandlers} sx={{ position: 'relative' }}>
      <PageHeader
        title={t('pages.documents.title')}
        subtitle={canUpload ? 'Files attached to your records. Drop files anywhere here to upload them.' : t('pages.documents.subtitle')}
        actions={
          <PermissionGate permission={PERMISSIONS.DOCUMENTS_CREATE}>
            <Button variant="contained" startIcon={<CloudUploadOutlinedIcon />} onClick={() => setUploading({ files: [] })}>
              Upload
            </Button>
          </PermissionGate>
        }
      />

      {error && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => refetch()}>
              {t('actions.retry')}
            </Button>
          }
        >
          {error.message}
        </Alert>
      )}

      <AdvancedDataTable
        tableId="documents"
        height="calc(100vh - 240px)"
        rowHref={(row) => `/documents/${row.id}`}
        toolbar={
          <FilterBar activeCount={FILTER_KEYS.filter((key) => params[key]).length}>
            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2}>
              <TextField
                label={t('fields.search')}
                placeholder="File name, record number or company"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon fontSize="small" />
                      </InputAdornment>
                    ),
                  },
                }}
                sx={{ flex: 2 }}
              />
              <TextField
                select
                label="File"
                value={params.kind}
                onChange={(event) => updateParams({ kind: event.target.value })}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
                sx={filterSx}
              >
                <MenuItem value="">All files</MenuItem>
                {KINDS.map((kind) => (
                  <MenuItem key={kind.value} value={kind.value}>
                    {kind.label}
                  </MenuItem>
                ))}
              </TextField>
              <LeadConfigSelect list={DOCUMENT_CONFIG.TYPES} label={t('fields.type')} emptyLabel={t('fields.allTypes')} value={params.documentTypeId} onChange={(documentTypeId) => updateParams({ documentTypeId })} sx={filterSx} />
              <LeadConfigSelect list={DOCUMENT_CONFIG.STATUSES} label={t('fields.status')} emptyLabel={t('fields.allStatuses')} value={params.statusId} onChange={(statusId) => updateParams({ statusId })} sx={filterSx} />
              <CompanySelect label={t('fields.company')} value={params.companyId} onChange={(companyId) => updateParams({ companyId })} sx={filterSx} />
              <UserSelect label="Uploaded by" value={params.uploadedBy} onChange={(uploadedBy) => updateParams({ uploadedBy })} sx={filterSx} />
              <TextField
                type="date"
                label="Updated from"
                value={params.from}
                onChange={(event) => updateParams({ from: event.target.value })}
                error={!rangeValid}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={filterSx}
              />
              <TextField
                type="date"
                label="Updated to"
                value={params.to}
                onChange={(event) => updateParams({ to: event.target.value })}
                error={!rangeValid}
                helperText={!rangeValid ? 'Must not be before the start' : undefined}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={filterSx}
              />
              <Button
                disabled={!hasFilters && !searchInput}
                onClick={() => {
                  setSearchInput('');
                  updateParams(Object.fromEntries(['search', ...FILTER_KEYS].map((key) => [key, ''])));
                }}
                sx={{ flexShrink: 0 }}
              >
                {t('actions.clear')}
              </Button>
            </Stack>
          </FilterBar>
        }
        rows={rangeValid ? (data?.documents ?? []) : []}
        columns={columns}
        loading={isFetching}
        {...serverPaging(params, updateParams, data?.pagination)}
        {...serverSorting(params, updateParams)}
        emptyState={<EmptyState dense filtered={hasFilters} />}
      />

      {dragging && (
        <Stack
          aria-hidden
          sx={{ position: 'absolute', inset: 0, zIndex: 5, border: '2px dashed', borderColor: 'primary.main', borderRadius: 2, bgcolor: 'action.selected', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}
        >
          <CloudUploadOutlinedIcon color="primary" sx={{ fontSize: 48 }} />
          <Typography variant="h6">Drop to upload</Typography>
        </Stack>
      )}
      {uploading && <UploadDocumentsDialog open files={uploading.files} onClose={() => setUploading(null)} />}
    </Stack>
  );
}
