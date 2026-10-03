import mongoose from 'mongoose';
import { MESSAGES, NOTIFICATION_TYPE, TICKET_MESSAGE_TYPE, TICKET_STATUS_CATEGORY, USER_STATUS } from '../constants/index.js';
import Company from '../models/Company.js';
import Contact from '../models/Contact.js';
import Customer from '../models/Customer.js';
import Project from '../models/Project.js';
import Ticket from '../models/Ticket.js';
import TicketCategory from '../models/TicketCategory.js';
import TicketMessage from '../models/TicketMessage.js';
import TicketPriority from '../models/TicketPriority.js';
import TicketStatus from '../models/TicketStatus.js';
import TimelineEvent from '../models/TimelineEvent.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { declarePermission, hasPermission } from '../utils/permissions.js';
import { paginationMeta, searchFilter } from '../utils/query.js';
import { registerCompanySection } from './companySection.service.js';
import { registerContactDeleteGuard } from './contact.service.js';
import { getDefaultEntry, registerLeadConfigUsage } from './leadConfig.service.js';
import { nextSequence } from './sequence.service.js';
import { numberFor } from './settings.service.js';
import { notifyUsers } from './notification.service.js';
import { diffSnapshots, recordEvent } from './timeline.service.js';
import { openFile, removeFiles, storeFiles } from './upload.service.js';

export const TICKET_ENTITY = 'ticket';
const { OPEN, IN_PROGRESS, WAITING, RESOLVED, CLOSED } = TICKET_STATUS_CATEGORY;
const { REPLY, INTERNAL_NOTE } = TICKET_MESSAGE_TYPE;
const ASSIGN_TICKETS = declarePermission('tickets.assign');

// People may have been deleted since; their names should still show.
const PERSON = { select: 'firstName lastName email', options: { withDeleted: true } };
const POPULATE = [
  { path: 'companyId', select: 'companyCode name email phone' },
  { path: 'contactId', select: 'firstName lastName email phone designation' },
  { path: 'customerId', select: 'customerNumber' },
  { path: 'projectId', select: 'projectNumber name' },
  { path: 'categoryId', select: 'name color isActive' },
  { path: 'priorityId', select: 'name color level isActive' },
  { path: 'statusId', select: 'name color category isActive' },
  { path: 'assignedTo', ...PERSON },
  { path: 'createdBy', ...PERSON },
  { path: 'attachments.uploadedBy', ...PERSON },
];

const SEARCH_FIELDS = ['ticketNumber', 'subject', 'description'];
const FILTER_FIELDS = ['statusId', 'priorityId', 'categoryId', 'assignedTo', 'companyId', 'contactId', 'customerId', 'projectId'];

const TIMELINE_LABELS = {
  subject: 'Subject',
  description: 'Description',
  contact: 'Contact',
  project: 'Project',
  category: 'Category',
  priority: 'Priority',
};

const idOf = (reference) => (reference ? String(reference._id ?? reference) : '');

function snapshot(ticket) {
  return {
    subject: ticket.subject,
    description: ticket.description ?? '',
    contact: ticket.contactId?.fullName ?? '',
    project: ticket.projectId?.projectNumber ?? '',
    category: ticket.categoryId?.name ?? '',
    priority: ticket.priorityId?.name ?? '',
  };
}

// --- relationships with other modules ----------------------------------------------

registerCompanySection('tickets', { count: (companyId) => Ticket.countDocuments({ companyId }), blocksDelete: true });
registerContactDeleteGuard('Tickets', (contactId) => Ticket.countDocuments({ contactId }));
registerLeadConfigUsage('ticketCategories', (categoryId) => Ticket.countDocuments({ categoryId }));
registerLeadConfigUsage('ticketPriorities', (priorityId) => Ticket.countDocuments({ priorityId }));
registerLeadConfigUsage('ticketStatuses', (statusId) => Ticket.countDocuments({ statusId }));

// --- helpers -----------------------------------------------------------------

const badReference = (field, message) => ApiError.badRequest(message, [{ field, message }]);

async function findTicket(id) {
  const ticket = await Ticket.findById(id).populate(POPULATE);
  if (!ticket) throw ApiError.notFound(MESSAGES.TICKET_NOT_FOUND);
  return ticket;
}

async function assertContact(companyId, contactId) {
  if (!contactId) return;
  const contact = await Contact.findById(contactId).select('companyId');
  if (!contact) throw badReference('contactId', MESSAGES.LEAD_CONTACT_NOT_FOUND);
  if (String(contact.companyId) !== String(companyId)) throw badReference('contactId', MESSAGES.LEAD_CONTACT_COMPANY_MISMATCH);
}

