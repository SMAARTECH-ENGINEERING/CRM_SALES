import {
  ACTIVITY_STATUS,
  DASHBOARD_PERIOD,
  FOLLOW_UP_STATUS,
  LEAD_STATUS_CATEGORY,
  MESSAGES,
  OPPORTUNITY_STATUS,
  ORDER_STATUS_CATEGORY,
  PAYMENT_STATUS_CATEGORY,
  STAGE_TYPE,
  TICKET_STATUS_CATEGORY,
} from '../constants/index.js';
import Activity from '../models/Activity.js';
import ActivityType from '../models/ActivityType.js';
import Company from '../models/Company.js';
import Customer from '../models/Customer.js';
import FollowUp from '../models/FollowUp.js';
import Lead from '../models/Lead.js';
import LeadSource from '../models/LeadSource.js';
import LeadStatus from '../models/LeadStatus.js';
import Opportunity from '../models/Opportunity.js';
import Order from '../models/Order.js';
import OrderStatus from '../models/OrderStatus.js';
import Organization from '../models/Organization.js';
import Payment from '../models/Payment.js';
import PaymentStatus from '../models/PaymentStatus.js';
import Pipeline from '../models/Pipeline.js';
import PipelineStage from '../models/PipelineStage.js';
import Ticket from '../models/Ticket.js';
import TicketStatus from '../models/TicketStatus.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { declarePermission, hasPermission } from '../utils/permissions.js';
import { startOfDay } from './lineItems.service.js';
import { round2 } from './quotationTotals.js';

// Every figure on the dashboard is counted or summed here, in the database,
// for the period asked for and for what the user is allowed to see:
//
//  - RBAC: a figure is only worked out when the user may read its module
//    (leads.read for lead figures, payments.read for payments, ...). Otherwise
//    it is returned as { available: false } - never as a zero.
//  - Scope: with dashboard.viewAll, everything (optionally one organization).
//    Without it, the user's own organization; a user with no organization sees
//    only the records assigned to them.

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP = 10;
const MIN_MONTHS = 12;
const MAX_MONTHS = 36;

const VIEW_ALL = declarePermission('dashboard.viewAll');
// What each kind of figure needs.
const NEEDS = Object.freeze({
  leads: declarePermission('leads.read'),
  opportunities: declarePermission('opportunities.read'),
  customers: declarePermission('customers.read'),
  followUps: declarePermission('followups.read'),
  tickets: declarePermission('tickets.read'),
  payments: declarePermission('payments.read'),
  orders: declarePermission('orders.read'),
  activities: declarePermission('activities.read'),
});
const can = (actor, what) => hasPermission(actor, NEEDS[what]);
const UNAVAILABLE = Object.freeze({ available: false });
const figure = (values) => ({ available: true, ...values });

// --- the period -------------------------------------------------------------------

const utc = (year, month, day = 1) => new Date(Date.UTC(year, month, day));
const dateText = (date) => date.toISOString().slice(0, 10);

// { key, start, end } - `end` is exclusive. Calendar periods are the current
// day, week (from Monday), month, quarter or year, in UTC.
export function resolvePeriod({ period = DASHBOARD_PERIOD.MONTH, from, to } = {}, now = new Date()) {
  const today = startOfDay(now);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  switch (period) {
    case DASHBOARD_PERIOD.TODAY:
      return { key: period, start: today, end: new Date(today.getTime() + DAY_MS) };
    case DASHBOARD_PERIOD.WEEK: {
      const start = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY_MS);
      return { key: period, start, end: new Date(start.getTime() + 7 * DAY_MS) };
    }
    case DASHBOARD_PERIOD.QUARTER: {
      const first = Math.floor(month / 3) * 3;
      return { key: period, start: utc(year, first), end: utc(year, first + 3) };
    }
    case DASHBOARD_PERIOD.YEAR:
      return { key: period, start: utc(year, 0), end: utc(year + 1, 0) };
    case DASHBOARD_PERIOD.CUSTOM:
      return { key: period, start: startOfDay(from), end: new Date(startOfDay(to).getTime() + DAY_MS) };
    default:
      return { key: DASHBOARD_PERIOD.MONTH, start: utc(year, month), end: utc(year, month + 1) };
  }
}

// As sent to clients: both dates inclusive.
const presentPeriod = ({ key, start, end }) => ({ key, from: dateText(start), to: dateText(new Date(end.getTime() - DAY_MS)) });
const within = ({ start, end }) => ({ $gte: start, $lt: end });

