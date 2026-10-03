import mongoose from 'mongoose';
import logger from '../config/logger.js';
import {
  ACTIVITY_STATUS,
  MESSAGES,
  ORDER_STATUS_CATEGORY,
  QUOTATION_STATUS_CATEGORY,
  STAGE_TYPE,
  USER_STATUS,
} from '../constants/index.js';
import Activity from '../models/Activity.js';
import Company from '../models/Company.js';
import Contact from '../models/Contact.js';
import Customer from '../models/Customer.js';
import Opportunity from '../models/Opportunity.js';
import Order from '../models/Order.js';
import Project from '../models/Project.js';
import Ticket from '../models/Ticket.js';
import Contract from '../models/Contract.js';
import Payment from '../models/Payment.js';
import Document from '../models/Document.js';
import OrderStatus from '../models/OrderStatus.js';
import Quotation from '../models/Quotation.js';
import QuotationStatus from '../models/QuotationStatus.js';
import TimelineEvent from '../models/TimelineEvent.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { paginationMeta, searchFilter } from '../utils/query.js';
import { registerCompanyDeleteGuard } from './companySection.service.js';
import { registerContactDeleteGuard } from './contact.service.js';
import { nextSequence } from './sequence.service.js';
import { numberFor } from './settings.service.js';
import { diffSnapshots, recordEvent } from './timeline.service.js';

export const CUSTOMER_ENTITY = 'customer';
const COMPANY_ENTITY = 'company';
const DUPLICATE_KEY = 11000;
const { ObjectId } = mongoose.Types;

// People may have been deleted since; their names should still show.
const PERSON = { select: 'firstName lastName email', options: { withDeleted: true } };
const POPULATE = [
  {
    path: 'companyId',
    select: 'companyCode name legalName email phone website city state country industryId companyTypeId status assignedTo',
    populate: [
      { path: 'industryId', select: 'name' },
      { path: 'companyTypeId', select: 'name' },
    ],
  },
  { path: 'primaryContactId', select: 'firstName lastName email phone designation' },
  { path: 'accountManagerId', ...PERSON },
  { path: 'firstOrderId', select: 'orderNumber orderDate', options: { withDeleted: true } },
  { path: 'createdBy', ...PERSON },
];

// Search covers the customer number and the company's own fields - which are
// read from the company, not copied onto the customer.
const SEARCH_FIELDS = [
  'customerNumber',
  'company.name',
  'company.legalName',
  'company.companyCode',
  'company.email',
  'company.phone',
  'company.city',
];
const SORT_FIELDS = { name: 'company.name', customerNumber: 'customerNumber', customerSince: 'customerSince', createdAt: 'createdAt', updatedAt: 'updatedAt' };

const TIMELINE_LABELS = {
  primaryContact: 'Primary contact',
  accountManager: 'Account manager',
  status: 'Status',
  customerSince: 'Customer since',
  notes: 'Notes',
};

const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');
const idOf = (reference) => (reference ? String(reference._id ?? reference) : '');
const startOfDay = (date) => new Date(new Date(date).toISOString().slice(0, 10));
const DAY_MS = 24 * 60 * 60 * 1000;

function snapshot(customer) {
  return {
    primaryContact: customer.primaryContactId?.fullName ?? '',
    accountManager: customer.accountManagerId?.fullName ?? '',
    status: customer.status,
    customerSince: day(customer.customerSince),
    notes: customer.notes ?? '',
  };
}

// --- relationships with other modules ----------------------------------------------

// A company that is a customer cannot be deleted, nor a contact who is a
// customer's primary contact.
registerCompanyDeleteGuard('Customer', (companyId) => Customer.countDocuments({ companyId }));
registerContactDeleteGuard('Customer (primary contact)', (contactId) =>
  Customer.countDocuments({ primaryContactId: contactId })
);

// --- helpers -----------------------------------------------------------------

const badReference = (field, message) => ApiError.badRequest(message, [{ field, message }]);

async function findCustomer(id) {
  const customer = await Customer.findById(id).populate(POPULATE);
  if (!customer) throw ApiError.notFound(MESSAGES.CUSTOMER_NOT_FOUND);
  return customer;
}

async function assertContact(companyId, contactId) {
  if (!contactId) return;
  const contact = await Contact.findById(contactId).select('companyId');
  if (!contact) throw badReference('primaryContactId', MESSAGES.LEAD_CONTACT_NOT_FOUND);
  if (String(contact.companyId) !== String(companyId)) {
    throw badReference('primaryContactId', MESSAGES.LEAD_CONTACT_COMPANY_MISMATCH);
  }
}

async function assertActiveUser(userId) {
  if (userId && !(await User.exists({ _id: userId, status: USER_STATUS.ACTIVE }))) {
    throw badReference('accountManagerId', MESSAGES.ASSIGNEE_NOT_FOUND);
  }
}

