import Joi from 'joi';
import { CONTRACT_STATUS_CATEGORY, PAGINATION } from '../constants/index.js';
import { objectId } from './common.validator.js';

// Optional fields accept '' or null to clear the stored value.
const reference = objectId.allow('', null);
const date = Joi.date().iso();
const amount = Joi.number().min(0).max(1e12).precision(2);
const serverOwned = {
  contractNumber: Joi.forbidden(),
  customerId: Joi.forbidden(),
  createdBy: Joi.forbidden(),
};

export const CONTRACT_SORT_FIELDS = ['contractNumber', 'startDate', 'endDate', 'renewalDate', 'amount', 'createdAt', 'updatedAt'];

export const listContractsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: Joi.string().trim().max(200).allow(''),
  statusId: objectId.allow(''),
  statusCategory: Joi.string()
    .valid(...Object.values(CONTRACT_STATUS_CATEGORY))
    .allow(''),
  contractTypeId: objectId.allow(''),
  billingCycleId: objectId.allow(''),
  assignedTo: objectId.allow(''),
  companyId: objectId.allow(''),
  customerId: objectId.allow(''),
  // Active contracts ending within this many days from today.
  expiringWithin: Joi.number().integer().min(0).max(3650).empty(''),
  endFrom: date.empty(''),
  endTo: date.empty(''),
  sortBy: Joi.string()
    .valid(...CONTRACT_SORT_FIELDS)
    .default('endDate'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
});

export const contractStatsQuery = Joi.object({ companyId: objectId.allow(''), assignedTo: objectId.allow('') });

export const contractPagingQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});

export const createContractSchema = Joi.object({
  companyId: objectId.required(),
  contractTypeId: reference,
  startDate: date.required(),
  endDate: date.required(),
  amount: amount.required(),
  // Omitted: the defaults.
  billingCycleId: reference,
  statusId: reference,
  assignedTo: reference,
  renewalDate: date.allow('', null),
  description: Joi.string().trim().max(5000).allow('', null),
  ...serverOwned,
});

// PUT applies the fields that are sent. The status has its own endpoint; the
// company is fixed.
export const updateContractSchema = Joi.object({
  contractTypeId: reference,
  startDate: date,
  endDate: date,
  amount,
  billingCycleId: reference,
  assignedTo: reference,
  renewalDate: date.allow('', null),
  description: Joi.string().trim().max(5000).allow('', null),
  companyId: Joi.forbidden(),
  statusId: Joi.forbidden(),
  ...serverOwned,
}).min(1);

export const contractStatusSchema = Joi.object({ statusId: objectId.required() });
