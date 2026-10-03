import logger from '../config/logger.js';
import { FOLLOW_UP_STATUS, MESSAGES, NOTIFICATION_TYPE, PAYMENT_STATUS_CATEGORY, USER_STATUS } from '../constants/index.js';
import Customer from '../models/Customer.js';
import FollowUp from '../models/FollowUp.js';
import Notification from '../models/Notification.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import PaymentStatus from '../models/PaymentStatus.js';
import User from '../models/User.js';
import { emitToUser } from '../realtime/socket.js';
import ApiError from '../utils/ApiError.js';
import { paginationMeta } from '../utils/query.js';
import { startOfDay } from './lineItems.service.js';
import { getSettings } from './settings.service.js';

// Notifications are produced by business events, in the service where the
// event happens:
//
//   await notifyUsers({ recipients: [lead.assignedTo], exclude: actor, type, title, message, entityType, entityId });
//
// WHO is notified always comes from the record - its assignee, creator, account
// manager - never from a list in code. Events that are not caused by a request
// (a follow-up coming due, a payment becoming overdue) are found by
// runNotificationChecks(), which a timer runs.

export const NOTIFICATION_EVENT = 'notification:new';
const DUPLICATE_KEY = 11000;
const DAY_MS = 24 * 60 * 60 * 1000;

const idOf = (reference) => (reference ? String(reference._id ?? reference) : '');
// A deleted notification that carries a dedupeKey is kept, hidden, so the
// recurring check does not bring it back; everything else reads past it.
const LIVE = { deletedAt: null };
const unreadCountOf = (userId) => Notification.countDocuments({ userId, isRead: false, ...LIVE });
const dateText = (date) => new Date(date).toISOString().slice(0, 10);

// Creates one notification per recipient and pushes it to their open
// connections. `recipients` may hold ids, user documents and empty values;
// duplicates, `exclude` (normally whoever caused the event - nobody is told
// what they just did themselves) and users who are not active are dropped.
// With `dedupeKey`, a user is told about the same thing only once.
//
// Like the timeline, a notification must never block the action it describes:
// failures are logged and the request carries on. Returns what was created.
export async function notifyUsers({ recipients = [], exclude, type, title, message, entityType, entityId, dedupeKey }) {
  const created = [];
  try {
    // A type switched off in Settings -> Notifications is not sent to anyone.
    if ((await getSettings()).notifications.disabledTypes.includes(type)) return created;
    const skip = idOf(exclude);
    const ids = [...new Set(recipients.map(idOf).filter((id) => id && id !== skip))];
    if (!ids.length) return created;
    const active = await User.distinct('_id', { _id: { $in: ids }, status: USER_STATUS.ACTIVE });

    // Those already told (the unique index is the guarantee; this spares the write).
    const told = dedupeKey ? (await Notification.distinct('userId', { dedupeKey, userId: { $in: active } })).map(String) : [];

    for (const userId of active) {
      if (told.includes(String(userId))) continue;
      try {
        const notification = await Notification.create({
          userId,
          type,
          title,
          message: String(message).slice(0, 1000),
          entityType,
          entityId,
          dedupeKey,
        });
        created.push(notification);
        emitToUser(userId, NOTIFICATION_EVENT, { notification: notification.toJSON(), unreadCount: await unreadCountOf(userId) });
      } catch (err) {
        // Already told about this one.
        if (err.code !== DUPLICATE_KEY) throw err;
      }
    }
  } catch (err) {
    logger.error({ err, type, entityType, entityId }, 'Failed to create notification');
  }
  return created;
}

// --- the signed-in user's own notifications ---------------------------------------

export async function listNotifications(userId, { page, limit, isRead, type }) {
  const filter = { userId, ...LIVE };
  if (typeof isRead === 'boolean') filter.isRead = isRead;
  if (type) filter.type = type;
  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter),
    unreadCountOf(userId),
  ]);
  return { notifications, unreadCount, pagination: paginationMeta({ page, limit }, total) };
}

// Someone else's notification is "not found", never "forbidden": its
// existence is not revealed.
async function findOwn(userId, id) {
  const notification = await Notification.findOne({ _id: id, userId, ...LIVE });
  if (!notification) throw ApiError.notFound(MESSAGES.NOTIFICATION_NOT_FOUND);
  return notification;
}

