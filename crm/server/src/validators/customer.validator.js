import Joi from 'joi';
import { CUSTOMER_STATUS, PAGINATION } from '../constants/index.js';
import { objectId } from './common.validator.js';

const reference = objectId.allow('', null);
const status = Joi.string().valid(...Object.values(CUSTOMER_STATUS));
const date = Joi.date().iso();

// Set by the server only. Company details are never accepted here: they live
// on the company and are edited there.
const serverOwned = {
  customerNumber: Joi.forbidden(),
  firstOrderId: Joi.forbidden(),
  createdBy: Joi.forbidden(),
  name: Joi.forbidden(),
  email: Joi.forbidden(),
  phone: Joi.forbidden(),
  address: Joi.forbidden(),
};

export const CUSTOMER_SORT_FIELDS = ['name', 'customerNumber', 'customerSince', 'createdAt', 'updatedAt'];

export const listCustomersQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  // Every word must match the customer number or the company's name, legal
  // name, code, email, phone or city.
  search: Joi.string().trim().max(200).allow(''),
  status: status.allow(''),
  accountManagerId: objectId.allow(''),
  companyId: objectId.allow(''),
  // The company's classification.
  industryId: objectId.allow(''),
  companyTypeId: objectId.allow(''),
  organizationId: objectId.allow(''),
  // customerSince range, both inclusive.
  sinceFrom: date.allow(''),
  sinceTo: date.allow(''),
  sortBy: Joi.string()
    .valid(...CUSTOMER_SORT_FIELDS)
    .default('name'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
});

export const createCustomerSchema = Joi.object({
  companyId: objectId.required(),
  primaryContactId: reference,
  // Omitted: the company's assigned user.
  accountManagerId: reference,
  status: status.default(CUSTOMER_STATUS.ACTIVE),
  // Omitted: the date of its first order, or today.
  customerSince: date,
  notes: Joi.string().trim().max(5000).allow('', null),
  ...serverOwned,
});

// PUT applies the fields that are sent. The company is fixed.
export const updateCustomerSchema = Joi.object({
  primaryContactId: reference,
  accountManagerId: reference,
  status,
  customerSince: date,
  notes: Joi.string().trim().max(5000).allow('', null),
  companyId: Joi.forbidden(),
  ...serverOwned,
}).min(1);

export const customerPagingQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});
