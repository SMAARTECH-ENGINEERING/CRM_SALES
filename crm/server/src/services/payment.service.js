import mongoose from 'mongoose';
import { HTTP_STATUS, MESSAGES, PAYMENT_STATE, PAYMENT_STATUS_CATEGORY } from '../constants/index.js';
import Company from '../models/Company.js';
import Customer from '../models/Customer.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import PaymentMethod from '../models/PaymentMethod.js';
import PaymentStatus from '../models/PaymentStatus.js';
import ApiError from '../utils/ApiError.js';
import { paginationMeta, searchFilter } from '../utils/query.js';
import { registerCompanySection } from './companySection.service.js';
import { registerLeadConfigUsage } from './leadConfig.service.js';
import { startOfDay } from './lineItems.service.js';
import { round2 } from './quotationTotals.js';
import { nextSequence } from './sequence.service.js';
import { getSettings, numberFor } from './settings.service.js';
import { diffSnapshots, listEvents, recordEvent } from './timeline.service.js';

export const PAYMENT_ENTITY = 'payment';
const { UNPAID, PARTIALLY_PAID, PAID, CANCELLED } = PAYMENT_STATUS_CATEGORY;
const OPEN = [UNPAID, PARTIALLY_PAID];
const DAY_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_KEY = 11000;
const { ObjectId } = mongoose.Types;

// People may have been deleted since; their names should still show.
const PERSON = { select: 'firstName lastName email', options: { withDeleted: true } };
const POPULATE = [
  { path: 'companyId', select: 'companyCode name email phone' },
  { path: 'customerId', select: 'customerNumber' },
  { path: 'orderId', select: 'orderNumber orderDate grandTotal' },
  { path: 'paymentMethodId', select: 'name color isActive' },
  { path: 'statusId', select: 'name color category isActive' },
  { path: 'createdBy', ...PERSON },
];

const SEARCH_FIELDS = ['invoiceNumber', 'notes'];
const FILTER_FIELDS = ['statusId', 'paymentMethodId', 'companyId', 'customerId', 'orderId'];

const TIMELINE_LABELS = {
  amount: 'Amount',
  paidAmount: 'Paid',
  remainingAmount: 'Remaining',
  dueDate: 'Due date',
  paymentDate: 'Payment date',
  paymentMethod: 'Payment method',
  status: 'Status',
  order: 'Order',
  notes: 'Notes',
};

const idOf = (reference) => (reference ? String(reference._id ?? reference) : '');
const dateText = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');
const money = (value) => (value == null ? '' : value.toFixed(2));

function snapshot(payment) {
  return {
    amount: money(payment.amount),
    paidAmount: money(payment.paidAmount),
    remainingAmount: money(payment.remainingAmount),
    dueDate: dateText(payment.dueDate),
    paymentDate: dateText(payment.paymentDate),
    paymentMethod: payment.paymentMethodId?.name ?? '',
    status: payment.statusId?.name ?? '',
    order: payment.orderId?.orderNumber ?? '',
    notes: payment.notes ?? '',
  };
}

// The payment as the API returns it. Whether it is overdue is worked out here
// - not paid in full, not cancelled, and past its due date - so no client has to.
function present(payment, now = new Date()) {
  const open = OPEN.includes(payment.statusId?.category);
  const daysOverdue = open && payment.dueDate ? Math.round((startOfDay(now) - startOfDay(payment.dueDate)) / DAY_MS) : 0;
  return {
    ...payment.toJSON(),
    isOverdue: daysOverdue > 0,
    daysOverdue: Math.max(0, daysOverdue),
    // Only possible with PAYMENT_ALLOW_OVERPAYMENT.
    overpaidAmount: round2(Math.max(0, payment.paidAmount - payment.amount)),
  };
}

// --- relationships with other modules ----------------------------------------------

registerCompanySection('payments', { count: (companyId) => Payment.countDocuments({ companyId }), blocksDelete: true });
registerLeadConfigUsage('paymentMethods', (paymentMethodId) => Payment.countDocuments({ paymentMethodId }));
registerLeadConfigUsage('paymentStatuses', (statusId) => Payment.countDocuments({ statusId }));

// --- helpers -----------------------------------------------------------------

const badReference = (field, message) => ApiError.badRequest(message, [{ field, message }]);
const unprocessable = (field, message) =>
  new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, MESSAGES.VALIDATION_FAILED, [{ field, message }]);

async function findPayment(id) {
  const payment = await Payment.findById(id).populate(POPULATE);
  if (!payment) throw ApiError.notFound(MESSAGES.PAYMENT_NOT_FOUND);
  return payment;
}

