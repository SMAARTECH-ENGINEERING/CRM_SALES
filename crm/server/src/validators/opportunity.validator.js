import Joi from 'joi';
import { OPPORTUNITY_STATUS, PAGINATION } from '../constants/index.js';
import { objectId } from './common.validator.js';

// Optional fields accept '' or null to clear the stored value.
const text = (max) => Joi.string().trim().max(max).allow('', null);
const reference = objectId.allow('', null);
const money = Joi.number().min(0).max(1e13).precision(2).allow('', null);
const date = Joi.date().iso().allow('', null);
const name = Joi.string().trim().min(2).max(200);
// Percent. Omitted: the stage's own probability.
const probability = Joi.number().integer().min(0).max(100);

const fields = {
  contactId: reference,
  priorityId: reference,
  estimatedValue: money,
  expectedCloseDate: date,
  notes: text(5000),
};

// Set by the server only. Status follows the stage.
const serverOwned = {
  opportunityNumber: Joi.forbidden(),
  status: Joi.forbidden(),
  closedAt: Joi.forbidden(),
  leadId: Joi.forbidden(),
  createdBy: Joi.forbidden(),
};

const paging = {
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
};

export const OPPORTUNITY_SORT_FIELDS = [
  'opportunityNumber',
  'name',
  'estimatedValue',
  'probability',
  'expectedCloseDate',
  'status',
  'createdAt',
  'updatedAt',
];

export const listOpportunitiesQuery = Joi.object({
  ...paging,
  search: Joi.string().trim().max(200).allow(''),
  pipelineId: objectId.allow(''),
  stageId: objectId.allow(''),
  status: Joi.string()
    .valid(...Object.values(OPPORTUNITY_STATUS))
    .allow(''),
  assignedTo: objectId.allow(''),
  companyId: objectId.allow(''),
  contactId: objectId.allow(''),
  priorityId: objectId.allow(''),
  leadId: objectId.allow(''),
  sortBy: Joi.string()
    .valid(...OPPORTUNITY_SORT_FIELDS)
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export const boardQuery = Joi.object({
  // Omitted: the default pipeline.
  pipelineId: objectId.allow(''),
  search: Joi.string().trim().max(200).allow(''),
  assignedTo: objectId.allow(''),
  companyId: objectId.allow(''),
  priorityId: objectId.allow(''),
  // Cards per column.
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});

export const createOpportunitySchema = Joi.object({
  name: name.required(),
  companyId: objectId.required(),
  // Both optional: the default pipeline and its first active stage.
  pipelineId: reference,
  stageId: reference,
  probability: probability.allow('', null),
  assignedTo: reference,
  ...fields,
  ...serverOwned,
});

// PUT applies the fields that are sent. Stage and assignment have their own
// endpoints (and rules), so they are rejected here.
export const updateOpportunitySchema = Joi.object({
  name,
  companyId: objectId,
  probability,
  ...fields,
  pipelineId: Joi.forbidden(),
  stageId: Joi.forbidden(),
  assignedTo: Joi.forbidden(),
  ...serverOwned,
}).min(1);

export const moveOpportunitySchema = Joi.object({
  stageId: objectId.required(),
});

// null unassigns.
export const assignOpportunitySchema = Joi.object({
  assignedTo: objectId.allow(null).required(),
});

export const opportunityPagingQuery = Joi.object(paging);

export const opportunityOptionsQuery = Joi.object({
  search: Joi.string().trim().max(200).allow(''),
  companyId: objectId.allow(''),
  // Returns exactly this opportunity, for a picker with a preselected value.
  id: objectId,
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});
