import Joi from 'joi';
import { PAGINATION, QUOTATION_STATUS_CATEGORY } from '../constants/index.js';
import { objectId } from './common.validator.js';

// Optional fields accept '' or null to clear the stored value.
const text = (max) => Joi.string().trim().max(max).allow('', null);
const reference = objectId.allow('', null);
const date = Joi.date().iso();
const percent = Joi.number().min(0).max(100).precision(2);
// Dropped without complaint: these are always calculated by the server, so a
// value sent by a client is never looked at.
const calculated = Joi.any().strip();

const item = Joi.object({
  productId: objectId.required(),
  description: text(1000),
  quantity: Joi.number().greater(0).max(1e9).precision(3).required(),
  // Before tax. Omitted: the product's selling price.
  unitPrice: Joi.number().min(0).max(1e13).precision(2).allow('', null),
  discountPercent: percent.default(0),
  // Read from the product, or calculated.
  sku: calculated,
  name: calculated,
  unit: calculated,
  taxName: calculated,
  taxRate: calculated,
  discount: calculated,
  tax: calculated,
  total: calculated,
});

const items = Joi.array().items(item).min(1).max(200);

const totals = {
  subtotal: calculated,
  discount: calculated,
  tax: calculated,
  grandTotal: calculated,
};

// Set by the server only.
const serverOwned = {
  quotationNumber: Joi.forbidden(),
  createdBy: Joi.forbidden(),
  sentAt: Joi.forbidden(),
  sentTo: Joi.forbidden(),
  sentBy: Joi.forbidden(),
};

const paging = {
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
};

export const QUOTATION_SORT_FIELDS = [
  'quotationNumber',
  'quotationDate',
  'validUntil',
  'grandTotal',
  'createdAt',
  'updatedAt',
];

export const listQuotationsQuery = Joi.object({
  ...paging,
  search: Joi.string().trim().max(200).allow(''),
  statusId: objectId.allow(''),
  // By what the status means, whatever the statuses are called.
  statusCategory: Joi.string()
    .valid(...Object.values(QUOTATION_STATUS_CATEGORY))
    .allow(''),
  companyId: objectId.allow(''),
  contactId: objectId.allow(''),
  opportunityId: objectId.allow(''),
  createdBy: objectId.allow(''),
  // quotationDate range, both inclusive.
  dateFrom: date.allow(''),
  dateTo: date.allow(''),
  sortBy: Joi.string()
    .valid(...QUOTATION_SORT_FIELDS)
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export const createQuotationSchema = Joi.object({
  companyId: objectId.required(),
  contactId: reference,
  opportunityId: reference,
  // Omitted: today, and today + the profile's validity period.
  quotationDate: date,
  validUntil: date.allow('', null),
  items: items.required(),
  discountPercent: percent.default(0),
  notes: text(5000),
  // Omitted: the default terms from the company profile.
  termsAndConditions: text(5000),
  // Omitted: the configured default status.
  statusId: reference,
  ...totals,
  ...serverOwned,
});

// PUT applies the fields that are sent. `items`, when sent, replaces every
// line. The status has its own endpoint, so it is rejected here.
export const updateQuotationSchema = Joi.object({
  companyId: objectId,
  contactId: reference,
  opportunityId: reference,
  quotationDate: date,
  validUntil: date.allow('', null),
  items,
  discountPercent: percent,
  notes: text(5000),
  termsAndConditions: text(5000),
  statusId: Joi.forbidden(),
  ...totals,
  ...serverOwned,
}).min(1);

export const calculateQuotationSchema = Joi.object({
  items: items.required(),
  discountPercent: percent.default(0),
  // When editing: lets products already on that quotation stay even if inactive.
  quotationId: objectId,
});

export const quotationStatusSchema = Joi.object({
  statusId: objectId.required(),
});

export const sendQuotationSchema = Joi.object({
  // Omitted: the contact's email, else the company's.
  to: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(254).allow('', null),
  subject: text(200),
  message: text(5000),
});

export const quotationPagingQuery = Joi.object(paging);
