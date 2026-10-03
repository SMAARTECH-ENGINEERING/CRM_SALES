import Joi from 'joi';
import { AUDIT_ACTION, PAGINATION } from '../constants/index.js';
import { objectId } from './common.validator.js';

const date = Joi.date().iso().empty('');

export const listAuditLogsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  // Who did it.
  userId: objectId.empty(''),
  action: Joi.string()
    .valid(...Object.values(AUDIT_ACTION))
    .empty(''),
  // The kind of record, and optionally which one.
  entityType: Joi.string().trim().max(60).empty(''),
  entityId: objectId.empty(''),
  // Both days included.
  from: date,
  to: date,
  // false: refused attempts (failed sign-ins).
  success: Joi.boolean().empty(''),
  // An IP address or part of a request path.
  search: Joi.string().trim().max(200).allow(''),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
}).custom((value, helpers) => (value.from && value.to && value.to < value.from ? helpers.message('"to" must not be before "from"') : value));
