import Joi from 'joi';
import { PAGINATION, TICKET_STATUS_CATEGORY } from '../constants/index.js';
import { objectId } from './common.validator.js';

// Optional fields accept '' or null to clear the stored value. Bodies may come
// as JSON or as multipart/form-data (with files), where every value is text.
const text = (max) => Joi.string().trim().max(max).allow('', null);
const reference = objectId.allow('', null);
const serverOwned = {
  ticketNumber: Joi.forbidden(),
  customerId: Joi.forbidden(),
  resolvedAt: Joi.forbidden(),
  closedAt: Joi.forbidden(),
  attachments: Joi.forbidden(),
  createdBy: Joi.forbidden(),
};

export const TICKET_SORT_FIELDS = ['ticketNumber', 'subject', 'createdAt', 'updatedAt', 'lastActivityAt'];

export const listTicketsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: Joi.string().trim().max(200).allow(''),
  statusId: objectId.allow(''),
  statusCategory: Joi.string()
    .valid(...Object.values(TICKET_STATUS_CATEGORY))
    .allow(''),
  // Not resolved or closed.
  openOnly: Joi.boolean(),
  priorityId: objectId.allow(''),
  categoryId: objectId.allow(''),
  assignedTo: objectId.allow(''),
  unassigned: Joi.boolean(),
  companyId: objectId.allow(''),
  contactId: objectId.allow(''),
  customerId: objectId.allow(''),
  projectId: objectId.allow(''),
  sortBy: Joi.string()
    .valid(...TICKET_SORT_FIELDS)
    .default('lastActivityAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export const ticketStatsQuery = Joi.object({ assignedTo: objectId.allow('') });

export const createTicketSchema = Joi.object({
  companyId: objectId.required(),
  contactId: reference,
  projectId: reference,
  subject: Joi.string().trim().min(3).max(200).required(),
  description: text(10000),
  categoryId: reference,
  // Omitted: the defaults.
  priorityId: reference,
  statusId: reference,
  // Yourself, or anyone with tickets.assign.
  assignedTo: reference,
  ...serverOwned,
});

// PUT applies the fields that are sent. Status and assignment have their own
// endpoints; the company is fixed.
export const updateTicketSchema = Joi.object({
  contactId: reference,
  projectId: reference,
  subject: Joi.string().trim().min(3).max(200),
  description: text(10000),
  categoryId: reference,
  priorityId: reference,
  companyId: Joi.forbidden(),
  statusId: Joi.forbidden(),
  assignedTo: Joi.forbidden(),
  ...serverOwned,
}).min(1);

// null unassigns.
export const assignTicketSchema = Joi.object({ assignedTo: objectId.allow(null).required() });

export const ticketStatusSchema = Joi.object({ statusId: objectId.required() });

export const messageSchema = Joi.object({ body: Joi.string().trim().min(1).max(10000).required() });

export const attachmentParams = Joi.object({ id: objectId.required(), attachmentId: objectId.required() });
