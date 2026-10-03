import AttachFileIcon from '@mui/icons-material/AttachFile';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { saveBlob } from '../../hooks/useQuotations.js';
import useNotify from '../../hooks/useNotify.js';
import usePermission from '../../hooks/usePermission.js';
import { useTicketMutations } from '../../hooks/useTickets.js';
import { formatDateTime, initials } from '../../utils/format.js';
import { PERMISSIONS } from '../../utils/permissions.js';

const ACTIONS = {
  created: 'opened the ticket',
  updated: 'edited the ticket',
  assigned: 'changed the assignee',
  status_changed: 'changed the status',
  deleted: 'deleted the ticket',
};

const sizeOf = (bytes) => (bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`);

function Files({ ticketId, files }) {
  const notify = useNotify();
  const { download } = useTicketMutations();
  if (!files?.length) return null;

  async function open(file) {
    try {
      saveBlob(await download.mutateAsync({ id: ticketId, attachmentId: file.id }), file.fileName);
    } catch (err) {
      notify.error(err.message);
    }
  }

  return (
    <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 1 }}>
      {files.map((file) => (
        <Chip
          key={file.id}
          size="small"
          variant="outlined"
          icon={<InsertDriveFileOutlinedIcon />}
          label={`${file.fileName} (${sizeOf(file.size)})`}
          onClick={() => open(file)}
          aria-label={`Download ${file.fileName}`}
        />
      ))}
    </Stack>
  );
}

// One reply or note. Internal notes are set apart: they are never part of the
// conversation with the customer.
function Message({ ticketId, author, createdAt, body, internal, files, title }) {
  return (
    <Stack direction="row" spacing={1.5} component="li" sx={{ listStyle: 'none' }} aria-label={internal ? 'Internal note' : 'Reply'}>
      <Avatar sx={{ width: 36, height: 36, fontSize: 14, bgcolor: internal ? 'warning.main' : 'primary.main' }}>{initials(author)}</Avatar>
      <Paper
        variant="outlined"
        sx={{
          p: 1.5,
          flexGrow: 1,
          minWidth: 0,
          borderColor: internal ? 'warning.light' : 'divider',
          ...(internal ? { backgroundColor: 'rgba(237, 108, 2, 0.06)' } : {}),
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {author?.fullName ?? 'Unknown user'}
          </Typography>
          {title && <Chip size="small" label={title} />}
          {internal && <Chip size="small" color="warning" icon={<LockOutlinedIcon />} label="Internal note" />}
          <Typography variant="caption" color="text.secondary">
            {formatDateTime(createdAt)}
          </Typography>
        </Stack>
        {body && (
          <Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {body}
          </Typography>
        )}
        <Files ticketId={ticketId} files={files} />
      </Paper>
    </Stack>
  );
}

// A change to the ticket, shown as a line between messages.
function Event({ event }) {
  const change = event.changes?.[0];
  return (
    <Box component="li" sx={{ listStyle: 'none', textAlign: 'center', py: 0.5 }} aria-label="Ticket event">
      <Typography variant="caption" color="text.secondary">
        {event.actor?.fullName ?? 'Someone'} {ACTIONS[event.action] ?? event.action}
        {change && event.action !== 'updated' ? `: ${change.from ?? 'none'} → ${change.to ?? 'none'}` : ''}
        {event.action === 'updated' && event.changes?.length ? ` (${event.changes.map((c) => c.label).join(', ')})` : ''}
        {' · '}
        {formatDateTime(event.createdAt)}
      </Typography>
    </Box>
  );
}

function Composer({ ticket, closed }) {
  const notify = useNotify();
  const { can } = usePermission();
  const { reply, note } = useTicketMutations();
  const modes = [
    can(PERMISSIONS.TICKETS_REPLY) && { value: 'reply', label: 'Reply' },
    can(PERMISSIONS.TICKETS_ADD_INTERNAL_NOTE) && { value: 'note', label: 'Internal note' },
  ].filter(Boolean);
  const [mode, setMode] = useState(modes[0]?.value);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState(null);
  if (!modes.length) return null;

  const isReply = mode === 'reply';
  const mutation = isReply ? reply : note;
  const blocked = isReply && closed;

  async function send() {
    setError(null);
    if (!text.trim()) {
      setError('Write something first');
      return;
    }
    try {
      await mutation.mutateAsync({ id: ticket.id, text: text.trim(), files });
      setText('');
      setFiles([]);
      notify.success(isReply ? 'Reply added' : 'Internal note added');
    } catch (err) {
      setError(err.errors?.[0]?.message ?? err.message);
    }
  }

  return (
    <Paper variant="outlined" sx={{ p: 2, ...(isReply ? {} : { backgroundColor: 'rgba(237, 108, 2, 0.06)' }) }}>
      <Tabs value={mode} onChange={(event, value) => setMode(value)} sx={{ mb: 1, minHeight: 36 }} aria-label="Message type">
        {modes.map((option) => (
          <Tab key={option.value} value={option.value} label={option.label} sx={{ minHeight: 36 }} />
        ))}
      </Tabs>
      {blocked ? (
        <Alert severity="info">This ticket is closed. Change its status to reopen it before replying; internal notes can still be added.</Alert>
      ) : (
        <Stack spacing={1.5}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            multiline
            minRows={3}
            placeholder={isReply ? 'Write a reply' : 'Only your team will see this note'}
            value={text}
            onChange={(event) => setText(event.target.value)}
            slotProps={{ htmlInput: { 'aria-label': isReply ? 'Write a reply' : 'Write an internal note' } }}
          />
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
            <Button component="label" size="small" startIcon={<AttachFileIcon />}>
              Attach
              <input hidden multiple type="file" aria-label="Attach files to the message" onChange={(event) => setFiles([...files, ...event.target.files])} />
            </Button>
            {files.map((file, index) => (
              <Chip key={`${file.name}-${index}`} size="small" label={file.name} onDelete={() => setFiles(files.filter((_, i) => i !== index))} />
            ))}
            <Box sx={{ flexGrow: 1 }} />
            <Button variant="contained" color={isReply ? 'primary' : 'warning'} endIcon={<SendOutlinedIcon />} onClick={send} loading={mutation.isPending}>
              {isReply ? 'Send reply' : 'Add note'}
            </Button>
          </Stack>
        </Stack>
      )}
    </Paper>
  );
}

// The ticket as a conversation, oldest first: what was reported (with its
// files), then every reply, internal note and change, as the API returns them.
export default function TicketConversation({ data }) {
  const { ticket, attachments, items } = data;
  const closed = ticket.status?.category === 'closed';
  return (
    <Stack spacing={2}>
      <Stack component="ol" spacing={1.5} sx={{ p: 0, m: 0 }} aria-label="Conversation">
        <Message
          ticketId={ticket.id}
          author={ticket.createdByUser}
          createdAt={ticket.createdAt}
          title={ticket.contact ? `On behalf of ${ticket.contact.fullName}` : 'Reported'}
          body={ticket.description || ticket.subject}
          files={attachments}
        />
        {items.map((item) =>
          item.kind === 'message' ? (
            <Message
              key={item.id}
              ticketId={ticket.id}
              author={item.author}
              createdAt={item.createdAt}
              body={item.body}
              internal={item.type === 'internal_note'}
              files={item.attachments}
            />
          ) : item.action === 'created' ? null : (
            <Event key={item.id} event={item} />
          )
        )}
      </Stack>
      <Composer ticket={ticket} closed={closed} />
    </Stack>
  );
}