// --- the scope --------------------------------------------------------------------

// Whose records the figures cover.
// iewAllKey is the permission that lifts the limit (reports have their own).
export async function resolveScope(actor, organizationId, viewAllKey = VIEW_ALL) {
  const viewAll = hasPermission(actor, viewAllKey);
  const own = actor.organizationId ? String(actor.organizationId) : '';
  if (!viewAll && organizationId && organizationId !== own) throw ApiError.forbidden(MESSAGES.DASHBOARD_ORGANIZATION_FORBIDDEN);

  const chosen = viewAll ? organizationId : own;
  if (!chosen) {
    return viewAll ? { type: 'all' } : { type: 'own', userId: actor._id };
  }
  const organization = await Organization.findById(chosen).select('name');
  if (!organization) {
    throw ApiError.badRequest(MESSAGES.ORGANIZATION_NOT_FOUND, [{ field: 'organizationId', message: MESSAGES.ORGANIZATION_NOT_FOUND }]);
  }
  const [companyIds, userIds] = await Promise.all([
    Company.distinct('_id', { organizationId: organization._id }),
    User.distinct('_id', { organizationId: organization._id }),
  ]);
  return { type: 'organization', organization, companyIds, userIds };
}

// How the scope narrows each kind of record. A record belongs to an
// organization directly (leads, opportunities), through its company, or - for
// follow-ups, which have no company - through the person it is assigned to.
const SCOPE_FILTERS = {
  leads: {
    organization: (s) => ({ $or: [{ organizationId: s.organization._id }, { companyId: { $in: s.companyIds } }] }),
    own: (s) => ({ assignedTo: s.userId }),
  },
  opportunities: {
    organization: (s) => ({ $or: [{ organizationId: s.organization._id }, { companyId: { $in: s.companyIds } }] }),
    own: (s) => ({ assignedTo: s.userId }),
  },
  orders: { organization: (s) => ({ companyId: { $in: s.companyIds } }), own: (s) => ({ assignedTo: s.userId }) },
  quotations: { organization: (s) => ({ companyId: { $in: s.companyIds } }), own: (s) => ({ createdBy: s.userId }) },
  contracts: { organization: (s) => ({ companyId: { $in: s.companyIds } }), own: (s) => ({ assignedTo: s.userId }) },
  customers: { organization: (s) => ({ companyId: { $in: s.companyIds } }), own: (s) => ({ accountManagerId: s.userId }) },
  tickets: { organization: (s) => ({ companyId: { $in: s.companyIds } }), own: (s) => ({ assignedTo: s.userId }) },
  payments: { organization: (s) => ({ companyId: { $in: s.companyIds } }), own: (s) => ({ createdBy: s.userId }) },
  activities: { organization: (s) => ({ companyId: { $in: s.companyIds } }), own: (s) => ({ assignedTo: s.userId }) },
  followUps: { organization: (s) => ({ assignedTo: { $in: s.userIds } }), own: (s) => ({ assignedTo: s.userId }) },
};
// The filter for one kind of record. `deletedAt: null` because aggregations
// do not pass through the models' soft-delete filter.
export const scoped = (scope, what, extra = {}) => ({
  deletedAt: null,
  ...(scope.type === 'all' ? {} : SCOPE_FILTERS[what][scope.type](scope)),
  ...extra,
});

export async function presentScope(actor, scope, viewAllKey = VIEW_ALL) {
  const viewAll = hasPermission(actor, viewAllKey);
  return {
    type: scope.type,
    organization: scope.organization ? { id: scope.organization.id, name: scope.organization.name } : null,
    // Only someone who sees everything can choose an organization.
    organizations: viewAll ? (await Organization.find({ isActive: true }).sort({ name: 1 }).select('name')).map((o) => ({ id: o.id, name: o.name })) : [],
  };
}

async function context(actor, query, now) {
  const period = resolvePeriod(query, now);
  const scope = await resolveScope(actor, query.organizationId);
  return { period, scope, header: { period: presentPeriod(period), scope: await presentScope(actor, scope), generatedAt: now.toISOString() } };
}

// --- small helpers ------------------------------------------------------------------

const statusIds = (Model, categories) => Model.distinct('_id', { category: { $in: categories } });

