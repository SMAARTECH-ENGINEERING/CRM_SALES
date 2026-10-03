import Joi from 'joi';

const MIN_LENGTH = 2;
const MAX_LENGTH = 100;
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

export const searchQuery = Joi.object({
  // What to look for: words, or a record number.
  q: Joi.string().trim().min(MIN_LENGTH).max(MAX_LENGTH).required(),
  // Results per category.
  limit: Joi.number().integer().min(1).max(MAX_LIMIT).empty('').default(DEFAULT_LIMIT),
});
