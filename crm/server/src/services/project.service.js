import {
  HTTP_STATUS,
  MESSAGES,
  PROJECT_STATUS_CATEGORY,
  TASK_STATUS_CATEGORY,
  USER_STATUS,
} from '../constants/index.js';
import Activity from '../models/Activity.js';
import Company from '../models/Company.js';
import Customer from '../models/Customer.js';
import LeadPriority from '../models/LeadPriority.js';
import Document from '../models/Document.js';
import Milestone from '../models/Milestone.js';
import Order from '../models/Order.js';
import Project from '../models/Project.js';
import ProjectStatus from '../models/ProjectStatus.js';
import ProjectTask from '../models/ProjectTask.js';
import TaskStatus from '../models/TaskStatus.js';
import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { paginationMeta, searchFilter } from '../utils/query.js';
import { registerCompanySection } from './companySection.service.js';
import { getDefaultEntry, registerLeadConfigUsage } from './leadConfig.service.js';
import { nextSequence } from './sequence.service.js';
import { numberFor } from './settings.service.js';
import { diffSnapshots, listEvents, recordEvent } from './timeline.service.js';

export const PROJECT_ENTITY = 'project';
const DAY_MS = 24 * 60 * 60 * 1000;

// People may have been deleted since; their names should still show.
const PERSON = { select: 'firstName lastName email', options: { withDeleted: true } };
const POPULATE = [
  { path: 'companyId', select: 'companyCode name' },
  { path: 'customerId', select: 'customerNumber' },
  { path: 'orderId', select: 'orderNumber grandTotal', options: { withDeleted: true } },
  { path: 'statusId', select: 'name color category isActive' },
  { path: 'priorityId', select: 'name color level isActive' },
  { path: 'projectManagerId', ...PERSON },
  { path: 'teamMembers', ...PERSON },
  { path: 'createdBy', ...PERSON },
];
const TASK_POPULATE = [
  { path: 'milestoneId', select: 'name dueDate completedAt' },
  { path: 'statusId', select: 'name color category isActive' },
  { path: 'priorityId', select: 'name color level isActive' },
  { path: 'assignedTo', ...PERSON },
  { path: 'createdBy', ...PERSON },
];

const SEARCH_FIELDS = ['projectNumber', 'name', 'description', 'notes'];
const FILTER_FIELDS = ['statusId', 'priorityId', 'companyId', 'customerId', 'orderId', 'projectManagerId'];

const PROJECT_LABELS = {
  name: 'Name',
  description: 'Description',
  order: 'Order',
  status: 'Status',
  priority: 'Priority',
  projectManager: 'Project manager',
  team: 'Team',
  startDate: 'Start date',
  expectedEndDate: 'Expected end date',
  actualEndDate: 'Actual end date',
  budget: 'Budget',
  notes: 'Notes',
};
const TASK_LABELS = {
  title: 'Title',
  description: 'Description',
  milestone: 'Milestone',
  status: 'Status',
  priority: 'Priority',
  assignedTo: 'Assigned to',
  startDate: 'Start date',
  dueDate: 'Due date',
  estimatedHours: 'Estimated hours',
};

const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');
const idOf = (reference) => (reference ? String(reference._id ?? reference) : '');
const empty = (value) => value === undefined || value === null || value === '';
const startOfDay = (date) => new Date(new Date(date).toISOString().slice(0, 10));
const round2 = (value) => Math.round(value * 100) / 100;

function projectSnapshot(project) {
  return {
    name: project.name,
    description: project.description ?? '',
    order: project.orderId?.orderNumber ?? '',
    status: project.statusId?.name ?? '',
    priority: project.priorityId?.name ?? '',
    projectManager: project.projectManagerId?.fullName ?? '',
    team: (project.teamMembers ?? []).map((user) => user.fullName).sort().join(', '),
    startDate: day(project.startDate),
    expectedEndDate: day(project.expectedEndDate),
    actualEndDate: day(project.actualEndDate),
    budget: empty(project.budget) ? '' : String(project.budget),
    notes: project.notes ?? '',
  };
}

