import { Router } from 'express';
import { HTTP_STATUS, MESSAGES, TICKET_MESSAGE_TYPE } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import * as ticketService from '../services/ticket.service.js';
import { sendFile, uploadFiles } from '../services/upload.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { idParam } from '../validators/common.validator.js';
import {
  assignTicketSchema,
  attachmentParams,
  createTicketSchema,
  listTicketsQuery,
  messageSchema,
  ticketStatsQuery,
  ticketStatusSchema,
  updateTicketSchema,
} from '../validators/ticket.validator.js';

const router = Router();
router.use(authenticate);

const read = requirePermission('tickets.read');
const update = requirePermission('tickets.update');
// Bodies with files are multipart/form-data, files in "attachments"; JSON works too.
const files = uploadFiles('attachments');
const created = (res, message, data) => sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message, data });

router.get('/', read, validate({ query: listTicketsQuery }), async (req, res) => {
  const data = await ticketService.listTickets(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.TICKETS_LISTED, data });
});
// Counts by status meaning, for the queue. Declared before /:id.
router.get('/stats', read, validate({ query: ticketStatsQuery }), async (req, res) => {
  const data = await ticketService.getTicketStats(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.TICKET_STATS, data });
});
router.post('/', requirePermission('tickets.create'), files, validate({ body: createTicketSchema }), async (req, res) =>
  created(res, MESSAGES.TICKET_CREATED, { ticket: await ticketService.createTicket(req.body, req.files, req.user) })
);
router.get('/:id', read, validate({ params: idParam }), async (req, res) => {
  const ticket = await ticketService.getTicket(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.TICKET_RETRIEVED, data: { ticket } });
});
router.put('/:id', update, validate({ params: idParam, body: updateTicketSchema }), async (req, res) => {
  const ticket = await ticketService.updateTicket(req.validated.params.id, req.body, req.user);
  return sendSuccess(res, { message: MESSAGES.TICKET_UPDATED, data: { ticket } });
});
router.delete('/:id', requirePermission('tickets.delete'), validate({ params: idParam }), async (req, res) => {
  await ticketService.deleteTicket(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.TICKET_DELETED });
});

// Taking a ticket yourself needs tickets.update; assigning anyone else needs
// tickets.assign (checked in the service).
router.patch(
  '/:id/assign',
  authorize('tickets.assign', 'tickets.update'),
  validate({ params: idParam, body: assignTicketSchema }),
  async (req, res) => {
    const ticket = await ticketService.assignTicket(req.validated.params.id, req.body.assignedTo, req.user);
    return sendSuccess(res, { message: MESSAGES.TICKET_ASSIGNED, data: { ticket } });
  }
);
router.patch('/:id/status', update, validate({ params: idParam, body: ticketStatusSchema }), async (req, res) => {
  const ticket = await ticketService.changeTicketStatus(req.validated.params.id, req.body.statusId, req.user);
  return sendSuccess(res, { message: MESSAGES.TICKET_STATUS_UPDATED, data: { ticket } });
});

router.post(
  '/:id/replies',
  requirePermission('tickets.reply'),
  files,
  validate({ params: idParam, body: messageSchema }),
  async (req, res) =>
    created(res, MESSAGES.TICKET_REPLY_ADDED, {
      message: await ticketService.addMessage(req.validated.params.id, TICKET_MESSAGE_TYPE.REPLY, req.body.body, req.files, req.user),
    })
);
router.post(
  '/:id/internal-notes',
  requirePermission('tickets.addInternalNote'),
  files,
  validate({ params: idParam, body: messageSchema }),
  async (req, res) =>
    created(res, MESSAGES.TICKET_NOTE_ADDED, {
      message: await ticketService.addMessage(
        req.validated.params.id,
        TICKET_MESSAGE_TYPE.INTERNAL_NOTE,
        req.body.body,
        req.files,
        req.user
      ),
    })
);

// Replies, internal notes and ticket events as one feed, oldest first.
router.get('/:id/conversation', read, validate({ params: idParam }), async (req, res) => {
  const data = await ticketService.getConversation(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.TICKET_CONVERSATION, data });
});

// Downloads one attachment. The only file route: the body is the file.
router.get('/:id/attachments/:attachmentId', read, validate({ params: attachmentParams }), async (req, res) => {
  const { id, attachmentId } = req.validated.params;
  const file = await ticketService.getAttachment(id, attachmentId);
  return sendFile(res, file.stream, file);
});

export default router;
