import { ACTIVITY_STATUS, HTTP_STATUS, MESSAGES, USER_STATUS } from '../constants/index.js';
import Activity from '../models/Activity.js';
import ActivityType from '../models/ActivityType.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { paginationMeta, searchFilter } from '../utils/query.js';
import { registerCompanySection } from './companySection.service.js';
import { registerLeadConfigUsage } from './leadConfig.service.js';
import { PENDING_RELATION_FIELDS, RELATION_FIELDS, resolveRelations } from './relation.service.js';

// People may have been deleted since; their names should still show.
const PERSON = { select: 'firstName lastName email', options: { withDeleted: true } };
const POPULATE = [
  { path: 'typeId', select: 'name color isActive' },
  { path: 'companyId', select: 'companyCode name' },
  { path: 'contactId', select: 'firstName lastName email' },
  { path: 'leadId', select: 'leadNumber title' },
  { path: 'opportunityId', select: 'opportunityNumber name' },
  { path: 'customerId', select: 'customerNumber companyId' },
  { path: 'projectId', select: 'projectNumber name' },
  { path: 'ticketId', select: 'ticketNumber subject' },
  { path: 'contractId', select: 'contractNumber' },
  { path: 'assignedTo', ...PERSON },
  { path: 'createdBy', ...PERSON },
];

const SEARCH_FIELDS = ['subject', 'description'];
const FILTER_FIELDS = ['typeId', 'status', 'priority', 'assignedTo', ...RELATION_FIELDS];
const ALL_RELATION_FIELDS = [...RELATION_FIELDS, ...Object.keys(PENDING_RELATION_FIELDS)];

// Activities appear on the company page, and a type that activities use can
// only be deactivated, not deleted.
registerCompanySection('activities', { count: (companyId) => Activity.countDocuments({ companyId }) });
registerLeadConfigUsage('activityTypes', (typeId) => Activity.countDocuments({ typeId }));

// --- helpers -----------------------------------------------------------------

const idOf = (reference) => (reference ? String(reference._id ?? reference) : '');
const badReference = (field, message) => ApiError.badRequest(message, [{ field, message }]);

async function findActivity(id) {
  const activity = await Activity.findById(id).populate(POPULATE);
  if (!activity) throw ApiError.notFound(MESSAGES.ACTIVITY_NOT_FOUND);
  return activity;
}

async function assertActiveType(typeId) {
  if (!(await ActivityType.exists({ _id: typeId, isActive: true }))) {
    throw badReference('typeId', MESSAGES.ACTIVITY_TYPE_NOT_FOUND);
  }
}

async function assertActiveUser(userId) {
  if (!(await User.exists({ _id: userId, status: USER_STATUS.ACTIVE }))) {
    throw badReference('assignedTo', MESSAGES.ASSIGNEE_NOT_FOUND);
  }
}

// Validates the related records and writes the resulting ids onto the activity.
// `keepCompanyId`: the company to keep when the related records imply none.
async function applyRelations(activity, ids, keepCompanyId) {
  const stored = await resolveRelations(ids);
  if (!stored.companyId && keepCompanyId) stored.companyId = keepCompanyId;
  if (!Object.keys(stored).length) {
    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, MESSAGES.VALIDATION_FAILED, [
      { field: 'relations', message: MESSAGES.ACTIVITY_RELATION_REQUIRED },
    ]);
  }
  for (const field of RELATION_FIELDS) activity[field] = stored[field];
}

// status and completedAt always agree: a completed activity has a completion
// time, and anything else has none.
function applyCompletion(activity, { status, completedAt }) {
  let next = status ?? activity.status;
  // Giving a completion time is saying it is done.
  if (completedAt && status === undefined) next = ACTIVITY_STATUS.COMPLETED;

  activity.status = next;
  if (next === ACTIVITY_STATUS.COMPLETED) {
    activity.completedAt = completedAt || activity.completedAt || new Date();
  } else {
    activity.completedAt = undefined;
  }
}

// --- operations --------------------------------------------------------------

export async function listActivities(query) {
  const { page, limit, search, sortBy, sortOrder, dueFrom, dueTo, overdue } = query;

  const filter = { ...searchFilter(search, SEARCH_FIELDS) };
  for (const field of FILTER_FIELDS) {
    if (query[field]) filter[field] = query[field];
  }
  if (dueFrom || dueTo) {
    filter.dueDate = { ...(dueFrom ? { $gte: dueFrom } : {}), ...(dueTo ? { $lte: dueTo } : {}) };
  }
  // Still pending although the due date has passed.
  if (overdue) {
    filter.status = ACTIVITY_STATUS.PENDING;
    filter.dueDate = { ...(filter.dueDate ?? {}), $lt: new Date() };
  }

  const [activities, total] = await Promise.all([
    Activity.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: -1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE),
    Activity.countDocuments(filter),
  ]);

  return { activities, pagination: paginationMeta({ page, limit }, total) };
}

export async function createActivity(input, actor) {
  await assertActiveType(input.typeId);
  // Whoever records it does it, unless someone else is named.
  const assignedTo = input.assignedTo || actor.id;
  if (assignedTo !== actor.id) await assertActiveUser(assignedTo);

  const activity = new Activity({
    typeId: input.typeId,
    subject: input.subject,
    description: input.description || undefined,
    assignedTo,
    dueDate: input.dueDate || undefined,
    priority: input.priority,
    createdBy: actor.id,
  });
  await applyRelations(activity, input);
  applyCompletion(activity, input);

  await activity.save();
  return findActivity(activity.id);
}

// Applies the fields that are sent. Relations are re-checked as a whole, so the
// result is always consistent (one company, at least one related record).
export async function updateActivity(id, input) {
  const activity = await findActivity(id);

  if (input.typeId && input.typeId !== idOf(activity.typeId)) {
    await assertActiveType(input.typeId);
    activity.typeId = input.typeId;
  }
  if (input.assignedTo && input.assignedTo !== idOf(activity.assignedTo)) {
    await assertActiveUser(input.assignedTo);
    activity.assignedTo = input.assignedTo;
  }

  if (ALL_RELATION_FIELDS.some((field) => field in input)) {
    const merged = Object.fromEntries(
      RELATION_FIELDS.map((field) => [field, field in input ? input[field] : idOf(activity[field])])
    );
    // The stored company may have been derived from the other relations. When
    // those change and no company was sent, derive it again from the new ones,
    // falling back to the current company if they imply none.
    const keepCompanyId = 'companyId' in input ? null : merged.companyId;
    if (!('companyId' in input)) merged.companyId = '';
    for (const field of Object.keys(PENDING_RELATION_FIELDS)) merged[field] = input[field];
    await applyRelations(activity, merged, keepCompanyId);
  }

  if (input.subject) activity.subject = input.subject;
  if ('description' in input) activity.description = input.description || undefined;
  if ('dueDate' in input) activity.dueDate = input.dueDate || undefined;
  if (input.priority) activity.priority = input.priority;
  if (input.status !== undefined || 'completedAt' in input) applyCompletion(activity, input);

  await activity.save();
  return findActivity(id);
}

export async function deleteActivity(id) {
  const activity = await findActivity(id);
  activity.deletedAt = new Date();
  await activity.save();
}