function taskSnapshot(task) {
  return {
    title: task.title,
    description: task.description ?? '',
    milestone: task.milestoneId?.name ?? '',
    status: task.statusId?.name ?? '',
    priority: task.priorityId?.name ?? '',
    assignedTo: task.assignedTo?.fullName ?? '',
    startDate: day(task.startDate),
    dueDate: day(task.dueDate),
    estimatedHours: empty(task.estimatedHours) ? '' : String(task.estimatedHours),
  };
}

// --- relationships with other modules ----------------------------------------------

registerCompanySection('projects', { count: (companyId) => Project.countDocuments({ companyId }), blocksDelete: true });
registerLeadConfigUsage('projectStatuses', (statusId) => Project.countDocuments({ statusId }));
registerLeadConfigUsage('taskStatuses', (statusId) => ProjectTask.countDocuments({ statusId }));
registerLeadConfigUsage('priorities', async (priorityId) =>
  (await Project.countDocuments({ priorityId })) + (await ProjectTask.countDocuments({ priorityId }))
);

// --- helpers -----------------------------------------------------------------

const badReference = (field, message) => ApiError.badRequest(message, [{ field, message }]);
const unprocessable = (field, message) =>
  new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, MESSAGES.VALIDATION_FAILED, [{ field, message }]);

// Team members are populated documents on the record; the API returns their
// ids in `teamMembers` and the people in `team`.
function present(project, stats) {
  const json = project.toJSON();
  json.team = json.teamMembers ?? [];
  json.teamMembers = json.team.map((member) => member.id ?? String(member));
  if (stats) json.stats = stats;
  return json;
}

async function findProject(id) {
  const project = await Project.findById(id).populate(POPULATE);
  if (!project) throw ApiError.notFound(MESSAGES.PROJECT_NOT_FOUND);
  return project;
}

async function findTask(project, taskId) {
  const task = await ProjectTask.findOne({ _id: taskId, projectId: project._id }).populate(TASK_POPULATE);
  if (!task) throw ApiError.notFound(MESSAGES.TASK_NOT_FOUND);
  return task;
}

async function findMilestone(project, milestoneId) {
  const milestone = await Milestone.findOne({ _id: milestoneId, projectId: project._id });
  if (!milestone) throw ApiError.notFound(MESSAGES.MILESTONE_NOT_FOUND);
  return milestone;
}

async function activeStatus(Model, kind, statusId, message, noDefault) {
  const id = statusId || (await getDefaultEntry(kind))?.id;
  if (!id) throw ApiError.conflict(noDefault);
  const status = await Model.findOne({ _id: id, isActive: true });
  if (!status) throw badReference('statusId', message);
  return status;
}

async function assertPriority(priorityId) {
  if (priorityId && !(await LeadPriority.exists({ _id: priorityId, isActive: true }))) {
    throw badReference('priorityId', MESSAGES.LEAD_PRIORITY_NOT_FOUND);
  }
}

async function assertUsers(ids, field, message) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  const found = await User.countDocuments({ _id: { $in: unique }, status: USER_STATUS.ACTIVE });
  if (found !== unique.length) throw badReference(field, message);
  return unique;
}

// The order must be the project company's.
async function assertOrder(companyId, orderId) {
  if (!orderId) return;
  const order = await Order.findById(orderId).select('companyId');
  if (!order) throw badReference('orderId', MESSAGES.PROJECT_ORDER_NOT_FOUND);
  if (String(order.companyId) !== String(companyId)) throw badReference('orderId', MESSAGES.PROJECT_ORDER_COMPANY_MISMATCH);
}

// The project's customer is the company's customer record: given or found.
async function resolveCustomer(companyId, customerId) {
  if (customerId) {
    if (!(await Customer.exists({ _id: customerId, companyId }))) {
      throw badReference('customerId', MESSAGES.PROJECT_CUSTOMER_MISMATCH);
    }
    return customerId;
  }
  return (await Customer.findOne({ companyId }).select('_id'))?._id;
}