// count and sum of one field for the records that match.
async function total(Model, match, field) {
  const [row] = await Model.aggregate([{ $match: match }, { $group: { _id: null, count: { $sum: 1 }, value: { $sum: { $ifNull: [`$${field}`, 0] } } } }]);
  return { count: row?.count ?? 0, value: round2(row?.value ?? 0) };
}

// Names for rows grouped by a user id; a deleted user keeps their name.
async function withUsers(rows, key = '_id') {
  const ids = rows.map((row) => row[key]).filter(Boolean);
  const users = await User.find({ _id: { $in: ids } })
    .select('firstName lastName')
    .setOptions({ withDeleted: true });
  const names = new Map(users.map((user) => [user.id, user.fullName]));
  return (row) => (row[key] ? { id: String(row[key]), fullName: names.get(String(row[key])) ?? 'Unknown user' } : null);
}

// --- GET /dashboard/summary --------------------------------------------------------

export async function getSummary(actor, query, now = new Date()) {
  const { period, scope, header } = await context(actor, query, now);
  const created = { createdAt: within(period) };
  const metrics = {};

  if (can(actor, 'leads')) {
    const qualified = await LeadStatus.distinct('_id', { isQualified: true });
    const [all, fresh, good] = await Promise.all([
      Lead.countDocuments(scoped(scope, 'leads')),
      Lead.countDocuments(scoped(scope, 'leads', created)),
      Lead.countDocuments(scoped(scope, 'leads', { ...created, statusId: { $in: qualified } })),
    ]);
    metrics.totalLeads = figure({ value: all });
    metrics.newLeads = figure({ value: fresh });
    metrics.qualifiedLeads = figure({ value: good });
  } else {
    metrics.totalLeads = metrics.newLeads = metrics.qualifiedLeads = UNAVAILABLE;
  }

  if (can(actor, 'opportunities')) {
    const closed = (status) => total(Opportunity, scoped(scope, 'opportunities', { status, closedAt: within(period) }), 'estimatedValue');
    const [open, won, lost] = await Promise.all([
      total(Opportunity, scoped(scope, 'opportunities', { status: OPPORTUNITY_STATUS.OPEN }), 'estimatedValue'),
      closed(OPPORTUNITY_STATUS.WON),
      closed(OPPORTUNITY_STATUS.LOST),
    ]);
    metrics.openOpportunities = figure({ value: open.count });
    metrics.pipelineValue = figure({ value: open.value });
    metrics.wonValue = figure({ value: won.value, count: won.count });
    metrics.lostValue = figure({ value: lost.value, count: lost.count });
  } else {
    metrics.openOpportunities = metrics.pipelineValue = metrics.wonValue = metrics.lostValue = UNAVAILABLE;
  }

  if (can(actor, 'customers')) {
    const [all, fresh] = await Promise.all([
      Customer.countDocuments(scoped(scope, 'customers')),
      Customer.countDocuments(scoped(scope, 'customers', { customerSince: within(period) })),
    ]);
    metrics.customers = figure({ value: all, new: fresh });
  } else {
    metrics.customers = UNAVAILABLE;
  }

  if (can(actor, 'followUps')) {
    const pending = scoped(scope, 'followUps', { status: FOLLOW_UP_STATUS.PENDING });
    const [all, overdue] = await Promise.all([FollowUp.countDocuments(pending), FollowUp.countDocuments({ ...pending, dueDate: { $lt: now } })]);
    metrics.pendingFollowUps = figure({ value: all, overdue });
  } else {
    metrics.pendingFollowUps = UNAVAILABLE;
  }

  if (can(actor, 'tickets')) {
    const open = await statusIds(TicketStatus, [TICKET_STATUS_CATEGORY.OPEN, TICKET_STATUS_CATEGORY.IN_PROGRESS, TICKET_STATUS_CATEGORY.WAITING]);
    const match = scoped(scope, 'tickets', { statusId: { $in: open } });
    const [all, unassigned] = await Promise.all([Ticket.countDocuments(match), Ticket.countDocuments({ ...match, assignedTo: null })]);
    metrics.openTickets = figure({ value: all, unassigned });
  } else {
    metrics.openTickets = UNAVAILABLE;
  }

  if (can(actor, 'payments')) {
    const open = await statusIds(PaymentStatus, [PAYMENT_STATUS_CATEGORY.UNPAID, PAYMENT_STATUS_CATEGORY.PARTIALLY_PAID]);
    const match = scoped(scope, 'payments', { statusId: { $in: open } });
    const [pending, overdue] = await Promise.all([
      total(Payment, match, 'remainingAmount'),
      total(Payment, { ...match, dueDate: { $lt: startOfDay(now) } }, 'remainingAmount'),
    ]);
    metrics.pendingPayments = figure({ value: pending.count, amount: pending.value, overdue: overdue.count, overdueAmount: overdue.value });
  } else {
    metrics.pendingPayments = UNAVAILABLE;
  }

  return { ...header, metrics };
}

