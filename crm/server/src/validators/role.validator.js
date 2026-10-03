import Joi from 'joi';
import { PAGINATION, ROLE_STATUS } from '../constants/index.js';

const status = Joi.string().valid(...Object.values(ROLE_STATUS));
const name = Joi.string().trim().min(2).max(100);
const description = Joi.string().trim().max(500).allow('', null);

// Permissions are referenced by key ("leads.create"); whether each key exists is
// checked against the database in the service.
const permissionKeys = Joi.array()
  .items(Joi.string().trim().max(101))
  .max(1000)
  .unique();

// Flags that only the seed may set.
const protectedFlags = {
  isSystem: Joi.forbidden(),
  isSuperAdmin: Joi.forbidden(),
  isDefault: Joi.forbidden(),
};

export const listRolesQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: Joi.string().trim().max(200).allow(''),
  status: status.allow(''),
  sortBy: Joi.string().valid('name', 'status', 'createdAt', 'updatedAt').default('name'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
});

export const createRoleSchema = Joi.object({
  name: name.required(),
  description,
  status: status.default(ROLE_STATUS.ACTIVE),
  permissions: permissionKeys.default([]),
  ...protectedFlags,
});

// Applies the fields that are sent. Permissions have their own endpoint.
export const updateRoleSchema = Joi.object({
  name,
  description,
  status,
  permissions: Joi.forbidden(),
  ...protectedFlags,
}).min(1);

// Replaces the role's permissions with exactly this list.
export const rolePermissionsSchema = Joi.object({
  permissions: permissionKeys.required(),
});

export const listPermissionsQuery = Joi.object({
  module: Joi.string().trim().max(50).allow(''),
  search: Joi.string().trim().max(200).allow(''),
});
