import Joi from 'joi';
import { CONTACT_METHODS, CONTACT_STATUS, PAGINATION } from '../constants/index.js';
import { email, personName } from './auth.validator.js';
import { objectId } from './common.validator.js';

const status = Joi.string().valid(...Object.values(CONTACT_STATUS));

// Optional fields accept '' or null to clear the stored value.
const text = (max) => Joi.string().trim().max(max).allow('', null);
const phone = Joi.string()
  .trim()
  .pattern(/^\+?[0-9\s\-()]{7,20}$/)
  .allow('', null)
  .messages({ 'string.pattern.base': '{{#label}} must be a valid phone number' });

const fields = {
  designation: text(100),
  department: text(100),
  email: email.allow('', null),
  phone,
  alternatePhone: phone,
  preferredContactMethod: Joi.string()
    .valid(...Object.keys(CONTACT_METHODS))
    .allow('', null),
  notes: text(5000),
};

// Set by the server only.
const serverOwned = { createdBy: Joi.forbidden() };

export const CONTACT_SORT_FIELDS = ['firstName', 'lastName', 'email', 'designation', 'department', 'status', 'createdAt', 'updatedAt'];

export const listContactsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: Joi.string().trim().max(200).allow(''),
  companyId: objectId.allow(''),
  status: status.allow(''),
  sortBy: Joi.string()
    .valid(...CONTACT_SORT_FIELDS)
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

// A person's details without the company - used where the company is decided
// elsewhere (lead conversion).
const personFields = {
  firstName: personName.required(),
  lastName: personName.required(),
  status: status.default(CONTACT_STATUS.ACTIVE),
  ...fields,
  ...serverOwned,
};

export const contactPersonSchema = Joi.object({
  ...personFields,
  // The company is chosen by the caller's context, never by this payload.
  companyId: Joi.forbidden(),
});

export const createContactSchema = Joi.object({
  ...personFields,
  // Shape is checked here; that the company exists is checked in the service.
  companyId: objectId.required(),
});

export const contactOptionsQuery = Joi.object({
  search: Joi.string().trim().max(100).allow(''),
  companyId: objectId.allow(''),
  id: objectId.allow(''),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});

// PUT applies the fields that are sent; anything omitted is left unchanged.
// A contact always has a company, so companyId can be changed but not cleared.
export const updateContactSchema = Joi.object({
  firstName: personName,
  lastName: personName,
  companyId: objectId,
  status,
  ...fields,
  ...serverOwned,
}).min(1);
