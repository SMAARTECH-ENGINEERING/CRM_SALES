import mongoose from 'mongoose';
import { HTTP_STATUS, MESSAGES, ORDER_STATUS_CATEGORY, QUOTATION_STATUS_CATEGORY, USER_STATUS } from '../constants/index.js';
import Company from '../models/Company.js';
import Contact from '../models/Contact.js';
import Order from '../models/Order.js';
import OrderStatus from '../models/OrderStatus.js';
import Payment from '../models/Payment.js';
import Quotation from '../models/Quotation.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { paginationMeta, searchFilter } from '../utils/query.js';
import { registerCompanySection } from './companySection.service.js';
import { registerContactDeleteGuard } from './contact.service.js';
import { ensureCustomerForOrder } from './customer.service.js';
import { getDefaultEntry, registerLeadConfigUsage } from './leadConfig.service.js';
import { applyTotals, priceLines, productIdsOf, startOfDay } from './lineItems.service.js';
import { nextSequence } from './sequence.service.js';
import { numberFor } from './settings.service.js';
import { diffSnapshots, listEvents, recordEvent } from './timeline.service.js';

export const ORDER_ENTITY = 'order';

const LOCKED = [ORDER_STATUS_CATEGORY.COMPLETED, ORDER_STATUS_CATEGORY.CANCELLED];
const DAY_MS = 24 * 60 * 60 * 1000;

// People may have been deleted since; their names should still show.
const PERSON = { select: 'firstName lastName email', options: { withDeleted: true } };
const POPULATE = [
  { path: 'quotationId', select: 'quotationNumber quotationDate', options: { withDeleted: true } },
  { path: 'companyId', select: 'companyCode name email phone city status' },
  { path: 'contactId', select: 'firstName lastName email phone designation' },
  { path: 'statusId', select: 'name color category isActive' },
  { path: 'assignedTo', ...PERSON },
  { path: 'createdBy', ...PERSON },
];

const SEARCH_FIELDS = ['orderNumber', 'notes', 'items.name', 'items.sku'];
const FILTER_FIELDS = ['statusId', 'companyId', 'contactId', 'quotationId', 'assignedTo'];

// Fields tracked in the timeline for ordinary edits, with the label shown for each.
const TIMELINE_LABELS = {
  contact: 'Contact',
  orderDate: 'Order date',
  deliveryDate: 'Delivery date',
  assignedTo: 'Assigned to',
  items: 'Items',
  discount: 'Discount',
  grandTotal: 'Grand total',
  notes: 'Notes',
};

const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');
const idOf = (reference) => (reference ? String(reference._id ?? reference) : '');
const empty = (value) => value === undefined || value === null || value === '';

function snapshot(order) {
  return {
    contact: order.contactId?.fullName ?? '',
    orderDate: day(order.orderDate),
    deliveryDate: day(order.deliveryDate),
    assignedTo: order.assignedTo?.fullName ?? '',
    items: order.items.map((item) => `${item.quantity} x ${item.name} @ ${item.unitPrice}`).join('; '),
    discount: `${order.discountPercent}%`,
    grandTotal: String(order.grandTotal),
    notes: order.notes ?? '',
  };
}

// --- relationships with other modules ----------------------------------------------

// Orders appear on the company page, and a company, contact or status that
// they point to cannot be deleted.
registerCompanySection('orders', { count: (companyId) => Order.countDocuments({ companyId }), blocksDelete: true });
registerContactDeleteGuard('Orders', (contactId) => Order.countDocuments({ contactId }));
registerLeadConfigUsage('orderStatuses', (statusId) => Order.countDocuments({ statusId }));

// --- helpers -----------------------------------------------------------------

const badReference = (field, message) => ApiError.badRequest(message, [{ field, message }]);
const unprocessable = (field, message) =>
  new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, MESSAGES.VALIDATION_FAILED, [{ field, message }]);

async function findOrder(id) {
  const order = await Order.findById(id).populate(POPULATE);
  if (!order) throw ApiError.notFound(MESSAGES.ORDER_NOT_FOUND);
  return order;
}

async function assertCompanyAndContact(companyId, contactId) {
  if (!(await Company.exists({ _id: companyId }))) {
    throw badReference('companyId', MESSAGES.CONTACT_COMPANY_NOT_FOUND);
  }
  if (!contactId) return;
  const contact = await Contact.findById(contactId).select('companyId');
  if (!contact) throw badReference('contactId', MESSAGES.LEAD_CONTACT_NOT_FOUND);
  if (String(contact.companyId) !== String(companyId)) {
    throw badReference('contactId', MESSAGES.LEAD_CONTACT_COMPANY_MISMATCH);
  }
}

async function resolveStatus(statusId) {
  const id = statusId || (await getDefaultEntry('orderStatuses'))?.id;
  if (!id) throw ApiError.conflict(MESSAGES.ORDER_NO_DEFAULT_STATUS);
  const status = await OrderStatus.findOne({ _id: id, isActive: true });
  if (!status) throw badReference('statusId', MESSAGES.ORDER_STATUS_NOT_FOUND);
  return status;
}