// --- GET /dashboard/leads -----------------------------------------------------------

// Leads created in the period, by where they came from and where they stand.
export async function getLeads(actor, query, now = new Date()) {
  const { period, scope, header } = await context(actor, query, now);
  const match = scoped(scope, 'leads', { createdAt: within(period) });
  const [sourceRows, statusRows, sources, statuses] = await Promise.all([
    Lead.aggregate([{ $match: match }, { $group: { _id: '$sourceId', count: { $sum: 1 } } }]),
    Lead.aggregate([{ $match: match }, { $group: { _id: '$statusId', count: { $sum: 1 } } }]),
    LeadSource.find().sort({ sortOrder: 1, name: 1 }).select('name'),
    LeadStatus.find().sort({ sortOrder: 1, name: 1 }).select('name color category isQualified'),
  ]);
  const countOf = (rows) => new Map(rows.map((row) => [String(row._id), row.count]));

  const perSource = countOf(sourceRows);
  const bySource = sources.map((source) => ({ id: source.id, name: source.name, count: perSource.get(source.id) ?? 0 })).filter((row) => row.count);
  // Leads entered without a source are shown, not dropped.
  const noSource = perSource.get('null') ?? 0;
  if (noSource) bySource.push({ id: null, name: 'No source', count: noSource });
  bySource.sort((a, b) => b.count - a.count);

  const perStatus = countOf(statusRows);
  // Every status in its configured order, so the chart reads as the pipeline.
  const byStatus = statuses
    .map((status) => ({ id: status.id, name: status.name, color: status.color ?? null, category: status.category, isQualified: status.isQualified, count: perStatus.get(status.id) ?? 0 }))
    .filter((row) => row.count);

  const sum = (rows) => rows.reduce((n, row) => n + row.count, 0);
  const created = sum(byStatus);
  const won = sum(byStatus.filter((row) => row.category === LEAD_STATUS_CATEGORY.WON));
  return {
    ...header,
    totals: {
      created,
      qualified: sum(byStatus.filter((row) => row.isQualified)),
      won,
      lost: sum(byStatus.filter((row) => row.category === LEAD_STATUS_CATEGORY.LOST)),
      // Of the leads created in the period, the share that has been won. Null with no leads.
      conversionRate: created ? round2((won / created) * 100) : null,
    },
    bySource,
    byStatus,
  };
}

// --- GET /dashboard/opportunities ---------------------------------------------------

