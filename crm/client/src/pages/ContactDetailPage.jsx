import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import RecordEngagement from '../components/activities/RecordEngagement.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ContactForm, { CONTACT_METHOD_OPTIONS } from '../components/contacts/ContactForm.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { useContact, useContactMutations } from '../hooks/useContacts.js';
import useNotify from '../hooks/useNotify.js';
import usePermission from '../hooks/usePermission.js';
import { EMPTY, formatDateTime, initials } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';
import DocumentList from '../components/documents/DocumentList.jsx';

function Field({ label, children }) {
  return (
    <div>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant="body1" component="div" sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
        {children || EMPTY}
      </Typography>
    </div>
  );
}

export default function ContactDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const { remove } = useContactMutations();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { data: contact, error, isPending, refetch } = useContact(id);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/contacts'));
  const backButton = (
    <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ alignSelf: 'flex-start' }}>
      Back
    </Button>
  );

  if (isPending) return <LoadingScreen />;

  if (error) {
    return (
      <Stack spacing={2}>
        {backButton}
        <Alert
          severity="error"
          action={
            error.status === 404 ? undefined : (
              <Button color="inherit" size="small" onClick={() => refetch()}>
                Retry
              </Button>
            )
          }
        >
          {error.message}
        </Alert>
      </Stack>
    );
  }

  const { company } = contact;
  const method = CONTACT_METHOD_OPTIONS.find((option) => option.value === contact.preferredContactMethod);

  async function confirmDelete() {
    try {
      await remove.mutateAsync(contact.id);
      notify.success(`${contact.fullName} deleted`);
      navigate('/contacts', { replace: true });
    } catch (err) {
      notify.error(err.message);
      setConfirmingDelete(false);
    }
  }

  return (
    <Stack spacing={2}>
      {backButton}

      <Card>
        <CardContent>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
          >
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center', minWidth: 0 }}>
              <Avatar sx={{ width: 56, height: 56 }}>{initials(contact)}</Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                  <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
                    {contact.fullName}
                  </Typography>
                  <StatusChip status={contact.status} />
                  {method && <Chip size="small" variant="outlined" label={`Prefers ${method.label}`} />}
                </Stack>
                <Typography color="text.secondary">
                  {[contact.designation, contact.department].filter(Boolean).join(' · ') || 'No designation recorded'}
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={1}>
              <PermissionGate permission={PERMISSIONS.CONTACTS_UPDATE}>
                <Button variant="contained" onClick={() => setEditing(true)}>
                  Edit
                </Button>
              </PermissionGate>
              <PermissionGate permission={PERMISSIONS.CONTACTS_DELETE}>
                <Button variant="outlined" color="error" onClick={() => setConfirmingDelete(true)}>
                  Delete
                </Button>
              </PermissionGate>
            </Stack>
          </Stack>

          <Divider sx={{ my: 3 }} />

          <Box
            sx={{
              display: 'grid',
              gap: 3,
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' },
            }}
          >
            <Field label="Company">
              {company &&
                (can(PERMISSIONS.COMPANIES_READ) ? (
                  <Link component={RouterLink} to={`/companies/${company.id}`} underline="hover">
                    {company.name}
                  </Link>
                ) : (
                  company.name
                ))}
              {company && (
                <Typography variant="caption" color="text.secondary" component="div">
                  {company.companyCode}
                </Typography>
              )}
            </Field>
            <Field label="Designation">{contact.designation}</Field>
            <Field label="Department">{contact.department}</Field>
            <Field label="Email">{contact.email && <Link href={`mailto:${contact.email}`}>{contact.email}</Link>}</Field>
            <Field label="Phone">{contact.phone && <Link href={`tel:${contact.phone}`}>{contact.phone}</Link>}</Field>
            <Field label="Alternate phone">
              {contact.alternatePhone && <Link href={`tel:${contact.alternatePhone}`}>{contact.alternatePhone}</Link>}
            </Field>
            <Field label="Preferred contact method">{method?.label}</Field>
            <Field label="Created by">{contact.createdByUser?.fullName}</Field>
            <Field label="Created">{formatDateTime(contact.createdAt)}</Field>
            <Field label="Last updated">{formatDateTime(contact.updatedAt)}</Field>
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Field label="Notes">{contact.notes}</Field>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <RecordEngagement type="contact" id={contact.id} />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
            Documents
          </Typography>
          <DocumentList entityType="contact" entityId={contact.id} />
        </CardContent>
      </Card>

      {/* Mounted only while open so the form starts from the current values. */}
      {editing && (
        <Dialog open onClose={() => setEditing(false)} maxWidth="md" fullWidth>
          <DialogTitle>Edit contact</DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 1 }}>
              <ContactForm contact={contact} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
            </Box>
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete contact"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setConfirmingDelete(false)}
      >
        {`${contact.fullName} will be removed from ${company?.name ?? 'their company'}.`}
      </ConfirmDialog>
    </Stack>
  );
}