async function nextCustomerNumber() {
  const number = await nextSequence(CUSTOMER_ENTITY);
  return await numberFor('customer', number);
}

const idsOfCategory = async (Model, categories) => Model.distinct('_id', { category: { $in: categories } });

// What every list row and the summary show, worked out in the database for the
// given companies: { [companyId]: { orderCount, orderValue, lastOrderDate, openOpportunities } }.
// Cancelled orders are not counted as business.
async function statsFor(companyIds) {
  const cancelled = await idsOfCategory(OrderStatus, [ORDER_STATUS_CATEGORY.CANCELLED]);
  const [orders, opportunities] = await Promise.all([
    Order.aggregate([
      { $match: { companyId: { $in: companyIds }, deletedAt: null, statusId: { $nin: cancelled } } },
      {
        $group: {
          _id: '$companyId',
          orderCount: { $sum: 1 },
          orderValue: { $sum: '$grandTotal' },
          lastOrderDate: { $max: '$orderDate' },
        },
      },
    ]),
    Opportunity.aggregate([
      { $match: { companyId: { $in: companyIds }, deletedAt: null, status: STAGE_TYPE.OPEN } },
      { $group: { _id: '$companyId', openOpportunities: { $sum: 1 } } },
    ]),
  ]);

  const stats = new Map(
    companyIds.map((id) => [String(id), { orderCount: 0, orderValue: 0, lastOrderDate: null, openOpportunities: 0 }])
  );
  for (const row of orders) {
    Object.assign(stats.get(String(row._id)), {
      orderCount: row.orderCount,
      orderValue: Math.round(row.orderValue * 100) / 100,
      lastOrderDate: row.lastOrderDate,
    });
  }
  for (const row of opportunities) stats.get(String(row._id)).openOpportunities = row.openOpportunities;
  return stats;
}

// --- list and detail ------------------------------------------------------------