async function assertProject(companyId, projectId) {
  if (!projectId) return;
  const project = await Project.findById(projectId).select('companyId');
  if (!project) throw badReference('projectId', MESSAGES.PROJECT_NOT_FOUND);
  if (String(project.companyId) !== String(companyId)) throw badReference('projectId', MESSAGES.TICKET_PROJECT_MISMATCH);
}

async function assertActive(Model, id, field, message) {
  if (id && !(await Model.exists({ _id: id, isActive: true }))) throw badReference(field, message);
}

async function assertActiveUser(userId) {
  if (userId && !(await User.exists({ _id: userId, status: USER_STATUS.ACTIVE }))) {
    throw badReference('assignedTo', MESSAGES.ASSIGNEE_NOT_FOUND);
  }
}

// Anyone may take a ticket themselves (or let go of their own); giving it to
// someone else needs tickets.assign.
function assertMayAssign(actor, userId, currentId = '') {
  const self = String(actor.id);
  const touchesOthers = (userId && userId !== self) || (currentId && currentId !== self && currentId !== (userId || ''));
  if (touchesOthers && !hasPermission(actor, ASSIGN_TICKETS)) throw ApiError.forbidden(MESSAGES.TICKET_ASSIGN_FORBIDDEN);
}

// The status's meaning drives the dates: resolved and closed are recorded the
// first time; going back to an open state clears them.
function enterStatus(ticket, status) {
  ticket.statusId = status._id;
  const now = new Date();
  if (status.category === RESOLVED) {
    ticket.resolvedAt ??= now;
    ticket.closedAt = undefined;
  } else if (status.category === CLOSED) {
    ticket.resolvedAt ??= now;
    ticket.closedAt ??= now;
  } else {
    ticket.resolvedAt = undefined;
    ticket.closedAt = undefined;
  }
}

const ticketEvent = (ticket, action, actor, extra = {}) =>
  recordEvent({ entityType: TICKET_ENTITY, entityId: ticket._id, action, actor, ...extra });

// Tells the person a ticket was given to - unless they took it themselves.
const notifyTicketAssigned = (ticket, actor) =>
  notifyUsers({
    recipients: [ticket.assignedTo],
    exclude: actor,
    type: NOTIFICATION_TYPE.TICKET_ASSIGNED,
    title: 'Ticket assigned to you',
    message: `${ticket.ticketNumber} - ${ticket.subject}${actor ? ` was assigned to you by ${actor.fullName}` : ' was assigned to you'}`,
    entityType: TICKET_ENTITY,
    entityId: ticket._id,
  });

const folderOf = (ticketId) => `tickets/${ticketId}`;

// --- list and stats ------------------------------------------------------------

async function buildFilter(query) {
  const filter = { ...searchFilter(query.search, SEARCH_FIELDS) };
  for (const field of FILTER_FIELDS) {
    if (query[field]) filter[field] = query[field];
  }
  if (query.unassigned) filter.assignedTo = null;
  if (query.statusCategory && !filter.statusId) {
    filter.statusId = { $in: await TicketStatus.distinct('_id', { category: query.statusCategory }) };
  }
  // Everything still needing work: not resolved or closed.
  if (query.openOnly && !filter.statusId) {
    filter.statusId = { $in: await TicketStatus.distinct('_id', { category: { $in: [OPEN, IN_PROGRESS, WAITING] } }) };
  }
  return filter;
}

export async function listTickets(query) {
  const { page, limit, sortBy, sortOrder } = query;
  const filter = await buildFilter(query);
  const [tickets, total] = await Promise.all([
    Ticket.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE),
    Ticket.countDocuments(filter),
  ]);
  return { tickets, pagination: paginationMeta({ page, limit }, total) };
}

// Counts by what the status means - for the queue's header - plus open
// tickets nobody has taken. `assignedTo` narrows them to one person.
export async function getTicketStats({ assignedTo }) {
  const statuses = await TicketStatus.find().select('category');
  const categoryOf = new Map(statuses.map((status) => [status.id, status.category]));
  const match = { deletedAt: null, ...(assignedTo ? { assignedTo: new mongoose.Types.ObjectId(assignedTo) } : {}) };
  const rows = await Ticket.aggregate([
    { $match: match },
    { $group: { _id: { statusId: '$statusId', assigned: { $gt: ['$assignedTo', null] } }, count: { $sum: 1 } } },
  ]);

  const byCategory = Object.fromEntries(Object.values(TICKET_STATUS_CATEGORY).map((category) => [category, 0]));
  let unassignedOpen = 0;
  for (const row of rows) {
    const category = categoryOf.get(String(row._id.statusId));
    if (!category) continue;
    byCategory[category] += row.count;
    if (!row._id.assigned && [OPEN, IN_PROGRESS, WAITING].includes(category)) unassignedOpen += row.count;
  }
  return { byCategory, unassignedOpen, total: Object.values(byCategory).reduce((sum, n) => sum + n, 0) };
}

