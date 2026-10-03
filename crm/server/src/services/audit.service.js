import logger from '../config/logger.js';
import { AUDIT_ACTION, MESSAGES } from '../constants/index.js';
import Activity from '../models/Activity.js';
import AuditLog from '../models/AuditLog.js';
import Company from '../models/Company.js';
import CompanyType from '../models/CompanyType.js';
import Contact from '../models/Contact.js';
import Contract from '../models/Contract.js';
import Customer from '../models/Customer.js';
import Document from '../models/Document.js';
import FollowUp from '../models/FollowUp.js';
import Industry from '../models/Industry.js';
import Lead from '../models/Lead.js';
import Opportunity from '../models/Opportunity.js';
import Order from '../models/Order.js';
import Organization from '../models/Organization.js';
import Payment from '../models/Payment.js';
import Pipeline from '../models/Pipeline.js';
import PipelineStage from '../models/PipelineStage.js';
import Product from '../models/Product.js';
import Project from '../models/Project.js';
import Quotation from '../models/Quotation.js';
import Role from '../models/Role.js';
import Ticket from '../models/Ticket.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { declarePermission, hasPermission } from '../utils/permissions.js';
import { paginationMeta } from '../utils/query.js';
import { LEAD_CONFIG } from './leadConfig.service.js';
import { startOfDay } from './lineItems.service.js';

// The audit trail. Entries are written by middleware/audit.js for every
// request that changes something; this module knows which record a request is
// about, strips secrets from what is stored, and serves the log to those
// allowed to read it.

const DAY_MS = 24 * 60 * 60 * 1000;
const VIEW_ALL = declarePermission('audit.viewAll');
const lowerFirst = (text) => text.charAt(0).toLowerCase() + text.slice(1);

// --- which record a request is about ---------------------------------------------------

// The first path segment after the API prefix -> the collection behind it.
const MODELS = {
  companies: Company,
  contacts: Contact,
  leads: Lead,
  opportunities: Opportunity,
  quotations: Quotation,
  orders: Order,
  customers: Customer,
  projects: Project,
  tickets: Ticket,
  contracts: Contract,
  payments: Payment,
  documents: Document,
  products: Product,
  activities: Activity,
  followups: FollowUp,
  users: User,
  roles: Role,
  pipelines: Pipeline,
  'pipeline-stages': PipelineStage,
  industries: Industry,
  'company-types': CompanyType,
  organizations: Organization,
  // The administrator-managed lists.
  'lead-sources': LEAD_CONFIG.sources.Model,
  'lead-statuses': LEAD_CONFIG.statuses.Model,
  'lead-priorities': LEAD_CONFIG.priorities.Model,
  'activity-types': LEAD_CONFIG.activityTypes.Model,
  'product-categories': LEAD_CONFIG.productCategories.Model,
  units: LEAD_CONFIG.units.Model,
  taxes: LEAD_CONFIG.taxes.Model,
  'quotation-statuses': LEAD_CONFIG.quotationStatuses.Model,
  'order-statuses': LEAD_CONFIG.orderStatuses.Model,
  'project-statuses': LEAD_CONFIG.projectStatuses.Model,
  'task-statuses': LEAD_CONFIG.taskStatuses.Model,
  'ticket-categories': LEAD_CONFIG.ticketCategories.Model,
  'ticket-priorities': LEAD_CONFIG.ticketPriorities.Model,
  'ticket-statuses': LEAD_CONFIG.ticketStatuses.Model,
  'contract-types': LEAD_CONFIG.contractTypes.Model,
  'contract-statuses': LEAD_CONFIG.contractStatuses.Model,
  'billing-cycles': LEAD_CONFIG.billingCycles.Model,
  'contract-reminder-periods': LEAD_CONFIG.contractReminderPeriods.Model,
  'payment-methods': LEAD_CONFIG.paymentMethods.Model,
  'payment-statuses': LEAD_CONFIG.paymentStatuses.Model,
};
// Requests that change nothing worth a line: token renewal, a price preview,
// a user's own notification inbox.
const IGNORED = [/^\/auth\/refresh-token$/, /^\/quotations\/calculate$/, /^\/notifications(\/|$)/, /^\/contracts\/reminders\/run$/];
const OBJECT_ID = /^[0-9a-f]{24}$/i;

// What a request means: { action, entityType, entityId, Model } - or null when
// it is not audited. `path` is the path after the API prefix.
export function describeRequest(method, path, body = {}) {
  if (IGNORED.some((pattern) => pattern.test(path))) return null;
  const [resource, second, ...rest] = path.split('/').filter(Boolean);
  const last = rest.at(-1) ?? second ?? '';

  if (resource === 'auth') {
    const actions = { login: AUDIT_ACTION.LOGIN, logout: AUDIT_ACTION.LOGOUT, 'change-password': AUDIT_ACTION.PASSWORD_CHANGE, register: AUDIT_ACTION.CREATE };
    return actions[second] ? { action: actions[second], entityType: 'user', auth: second } : null;
  }

  const Model = MODELS[resource];
  const target = { entityType: Model ? lowerFirst(Model.modelName) : resource, entityId: OBJECT_ID.test(second ?? '') ? second : null, Model };
  let action = { POST: AUDIT_ACTION.CREATE, PUT: AUDIT_ACTION.UPDATE, PATCH: AUDIT_ACTION.UPDATE, DELETE: AUDIT_ACTION.DELETE }[method];
  // Something added to an existing record (a reply, a task) is a change to that record.
  if (method === 'POST' && target.entityId) action = AUDIT_ACTION.UPDATE;
  if (last === 'assign') action = AUDIT_ACTION.ASSIGN;
  if (last === 'status' || last === 'stage') action = AUDIT_ACTION.STATUS_CHANGE;
  if (/password/.test(last)) action = AUDIT_ACTION.PASSWORD_CHANGE;
  // A role's permissions, or which role a user has.
  if (resource === 'roles' && (last === 'permissions' || 'permissions' in body)) action = AUDIT_ACTION.PERMISSION_CHANGE;
  if (resource === 'users' && method !== 'POST' && 'roleId' in body) action = AUDIT_ACTION.PERMISSION_CHANGE;
  return { ...target, action };
}