// The open pipeline stage by stage, and what was won and lost in the period.
export async function getOpportunities(actor, query, now = new Date()) {
  const { period, scope, header } = await context(actor, query, now);
  const pipelines = await Pipeline.find().sort({ isDefault: -1, name: 1 }).select('name isDefault status');
  const pipeline = query.pipelineId ? pipelines.find((p) => p.id === query.pipelineId) : pipelines[0];
  if (query.pipelineId && !pipeline) {
    throw ApiError.badRequest(MESSAGES.PIPELINE_NOT_FOUND, [{ field: 'pipelineId', message: MESSAGES.PIPELINE_NOT_FOUND }]);
  }
  const inPipeline = pipeline ? { pipelineId: pipeline._id } : {};

  const closed = (status) => total(Opportunity, scoped(scope, 'opportunities', { ...inPipeline, status, closedAt: within(period) }), 'estimatedValue');
  const [stages, rows, won, lost] = await Promise.all([
    pipeline ? PipelineStage.find({ pipelineId: pipeline._id, type: STAGE_TYPE.OPEN }).sort({ order: 1 }).select('name color order probability') : [],
    Opportunity.aggregate([
      { $match: scoped(scope, 'opportunities', { ...inPipeline, status: OPPORTUNITY_STATUS.OPEN }) },
      {
        $group: {
          _id: '$stageId',
          count: { $sum: 1 },
          value: { $sum: { $ifNull: ['$estimatedValue', 0] } },
          // Each deal's value times its own chance of closing.
          weighted: { $sum: { $multiply: [{ $ifNull: ['$estimatedValue', 0] }, { $divide: [{ $ifNull: ['$probability', 0] }, 100] }] } },
        },
      },
    ]),
    closed(OPPORTUNITY_STATUS.WON),
    closed(OPPORTUNITY_STATUS.LOST),
  ]);

  const perStage = new Map(rows.map((row) => [String(row._id), row]));
  // Every open stage, in board order, including the empty ones.
  const pipelineStages = stages.map((stage) => {
    const row = perStage.get(stage.id);
    return { id: stage.id, name: stage.name, color: stage.color ?? null, order: stage.order, count: row?.count ?? 0, value: round2(row?.value ?? 0), weightedValue: round2(row?.weighted ?? 0) };
  });
  const sum = (key) => round2(pipelineStages.reduce((n, stage) => n + stage[key], 0));
  const decided = won.count + lost.count;

  return {
    ...header,
    pipeline: pipeline ? { id: pipeline.id, name: pipeline.name } : null,
    pipelines: pipelines.map((p) => ({ id: p.id, name: p.name, isDefault: p.isDefault })),
    totals: {
      open: { count: sum('count'), value: sum('value'), weightedValue: sum('weightedValue') },
      won,
      lost,
      // Of the deals decided in the period, the share won. Null when none was decided.
      winRate: decided ? round2((won.count / decided) * 100) : null,
    },
    stages: pipelineStages,
  };
}

// --- GET /dashboard/sales -----------------------------------------------------------

// The months to chart: the twelve ending with the period's last month, or the
// whole period when it is longer (to a limit).
function monthsFor(period) {
  const last = new Date(period.end.getTime() - 1);
  const span = (last.getUTCFullYear() - period.start.getUTCFullYear()) * 12 + last.getUTCMonth() - period.start.getUTCMonth() + 1;
  const count = Math.min(MAX_MONTHS, Math.max(MIN_MONTHS, span));
  return Array.from({ length: count }, (unused, index) => utc(last.getUTCFullYear(), last.getUTCMonth() - (count - 1 - index)));
}

// Orders (cancelled ones aside) month by month, and - for the period - who sold
// and what sold.
export async function getSales(actor, query, now = new Date()) {
  const { period, scope, header } = await context(actor, query, now);
  const cancelled = await statusIds(OrderStatus, [ORDER_STATUS_CATEGORY.CANCELLED]);
  const live = { statusId: { $nin: cancelled } };
  const inPeriod = scoped(scope, 'orders', { ...live, orderDate: within(period) });
  const months = monthsFor(period);
  const afterLastMonth = utc(months.at(-1).getUTCFullYear(), months.at(-1).getUTCMonth() + 1);

  const [monthRows, sellerRows, productRows, totals, wonRows] = await Promise.all([
    Order.aggregate([
      { $match: scoped(scope, 'orders', { ...live, orderDate: { $gte: months[0], $lt: afterLastMonth } }) },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$orderDate' } }, count: { $sum: 1 }, value: { $sum: '$grandTotal' } } },
    ]),
    Order.aggregate([{ $match: inPeriod }, { $group: { _id: '$assignedTo', orderCount: { $sum: 1 }, orderValue: { $sum: '$grandTotal' } } }]),
    Order.aggregate([
      { $match: inPeriod },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          name: { $last: '$items.name' },
          sku: { $last: '$items.sku' },
          quantity: { $sum: '$items.quantity' },
          // Before tax, after the line discount - as on the order line.
          revenue: { $sum: '$items.total' },
          orders: { $addToSet: '$_id' },
        },
      },
      { $sort: { revenue: -1, _id: 1 } },
      { $limit: TOP },
    ]),
    total(Order, inPeriod, 'grandTotal'),
    // Deals won in the period, per salesperson - only for those who may see opportunities.
    can(actor, 'opportunities')
      ? Opportunity.aggregate([
          { $match: scoped(scope, 'opportunities', { status: OPPORTUNITY_STATUS.WON, closedAt: within(period) }) },
          { $group: { _id: '$assignedTo', wonCount: { $sum: 1 }, wonValue: { $sum: { $ifNull: ['$estimatedValue', 0] } } } },
        ])
      : [],
  ]);

  const perMonth = new Map(monthRows.map((row) => [row._id, row]));
  const monthlySales = months.map((month) => {
    const key = month.toISOString().slice(0, 7);
    return { month: key, orderCount: perMonth.get(key)?.count ?? 0, value: round2(perMonth.get(key)?.value ?? 0) };
  });

  // One row per person: their orders and their won deals side by side.
  const people = new Map();
  for (const row of [...sellerRows, ...wonRows]) {
    const key = String(row._id);
    people.set(key, { _id: row._id, orderCount: 0, orderValue: 0, wonCount: 0, wonValue: 0, ...people.get(key), ...row });
  }
  const sellers = [...people.values()].sort((a, b) => b.orderValue - a.orderValue || b.wonValue - a.wonValue).slice(0, TOP);
  const userOf = await withUsers(sellers);

  return {
    ...header,
    totals: { orderCount: totals.count, orderValue: totals.value, averageOrderValue: totals.count ? round2(totals.value / totals.count) : 0 },
    monthlySales,
    salespeople: sellers.map((row) => ({
      // null: orders and deals nobody is assigned to.
      user: userOf(row),
      orderCount: row.orderCount,
      orderValue: round2(row.orderValue),
      wonCount: row.wonCount,
      wonValue: round2(row.wonValue),
    })),
    products: productRows.map((row) => ({
      productId: String(row._id),
      name: row.name,
      sku: row.sku ?? null,
      quantity: round2(row.quantity),
      revenue: round2(row.revenue),
      orderCount: row.orders.length,
    })),
  };
}

