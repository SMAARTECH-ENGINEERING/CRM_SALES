import Joi from 'joi';
import { LEAD_STATUS_CATEGORY, PAGINATION } from '../constants/index.js';
import { objectId } from './common.validator.js';
import { createCompanySchema } from './company.validator.js';
import { contactPersonSchema } from './contact.validator.js';

// Optional fields accept '' or null to clear the stored value.
const text = (max) => Joi.string().trim().max(max).allow('', null);
const reference = objectId.allow('', null);
const money = Joi.number().min(0).max(1e13).precision(2).allow('', null);
const date = Joi.date().iso().allow('', null);

const tags = Joi.array()
  .items(Joi.string().trim().min(1).max(30))
  .max(20)
  // "VIP" and "vip" are the same tag.
  .unique((a, b) => a.toLowerCase() === b.toLowerCase());

const fields = {
  description: text(5000),
  companyId: reference,
  contactId: reference,
  sourceId: reference,
  priorityId: reference,
  estimatedValue: money,
  expectedCloseDate: date,
  notes: text(5000),
  tags,
  organizationId: reference,
};

// Set by the server only.
const serverOwned = {
  leadNumber: Joi.forbidden(),
  createdBy: Joi.forbidden(),
  convertedAt: Joi.forbidden(),
  convertedBy: Joi.forbidden(),
  opportunityId: Joi.forbidden(),
};

const paging = {
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
};

// POST /leads/bulk-email: one message for the people behind several leads.
// {{greeting}}, {{contactName}}, {{companyName}}, {{leadTitle}}, {{leadNumber}}
// and {{senderCompany}} are filled in for each recipient.
export const bulkEmailSchema = Joi.object({
  leadIds: Joi.array().items(objectId.required()).min(1).max(100).unique().required(),
  subject: Joi.string().trim().min(1).max(200).pattern(/^[^\r\n]*$/).required().messages({ 'string.pattern.base': '{{#label}} must be one line' }),
  message: Joi.string().trim().min(1).max(10000).required(),
});

export const LEAD_SORT_FIELDS = ['leadNumber', 'title', 'estimatedValue', 'expectedCloseDate', 'createdAt', 'updatedAt'];

export const listLeadsQuery = Joi.object({
  ...paging,
  search: Joi.string().trim().max(200).allow(''),
  statusId: objectId.allow(''),
  sourceId: objectId.allow(''),
  priorityId: objectId.allow(''),
  assignedTo: objectId.allow(''),
  companyId: objectId.allow(''),
  contactId: objectId.allow(''),
  organizationId: objectId.allow(''),
  // By what the status means (open / won / lost), whatever the statuses are called.
  statusCategory: Joi.string()
    .valid(...Object.values(LEAD_STATUS_CATEGORY))
    .allow(''),
  converted: Joi.boolean(),
  sortBy: Joi.string()
    .valid(...LEAD_SORT_FIELDS)
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export const createLeadSchema = Joi.object({
  title: Joi.string().trim().min(2).max(200).required(),
  // Omitted: the configured default status.
  statusId: reference,
  assignedTo: reference,
  ...fields,
  ...serverOwned,
});

// PUT applies the fields that are sent. Status and assignment have their own
// endpoints (and permissions), so they are rejected here.
export const updateLeadSchema = Joi.object({
  title: Joi.string().trim().min(2).max(200),
  ...fields,
  statusId: Joi.forbidden(),
  assignedTo: Joi.forbidden(),
  ...serverOwned,
}).min(1);

// null unassigns.
export const assignLeadSchema = Joi.object({
  assignedTo: objectId.allow(null).required(),
});

export const leadStatusSchema = Joi.object({
  statusId: objectId.required(),
});

// Company / contact details are needed only when the lead does not already
// point at one. They are validated exactly like a normal create.
export const convertLeadSchema = Joi.object({
  company: createCompanySchema,
  contact: contactPersonSchema,
  opportunity: Joi.object({
    // Omitted: the lead's title.
    name: Joi.string().trim().min(2).max(200),
    // Omitted: the default pipeline and its first active stage.
    pipelineId: objectId,
    stageId: objectId,
    estimatedValue: money,
    expectedCloseDate: date,
    notes: text(5000),
  }),
  // The status the lead moves to. Omitted: the first active "won" status.
  statusId: objectId,
  // true: report what would happen without changing anything.
  dryRun: Joi.boolean().default(false),
});

export const leadPagingQuery = Joi.object(paging);
