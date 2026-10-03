import Joi from 'joi';
import { COMPANY_STATUS, PAGINATION } from '../constants/index.js';
import { email } from './auth.validator.js';
import { objectId } from './common.validator.js';

const status = Joi.string().valid(...Object.values(COMPANY_STATUS));

// Optional fields accept '' or null to clear the stored value.
const text = (max) => Joi.string().trim().max(max).allow('', null);
const reference = objectId.allow('', null);

const fields = {
  legalName: text(200),
  industryId: reference,
  companyTypeId: reference,
  email: email.allow('', null),
  phone: Joi.string()
    .trim()
    .pattern(/^\+?[0-9\s\-()]{7,20}$/)
    .allow('', null)
    .messages({ 'string.pattern.base': '{{#label}} must be a valid phone number' }),
  website: Joi.string()
    .trim()
    .uri({ scheme: ['http', 'https'] })
    .max(2048)
    .allow('', null)
    .messages({ 'string.uriCustomScheme': '{{#label}} must be a URL starting with http:// or https://' }),
  address: text(500),
  city: text(100),
  state: text(100),
  country: text(100),
  postalCode: Joi.string()
    .trim()
    .pattern(/^[A-Za-z0-9][A-Za-z0-9\s-]{2,11}$/)
    .allow('', null)
    .messages({ 'string.pattern.base': '{{#label}} must be a valid postal code' }),
  // GSTIN: 2-digit state code + PAN + entity number + "Z" + check character.
  gstNumber: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/)
    .allow('', null)
    .messages({ 'string.pattern.base': '{{#label}} must be a valid 15-character GSTIN' }),
  panNumber: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z]{5}[0-9]{4}[A-Z]$/)
    .allow('', null)
    .messages({ 'string.pattern.base': '{{#label}} must be a valid 10-character PAN' }),
  assignedTo: reference,
  organizationId: reference,
  notes: text(5000),
};

// Set by the server only.
const serverOwned = {
  companyCode: Joi.forbidden(),
  createdBy: Joi.forbidden(),
};

export const COMPANY_SORT_FIELDS = ['companyCode', 'name', 'city', 'state', 'country', 'status', 'createdAt', 'updatedAt'];

export const listCompaniesQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: Joi.string().trim().max(200).allow(''),
  status: status.allow(''),
  industryId: objectId.allow(''),
  companyTypeId: objectId.allow(''),
  organizationId: objectId.allow(''),
  assignedTo: objectId.allow(''),
  city: Joi.string().trim().max(100).allow(''),
  state: Joi.string().trim().max(100).allow(''),
  country: Joi.string().trim().max(100).allow(''),
  sortBy: Joi.string()
    .valid(...COMPANY_SORT_FIELDS)
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export const createCompanySchema = Joi.object({
  name: Joi.string().trim().min(2).max(200).required(),
  status: status.default(COMPANY_STATUS.ACTIVE),
  ...fields,
  ...serverOwned,
});

// PUT applies the fields that are sent; anything omitted is left unchanged.
export const updateCompanySchema = Joi.object({
  name: Joi.string().trim().min(2).max(200),
  status,
  ...fields,
  ...serverOwned,
}).min(1);

export const timelineQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});

export const masterDataQuery = Joi.object({
  search: Joi.string().trim().max(100).allow(''),
});

export const masterDataSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).required(),
  description: text(500),
});

export const companyOptionsQuery = Joi.object({
  search: Joi.string().trim().max(100).allow(''),
  // Returns just this company - lets a picker show the label of a preselected id.
  id: objectId.allow(''),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});

export const userOptionsQuery = Joi.object({
  search: Joi.string().trim().max(100).allow(''),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.MAX_LIMIT),
});