// --- GET /dashboard/activities ------------------------------------------------------

// Activities logged in the period by type and by person, and where follow-ups stand.
export async function getActivities(actor, query, now = new Date()) {
  const { period, scope, header } = await context(actor, query, now);
  const match = scoped(scope, 'activities', { createdAt: within(period) });
  const [typeRows, statusRows, userRows, types, overdue] = await Promise.all([
    Activity.aggregate([{ $match: match }, { $group: { _id: '$typeId', count: { $sum: 1 } } }]),
    Activity.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Activity.aggregate([
      { $match: match },
      { $group: { _id: '$assignedTo', count: { $sum: 1 }, completed: { $sum: { $cond: [{ $eq: ['$status', ACTIVITY_STATUS.COMPLETED] }, 1, 0] } } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: TOP },
    ]),
    ActivityType.find().sort({ sortOrder: 1, name: 1 }).select('name color'),
    // Still to do and past due - whenever it was created.
    Activity.countDocuments(scoped(scope, 'activities', { status: ACTIVITY_STATUS.PENDING, dueDate: { $lt: now } })),
  ]);

  const perType = new Map(typeRows.map((row) => [String(row._id), row.count]));
  const byType = types
    .map((type) => ({ id: type.id, name: type.name, color: type.color ?? null, count: perType.get(type.id) ?? 0 }))
    .filter((row) => row.count)
    .sort((a, b) => b.count - a.count);
  const perStatus = new Map(statusRows.map((row) => [row._id, row.count]));
  const byStatus = Object.fromEntries(Object.values(ACTIVITY_STATUS).map((status) => [status, perStatus.get(status) ?? 0]));
  const userOf = await withUsers(userRows);

  let followUps = UNAVAILABLE;
  if (can(actor, 'followUps')) {
    const pending = scoped(scope, 'followUps', { status: FOLLOW_UP_STATUS.PENDING });
    const today = startOfDay(now);
    const [all, late, dueToday, done] = await Promise.all([
      FollowUp.countDocuments(pending),
      FollowUp.countDocuments({ ...pending, dueDate: { $lt: now } }),
      FollowUp.countDocuments({ ...pending, dueDate: { $gte: today, $lt: new Date(today.getTime() + DAY_MS) } }),
      FollowUp.countDocuments(scoped(scope, 'followUps', { status: FOLLOW_UP_STATUS.COMPLETED, completedAt: within(period) })),
    ]);
    followUps = figure({ pending: all, overdue: late, dueToday, completedInPeriod: done });
  }

  return {
    ...header,
    totals: { total: Object.values(byStatus).reduce((n, count) => n + count, 0), ...byStatus, overdue },
    byType,
    byUser: userRows.map((row) => ({ user: userOf(row), count: row.count, completed: row.completed })),
    followUps,
  };
}
