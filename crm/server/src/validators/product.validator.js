import Joi from 'joi';
import { PAGINATION, PRODUCT_STATUS } from '../constants/index.js';
import { objectId } from './common.validator.js';

const status = Joi.string().valid(...Object.values(PRODUCT_STATUS));

// Optional fields accept '' or null to clear the stored value.
const text = (max) => Joi.string().trim().max(max).allow('', null);
const reference = objectId.allow('', null);
const money = Joi.number().min(0).max(1e13).precision(2);

// 2-40 characters: letters, digits, dot, dash, underscore; starting with a
// letter or digit. Stored in upper case.
export const sku = Joi.string()
  .trim()
  .uppercase()
  .pattern(/^[A-Z0-9][A-Z0-9._-]{1,39}$/)
  .messages({
    'string.pattern.base':
      '{{#label}} must be 2-40 characters: letters, digits, dot, dash or underscore, starting with a letter or digit',
  });

const fields = {
  description: text(5000),
  categoryId: reference,
  unitId: reference,
  costPrice: money.allow('', null),
  taxId: reference,
  image: Joi.string()
    .trim()
    .uri({ scheme: ['http', 'https'] })
    .max(2048)
    .allow('', null)
    .messages({ 'string.uriCustomScheme': '{{#label}} must be a URL starting with http:// or https://' }),
  organizationId: reference,
};

// Set by the server only.
const serverOwned = { createdBy: Joi.forbidden() };

export const PRODUCT_SORT_FIELDS = ['sku', 'name', 'basePrice', 'costPrice', 'status', 'createdAt', 'updatedAt'];

export const listProductsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: Joi.string().trim().max(200).allow(''),
  categoryId: objectId.allow(''),
  unitId: objectId.allow(''),
  taxId: objectId.allow(''),
  organizationId: objectId.allow(''),
  status: status.allow(''),
  // Selling price range, bounds included. '' means "no bound".
  minPrice: money.allow(''),
  maxPrice: money.allow(''),
  sortBy: Joi.string()
    .valid(...PRODUCT_SORT_FIELDS)
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export const createProductSchema = Joi.object({
  // Omitted or '': the server generates one.
  sku: sku.allow('', null),
  name: Joi.string().trim().min(2).max(200).required(),
  basePrice: money.required(),
  status: status.default(PRODUCT_STATUS.ACTIVE),
  ...fields,
  ...serverOwned,
});

// PUT applies the fields that are sent; anything omitted is left unchanged.
// The SKU identifies the product elsewhere, so it cannot be changed.
export const updateProductSchema = Joi.object({
  sku: Joi.forbidden(),
  name: Joi.string().trim().min(2).max(200),
  basePrice: money,
  status,
  ...fields,
  ...serverOwned,
}).min(1);

export const productOptionsQuery = Joi.object({
  search: Joi.string().trim().max(100).allow(''),
  // Returns just this product - lets a picker show the label of a preselected id.
  id: objectId.allow(''),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});

export const skuCheckQuery = Joi.object({ sku: sku.required() });
