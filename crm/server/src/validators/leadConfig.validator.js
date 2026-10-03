import Joi from 'joi';
import {
  CONTRACT_STATUS_CATEGORY,
  LEAD_STATUS_CATEGORY,
  ORDER_STATUS_CATEGORY,
  PAYMENT_STATUS_CATEGORY,
  PROJECT_STATUS_CATEGORY,
  QUOTATION_STATUS_CATEGORY,
  TASK_STATUS_CATEGORY,
  TICKET_STATUS_CATEGORY,
} from '../constants/index.js';

const name = Joi.string().trim().min(2).max(60);
const description = Joi.string().trim().max(300).allow('', null);
const sortOrder = Joi.number().integer().min(0).max(100000);
const color = Joi.string()
  .trim()
  .lowercase()
  .pattern(/^#[0-9a-f]{6}$/)
  .messages({ 'string.pattern.base': '{{#label}} must be a hex colour such as #1976d2' });

const common = { description, sortOrder, isActive: Joi.boolean() };

// Fields beyond the common ones, per list. `required` applies on create only.
const EXTRA = {
  sources: {},
  statuses: {
    category: { schema: Joi.string().valid(...Object.values(LEAD_STATUS_CATEGORY)), required: false },
    color: { schema: color.allow('', null), required: false },
    isQualified: { schema: Joi.boolean(), required: false },
    isDefault: { schema: Joi.boolean(), required: false },
  },
  priorities: {
    level: { schema: Joi.number().integer().min(1).max(100), required: true },
    color: { schema: color.allow('', null), required: false },
    isDefault: { schema: Joi.boolean(), required: false },
  },
  activityTypes: {
    color: { schema: color.allow('', null), required: false },
  },
  productCategories: {
    skuPrefix: {
      schema: Joi.string()
        .trim()
        .uppercase()
        .pattern(/^[A-Z0-9]{1,10}$/)
        .allow('', null)
        .messages({ 'string.pattern.base': '{{#label}} must be 1-10 letters or digits' }),
      required: false,
    },
  },
  units: {
    symbol: { schema: Joi.string().trim().min(1).max(15), required: true },
  },
  taxes: {
    // A percentage: 18 means 18%.
    rate: { schema: Joi.number().min(0).max(100).precision(3), required: true },
  },
  ticketCategories: {
    color: { schema: color.allow('', null), required: false },
  },
  ticketPriorities: {
    level: { schema: Joi.number().integer().min(1).max(100), required: true },
    color: { schema: color.allow('', null), required: false },
    isDefault: { schema: Joi.boolean(), required: false },
  },
  ticketStatuses: {
    category: { schema: Joi.string().valid(...Object.values(TICKET_STATUS_CATEGORY)), required: false },
    color: { schema: color.allow('', null), required: false },
    isDefault: { schema: Joi.boolean(), required: false },
  },
  projectStatuses: {
    category: { schema: Joi.string().valid(...Object.values(PROJECT_STATUS_CATEGORY)), required: false },
    color: { schema: color.allow('', null), required: false },
    isDefault: { schema: Joi.boolean(), required: false },
  },
  taskStatuses: {
    category: { schema: Joi.string().valid(...Object.values(TASK_STATUS_CATEGORY)), required: false },
    color: { schema: color.allow('', null), required: false },
    isDefault: { schema: Joi.boolean(), required: false },
  },
  orderStatuses: {
    category: { schema: Joi.string().valid(...Object.values(ORDER_STATUS_CATEGORY)), required: false },
    color: { schema: color.allow('', null), required: false },
    isDefault: { schema: Joi.boolean(), required: false },
  },
  quotationStatuses: {
    category: { schema: Joi.string().valid(...Object.values(QUOTATION_STATUS_CATEGORY)), required: false },
    color: { schema: color.allow('', null), required: false },
    isDefault: { schema: Joi.boolean(), required: false },
  },
  paymentMethods: {
    color: { schema: color.allow('', null), required: false },
  },
  paymentStatuses: {
    category: { schema: Joi.string().valid(...Object.values(PAYMENT_STATUS_CATEGORY)), required: true },
    color: { schema: color.allow('', null), required: false },
  },
  contractTypes: {
    color: { schema: color.allow('', null), required: false },
  },
  contractStatuses: {
    category: { schema: Joi.string().valid(...Object.values(CONTRACT_STATUS_CATEGORY)), required: false },
    color: { schema: color.allow('', null), required: false },
    isDefault: { schema: Joi.boolean(), required: false },
  },
  billingCycles: {
    // The length of one cycle; empty for a one-time charge.
    months: { schema: Joi.number().integer().min(1).max(120).allow('', null), required: false },
    isDefault: { schema: Joi.boolean(), required: false },
  },
  contractReminderPeriods: {
    // 0 means on the end date itself.
    daysBefore: { schema: Joi.number().integer().min(0).max(365), required: true },
  },
};

function extraFields(kind, { forCreate }) {
  return Object.fromEntries(
    Object.entries(EXTRA[kind]).map(([field, { schema, required }]) => [
      field,
      forCreate && required ? schema.required() : schema,
    ])
  );
}

export function createLeadConfigSchema(kind) {
  return Joi.object({ name: name.required(), ...common, ...extraFields(kind, { forCreate: true }) });
}

// PUT applies the fields that are sent; anything omitted is left unchanged.
export function updateLeadConfigSchema(kind) {
  return Joi.object({ name, ...common, ...extraFields(kind, { forCreate: false }) }).min(1);
}

export const listLeadConfigQuery = Joi.object({
  // Omitted: everything. true: what lead forms offer. false: only deactivated values.
  isActive: Joi.boolean(),
  search: Joi.string().trim().max(60).allow(''),
});