async function assertActiveUser(userId) {
  if (!(await User.exists({ _id: userId, status: USER_STATUS.ACTIVE }))) {
    throw badReference('assignedTo', MESSAGES.ASSIGNEE_NOT_FOUND);
  }
}

function assertDates(orderDate, deliveryDate) {
  if (deliveryDate && startOfDay(deliveryDate) < startOfDay(orderDate)) {
    throw unprocessable('deliveryDate', MESSAGES.ORDER_DELIVERY_BEFORE_ORDER);
  }
}

// Fields common to both ways of creating an order, already checked.
async function orderBasics(input) {
  const status = await resolveStatus(input.statusId);
  if (input.assignedTo) await assertActiveUser(input.assignedTo);
  const orderDate = startOfDay(input.orderDate ?? new Date());
  const deliveryDate = empty(input.deliveryDate) ? undefined : startOfDay(input.deliveryDate);
  assertDates(orderDate, deliveryDate);
  return { status, orderDate, deliveryDate };
}

// Taken last, after everything that can fail.
async function nextOrderNumber() {
  const number = await nextSequence(ORDER_ENTITY);
  return await numberFor('order', number);
}

// --- operations --------------------------------------------------------------

export async function listOrders(query) {
  const { page, limit, sortBy, sortOrder, statusCategory, dateFrom, dateTo } = query;

  const filter = { ...searchFilter(query.search, SEARCH_FIELDS) };
  for (const field of FILTER_FIELDS) {
    if (query[field]) filter[field] = query[field];
  }
  if (statusCategory && !filter.statusId) {
    filter.statusId = { $in: await OrderStatus.distinct('_id', { category: statusCategory }) };
  }
  if (dateFrom || dateTo) {
    filter.orderDate = {
      ...(dateFrom ? { $gte: startOfDay(dateFrom) } : {}),
      ...(dateTo ? { $lt: new Date(startOfDay(dateTo).getTime() + DAY_MS) } : {}),
    };
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE),
    Order.countDocuments(filter),
  ]);

  return { orders, pagination: paginationMeta({ page, limit }, total) };
}

// What an order picker needs. Newest first; one company's when asked.
export async function listOrderOptions({ search, companyId, id, limit }) {
  const filter = id
    ? { _id: id }
    : { ...searchFilter(search, ['orderNumber']), ...(companyId ? { companyId } : {}) };
  const orders = await Order.find(filter).select('orderNumber orderDate grandTotal companyId').sort({ orderDate: -1, _id: 1 }).limit(limit);
  return orders.map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    orderDate: order.orderDate,
    grandTotal: order.grandTotal,
    companyId: String(order.companyId),
  }));
}

export function getOrder(id) {
  return findOrder(id);
}

// Turns an accepted quotation into an order, copying its customer, lines and
// totals exactly as quoted. The backend checks that the quotation exists, that
// it belongs to the company (when one is named), that it is accepted, and that
// no order was made from it yet - and claims it atomically, so two requests at
// the same moment cannot both create an order.
export async function createOrderFromQuotation(quotationId, input, actor) {
  const quotation = await Quotation.findById(quotationId).populate({ path: 'statusId', select: 'name category' });
  if (!quotation) throw ApiError.notFound(MESSAGES.QUOTATION_NOT_FOUND);
  if (input.companyId && input.companyId !== String(quotation.companyId)) {
    throw badReference('companyId', MESSAGES.ORDER_QUOTATION_COMPANY_MISMATCH);
  }
  if (quotation.statusId?.category !== QUOTATION_STATUS_CATEGORY.ACCEPTED) {
    throw ApiError.conflict(MESSAGES.ORDER_QUOTATION_NOT_ACCEPTED);
  }
  if (quotation.orderId) throw ApiError.conflict(MESSAGES.ORDER_ALREADY_GENERATED);

  const { status, orderDate, deliveryDate } = await orderBasics(input);
  // The contact may have been deleted since the quotation was written.
  const contactId = quotation.contactId && (await Contact.exists({ _id: quotation.contactId })) ? quotation.contactId : undefined;

  // Claim the quotation: only one request gets past this point.
  const orderId = new mongoose.Types.ObjectId();
  const claimed = await Quotation.findOneAndUpdate(
    { _id: quotation._id, orderId: null },
    { $set: { orderId } },
    { returnDocument: 'after' }
  );
  if (!claimed) throw ApiError.conflict(MESSAGES.ORDER_ALREADY_GENERATED);

  try {
    const order = new Order({
      _id: orderId,
      quotationId: quotation._id,
      companyId: quotation.companyId,
      contactId,
      // As quoted: the prices and taxes the customer accepted.
      items: quotation.items.map((item) => item.toObject()),
      subtotal: quotation.subtotal,
      discountPercent: quotation.discountPercent,
      discount: quotation.discount,
      tax: quotation.tax,
      grandTotal: quotation.grandTotal,
      orderDate,
      deliveryDate,
      statusId: status._id,
      assignedTo: input.assignedTo || undefined,
      notes: input.notes || quotation.notes || undefined,
      createdBy: actor.id,
    });
    order.orderNumber = await nextOrderNumber();
    await order.save();

    await recordEvent({
      entityType: ORDER_ENTITY,
      entityId: order._id,
      action: 'created',
      summary: `Created from quotation ${quotation.quotationNumber}`,
      actor,
    });
    // The first order makes the company a customer.
    await ensureCustomerForOrder(order, actor);
    return findOrder(order.id);
  } catch (err) {
    // Release the claim so the order can be created again.
    await Quotation.updateOne({ _id: quotation._id, orderId }, { $set: { orderId: null } });
    throw err;
  }
}