export async function markRead(userId, id) {
  const notification = await findOwn(userId, id);
  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
  }
  return { notification, unreadCount: await unreadCountOf(userId) };
}

export async function markAllRead(userId) {
  const result = await Notification.updateMany({ userId, isRead: false, ...LIVE }, { $set: { isRead: true, readAt: new Date() } });
  return { updated: result.modifiedCount, unreadCount: 0 };
}

export async function deleteNotification(userId, id) {
  const notification = await findOwn(userId, id);
  if (notification.dedupeKey) {
    notification.deletedAt = new Date();
    await notification.save();
  } else {
    await notification.deleteOne();
  }
  return { unreadCount: await unreadCountOf(userId) };
}

// --- events found by the clock ------------------------------------------------------

// Pending follow-ups whose reminder date (or, without one, due date) has
// come: the person it is assigned to is told, once per due date - moving the
// date notifies again when the new one comes.
async function followUpsDue(now) {
  const followUps = await FollowUp.find({
    status: FOLLOW_UP_STATUS.PENDING,
    assignedTo: { $ne: null },
    $or: [{ reminderDate: { $lte: now } }, { reminderDate: null, dueDate: { $lte: now } }],
  }).select('title relatedType relatedId assignedTo dueDate');

  let count = 0;
  for (const followUp of followUps) {
    const late = followUp.dueDate < now;
    const created = await notifyUsers({
      recipients: [followUp.assignedTo],
      type: NOTIFICATION_TYPE.FOLLOW_UP_DUE,
      title: late ? 'Follow-up overdue' : 'Follow-up due',
      message: `"${followUp.title}" ${late ? 'was' : 'is'} due on ${dateText(followUp.dueDate)}`,
      // Opens the record the follow-up is about.
      entityType: followUp.relatedType,
      entityId: followUp.relatedId,
      dedupeKey: `follow-up-due:${followUp.id}:${followUp.dueDate.getTime()}`,
    });
    count += created.length;
  }
  return count;
}

// Payments not paid in full and past their due date: whoever recorded the
// payment, the customer's account manager and the person the order is
// assigned to are told, once per due date.
async function paymentsOverdue(now) {
  const openStatuses = await PaymentStatus.distinct('_id', {
    category: { $in: [PAYMENT_STATUS_CATEGORY.UNPAID, PAYMENT_STATUS_CATEGORY.PARTIALLY_PAID] },
  });
  const today = startOfDay(now);
  const payments = await Payment.find({ statusId: { $in: openStatuses }, dueDate: { $lt: today } })
    .select('invoiceNumber companyId customerId orderId remainingAmount dueDate createdBy')
    .populate('companyId', 'name');

  let count = 0;
  for (const payment of payments) {
    const [customer, order] = await Promise.all([
      payment.customerId ? Customer.findById(payment.customerId).select('accountManagerId') : null,
      payment.orderId ? Order.findById(payment.orderId).select('assignedTo') : null,
    ]);
    const days = Math.round((today - startOfDay(payment.dueDate)) / DAY_MS);
    const created = await notifyUsers({
      recipients: [payment.createdBy, customer?.accountManagerId, order?.assignedTo],
      type: NOTIFICATION_TYPE.PAYMENT_OVERDUE,
      title: 'Payment overdue',
      message: `${payment.invoiceNumber}${payment.companyId ? ` (${payment.companyId.name})` : ''}: ${payment.remainingAmount.toFixed(2)} outstanding, due ${dateText(payment.dueDate)} - ${days} day${days === 1 ? '' : 's'} ago`,
      entityType: 'payment',
      entityId: payment._id,
      dedupeKey: `payment-overdue:${payment.id}:${payment.dueDate.getTime()}`,
    });
    count += created.length;
  }
  return count;
}

// One pass. Safe to run any number of times, and on several servers at once:
// the unique key on (user, dedupeKey) lets each notification exist once.
export async function runNotificationChecks(now = new Date()) {
  const result = { checkedAt: now.toISOString(), followUpsDue: await followUpsDue(now), paymentsOverdue: await paymentsOverdue(now) };
  if (result.followUpsDue || result.paymentsOverdue) logger.info(result, 'Notification check');
  return result;
}