export function getTicket(id) {
  return findTicket(id);
}

// --- changes -------------------------------------------------------------------

export async function createTicket(input, files, actor) {
  if (!(await Company.exists({ _id: input.companyId }))) throw badReference('companyId', MESSAGES.CONTACT_COMPANY_NOT_FOUND);
  await assertContact(input.companyId, input.contactId);
  await assertProject(input.companyId, input.projectId);
  await assertActive(TicketCategory, input.categoryId, 'categoryId', MESSAGES.TICKET_CATEGORY_NOT_FOUND);
  const priorityId = input.priorityId || (await getDefaultEntry('ticketPriorities'))?.id;
  await assertActive(TicketPriority, priorityId, 'priorityId', MESSAGES.TICKET_PRIORITY_NOT_FOUND);
  const statusId = input.statusId || (await getDefaultEntry('ticketStatuses'))?.id;
  if (!statusId) throw ApiError.conflict(MESSAGES.TICKET_NO_DEFAULT_STATUS);
  const status = await TicketStatus.findOne({ _id: statusId, isActive: true });
  if (!status) throw badReference('statusId', MESSAGES.TICKET_STATUS_NOT_FOUND);
  assertMayAssign(actor, input.assignedTo);
  await assertActiveUser(input.assignedTo);
  const customer = await Customer.findOne({ companyId: input.companyId }).select('_id');

  const ticket = new Ticket({
    companyId: input.companyId,
    contactId: input.contactId || undefined,
    customerId: customer?._id,
    projectId: input.projectId || undefined,
    subject: input.subject,
    description: input.description || undefined,
    categoryId: input.categoryId || undefined,
    priorityId: priorityId || undefined,
    assignedTo: input.assignedTo || undefined,
    lastActivityAt: new Date(),
    createdBy: actor.id,
  });
  enterStatus(ticket, status);

  // Files last, after every check: nothing is left on disk for a refused request.
  const saved = await storeFiles(files, folderOf(ticket.id));
  ticket.attachments = saved.map((file) => ({ ...file, uploadedBy: actor.id }));
  try {
    const number = await nextSequence(TICKET_ENTITY);
    ticket.ticketNumber = await numberFor('ticket', number);
    await ticket.save();
  } catch (err) {
    await removeFiles(saved);
    throw err;
  }

  await ticketEvent(ticket, 'created', actor);
  await notifyTicketAssigned(ticket, actor);
  return findTicket(ticket.id);
}

// Edits the details. Status and assignment have their own endpoints; the company is fixed.
export async function updateTicket(id, input, actor) {
  const ticket = await findTicket(id);
  const before = snapshot(ticket);
  const companyId = idOf(ticket.companyId);

  if ('contactId' in input && (input.contactId || '') !== idOf(ticket.contactId)) {
    await assertContact(companyId, input.contactId);
    ticket.contactId = input.contactId || undefined;
  }
  if ('projectId' in input && (input.projectId || '') !== idOf(ticket.projectId)) {
    await assertProject(companyId, input.projectId);
    ticket.projectId = input.projectId || undefined;
  }
  if ('categoryId' in input && (input.categoryId || '') !== idOf(ticket.categoryId)) {
    await assertActive(TicketCategory, input.categoryId, 'categoryId', MESSAGES.TICKET_CATEGORY_NOT_FOUND);
    ticket.categoryId = input.categoryId || undefined;
  }
  if ('priorityId' in input && (input.priorityId || '') !== idOf(ticket.priorityId)) {
    await assertActive(TicketPriority, input.priorityId, 'priorityId', MESSAGES.TICKET_PRIORITY_NOT_FOUND);
    ticket.priorityId = input.priorityId || undefined;
  }
  if (input.subject) ticket.subject = input.subject;
  if ('description' in input) ticket.description = input.description || undefined;

  await ticket.save();
  const updated = await findTicket(id);
  const changes = diffSnapshots(before, snapshot(updated), TIMELINE_LABELS);
  if (changes.length) await ticketEvent(updated, 'updated', actor, { changes });
  return updated;
}

export async function assignTicket(id, userId, actor) {
  const ticket = await findTicket(id);
  const current = idOf(ticket.assignedTo);
  if ((userId || '') === current) return ticket;
  assertMayAssign(actor, userId, current);
  await assertActiveUser(userId);

  const from = ticket.assignedTo?.fullName;
  ticket.assignedTo = userId || undefined;
  ticket.lastActivityAt = new Date();
  await ticket.save();
  const updated = await findTicket(id);
  await ticketEvent(updated, 'assigned', actor, {
    changes: [{ field: 'assignedTo', label: 'Assigned to', from, to: updated.assignedTo?.fullName }],
  });
  await notifyTicketAssigned(updated, actor);
  return updated;
}