function assertProjectDates({ startDate, expectedEndDate, actualEndDate }) {
  for (const [field, value] of [
    ['expectedEndDate', expectedEndDate],
    ['actualEndDate', actualEndDate],
  ]) {
    if (startDate && value && startOfDay(value) < startOfDay(startDate)) {
      throw unprocessable(field, MESSAGES.PROJECT_END_BEFORE_START);
    }
  }
}

const dateOrUndefined = (value) => (empty(value) ? undefined : startOfDay(value));

// A project entering a "completed" status gets an actual end date if it has
// none: today, but never before its start date.
function onStatus(project, status) {
  project.statusId = status._id;
  if (status.category === PROJECT_STATUS_CATEGORY.COMPLETED && !project.actualEndDate) {
    const today = startOfDay(new Date());
    project.actualEndDate = project.startDate && project.startDate > today ? project.startDate : today;
  }
}

// A task in a "done" status records when; leaving it clears that.
function onTaskStatus(task, status) {
  task.statusId = status._id;
  if (status.category === TASK_STATUS_CATEGORY.DONE) task.completedAt ??= new Date();
  else task.completedAt = undefined;
}

// Task figures for a set of projects, worked out in the database:
// { [projectId]: { totalTasks, doneTasks, openTasks, overdueTasks, progress } }.
// Cancelled tasks do not count towards progress.
async function taskStats(projectIds) {
  const statuses = await TaskStatus.find().select('category');
  const categoryOf = new Map(statuses.map((status) => [status.id, status.category]));
  const rows = await ProjectTask.aggregate([
    { $match: { projectId: { $in: projectIds }, deletedAt: null } },
    {
      $group: {
        _id: { projectId: '$projectId', statusId: '$statusId' },
        count: { $sum: 1 },
        // A missing date sorts before every date, so check it is a date first.
        overdue: { $sum: { $cond: [{ $and: [{ $eq: [{ $type: '$dueDate' }, 'date'] }, { $lt: ['$dueDate', new Date()] }] }, 1, 0] } },
      },
    },
  ]);

  const stats = new Map(
    projectIds.map((id) => [String(id), { totalTasks: 0, doneTasks: 0, openTasks: 0, overdueTasks: 0, cancelledTasks: 0, progress: null }])
  );
  for (const row of rows) {
    const entry = stats.get(String(row._id.projectId));
    const category = categoryOf.get(String(row._id.statusId));
    entry.totalTasks += row.count;
    if (category === TASK_STATUS_CATEGORY.DONE) entry.doneTasks += row.count;
    else if (category === TASK_STATUS_CATEGORY.CANCELLED) entry.cancelledTasks += row.count;
    else {
      entry.openTasks += row.count;
      entry.overdueTasks += row.overdue;
    }
  }
  for (const entry of stats.values()) {
    const counted = entry.totalTasks - entry.cancelledTasks;
    entry.progress = counted ? Math.round((entry.doneTasks / counted) * 100) : null;
    delete entry.cancelledTasks;
  }
  return stats;
}

const projectEvent = (project, action, actor, extra = {}) =>
  recordEvent({ entityType: PROJECT_ENTITY, entityId: project._id, action, actor, ...extra });

// --- projects ---------------------------------------------------------------

export async function listProjects(query) {
  const { page, limit, sortBy, sortOrder, statusCategory, memberId } = query;

  const filter = { ...searchFilter(query.search, SEARCH_FIELDS) };
  for (const field of FILTER_FIELDS) {
    if (query[field]) filter[field] = query[field];
  }
  if (statusCategory && !filter.statusId) {
    filter.statusId = { $in: await ProjectStatus.distinct('_id', { category: statusCategory }) };
  }
  // Everything a person works on: as manager or as a member.
  if (memberId) {
    filter.$and = [...(filter.$and ?? []), { $or: [{ projectManagerId: memberId }, { teamMembers: memberId }] }];
  }

  const [projects, total] = await Promise.all([
    Project.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE),
    Project.countDocuments(filter),
  ]);
  const stats = await taskStats(projects.map((project) => project._id));
  return {
    projects: projects.map((project) => present(project, stats.get(project.id))),
    pagination: paginationMeta({ page, limit }, total),
  };
}

