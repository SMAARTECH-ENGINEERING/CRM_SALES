import Joi from 'joi';
import { PAGINATION, PROJECT_STATUS_CATEGORY, TASK_STATUS_CATEGORY } from '../constants/index.js';
import { objectId } from './common.validator.js';

// Optional fields accept '' or null to clear the stored value.
const text = (max) => Joi.string().trim().max(max).allow('', null);
const reference = objectId.allow('', null);
const date = Joi.date().iso().allow('', null);
const paging = {
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
};

// --- projects ---------------------------------------------------------------

const projectFields = {
  // The company's customer record. Omitted: found from the company.
  customerId: reference,
  // Must be the company's order.
  orderId: reference,
  description: text(5000),
  startDate: date,
  expectedEndDate: date,
  actualEndDate: date,
  statusId: reference,
  priorityId: reference,
  projectManagerId: reference,
  teamMembers: Joi.array().items(objectId).max(100).unique(),
  budget: Joi.number().min(0).max(1e13).precision(2).allow('', null),
  notes: text(5000),
  projectNumber: Joi.forbidden(),
  createdBy: Joi.forbidden(),
};

export const PROJECT_SORT_FIELDS = ['projectNumber', 'name', 'startDate', 'expectedEndDate', 'budget', 'createdAt', 'updatedAt'];

export const listProjectsQuery = Joi.object({
  ...paging,
  search: Joi.string().trim().max(200).allow(''),
  statusId: objectId.allow(''),
  statusCategory: Joi.string()
    .valid(...Object.values(PROJECT_STATUS_CATEGORY))
    .allow(''),
  priorityId: objectId.allow(''),
  companyId: objectId.allow(''),
  customerId: objectId.allow(''),
  orderId: objectId.allow(''),
  projectManagerId: objectId.allow(''),
  // Projects a person works on, as manager or team member.
  memberId: objectId.allow(''),
  sortBy: Joi.string()
    .valid(...PROJECT_SORT_FIELDS)
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

export const createProjectSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200).required(),
  companyId: objectId.required(),
  ...projectFields,
});

// PUT applies the fields that are sent; `teamMembers` replaces the whole team.
// The company is fixed.
export const updateProjectSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200),
  ...projectFields,
  statusId: objectId,
  companyId: Joi.forbidden(),
}).min(1);

export const projectPagingQuery = Joi.object(paging);

// --- tasks ---------------------------------------------------------------------

export const taskParams = Joi.object({ id: objectId.required(), taskId: objectId.required() });

export const TASK_SORT_FIELDS = ['dueDate', 'startDate', 'title', 'createdAt', 'updatedAt'];

export const listTasksQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.MAX_LIMIT),
  search: Joi.string().trim().max(200).allow(''),
  statusId: objectId.allow(''),
  statusCategory: Joi.string()
    .valid(...Object.values(TASK_STATUS_CATEGORY))
    .allow(''),
  assignedTo: objectId.allow(''),
  milestoneId: objectId.allow(''),
  priorityId: objectId.allow(''),
  // Open tasks past their due date.
  overdue: Joi.boolean(),
  sortBy: Joi.string()
    .valid(...TASK_SORT_FIELDS)
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
});

const taskFields = {
  description: text(5000),
  milestoneId: reference,
  priorityId: reference,
  // The project manager or a team member.
  assignedTo: reference,
  startDate: date,
  dueDate: date,
  estimatedHours: Joi.number().min(0).max(100000).precision(2).allow('', null),
  completedAt: Joi.forbidden(),
  projectId: Joi.forbidden(),
  createdBy: Joi.forbidden(),
};

export const createTaskSchema = Joi.object({
  title: Joi.string().trim().min(2).max(200).required(),
  // Omitted: the default task status.
  statusId: reference,
  ...taskFields,
});

export const updateTaskSchema = Joi.object({
  title: Joi.string().trim().min(2).max(200),
  statusId: objectId,
  ...taskFields,
}).min(1);

// --- milestones ------------------------------------------------------------------

export const milestoneParams = Joi.object({ id: objectId.required(), milestoneId: objectId.required() });

export const createMilestoneSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200).required(),
  description: text(2000),
  dueDate: date,
  completed: Joi.boolean(),
});

export const updateMilestoneSchema = Joi.object({
  name: Joi.string().trim().min(2).max(200),
  description: text(2000),
  dueDate: date,
  // true marks it reached (now); false reopens it.
  completed: Joi.boolean(),
}).min(1);
