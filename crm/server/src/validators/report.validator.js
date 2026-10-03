import Joi from 'joi';
import { PAGINATION } from '../constants/index.js';
import { REPORT_FILTER_KEYS, REPORT_KEYS } from '../services/report.definitions.js';
import { EXPORT_FORMATS } from '../services/report.service.js';
import { objectId } from './common.validator.js';

const date = Joi.date().iso().empty('');

export const reportParams = Joi.object({ key: Joi.string().valid(...REPORT_KEYS).required() });

// What every report takes. Which filters, date fields and sort columns a
// particular report understands is checked against its definition in the service.
const common = {
  from: date,
  to: date,
  dateField: Joi.string().trim().max(40).empty(''),
  search: Joi.string().trim().max(200).allow(''),
  sortBy: Joi.string().trim().max(40).empty(''),
  sortOrder: Joi.string().valid('asc', 'desc').empty(''),
  organizationId: objectId.empty(''),
  ...Object.fromEntries(REPORT_FILTER_KEYS.map((key) => [key, Joi.string().trim().max(100).empty('')])),
};
const forwards = (value, helpers) => (value.from && value.to && value.to < value.from ? helpers.message('"to" must not be before "from"') : value);

export const runReportQuery = Joi.object({
  ...common,
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
}).custom(forwards);

export const exportReportQuery = Joi.object({
  ...common,
  format: Joi.string()
    .valid(...EXPORT_FORMATS)
    .default('csv'),
}).custom(forwards);