export async function changeTicketStatus(id, statusId, actor) {
  const ticket = await findTicket(id);
  if (statusId === idOf(ticket.statusId)) return ticket;
  const status = await TicketStatus.findOne({ _id: statusId, isActive: true });
  if (!status) throw badReference('statusId', MESSAGES.TICKET_STATUS_NOT_FOUND);

  const from = ticket.statusId?.name;
  enterStatus(ticket, status);
  ticket.lastActivityAt = new Date();
  await ticket.save();
  const updated = await findTicket(id);
  await ticketEvent(updated, 'status_changed', actor, { changes: [{ field: 'status', label: 'Status', from, to: status.name }] });
  return updated;
}

// A reply (the conversation with the customer) or an internal note (staff
// only), with optional files. A closed ticket takes notes but not replies.
export async function addMessage(id, type, body, files, actor) {
  const ticket = await findTicket(id);
  if (type === REPLY && ticket.statusId?.category === CLOSED) throw ApiError.conflict(MESSAGES.TICKET_CLOSED);

  const message = await TicketMessage.create({ ticketId: ticket._id, type, body, authorId: actor.id });
  let saved = [];
  try {
    saved = await storeFiles(files, folderOf(ticket.id));
    await Ticket.updateOne(
      { _id: ticket._id },
      {
        $push: {
          attachments: {
            $each: saved.map((file) => ({ ...file, messageId: message._id, internal: type === INTERNAL_NOTE, uploadedBy: actor.id })),
          },
        },
        $inc: { replyCount: type === REPLY ? 1 : 0 },
        $set: { lastActivityAt: message.createdAt },
      }
    );
  } catch (err) {
    await removeFiles(saved);
    await message.deleteOne();
    throw err;
  }

  await message.populate({ path: 'authorId', ...PERSON });
  const attachments = (await Ticket.findById(ticket._id).select('attachments')).attachments.filter(
    (attachment) => String(attachment.messageId) === message.id
  );
  return { ...message.toJSON(), attachments: attachments.map((attachment) => attachment.toJSON()) };
}

// The ticket's conversation, oldest first: replies, internal notes (each with
// its files) and what happened to the ticket - created, assigned, status
// changes, edits - as one feed.
export async function getConversation(id) {
  const ticket = await findTicket(id);
  const [messages, events] = await Promise.all([
    TicketMessage.find({ ticketId: ticket._id }).sort({ createdAt: 1, _id: 1 }).populate({ path: 'authorId', ...PERSON }),
    TimelineEvent.find({ entityType: TICKET_ENTITY, entityId: ticket._id })
      .sort({ createdAt: 1, _id: 1 })
      .populate({ path: 'actorId', ...PERSON }),
  ]);

  const filesOf = new Map();
  for (const attachment of ticket.attachments) {
    const key = attachment.messageId ? String(attachment.messageId) : '';
    filesOf.set(key, [...(filesOf.get(key) ?? []), attachment.toJSON()]);
  }

  const items = [
    ...messages.map((message) => ({ kind: 'message', ...message.toJSON(), attachments: filesOf.get(message.id) ?? [] })),
    ...events.map((event) => ({ kind: 'event', ...event.toJSON() })),
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  return {
    ticket,
    // The files that came with the ticket itself.
    attachments: filesOf.get('') ?? [],
    items,
    counts: {
      replies: messages.filter((m) => m.type === REPLY).length,
      internalNotes: messages.filter((m) => m.type === INTERNAL_NOTE).length,
      events: events.length,
    },
  };
}

// The stored file of one attachment, for downloading.
export async function getAttachment(id, attachmentId) {
  const ticket = await Ticket.findById(id).select('attachments');
  if (!ticket) throw ApiError.notFound(MESSAGES.TICKET_NOT_FOUND);
  const attachment = ticket.attachments.id(attachmentId);
  if (!attachment) throw ApiError.notFound(MESSAGES.ATTACHMENT_NOT_FOUND);
  // 404 when the record exists but storage no longer has the file.
  const stream = await openFile(attachment.storedName);
  return { stream, fileName: attachment.fileName, mimeType: attachment.mimeType, size: attachment.size };
}

export async function deleteTicket(id, actor) {
  const ticket = await findTicket(id);
  ticket.deletedAt = new Date();
  await ticket.save();
  await ticketEvent(ticket, 'deleted', actor);
}