// --- what may be stored ------------------------------------------------------------------

const SECRET_KEY = /pass(word)?|token|secret|authorization|hash|otp|api[-_]?key/i;
const DROPPED_KEYS = new Set(['__v', 'updatedAt']);
const MAX_STRING = 2000;
const MAX_ITEMS = 50;
const MAX_DEPTH = 6;
const MAX_BYTES = 32 * 1024;
export const REDACTED = '[REDACTED]';

// A copy that is safe to keep: secrets replaced, ids and dates as text, long
// values cut. Applied to everything written to oldData / newData.
export function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}... (${value.length} characters)` : value;
  if (typeof value !== 'object') return value;
  if (Buffer.isBuffer(value)) return `[${value.length} bytes]`;
  // ObjectIds and other BSON values.
  if (value._bsontype) return String(value);
  if (depth >= MAX_DEPTH) return '[nested]';
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((item) => sanitize(item, depth + 1));
    return value.length > MAX_ITEMS ? [...items, `... and ${value.length - MAX_ITEMS} more`] : items;
  }
  const copy = {};
  for (const [key, item] of Object.entries(value)) {
    if (DROPPED_KEYS.has(key)) continue;
    copy[key === '_id' ? 'id' : key] = SECRET_KEY.test(key) ? REDACTED : sanitize(item, depth + 1);
  }
  return copy;
}

// Too large to keep whole: what it contained is noted instead.
function capped(data) {
  if (data == null) return undefined;
  const size = Buffer.byteLength(JSON.stringify(data));
  return size > MAX_BYTES ? { truncated: true, bytes: size, fields: Object.keys(data) } : data;
}

// A record as it is now, or null (it does not exist, or was deleted).
export async function snapshot(Model, id) {
  if (!Model || !id) return null;
  const record = await Model.findById(id).lean();
  return record ? sanitize(record) : null;
}

// Only the fields that differ between two snapshots: [before, after].
export function difference(before, after) {
  const oldData = {};
  const newData = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) === JSON.stringify(after[key])) continue;
    if (key in before) oldData[key] = before[key];
    if (key in after) newData[key] = after[key];
  }
  return [oldData, newData];
}

// --- writing ------------------------------------------------------------------------------

const pending = new Set();

// Stores one entry. Never throws and never delays a response: a failure to
// audit is logged, loudly, and the request it describes still succeeds.
export function writeAudit(entry) {
  const write = AuditLog.create({ ...entry, oldData: capped(entry.oldData), newData: capped(entry.newData) })
    .catch((err) => logger.error({ err, action: entry.action, entityType: entry.entityType }, 'Failed to write audit log entry'))
    .finally(() => pending.delete(write));
  pending.add(write);
  return write;
}
// Lets tests wait for entries that are written after the response.
export const trackAudit = (promise) => {
  pending.add(promise);
  promise.finally(() => pending.delete(promise));
};
export const flushAudit = async () => {
  while (pending.size) await Promise.all([...pending]);
};

// --- reading ------------------------------------------------------------------------------

const POPULATE = [
  { path: 'userId', select: 'firstName lastName email', options: { withDeleted: true } },
  { path: 'organizationId', select: 'name' },
];

// What the reader may see: everything with audit.viewAll; otherwise the
// entries of their own organization; with no organization, their own actions.
function visibleTo(actor) {
  if (hasPermission(actor, VIEW_ALL)) return {};
  return actor.organizationId ? { organizationId: actor.organizationId } : { userId: actor._id };
}

export async function listAuditLogs(query, actor) {
  const { page, limit, sortOrder, userId, action, entityType, entityId, success, from, to, search } = query;
  const filter = { ...visibleTo(actor) };
  if (userId) filter.userId = filter.userId ? { $in: [filter.userId].filter((own) => String(own) === userId) } : userId;
  if (action) filter.action = action;
  if (entityType) filter.entityType = entityType;
  if (entityId) filter.entityId = entityId;
  if (typeof success === 'boolean') filter.success = success;
  // Both days of the range are included.
  if (from || to) filter.timestamp = { ...(from ? { $gte: startOfDay(from) } : {}), ...(to ? { $lt: new Date(startOfDay(to).getTime() + DAY_MS) } : {}) };
  // An address, or part of a path.
  if (search) {
    const pattern = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ ipAddress: pattern }, { path: pattern }];
  }

  const [entries, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ timestamp: sortOrder === 'asc' ? 1 : -1, _id: sortOrder === 'asc' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      // The list is for scanning; the data is on the entry itself.
      .select('-oldData -newData')
      .populate(POPULATE),
    AuditLog.countDocuments(filter),
  ]);
  return { auditLogs: entries, pagination: paginationMeta({ page, limit }, total) };
}

export async function getAuditLog(id, actor) {
  const entry = await AuditLog.findOne({ _id: id, ...visibleTo(actor) }).populate(POPULATE);
  if (!entry) throw ApiError.notFound(MESSAGES.AUDIT_LOG_NOT_FOUND);
  return entry;
}

// The values the filters can take: every action, and the kinds of record that
// appear in the part of the log this user can see.
export async function getAuditFilters(actor) {
  const entityTypes = (await AuditLog.distinct('entityType', visibleTo(actor))).filter(Boolean).sort();
  return { actions: Object.values(AUDIT_ACTION), entityTypes };
}