const statusIdsOf = (categories) => PaymentStatus.distinct('_id', { category: { $in: categories } });

async function loadOrder(companyId, orderId) {
  if (!orderId) return null;
  const order = await Order.findById(orderId).select('companyId grandTotal orderNumber');
  if (!order) throw badReference('orderId', MESSAGES.PAYMENT_ORDER_NOT_FOUND);
  if (String(order.companyId) !== String(companyId)) throw badReference('orderId', MESSAGES.PAYMENT_ORDER_COMPANY_MISMATCH);
  return order;
}

async function assertMethod(paymentMethodId) {
  if (paymentMethodId && !(await PaymentMethod.exists({ _id: paymentMethodId, isActive: true }))) {
    throw badReference('paymentMethodId', MESSAGES.PAYMENT_METHOD_NOT_FOUND);
  }
}

// What the amounts say: nothing received, part of it, or all of it.
function categoryOf({ amount, paidAmount }) {
  if (paidAmount <= 0) return UNPAID;
  return paidAmount < amount ? PARTIALLY_PAID : PAID;
}

// THE calculation. Whatever a client sends, the remaining amount is what is
// left of the amount after what was paid.
function settle(payment) {
  payment.amount = round2(payment.amount);
  payment.paidAmount = round2(payment.paidAmount);
  payment.remainingAmount = round2(Math.max(0, payment.amount - payment.paidAmount));
  if (payment.paidAmount > 0) payment.paymentDate ??= startOfDay(new Date());
  else payment.paymentDate = undefined;
}

// Whether more may be paid than is outstanding (Settings -> Sales).
const overpaymentAllowed = async () => (await getSettings()).sales.allowOverpayment;

// Unless overpayment is allowed, no more can be paid than is outstanding.
function assertNotOverpaid(payment, field, allowed) {
  if (allowed || payment.paidAmount <= payment.amount) return;
  throw unprocessable(field, `${MESSAGES.PAYMENT_EXCEEDS_OUTSTANDING} (amount ${money(payment.amount)})`);
}

// What other payments (not cancelled) already claim of an order.
async function invoicedForOrder(orderId, excludeId) {
  const [row] = await Payment.aggregate([
    {
      $match: {
        orderId: new ObjectId(String(orderId)),
        deletedAt: null,
        statusId: { $nin: await statusIdsOf([CANCELLED]) },
        ...(excludeId ? { _id: { $ne: excludeId } } : {}),
      },
    },
    { $group: { _id: null, amount: { $sum: '$amount' } } },
  ]);
  return round2(row?.amount ?? 0);
}

// Unless overpayment is allowed, an order's invoices may not add up to more
// than the order.
async function assertWithinOrder(payment, order, category, allowed) {
  if (!order || allowed || category === CANCELLED) return;
  const others = await invoicedForOrder(order._id, payment.isNew ? null : payment._id);
  const outstanding = round2(order.grandTotal - others);
  if (payment.amount > outstanding) {
    throw unprocessable('amount', `${MESSAGES.PAYMENT_EXCEEDS_ORDER} (still to invoice on ${order.orderNumber}: ${money(Math.max(0, outstanding))})`);
  }
}

// The status follows the amounts. A status may be asked for to cancel, or to
// choose between several statuses of the meaning that applies; anything else
// asked for is replaced by what the amounts say. A cancelled payment stays
// cancelled until a status that is not "cancelled" is asked for.
async function resolveStatus(payment, requestedId, currentStatus) {
  const computed = categoryOf(payment);
  let requested = null;
  if (requestedId) {
    requested = await PaymentStatus.findOne({ _id: requestedId, isActive: true });
    if (!requested) throw badReference('statusId', MESSAGES.PAYMENT_STATUS_NOT_FOUND);
  }
  if (requested?.category === CANCELLED) return requested;
  if (!requested && currentStatus?.category === CANCELLED) return currentStatus;
  if (requested?.category === computed) return requested;
  if (currentStatus?.category === computed) return currentStatus;
  const status = await PaymentStatus.findOne({ category: computed, isActive: true }).sort({ sortOrder: 1, name: 1 });
  if (!status) throw ApiError.conflict(MESSAGES.PAYMENT_NO_STATUS);
  return status;
}

const paymentEvent = (payment, action, actor, extra = {}) =>
  recordEvent({ entityType: PAYMENT_ENTITY, entityId: payment._id, action, actor, ...extra });

// --- list and totals -------------------------------------------------------------

async function stateFilter(state, now) {
  if (state === PAYMENT_STATE.OVERDUE) {
    return { statusId: { $in: await statusIdsOf(OPEN) }, dueDate: { $lt: startOfDay(now) } };
  }
  return { statusId: { $in: await statusIdsOf([state]) } };
}

