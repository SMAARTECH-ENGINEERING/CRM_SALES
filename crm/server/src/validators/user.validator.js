import Joi from 'joi';
import { PAGINATION, USER_STATUS } from '../constants/index.js';
import { email, personName, strongPassword } from './auth.validator.js';
import { objectId } from './common.validator.js';

const status = Joi.string().valid(...Object.values(USER_STATUS));

// Optional text fields accept '' or null to clear the stored value.
const phone = Joi.string()
  .trim()
  .pattern(/^\+?[0-9\s\-()]{7,20}$/)
  .allow('', null)
  .messages({ 'string.pattern.base': '{{#label}} must be a valid phone number' });
const designation = Joi.string().trim().max(100).allow('', null);
const profileImage = Joi.string()
  .trim()
  .uri({ scheme: ['http', 'https'] })
  .max(2048)
  .allow('', null);

// A user's access is decided solely by roleId. Sending permissions (or a role
// object) directly is rejected.
const accessGuards = {
  permissions: Joi.forbidden(),
  role: Joi.forbidden(),
};

export const USER_SORT_FIELDS = ['firstName', 'lastName', 'email', 'designation', 'status', 'lastLogin', 'createdAt'];

export const listUsersQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: Joi.string().trim().max(200).allow(''),
  status: status.allow(''),
  roleId: objectId.allow(''),
  departmentId: objectId.allow(''),
  sortBy: Joi.string()
    .valid(...USER_SORT_FIELDS)
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export const createUserSchema = Joi.object({
  firstName: personName.required(),
  lastName: personName.required(),
  email: email.required(),
  password: strongPassword.required(),
  phone,
  // Omitted -> the default role.
  roleId: objectId,
  departmentId: objectId.allow(null),
  organizationId: objectId.allow(null),
  designation,
  profileImage,
  ...accessGuards,
});

// PUT applies the fields that are sent; anything omitted is left unchanged.
// Status and password have their own endpoints and permissions.
export const updateUserSchema = Joi.object({
  firstName: personName,
  lastName: personName,
  email,
  phone,
  roleId: objectId,
  departmentId: objectId.allow(null),
  organizationId: objectId.allow(null),
  designation,
  profileImage,
  status: Joi.forbidden(),
  password: Joi.forbidden(),
  ...accessGuards,
}).min(1);

export const updateStatusSchema = Joi.object({
  status: status.required(),
});

export const resetPasswordSchema = Joi.object({
  newPassword: strongPassword.required(),
});