export async function getProject(id) {
  const project = await findProject(id);
  const stats = await taskStats([project._id]);
  return present(project, stats.get(project.id));
}

export async function createProject(input, actor) {
  if (!(await Company.exists({ _id: input.companyId }))) {
    throw badReference('companyId', MESSAGES.CONTACT_COMPANY_NOT_FOUND);
  }
  const customerId = await resolveCustomer(input.companyId, input.customerId);
  await assertOrder(input.companyId, input.orderId);
  const status = await activeStatus(ProjectStatus, 'projectStatuses', input.statusId, MESSAGES.PROJECT_STATUS_NOT_FOUND, MESSAGES.PROJECT_NO_DEFAULT_STATUS);
  const priorityId = input.priorityId || (await getDefaultEntry('priorities'))?.id;
  await assertPriority(priorityId);
  if (input.projectManagerId) await assertUsers([input.projectManagerId], 'projectManagerId', MESSAGES.ASSIGNEE_NOT_FOUND);
  const teamMembers = await assertUsers(input.teamMembers ?? [], 'teamMembers', MESSAGES.PROJECT_MEMBER_NOT_FOUND);

  const dates = {
    startDate: dateOrUndefined(input.startDate),
    expectedEndDate: dateOrUndefined(input.expectedEndDate),
    actualEndDate: dateOrUndefined(input.actualEndDate),
  };
  assertProjectDates(dates);

  const project = new Project({
    name: input.name,
    companyId: input.companyId,
    customerId,
    orderId: input.orderId || undefined,
    description: input.description || undefined,
    ...dates,
    priorityId: priorityId || undefined,
    projectManagerId: input.projectManagerId || undefined,
    teamMembers,
    budget: empty(input.budget) ? undefined : input.budget,
    notes: input.notes || undefined,
    createdBy: actor.id,
  });
  onStatus(project, status);
  // Taken last, after everything that can fail.
  const number = await nextSequence(PROJECT_ENTITY);
  project.projectNumber = await numberFor('project', number);
  await project.save();

  await projectEvent(project, 'created', actor);
  return getProject(project.id);
}

export async function updateProject(id, input, actor) {
  const project = await findProject(id);
  const before = projectSnapshot(project);
  const companyId = idOf(project.companyId);

  if ('customerId' in input) project.customerId = await resolveCustomer(companyId, input.customerId || undefined);
  if ('orderId' in input && (input.orderId || '') !== idOf(project.orderId)) {
    await assertOrder(companyId, input.orderId);
    project.orderId = input.orderId || undefined;
  }
  if (input.statusId && input.statusId !== idOf(project.statusId)) {
    onStatus(project, await activeStatus(ProjectStatus, 'projectStatuses', input.statusId, MESSAGES.PROJECT_STATUS_NOT_FOUND));
  }
  if ('priorityId' in input) {
    if (input.priorityId && input.priorityId !== idOf(project.priorityId)) await assertPriority(input.priorityId);
    project.priorityId = input.priorityId || undefined;
  }
  if ('projectManagerId' in input && (input.projectManagerId || '') !== idOf(project.projectManagerId)) {
    if (input.projectManagerId) await assertUsers([input.projectManagerId], 'projectManagerId', MESSAGES.ASSIGNEE_NOT_FOUND);
    project.projectManagerId = input.projectManagerId || undefined;
  }
  if (input.teamMembers) {
    // People already on the team stay allowed even if since deactivated.
    const current = new Set(project.teamMembers.map(idOf));
    const added = input.teamMembers.filter((member) => !current.has(member));
    await assertUsers(added, 'teamMembers', MESSAGES.PROJECT_MEMBER_NOT_FOUND);
    project.teamMembers = [...new Set(input.teamMembers)];
  }
  for (const field of ['startDate', 'expectedEndDate', 'actualEndDate']) {
    if (field in input) project[field] = dateOrUndefined(input[field]);
  }
  assertProjectDates(project);
  if (input.name) project.name = input.name;
  for (const field of ['description', 'notes']) {
    if (field in input) project[field] = input[field] || undefined;
  }
  if ('budget' in input) project.budget = empty(input.budget) ? undefined : input.budget;

  await project.save();
  const updated = await findProject(id);
  const changes = diffSnapshots(before, projectSnapshot(updated), PROJECT_LABELS);
  if (changes.length) {
    const statusOnly = changes.length === 1 && changes[0].field === 'status';
    await projectEvent(updated, statusOnly ? 'status_changed' : 'updated', actor, { changes });
  }
  return getProject(id);
}

