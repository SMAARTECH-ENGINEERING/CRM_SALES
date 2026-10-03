import { FOLLOW_UP_STATUS, HTTP_STATUS, MESSAGES, USER_STATUS } from '../constants/index.js';
import FollowUp from '../models/FollowUp.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { paginationMeta, searchFilter } from '../utils/query.js';
import { describeRelated, loadRelated } from './relation.service.js';

// People may have been deleted since; their names should still show.
const person = (path) => ({ path, select: 'firstName lastName email', options: { withDeleted: true } });
const PEOPLE = [person('assignedTo'), person('completedBy'), person('createdBy')];

const SEARCH_FIELDS = ['title', 'description'];

// --- helpers -----------------------------------------------------------------

const idOf = (reference) => (reference ? String(reference._id ?? reference) : '');
const unprocessable = (field, message) =>
  new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, MESSAGES.VALIDATION_FAILED, [{ field, message }]);

async function findFollowUp(id) {
  const followUp = await FollowUp.findById(id).populate(PEOPLE);
  if (!followUp) throw ApiError.notFound(MESSAGES.FOLLOW_UP_NOT_FOUND);
  return followUp;
}

async function assertActiveUser(userId) {
  if (!(await User.exists({ _id: userId, status: USER_STATUS.ACTIVE }))) {
    throw ApiError.badRequest(MESSAGES.ASSIGNEE_NOT_FOUND, [
      { field: 'assignedTo', message: MESSAGES.ASSIGNEE_NOT_FOUND },
    ]);
  }
}

// A reminder after the deadline would be pointless.
function assertReminderBeforeDue(followUp) {
  if (followUp.reminderDate && followUp.reminderDate > followUp.dueDate) {
    throw unprocessable('reminderDate', MESSAGES.FOLLOW_UP_REMINDER_AFTER_DUE);
  }
}

function setStatus(followUp, status, actor) {
  followUp.status = status;
  const completed = status === FOLLOW_UP_STATUS.COMPLETED;
  followUp.completedAt = completed ? (followUp.completedAt ?? new Date()) : undefined;
  followUp.completedBy = completed ? (followUp.completedBy ?? actor.id) : undefined;
}

// Adds `related: { type, id, label }` - what the follow-up is about - or null
// when that record no longer exists.
async function present(followUps) {
  const described = await describeRelated(followUps);
  return followUps.map((followUp) => ({
    ...followUp.toJSON(),
    related: described.get(`${followUp.relatedType}:${followUp.relatedId}`) ?? null,
  }));
}

const presentOne = async (followUp) => (await present([followUp]))[0];

// --- operations --------------------------------------------------------------

export async function listFollowUps(query) {
  const { page, limit, search, sortBy, sortOrder, relatedType, relatedId, assignedTo, status, priority, overdue, dueFrom, dueTo } = query;

  const filter = { ...searchFilter(search, SEARCH_FIELDS) };
  if (relatedType) filter.relatedType = relatedType;
  if (relatedId) filter.relatedId = relatedId;
  if (assignedTo) filter.assignedTo = assignedTo;
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (dueFrom || dueTo) {
    filter.dueDate = { ...(dueFrom ? { $gte: dueFrom } : {}), ...(dueTo ? { $lte: dueTo } : {}) };
  }
  // Still pending although the due date has passed.
  if (overdue) {
    filter.status = FOLLOW_UP_STATUS.PENDING;
    filter.dueDate = { ...(filter.dueDate ?? {}), $lt: new Date() };
  }

  const [followUps, total] = await Promise.all([
    FollowUp.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(PEOPLE),
    FollowUp.countDocuments(filter),
  ]);

  return { followUps: await present(followUps), pagination: paginationMeta({ page, limit }, total) };
}

export async function createFollowUp(input, actor) {
  // The record it is about must exist.
  await loadRelated(input.relatedType, input.relatedId, 'relatedId');

  // Whoever creates it does it, unless someone else is named.
  const assignedTo = input.assignedTo || actor.id;
  if (assignedTo !== actor.id) await assertActiveUser(assignedTo);

  const followUp = new FollowUp({
    title: input.title,
    description: input.description || undefined,
    relatedType: input.relatedType,
    relatedId: input.relatedId,
    assignedTo,
    dueDate: input.dueDate,
    reminderDate: input.reminderDate || undefined,
    priority: input.priority,
    createdBy: actor.id,
  });
  assertReminderBeforeDue(followUp);

  await followUp.save();
  return presentOne(await findFollowUp(followUp.id));
}

// Applies the fields that are sent. Setting status here is how a follow-up is
// cancelled or reopened; completing and rescheduling also have their own endpoints.
export async function updateFollowUp(id, input, actor) {
  const followUp = await findFollowUp(id);

  const relatedType = input.relatedType ?? followUp.relatedType;
  const relatedId = input.relatedId ?? String(followUp.relatedId);
  if (relatedType !== followUp.relatedType || relatedId !== String(followUp.relatedId)) {
    await loadRelated(relatedType, relatedId, 'relatedId');
    followUp.relatedType = relatedType;
    followUp.relatedId = relatedId;
  }

  if (input.assignedTo && input.assignedTo !== idOf(followUp.assignedTo)) {
    await assertActiveUser(input.assignedTo);
    followUp.assignedTo = input.assignedTo;
  }

  if (input.title) followUp.title = input.title;
  if ('description' in input) followUp.description = input.description || undefined;
  if (input.dueDate) followUp.dueDate = input.dueDate;
  if ('reminderDate' in input) followUp.reminderDate = input.reminderDate || undefined;
  if (input.priority) followUp.priority = input.priority;
  if (input.status && input.status !== followUp.status) setStatus(followUp, input.status, actor);
  assertReminderBeforeDue(followUp);

  await followUp.save();
  return presentOne(await findFollowUp(id));
}

// Completing twice is harmless: the first completion time and person are kept.
export async function completeFollowUp(id, actor) {
  const followUp = await findFollowUp(id);
  if (followUp.status !== FOLLOW_UP_STATUS.COMPLETED) {
    setStatus(followUp, FOLLOW_UP_STATUS.COMPLETED, actor);
    await followUp.save();
  }
  return presentOne(await findFollowUp(id));
}

// Moves the deadline of a follow-up that is still to be done. A reminder that
// would now fall after the new deadline must be sent along or it is dropped.
export async function rescheduleFollowUp(id, { dueDate, reminderDate }) {
  const followUp = await findFollowUp(id);
  if (followUp.status !== FOLLOW_UP_STATUS.PENDING) {
    throw ApiError.conflict(MESSAGES.FOLLOW_UP_NOT_PENDING);
  }

  followUp.dueDate = dueDate;
  if (reminderDate !== undefined) {
    followUp.reminderDate = reminderDate || undefined;
    assertReminderBeforeDue(followUp);
  } else if (followUp.reminderDate && followUp.reminderDate > followUp.dueDate) {
    followUp.reminderDate = undefined;
  }

  await followUp.save();
  return presentOne(await findFollowUp(id));
}