export async function listPayments(query, now = new Date()) {
  const { page, limit, sortBy, sortOrder } = query;
  const filter = { ...searchFilter(query.search, SEARCH_FIELDS) };
  for (const field of FILTER_FIELDS) {
    if (query[field]) filter[field] = query[field];
  }
  if (query.state) {
    const { statusId, ...rest } = await stateFilter(query.state, now);
    Object.assign(filter, rest);
    if (!filter.statusId) filter.statusId = statusId;
    // An explicit status that contradicts the state matches nothing.
    else if (!statusId.$in.some((id) => String(id) === String(filter.statusId))) filter.statusId = { $in: [] };
  }
  if (query.dueFrom || query.dueTo) {
    filter.dueDate = { ...(filter.dueDate ?? {}), ...(query.dueFrom ? { $gte: query.dueFrom } : {}), ...(query.dueTo ? { $lte: query.dueTo } : {}) };
  }

  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE),
    Payment.countDocuments(filter),
  ]);
  return { payments: payments.map((payment) => present(payment, now)), pagination: paginationMeta({ page, limit }, total) };
}

// Counts and sums by what the status means, what is overdue and what is still
// to be collected - all aggregated in the database. With `orderId`, also how
// much of that order has been invoiced.
export async function getPaymentStats({ companyId, customerId, orderId } = {}, now = new Date()) {
  const match = {
    deletedAt: null,
    ...(companyId ? { companyId: new ObjectId(companyId) } : {}),
    ...(customerId ? { customerId: new ObjectId(customerId) } : {}),
    ...(orderId ? { orderId: new ObjectId(orderId) } : {}),
  };
  const statuses = await PaymentStatus.find().select('category');
  const categoryOfStatus = new Map(statuses.map((status) => [status.id, status.category]));
  const openIds = statuses.filter((status) => OPEN.includes(status.category)).map((status) => status._id);
  const sums = { count: { $sum: 1 }, amount: { $sum: '$amount' }, paid: { $sum: '$paidAmount' }, remaining: { $sum: '$remainingAmount' } };

  const [rows, [overdue], order] = await Promise.all([
    Payment.aggregate([{ $match: match }, { $group: { _id: '$statusId', ...sums } }]),
    Payment.aggregate([{ $match: { ...match, statusId: { $in: openIds }, dueDate: { $lt: startOfDay(now) } } }, { $group: { _id: null, ...sums } }]),
    orderId ? Order.findById(orderId).select('orderNumber grandTotal') : null,
  ]);

  const empty = () => ({ count: 0, amount: 0, paid: 0, remaining: 0 });
  const byCategory = Object.fromEntries(Object.values(PAYMENT_STATUS_CATEGORY).map((category) => [category, empty()]));
  for (const row of rows) {
    const group = byCategory[categoryOfStatus.get(String(row._id))];
    if (!group) continue;
    group.count += row.count;
    for (const key of ['amount', 'paid', 'remaining']) group[key] = round2(group[key] + row[key]);
  }
  const live = [UNPAID, PARTIALLY_PAID, PAID].map((category) => byCategory[category]);
  const sum = (key) => round2(live.reduce((total, group) => total + group[key], 0));

  const stats = {
    byCategory,
    overdue: { count: overdue?.count ?? 0, remaining: round2(overdue?.remaining ?? 0) },
    // Cancelled payments are left out of the totals.
    totals: { count: sum('count'), amount: sum('amount'), paid: sum('paid'), outstanding: round2(byCategory[UNPAID].remaining + byCategory[PARTIALLY_PAID].remaining) },
  };
  if (order) {
    stats.order = {
      id: order.id,
      orderNumber: order.orderNumber,
      grandTotal: order.grandTotal,
      invoiced: stats.totals.amount,
      toInvoice: round2(Math.max(0, order.grandTotal - stats.totals.amount)),
    };
  }
  return stats;
}

export async function getPayment(id) {
  return present(await findPayment(id));
}

export async function getPaymentTimeline(id, paging) {
  const payment = await findPayment(id);
  return listEvents(PAYMENT_ENTITY, payment._id, paging);
}

// --- changes -------------------------------------------------------------------

async function save(payment) {
  try {
    await payment.save();
  } catch (err) {
    if (err.code === DUPLICATE_KEY) throw ApiError.conflict(MESSAGES.PAYMENT_INVOICE_TAKEN, [{ field: 'invoiceNumber', message: MESSAGES.PAYMENT_INVOICE_TAKEN }]);
    throw err;
  }
}