export async function deleteProject(id, actor) {
  const project = await findProject(id);
  project.deletedAt = new Date();
  await project.save();
  await projectEvent(project, 'deleted', actor);
}

// The project page: every section with its real count, and the figures.
export async function getProjectSummary(id) {
  const project = await findProject(id);
  const now = new Date();
  const [stats, milestones, activities, timeline, hours, tickets, documents] = await Promise.all([
    taskStats([project._id]),
    Milestone.find({ projectId: project._id }).select('dueDate completedAt'),
    Activity.countDocuments({ projectId: project._id }),
    listEvents(PROJECT_ENTITY, project._id, { page: 1, limit: 1 }),
    ProjectTask.aggregate([
      { $match: { projectId: project._id, deletedAt: null } },
      { $group: { _id: null, estimatedHours: { $sum: { $ifNull: ['$estimatedHours', 0] } } } },
    ]),
    Ticket.countDocuments({ projectId: project._id }),
    Document.countDocuments({ entityType: PROJECT_ENTITY, entityId: project._id }),
  ]);
  const tasks = stats.get(project.id);
  const team = new Set([...project.teamMembers.map(idOf), idOf(project.projectManagerId)].filter(Boolean));
  const counts = {
    tasks: tasks.totalTasks,
    milestones: milestones.length,
    team: team.size,
    activities,
    documents,
    tickets,
    timeline: timeline.pagination.total,
  };
  const SECTIONS = [
    ['tasks', 'Tasks'],
    ['milestones', 'Milestones'],
    ['team', 'Team'],
    ['activities', 'Activities'],
    ['documents', 'Documents'],
    ['tickets', 'Tickets'],
    ['timeline', 'Timeline'],
  ];

  return {
    project: present(project, tasks),
    sections: SECTIONS.map(([key, label]) =>
      key in counts ? { key, label, available: true, count: counts[key] } : { key, label, available: false, count: null }
    ),
    metrics: {
      tasks: { ...tasks, estimatedHours: round2(hours[0]?.estimatedHours ?? 0) },
      milestones: {
        total: milestones.length,
        completed: milestones.filter((m) => m.completedAt).length,
        overdue: milestones.filter((m) => !m.completedAt && m.dueDate && m.dueDate < now).length,
      },
      daysRemaining: project.expectedEndDate && !project.actualEndDate
        ? Math.ceil((startOfDay(project.expectedEndDate) - startOfDay(now)) / DAY_MS)
        : null,
    },
  };
}

// Project history, including what happened to its tasks and milestones.
export async function getProjectTimeline(id, query) {
  const project = await findProject(id);
  return listEvents(PROJECT_ENTITY, project._id, query);
}

// --- tasks ---------------------------------------------------------------------

async function assertMilestone(project, milestoneId) {
  if (milestoneId && !(await Milestone.exists({ _id: milestoneId, projectId: project._id }))) {
    throw badReference('milestoneId', MESSAGES.MILESTONE_NOT_FOUND);
  }
}

