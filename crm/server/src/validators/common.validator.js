import Joi from 'joi';
import { PAGINATION } from '../constants/index.js';

// Reusable building blocks for module validators.

export const objectId = Joi.string()
  .hex()
  .length(24)
  .messages({ 'string.hex': '{{#label}} must be a valid id', 'string.length': '{{#label}} must be a valid id' });

export const idParam = Joi.object({ id: objectId.required() });

export const paginationQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  sort: Joi.string().trim().max(100),
  search: Joi.string().trim().max(200).allow(''),
});
