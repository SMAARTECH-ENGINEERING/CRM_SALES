import Joi from 'joi';
import { PAGINATION, PAYMENT_STATE } from '../constants/index.js';
import { objectId } from './common.validator.js';

// Optional fields accept '' or null to clear the stored value.
const reference = objectId.allow('', null);
const date = Joi.date().iso();
const money = Joi.number().max(1e12).precision(2);
// Worked out or set by the server; a client that sends them is told so.
const serverOwned = {
  remainingAmount: Joi.forbidden().messages({ 'any.unknown': 'remainingAmount is calculated by the server and cannot be sent' }),
  customerId: Joi.forbidden(),
  createdBy: Joi.forbidden(),
};

export const PAYMENT_SORT_FIELDS = ['invoiceNumber', 'amount', 'paidAmount', 'remainingAmount', 'dueDate', 'paymentDate', 'createdAt', 'updatedAt'];

export const listPaymentsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: Joi.string().trim().max(200).allow(''),
  // paid | partially_paid | unpaid | overdue | cancelled
  state: Joi.string()
    .valid(...Object.values(PAYMENT_STATE))
    .empty(''),
  statusId: objectId.allow(''),
  paymentMethodId: objectId.allow(''),
  companyId: objectId.allow(''),
  customerId: objectId.allow(''),
  orderId: objectId.allow(''),
  dueFrom: date.empty(''),
  dueTo: date.empty(''),
  sortBy: Joi.string()
    .valid(...PAYMENT_SORT_FIELDS)
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export const paymentStatsQuery = Joi.object({
  companyId: objectId.empty(''),
  customerId: objectId.empty(''),
  orderId: objectId.empty(''),
});

export const paymentPagingQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});

export const createPaymentSchema = Joi.object({
  // Omitted: generated.
  invoiceNumber: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z0-9][A-Z0-9/_.-]{0,39}$/)
    .allow('', null)
    .messages({ 'string.pattern.base': '{{#label}} may contain letters, digits and / _ . - (max 40)' }),
  companyId: objectId.required(),
  orderId: reference,
  amount: money.greater(0).required(),
  paidAmount: money.min(0),
  dueDate: date.allow('', null),
  paymentDate: date.allow('', null),
  paymentMethodId: reference,
  // Only to cancel, or to pick among statuses of the meaning the amounts give.
  statusId: reference,
  notes: Joi.string().trim().max(5000).allow('', null),
  ...serverOwned,
});

// PUT applies the fields that are sent. Money received is either the new
// total (paidAmount) or an amount to add (receivedAmount) - not both.
export const updatePaymentSchema = Joi.object({
  orderId: reference,
  amount: money.greater(0),
  paidAmount: money.min(0),
  receivedAmount: money.greater(0),
  dueDate: date.allow('', null),
  paymentDate: date.allow('', null),
  paymentMethodId: reference,
  statusId: reference,
  notes: Joi.string().trim().max(5000).allow('', null),
  companyId: Joi.forbidden(),
  invoiceNumber: Joi.forbidden(),
  ...serverOwned,
})
  .min(1)
  .oxor('paidAmount', 'receivedAmount');