// Work goes to people on the project: its manager or a team member.
function assertOnTeam(project, userId) {
  if (!userId) return;
  const team = new Set([...project.teamMembers.map(idOf), idOf(project.projectManagerId)]);
  if (!team.has(String(userId))) throw badReference('assignedTo', MESSAGES.TASK_ASSIGNEE_NOT_ON_TEAM);
}

function assertTaskDates(task) {
  if (task.startDate && task.dueDate && startOfDay(task.dueDate) < startOfDay(task.startDate)) {
    throw unprocessable('dueDate', MESSAGES.TASK_DUE_BEFORE_START);
  }
}

export async function listTasks(projectId, query) {
  const project = await findProject(projectId);
  const { page, limit, sortBy, sortOrder, statusCategory, overdue } = query;
  const filter = { projectId: project._id, ...searchFilter(query.search, ['title', 'description']) };
  for (const field of ['statusId', 'assignedTo', 'milestoneId', 'priorityId']) {
    if (query[field]) filter[field] = query[field];
  }
  if (statusCategory && !filter.statusId) {
    filter.statusId = { $in: await TaskStatus.distinct('_id', { category: statusCategory }) };
  }
  if (overdue) {
    const closed = await TaskStatus.distinct('_id', { category: { $in: [TASK_STATUS_CATEGORY.DONE, TASK_STATUS_CATEGORY.CANCELLED] } });
    filter.dueDate = { $lt: new Date() };
    filter.statusId = filter.statusId ? { $in: [filter.statusId].flat(), $nin: closed } : { $nin: closed };
  }

  const [tasks, total] = await Promise.all([
    ProjectTask.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(TASK_POPULATE),
    ProjectTask.countDocuments(filter),
  ]);
  return { tasks, pagination: paginationMeta({ page, limit }, total) };
}

export async function createTask(projectId, input, actor) {
  const project = await findProject(projectId);
  await assertMilestone(project, input.milestoneId);
  const status = await activeStatus(TaskStatus, 'taskStatuses', input.statusId, MESSAGES.TASK_STATUS_NOT_FOUND, MESSAGES.TASK_NO_DEFAULT_STATUS);
  await assertPriority(input.priorityId);
  assertOnTeam(project, input.assignedTo);

  const task = new ProjectTask({
    projectId: project._id,
    title: input.title,
    description: input.description || undefined,
    milestoneId: input.milestoneId || undefined,
    priorityId: input.priorityId || undefined,
    assignedTo: input.assignedTo || undefined,
    startDate: dateOrUndefined(input.startDate),
    dueDate: dateOrUndefined(input.dueDate),
    estimatedHours: empty(input.estimatedHours) ? undefined : input.estimatedHours,
    createdBy: actor.id,
  });
  onTaskStatus(task, status);
  assertTaskDates(task);
  await task.save();

  await projectEvent(project, 'updated', actor, { summary: `Task "${task.title}" added` });
  return findTask(project, task.id);
}

export async function updateTask(projectId, taskId, input, actor) {
  const project = await findProject(projectId);
  const task = await findTask(project, taskId);
  const before = taskSnapshot(task);

  if ('milestoneId' in input && (input.milestoneId || '') !== idOf(task.milestoneId)) {
    await assertMilestone(project, input.milestoneId);
    task.milestoneId = input.milestoneId || undefined;
  }
  if (input.statusId && input.statusId !== idOf(task.statusId)) {
    onTaskStatus(task, await activeStatus(TaskStatus, 'taskStatuses', input.statusId, MESSAGES.TASK_STATUS_NOT_FOUND));
  }
  if ('priorityId' in input) {
    if (input.priorityId && input.priorityId !== idOf(task.priorityId)) await assertPriority(input.priorityId);
    task.priorityId = input.priorityId || undefined;
  }
  if ('assignedTo' in input && (input.assignedTo || '') !== idOf(task.assignedTo)) {
    assertOnTeam(project, input.assignedTo);
    task.assignedTo = input.assignedTo || undefined;
  }
  for (const field of ['startDate', 'dueDate']) {
    if (field in input) task[field] = dateOrUndefined(input[field]);
  }
  assertTaskDates(task);
  if (input.title) task.title = input.title;
  if ('description' in input) task.description = input.description || undefined;
  if ('estimatedHours' in input) task.estimatedHours = empty(input.estimatedHours) ? undefined : input.estimatedHours;

  await task.save();
  const updated = await findTask(project, taskId);
  const changes = diffSnapshots(before, taskSnapshot(updated), TASK_LABELS);
  if (changes.length) {
    await projectEvent(project, 'updated', actor, { summary: `Task "${updated.title}" changed`, changes });
  }
  return updated;
}