export async function listCustomers(query) {
  const { page, limit, sortBy, sortOrder } = query;

  const match = {};
  if (query.status) match.status = query.status;
  if (query.accountManagerId) match.accountManagerId = new ObjectId(query.accountManagerId);
  if (query.companyId) match.companyId = new ObjectId(query.companyId);
  if (query.sinceFrom || query.sinceTo) {
    match.customerSince = {
      ...(query.sinceFrom ? { $gte: startOfDay(query.sinceFrom) } : {}),
      ...(query.sinceTo ? { $lt: new Date(startOfDay(query.sinceTo).getTime() + DAY_MS) } : {}),
    };
  }

  // Filters on the company itself (it is joined, never copied).
  const companyMatch = { 'company.deletedAt': null };
  for (const field of ['industryId', 'companyTypeId', 'organizationId']) {
    if (query[field]) companyMatch[`company.${field}`] = new ObjectId(query[field]);
  }

  const [result] = await Customer.aggregate(
    [
      { $match: match },
      { $lookup: { from: Company.collection.name, localField: 'companyId', foreignField: '_id', as: 'company' } },
      { $unwind: '$company' },
      { $match: { ...companyMatch, ...searchFilter(query.search, SEARCH_FIELDS) } },
      {
        $facet: {
          rows: [
            { $sort: { [SORT_FIELDS[sortBy]]: sortOrder === 'asc' ? 1 : -1, _id: 1 } },
            { $skip: (page - 1) * limit },
            { $limit: limit },
            { $project: { _id: 1 } },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ],
    { collation: { locale: 'en', strength: 2 } }
  );

  const ids = result.rows.map((row) => row._id);
  const records = await Customer.find({ _id: { $in: ids } }).populate(POPULATE);
  const byId = new Map(records.map((record) => [record.id, record]));
  const ordered = ids.map((id) => byId.get(String(id))).filter(Boolean);
  const stats = await statsFor(ordered.map((customer) => new ObjectId(idOf(customer.companyId))));

  return {
    customers: ordered.map((customer) => ({ ...customer.toJSON(), stats: stats.get(idOf(customer.companyId)) })),
    pagination: paginationMeta({ page, limit }, result.total[0]?.count ?? 0),
  };
}

export async function getCustomer(id) {
  const customer = await findCustomer(id);
  const stats = await statsFor([new ObjectId(idOf(customer.companyId))]);
  return { ...customer.toJSON(), stats: stats.get(idOf(customer.companyId)) };
}

// --- the 360-degree view ------------------------------------------------------------

// Sections of the customer page, in order. A section whose module exists has a
// real count; the others say so (available: false, count: null) rather than
// show an invented number.
const SECTION_LABELS = [
  ['contacts', 'Contacts'],
  ['activities', 'Activities'],
  ['opportunities', 'Opportunities'],
  ['quotations', 'Quotations'],
  ['orders', 'Orders'],
  ['projects', 'Projects'],
  ['tickets', 'Tickets'],
  ['payments', 'Payments'],
  ['contracts', 'Contracts'],
  ['documents', 'Documents'],
  ['timeline', 'Timeline'],
];

const timelineFilter = (customer) => ({
  $or: [
    { entityType: CUSTOMER_ENTITY, entityId: customer._id },
    { entityType: COMPANY_ENTITY, entityId: new ObjectId(idOf(customer.companyId)) },
  ],
});

// { [category]: { count, value } } for documents whose status lists categories.
async function byStatusCategory(Model, StatusModel, companyId) {
  const statuses = await StatusModel.find().select('category');
  const categoryOf = new Map(statuses.map((status) => [status.id, status.category]));
  const rows = await Model.aggregate([
    { $match: { companyId, deletedAt: null } },
    { $group: { _id: '$statusId', count: { $sum: 1 }, value: { $sum: '$grandTotal' } } },
  ]);
  const result = {};
  for (const row of rows) {
    const category = categoryOf.get(String(row._id)) ?? 'unknown';
    result[category] ??= { count: 0, value: 0 };
    result[category].count += row.count;
    result[category].value = Math.round((result[category].value + row.value) * 100) / 100;
  }
  return result;
}

export async function getCustomerSummary(id) {
  const customer = await findCustomer(id);
  const companyId = new ObjectId(idOf(customer.companyId));
  const now = new Date();

  const [contacts, activities, pendingActivities, overdueActivities, opportunityRows, quotations, orders, timeline, stats, projects, tickets, contracts, payments, documents] =
   
    await Promise.all([
      Contact.countDocuments({ companyId }),
      Activity.countDocuments({ companyId }),
      Activity.countDocuments({ companyId, status: ACTIVITY_STATUS.PENDING }),
      Activity.countDocuments({ companyId, status: ACTIVITY_STATUS.PENDING, dueDate: { $lt: now } }),
      Opportunity.aggregate([
        { $match: { companyId, deletedAt: null } },
        { $group: { _id: '$status', count: { $sum: 1 }, value: { $sum: { $ifNull: ['$estimatedValue', 0] } } } },
      ]),
      byStatusCategory(Quotation, QuotationStatus, companyId),
      byStatusCategory(Order, OrderStatus, companyId),
      TimelineEvent.countDocuments(timelineFilter(customer)),
      statsFor([companyId]),
      Project.countDocuments({ companyId }),
      Ticket.countDocuments({ companyId }),
      Contract.countDocuments({ companyId }),
      Payment.countDocuments({ companyId }),
      Document.countDocuments({ entityType: 'company', entityId: companyId }),
    ]);

  const opportunities = Object.fromEntries(
    Object.values(STAGE_TYPE).map((type) => {
      const row = opportunityRows.find((r) => r._id === type);
      return [type, { count: row?.count ?? 0, value: Math.round((row?.value ?? 0) * 100) / 100 }];
    })
  );
  const total = (groups) => Object.values(groups).reduce((sum, group) => sum + group.count, 0);
  const counts = {
    contacts,
    activities,
    opportunities: total(opportunities),
    quotations: total(quotations),
    orders: total(orders),
    projects,
    tickets,
    contracts,
    payments,
    documents,
    timeline,
  };

  return {
    customer: customer.toJSON(),
    sections: SECTION_LABELS.map(([key, label]) =>
      key in counts ? { key, label, available: true, count: counts[key] } : { key, label, available: false, count: null }
    ),
    metrics: {
      orders: { ...stats.get(String(companyId)), byCategory: orders },
      quotations: {
        byCategory: quotations,
        // Still with the customer: drafts and sent quotations.
        openValue:
          Math.round(
            ((quotations[QUOTATION_STATUS_CATEGORY.DRAFT]?.value ?? 0) + (quotations[QUOTATION_STATUS_CATEGORY.SENT]?.value ?? 0)) * 100
          ) / 100,
      },
      opportunities,
      activities: { total: activities, pending: pendingActivities, overdue: overdueActivities },
    },
  };
}

// The customer's own history and its company's, newest first.
export async function getCustomerTimeline(id, { page, limit }) {
  const customer = await findCustomer(id);
  const filter = timelineFilter(customer);
  const [events, total] = await Promise.all([
    TimelineEvent.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({ path: 'actorId', select: 'firstName lastName email', options: { withDeleted: true } }),
    TimelineEvent.countDocuments(filter),
  ]);
  return { events, pagination: paginationMeta({ page, limit }, total) };
}

// --- changes -----------------------------------------------------------------

export async function createCustomer(input, actor) {
  const company = await Company.findById(input.companyId).select('assignedTo');
  if (!company) throw badReference('companyId', MESSAGES.CONTACT_COMPANY_NOT_FOUND);
  if (await Customer.exists({ companyId: input.companyId })) {
    throw ApiError.conflict(MESSAGES.CUSTOMER_EXISTS, [{ field: 'companyId', message: MESSAGES.CUSTOMER_EXISTS }]);
  }
  await assertContact(input.companyId, input.primaryContactId);
  await assertActiveUser(input.accountManagerId);

  // Its earliest order, if it already has some.
  const firstOrder = await Order.findOne({ companyId: input.companyId }).sort({ orderDate: 1, _id: 1 }).select('orderDate');

  const customer = new Customer({
    companyId: input.companyId,
    primaryContactId: input.primaryContactId || undefined,
    accountManagerId: input.accountManagerId || company.assignedTo || undefined,
    status: input.status,
    customerSince: startOfDay(input.customerSince ?? firstOrder?.orderDate ?? new Date()),
    firstOrderId: firstOrder?._id,
    notes: input.notes || undefined,
    createdBy: actor.id,
  });
  customer.customerNumber = await nextCustomerNumber();
  try {
    await customer.save();
  } catch (err) {
    // Two requests for the same company at once: the unique index decides.
    if (err.code === DUPLICATE_KEY) {
      throw ApiError.conflict(MESSAGES.CUSTOMER_EXISTS, [{ field: 'companyId', message: MESSAGES.CUSTOMER_EXISTS }]);
    }
    throw err;
  }

  await recordEvent({ entityType: CUSTOMER_ENTITY, entityId: customer._id, action: 'created', actor });
  return getCustomer(customer.id);
}

export async function updateCustomer(id, input, actor) {
  const customer = await findCustomer(id);
  const before = snapshot(customer);

  if ('primaryContactId' in input && (input.primaryContactId || '') !== idOf(customer.primaryContactId)) {
    await assertContact(idOf(customer.companyId), input.primaryContactId);
    customer.primaryContactId = input.primaryContactId || undefined;
  }
  if ('accountManagerId' in input && (input.accountManagerId || '') !== idOf(customer.accountManagerId)) {
    await assertActiveUser(input.accountManagerId);
    customer.accountManagerId = input.accountManagerId || undefined;
  }
  if (input.status) customer.status = input.status;
  if (input.customerSince) customer.customerSince = startOfDay(input.customerSince);
  if ('notes' in input) customer.notes = input.notes || undefined;

  await customer.save();
  const updated = await findCustomer(id);
  const changes = diffSnapshots(before, snapshot(updated), TIMELINE_LABELS);
  if (changes.length) {
    await recordEvent({ entityType: CUSTOMER_ENTITY, entityId: updated._id, action: 'updated', changes, actor });
  }
  return getCustomer(id);
}

// Removes the customer designation only. The company and all its records stay.
export async function deleteCustomer(id, actor) {
  const customer = await findCustomer(id);
  await customer.deleteOne();
  await recordEvent({
    entityType: CUSTOMER_ENTITY,
    entityId: customer._id,
    action: 'deleted',
    summary: `${customer.customerNumber} removed; ${customer.companyId?.name ?? 'the company'} is no longer a customer`,
    actor,
  });
}

// --- made automatically ------------------------------------------------------------

async function createFromOrder(companyId, order, actor) {
  const company = await Company.findById(companyId).select('assignedTo');
  if (!company) return false;
  const customer = new Customer({
    companyId,
    accountManagerId: company.assignedTo || undefined,
    customerSince: startOfDay(order.orderDate),
    firstOrderId: order._id,
    createdBy: actor?.id,
  });
  customer.customerNumber = await nextCustomerNumber();
  try {
    await customer.save();
  } catch (err) {
    if (err.code === DUPLICATE_KEY) return false;
    throw err;
  }
  await recordEvent({
    entityType: CUSTOMER_ENTITY,
    entityId: customer._id,
    action: 'created',
    summary: `Became a customer with order ${order.orderNumber}`,
    actor,
  });
  return true;
}

// Called after an order is created: the first order makes the company a
// customer. Never fails the order itself.
export async function ensureCustomerForOrder(order, actor) {
  try {
    if (await Customer.exists({ companyId: order.companyId })) return;
    await createFromOrder(order.companyId, order, actor);
  } catch (err) {
    logger.error({ err, orderId: String(order._id) }, 'Failed to create the customer for an order');
  }
}

// Every company with orders but no customer becomes one, from its first order.
export async function createCustomersForCompaniesWithOrders() {
  const firsts = await Order.aggregate([
    { $match: { deletedAt: null } },
    { $sort: { orderDate: 1, _id: 1 } },
    { $group: { _id: '$companyId', order: { $first: '$$ROOT' } } },
  ]);
  let created = 0;
  for (const { _id: companyId, order } of firsts) {
    if (await Customer.exists({ companyId })) continue;
    if (await createFromOrder(companyId, order, null)) created += 1;
  }
  return created;
}