// An order entered directly, priced from the products like a quotation. With a
// quotationId it is created from that quotation instead.
export async function createOrder(input, actor) {
  if (input.quotationId) return createOrderFromQuotation(input.quotationId, input, actor);

  await assertCompanyAndContact(input.companyId, input.contactId);
  const { status, orderDate, deliveryDate } = await orderBasics(input);

  const order = new Order({
    companyId: input.companyId,
    contactId: input.contactId || undefined,
    orderDate,
    deliveryDate,
    statusId: status._id,
    assignedTo: input.assignedTo || undefined,
    notes: input.notes || undefined,
    createdBy: actor.id,
  });
  applyTotals(order, await priceLines(input.items), input.discountPercent ?? 0);
  order.orderNumber = await nextOrderNumber();
  await order.save();

  await recordEvent({ entityType: ORDER_ENTITY, entityId: order._id, action: 'created', actor });
  await ensureCustomerForOrder(order, actor);
  return findOrder(order.id);
}

// Edits everything except the status, which has its own endpoint.
export async function updateOrder(id, input, actor) {
  const order = await findOrder(id);
  if (LOCKED.includes(order.statusId?.category)) throw ApiError.conflict(MESSAGES.ORDER_LOCKED);
  const before = snapshot(order);

  if ('contactId' in input && (input.contactId || '') !== idOf(order.contactId)) {
    await assertCompanyAndContact(idOf(order.companyId), input.contactId);
    order.contactId = input.contactId || undefined;
  }
  if ('assignedTo' in input && (input.assignedTo || '') !== idOf(order.assignedTo)) {
    if (input.assignedTo) await assertActiveUser(input.assignedTo);
    order.assignedTo = input.assignedTo || undefined;
  }

  if (!empty(input.orderDate)) order.orderDate = startOfDay(input.orderDate);
  if ('deliveryDate' in input) order.deliveryDate = empty(input.deliveryDate) ? undefined : startOfDay(input.deliveryDate);
  assertDates(order.orderDate, order.deliveryDate);
  if ('notes' in input) order.notes = input.notes || undefined;

  // Totals are recalculated whenever lines or the discount change. Lines that
  // are not resent keep the prices and tax rates they were written with.
  if (input.items || !empty(input.discountPercent)) {
    const lines = input.items
      ? await priceLines(input.items, productIdsOf(order))
      : order.items.map((item) => item.toObject());
    applyTotals(order, lines, empty(input.discountPercent) ? order.discountPercent : input.discountPercent);
  }

  await order.save();
  const updated = await findOrder(id);

  const changes = diffSnapshots(before, snapshot(updated), TIMELINE_LABELS);
  if (changes.length) {
    await recordEvent({ entityType: ORDER_ENTITY, entityId: updated._id, action: 'updated', changes, actor });
  }
  return updated;
}

export async function changeOrderStatus(id, statusId, actor) {
  const order = await findOrder(id);
  if (statusId === idOf(order.statusId)) return order;

  const status = await OrderStatus.findOne({ _id: statusId, isActive: true });
  if (!status) throw badReference('statusId', MESSAGES.ORDER_STATUS_NOT_FOUND);
  const from = order.statusId?.name;
  order.statusId = status._id;
  await order.save();

  await recordEvent({
    entityType: ORDER_ENTITY,
    entityId: order._id,
    action: 'status_changed',
    changes: [{ field: 'status', label: 'Status', from, to: status.name }],
    actor,
  });
  return findOrder(id);
}

// Soft delete. The quotation it came from is released, so a new order can be
// created from it.
export async function deleteOrder(id, actor) {
  const order = await findOrder(id);
  // Money is being collected against it.
  if (await Payment.exists({ orderId: order._id })) throw ApiError.conflict(MESSAGES.ORDER_HAS_PAYMENTS);
  order.deletedAt = new Date();
  await order.save();
  if (order.quotationId) {
    await Quotation.updateOne({ _id: idOf(order.quotationId), orderId: order._id }, { $set: { orderId: null } });
  }
  await recordEvent({ entityType: ORDER_ENTITY, entityId: order._id, action: 'deleted', actor });
}

export async function getOrderTimeline(id, query) {
  const order = await findOrder(id);
  return listEvents(ORDER_ENTITY, order._id, query);
}