export async function createPayment(input, actor) {
  if (!(await Company.exists({ _id: input.companyId }))) throw badReference('companyId', MESSAGES.CONTACT_COMPANY_NOT_FOUND);
  const order = await loadOrder(input.companyId, input.orderId);
  await assertMethod(input.paymentMethodId);
  if (input.invoiceNumber && (await Payment.exists({ invoiceNumber: input.invoiceNumber }).setOptions({ withDeleted: true }))) {
    throw ApiError.conflict(MESSAGES.PAYMENT_INVOICE_TAKEN, [{ field: 'invoiceNumber', message: MESSAGES.PAYMENT_INVOICE_TAKEN }]);
  }
  const customer = await Customer.findOne({ companyId: input.companyId }).select('_id');

  const payment = new Payment({
    companyId: input.companyId,
    customerId: customer?._id,
    orderId: order?._id,
    amount: input.amount,
    paidAmount: input.paidAmount ?? 0,
    dueDate: input.dueDate ? startOfDay(input.dueDate) : undefined,
    paymentDate: input.paymentDate ? startOfDay(input.paymentDate) : undefined,
    paymentMethodId: input.paymentMethodId || undefined,
    notes: input.notes || undefined,
    createdBy: actor.id,
  });
  settle(payment);
  const allowed = await overpaymentAllowed();
  assertNotOverpaid(payment, 'paidAmount', allowed);
  const status = await resolveStatus(payment, input.statusId, null);
  await assertWithinOrder(payment, order, status.category, allowed);
  payment.statusId = status._id;

  // A generated number is taken last, after every check, so refused requests use none.
  payment.invoiceNumber =
    input.invoiceNumber || (await numberFor('invoice', await nextSequence(PAYMENT_ENTITY)));
  await save(payment);

  await paymentEvent(payment, 'created', actor);
  return getPayment(payment.id);
}

// Applies the fields that are sent. Money received is recorded either as the
// new total (`paidAmount`) or as an amount to add (`receivedAmount`) - the
// adding is done here, never by the client. The company and the invoice number
// are fixed.
export async function updatePayment(id, input, actor) {
  const payment = await findPayment(id);
  const before = snapshot(payment);
  const currentStatus = payment.statusId;
  const companyId = idOf(payment.companyId);

  let order = payment.orderId ? await Order.findById(idOf(payment.orderId)).select('companyId grandTotal orderNumber') : null;
  if ('orderId' in input && (input.orderId || '') !== idOf(payment.orderId)) {
    order = await loadOrder(companyId, input.orderId);
    payment.orderId = order?._id;
  }
  if ('paymentMethodId' in input && (input.paymentMethodId || '') !== idOf(payment.paymentMethodId)) {
    await assertMethod(input.paymentMethodId);
    payment.paymentMethodId = input.paymentMethodId || undefined;
  }
  if (input.amount != null) payment.amount = input.amount;
  if ('dueDate' in input) payment.dueDate = input.dueDate ? startOfDay(input.dueDate) : undefined;
  if ('notes' in input) payment.notes = input.notes || undefined;

  let paidField = 'paidAmount';
  if (input.receivedAmount != null) {
    paidField = 'receivedAmount';
    payment.paidAmount += input.receivedAmount;
    // A new receipt: dated today unless a date came with it.
    payment.paymentDate = input.paymentDate ? startOfDay(input.paymentDate) : startOfDay(new Date());
  } else {
    if (input.paidAmount != null) payment.paidAmount = input.paidAmount;
    if ('paymentDate' in input) payment.paymentDate = input.paymentDate ? startOfDay(input.paymentDate) : undefined;
  }

  settle(payment);
  const allowed = await overpaymentAllowed();
  assertNotOverpaid(payment, paidField, allowed);
  const status = await resolveStatus(payment, input.statusId, currentStatus);
  // Only when this edit changes what the order is asked to carry.
  const reopened = currentStatus?.category === CANCELLED && status.category !== CANCELLED;
  if (payment.isModified('amount') || payment.isModified('orderId') || reopened) {
    await assertWithinOrder(payment, order, status.category, allowed);
  }
  payment.statusId = status._id;

  await save(payment);
  const updated = await findPayment(id);
  const changes = diffSnapshots(before, snapshot(updated), TIMELINE_LABELS);
  if (changes.length) {
    const statusOnly = changes.every((change) => change.field === 'status');
    await paymentEvent(updated, statusOnly ? 'status_changed' : 'updated', actor, { changes });
  }
  return present(updated);
}

export async function deletePayment(id, actor) {
  const payment = await findPayment(id);
  payment.deletedAt = new Date();
  await payment.save();
  await paymentEvent(payment, 'deleted', actor);
}
