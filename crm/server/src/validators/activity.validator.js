import Joi from 'joi';
import {
  ACTIVITY_STATUS,
  FOLLOW_UP_STATUS,
  PAGINATION,
  WORK_PRIORITY,
} from '../constants/index.js';
import { PENDING_RELATION_FIELDS, RELATION_FIELDS, RELATION_TYPES } from '../services/relation.service.js';
import { objectId } from './common.validator.js';

// Optional fields accept '' or null to clear the stored value.
const text = (max) => Joi.string().trim().max(max).allow('', null);
const reference = objectId.allow('', null);
const date = Joi.date().iso();
const priority = Joi.string().valid(...Object.values(WORK_PRIORITY));

const paging = {
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
};

// Every relation field, including the ones reserved for future modules: those
// are well-formed ids here and refused with a clear message in the service.
const relationFields = Object.fromEntries(
  [...RELATION_FIELDS, ...Object.keys(PENDING_RELATION_FIELDS)].map((field) => [field, reference])
);

// --- activities ----------------------------------------------------------------

const activityStatus = Joi.string().valid(...Object.values(ACTIVITY_STATUS));

const activityFields = {
  description: text(5000),
  ...relationFields,
  assignedTo: reference,
  dueDate: date.allow('', null),
  // When it was done; cannot be in the future.
  completedAt: date.max('now').allow('', null),
  priority,
};

const serverOwned = { createdBy: Joi.forbidden() };

export const listActivitiesQuery = Joi.object({
  ...paging,
  search: Joi.string().trim().max(200).allow(''),
  typeId: objectId.allow(''),
  status: activityStatus.allow(''),
  priority: priority.allow(''),
  assignedTo: objectId.allow(''),
  ...Object.fromEntries(RELATION_FIELDS.map((field) => [field, objectId.allow('')])),
  dueFrom: date,
  dueTo: date,
  overdue: Joi.boolean(),
  sortBy: Joi.string().valid('createdAt', 'updatedAt', 'dueDate', 'completedAt', 'subject').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export const createActivitySchema = Joi.object({
  typeId: objectId.required(),
  subject: Joi.string().trim().min(2).max(200).required(),
  status: activityStatus,
  ...activityFields,
  ...serverOwned,
});

// PUT applies the fields that are sent; anything omitted is left unchanged.
export const updateActivitySchema = Joi.object({
  typeId: objectId,
  subject: Joi.string().trim().min(2).max(200),
  status: activityStatus,
  ...activityFields,
  ...serverOwned,
}).min(1);

// --- follow-ups ----------------------------------------------------------------

const followUpStatus = Joi.string().valid(...Object.values(FOLLOW_UP_STATUS));
const relatedType = Joi.string().valid(...RELATION_TYPES);

const followUpServerOwned = {
  completedAt: Joi.forbidden(),
  completedBy: Joi.forbidden(),
  createdBy: Joi.forbidden(),
};

export const listFollowUpsQuery = Joi.object({
  ...paging,
  search: Joi.string().trim().max(200).allow(''),
  relatedType: relatedType.allow(''),
  relatedId: objectId.allow(''),
  assignedTo: objectId.allow(''),
  status: followUpStatus.allow(''),
  priority: priority.allow(''),
  dueFrom: date,
  dueTo: date,
  overdue: Joi.boolean(),
  sortBy: Joi.string().valid('dueDate', 'createdAt', 'updatedAt', 'title').default('dueDate'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
});

export const createFollowUpSchema = Joi.object({
  title: Joi.string().trim().min(2).max(300).required(),
  description: text(5000),
  relatedType: relatedType.required(),
  relatedId: objectId.required(),
  assignedTo: reference,
  dueDate: date.required(),
  reminderDate: date.allow('', null),
  priority,
  // A new follow-up is always pending.
  status: Joi.forbidden(),
  ...followUpServerOwned,
});

export const updateFollowUpSchema = Joi.object({
  title: Joi.string().trim().min(2).max(300),
  description: text(5000),
  relatedType,
  relatedId: objectId,
  assignedTo: objectId,
  dueDate: date,
  reminderDate: date.allow('', null),
  priority,
  status: followUpStatus,
  ...followUpServerOwned,
})
  // A record is identified by type and id together.
  .and('relatedType', 'relatedId')
  .min(1);

export const rescheduleFollowUpSchema = Joi.object({
  dueDate: date.required(),
  reminderDate: date.allow('', null),
});
