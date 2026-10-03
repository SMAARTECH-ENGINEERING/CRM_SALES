import Joi from 'joi';
import { ORDER_STATUS_CATEGORY, PAGINATION } from '../constants/index.js';
import { objectId } from './common.validator.js';

// Optional fields accept '' or null to clear the stored value.
const text = (max) => Joi.string().trim().max(max).allow('', null);
const reference = objectId.allow('', null);
const date = Joi.date().iso();
const percent = Joi.number().min(0).max(100).precision(2);
// Always calculated (or copied) by the server; a value sent by a client is dropped unread.
const calculated = Joi.any().strip();

const item = Joi.object({
  productId: objectId.required(),
  description: text(1000),
  quantity: Joi.number().greater(0).max(1e9).precision(3).required(),
  unitPrice: Joi.number().min(0).max(1e13).precision(2).allow('', null),
  discountPercent: percent.default(0),
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

const totals = { subtotal: calculated, discount: calculated, tax: calculated, grandTotal: calculated };

// Set by the server only.
const serverOwned = { orderNumber: Joi.forbidden(), createdBy: Joi.forbidden() };

// What either way of creating an order may set.
const orderFields = {
  // Omitted: today.
  orderDate: date,
  deliveryDate: date.allow('', null),
  // Omitted: the configured default status.
  statusId: reference,
  assignedTo: reference,
  notes: text(5000),
};

const paging = {
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
};

export const ORDER_SORT_FIELDS = ['orderNumber', 'orderDate', 'deliveryDate', 'grandTotal', 'createdAt', 'updatedAt'];

export const listOrdersQuery = Joi.object({
  ...paging,
  search: Joi.string().trim().max(200).allow(''),
  statusId: objectId.allow(''),
  statusCategory: Joi.string()
    .valid(...Object.values(ORDER_STATUS_CATEGORY))
    .allow(''),
  companyId: objectId.allow(''),
  contactId: objectId.allow(''),
  quotationId: objectId.allow(''),
  assignedTo: objectId.allow(''),
  // orderDate range, both inclusive.
  dateFrom: date.allow(''),
  dateTo: date.allow(''),
  sortBy: Joi.string()
    .valid(...ORDER_SORT_FIELDS)
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

// Either from a quotation (quotationId; the lines come from it, companyId if
// sent must match) or entered directly (companyId and items).
export const createOrderSchema = Joi.object({
  quotationId: objectId,
  companyId: Joi.when('quotationId', { is: Joi.exist(), then: objectId, otherwise: objectId.required() }),
  contactId: Joi.when('quotationId', { is: Joi.exist(), then: Joi.forbidden(), otherwise: reference }),
  items: Joi.when('quotationId', { is: Joi.exist(), then: Joi.forbidden(), otherwise: items.required() }),
  discountPercent: Joi.when('quotationId', { is: Joi.exist(), then: Joi.forbidden(), otherwise: percent.default(0) }),
  ...orderFields,
  ...totals,
  ...serverOwned,
});

// POST /orders/from-quotation/:quotationId. The customer, lines and totals come
// from the quotation; companyId, if sent, is checked against it.
export const fromQuotationSchema = Joi.object({
  companyId: objectId,
  ...orderFields,
  items: Joi.forbidden(),
  ...totals,
  ...serverOwned,
});

export const quotationIdParam = Joi.object({ quotationId: objectId.required() });

// PUT applies the fields that are sent. `items`, when sent, replaces every line.
export const updateOrderSchema = Joi.object({
  contactId: reference,
  items,
  discountPercent: percent,
  orderDate: date,
  deliveryDate: date.allow('', null),
  assignedTo: reference,
  notes: text(5000),
  // The customer and source quotation are fixed; the status has its own endpoint.
  companyId: Joi.forbidden(),
  quotationId: Joi.forbidden(),
  statusId: Joi.forbidden(),
  ...totals,
  ...serverOwned,
}).min(1);

export const orderStatusSchema = Joi.object({ statusId: objectId.required() });

export const orderPagingQuery = Joi.object(paging);

export const orderOptionsQuery = Joi.object({
  search: Joi.string().trim().max(200).allow(''),
  companyId: objectId.allow(''),
  id: objectId,
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});