export async function deleteTask(projectId, taskId, actor) {
  const project = await findProject(projectId);
  const task = await findTask(project, taskId);
  task.deletedAt = new Date();
  await task.save();
  await projectEvent(project, 'updated', actor, { summary: `Task "${task.title}" deleted` });
}

// --- milestones ------------------------------------------------------------------

// With each milestone's task counts, from the database.
export async function listMilestones(projectId) {
  const project = await findProject(projectId);
  const milestones = await Milestone.find({ projectId: project._id }).sort({ dueDate: 1, createdAt: 1 });
  const done = await TaskStatus.distinct('_id', { category: TASK_STATUS_CATEGORY.DONE });
  const rows = await ProjectTask.aggregate([
    { $match: { projectId: project._id, deletedAt: null, milestoneId: { $ne: null } } },
    { $group: { _id: '$milestoneId', total: { $sum: 1 }, done: { $sum: { $cond: [{ $in: ['$statusId', done] }, 1, 0] } } } },
  ]);
  const byMilestone = new Map(rows.map((row) => [String(row._id), row]));
  return milestones.map((milestone) => ({
    ...milestone.toJSON(),
    totalTasks: byMilestone.get(milestone.id)?.total ?? 0,
    doneTasks: byMilestone.get(milestone.id)?.done ?? 0,
  }));
}

export async function createMilestone(projectId, input, actor) {
  const project = await findProject(projectId);
  const milestone = await Milestone.create({
    projectId: project._id,
    name: input.name,
    description: input.description || undefined,
    dueDate: dateOrUndefined(input.dueDate),
    completedAt: input.completed ? new Date() : undefined,
    createdBy: actor.id,
  });
  await projectEvent(project, 'updated', actor, { summary: `Milestone "${milestone.name}" added` });
  return milestone;
}

export async function updateMilestone(projectId, milestoneId, input, actor) {
  const project = await findProject(projectId);
  const milestone = await findMilestone(project, milestoneId);
  const wasCompleted = Boolean(milestone.completedAt);
  if (input.name) milestone.name = input.name;
  if ('description' in input) milestone.description = input.description || undefined;
  if ('dueDate' in input) milestone.dueDate = dateOrUndefined(input.dueDate);
  if (typeof input.completed === 'boolean') milestone.completedAt = input.completed ? (milestone.completedAt ?? new Date()) : undefined;
  await milestone.save();

  const reached = !wasCompleted && milestone.completedAt;
  await projectEvent(project, 'updated', actor, {
    summary: reached ? `Milestone "${milestone.name}" reached` : `Milestone "${milestone.name}" changed`,
  });
  return milestone;
}

export async function deleteMilestone(projectId, milestoneId, actor) {
  const project = await findProject(projectId);
  const milestone = await findMilestone(project, milestoneId);
  if (await ProjectTask.exists({ milestoneId: milestone._id })) throw ApiError.conflict(MESSAGES.MILESTONE_HAS_TASKS);
  await milestone.deleteOne();
  await projectEvent(project, 'updated', actor, { summary: `Milestone "${milestone.name}" deleted` });
}
