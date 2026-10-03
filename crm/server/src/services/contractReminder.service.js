import logger from '../config/logger.js';
import { CONTRACT_STATUS_CATEGORY, NOTIFICATION_TYPE, USER_STATUS, WORK_PRIORITY } from '../constants/index.js';
import Contract from '../models/Contract.js';
import ContractReminder from '../models/ContractReminder.js';
import ContractStatus from '../models/ContractStatus.js';
import FollowUp from '../models/FollowUp.js';
import User from '../models/User.js';
import { CONTRACT_ENTITY, cancelPendingReminders } from './contract.service.js';
import { listEntries } from './leadConfig.service.js';
import { startOfDay } from './lineItems.service.js';
import { isMailConfigured, sendMail } from './mail.service.js';
import { notifyUsers } from './notification.service.js';
import { getCompanyProfile, getSettings } from './settings.service.js';
import { recordEvent } from './timeline.service.js';

// Automatic contract expiry reminders.
//
// The periods are data (Settings -> Contract reminder periods), e.g. "30 days
// before". On each run, for every ACTIVE contract whose end date is within the
// longest active period, the smallest period that covers the days left is the
// one that is due - so a contract crosses each period once and gets one
// reminder per period, and one created 10 days before its end gets the reminder
// for the period covering 10 days, not every larger period at once.
//
// A reminder is:
//  - a follow-up for the person responsible (assignedTo, else whoever created
//    the contract), due on the end date - it shows in their follow-ups and on
//    the contract page;
//  - an email to that person, when email is configured;
//  - an entry on the contract's timeline.
//
// The same run also moves active contracts whose end date has passed to the
// first active status meaning "expired", if there is one.

const DAY_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_KEY = 11000;
const PERSON = 'firstName lastName email status';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

async function activeStatusIds() {
  return ContractStatus.distinct('_id', { category: CONTRACT_STATUS_CATEGORY.ACTIVE });
}

// Active contracts past their end date -> the first active "expired" status.
async function expireEnded(today) {
  const expired = await ContractStatus.findOne({ category: CONTRACT_STATUS_CATEGORY.EXPIRED, isActive: true }).sort({ sortOrder: 1, name: 1 });
  if (!expired) return 0;
  const contracts = await Contract.find({ statusId: { $in: await activeStatusIds() }, endDate: { $lt: today } }).populate('statusId', 'name');
  let count = 0;
  for (const contract of contracts) {
    // Claimed one by one: a contract changed meanwhile is left alone.
    const claimed = await Contract.updateOne({ _id: contract._id, statusId: contract.statusId._id }, { $set: { statusId: expired._id } });
    if (!claimed.modifiedCount) continue;
    count += 1;
    await cancelPendingReminders(contract._id);
    await recordEvent({
      entityType: CONTRACT_ENTITY,
      entityId: contract._id,
      action: 'status_changed',
      summary: 'Marked expired automatically: the end date has passed',
      changes: [{ field: 'status', label: 'Status', from: contract.statusId.name, to: expired.name }],
    });
  }
  return count;
}

async function responsiblePerson(contract) {
  for (const id of [contract.assignedTo, contract.createdBy]) {
    if (!id) continue;
    const user = await User.findById(id).select(PERSON);
    if (user?.status === USER_STATUS.ACTIVE) return user;
  }
  return null;
}

// Returns why it was not emailed, or null when it was.
async function emailReminder(user, contract, subject, text) {
  if (!(await getSettings()).notifications.contractReminderEmails) return 'Reminder emails are switched off in Settings';
  if (!isMailConfigured()) return 'Email is not configured';
  if (!user?.email) return 'The recipient has no email address';
  try {
    const profile = await getCompanyProfile();
    await sendMail({ from: profile.email, to: user.email, subject, text });
    return null;
  } catch (err) {
    logger.warn({ err, contractId: contract.id }, 'Contract reminder email failed');
    return `The mail server refused the message: ${err.message}`.slice(0, 500);
  }
}

async function remind(contract, period, daysLeft, today) {
  const recipient = await responsiblePerson(contract);
  let reminder;
  try {
    // Claimed first: a second run (or server) finds the key taken and stops.
    reminder = await ContractReminder.create({
      contractId: contract._id,
      daysBefore: period.daysBefore,
      endDate: contract.endDate,
      daysLeft,
      recipientId: recipient?._id,
    });
  } catch (err) {
    if (err.code === DUPLICATE_KEY) return null;
    throw err;
  }

  const company = contract.companyId?.name ?? 'the customer';
  const when = daysLeft === 0 ? 'today' : `in ${plural(daysLeft, 'day')}`;
  const endText = contract.endDate.toISOString().slice(0, 10);
  const subject = `Contract ${contract.contractNumber} with ${company} ends ${when}`;
  const text = [
    recipient ? `Hello ${recipient.firstName},` : 'Hello,',
    '',
    `Contract ${contract.contractNumber} with ${company} ends on ${endText} (${when}).`,
    contract.renewalDate ? `Renewal date: ${contract.renewalDate.toISOString().slice(0, 10)}.` : null,
    'Please follow up on its renewal.',
    '',
    `This reminder is sent ${plural(period.daysBefore, 'day')} before the end date ("${period.name}").`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  const followUp = await FollowUp.create({
    title: subject,
    description: text,
    relatedType: CONTRACT_ENTITY,
    relatedId: contract._id,
    assignedTo: recipient?._id,
    dueDate: contract.endDate,
    reminderDate: today,
    priority: WORK_PRIORITY.MEDIUM,
  });
  const emailError = await emailReminder(recipient, contract, subject, text);
  reminder.followUpId = followUp._id;
  if (emailError) reminder.emailError = emailError;
  else reminder.emailedAt = new Date();
  await reminder.save();

  await notifyUsers({
    recipients: [recipient],
    type: NOTIFICATION_TYPE.CONTRACT_EXPIRING,
    title: 'Contract expiring',
    message: subject,
    entityType: CONTRACT_ENTITY,
    entityId: contract._id,
    dedupeKey: `contract-expiring:${contract.id}:${period.daysBefore}:${endText}`,
  });

  await recordEvent({
    entityType: CONTRACT_ENTITY,
    entityId: contract._id,
    action: 'reminded',
    summary: `Expiry reminder (${period.name}): ends ${when}${recipient ? `, sent to ${recipient.fullName}` : ''}${emailError ? '' : ' by email'}`,
  });
  return reminder;
}

// One pass: expire ended contracts, then send whatever reminders are due.
// Safe to run any number of times and on several servers at once.
export async function runReminderCheck(now = new Date()) {
  const today = startOfDay(now);
  const expired = await expireEnded(today);

  const periods = (await listEntries('contractReminderPeriods', { isActive: true })).sort((a, b) => a.daysBefore - b.daysBefore);
  const result = { checkedAt: now.toISOString(), periods: periods.map((p) => p.daysBefore), expired, considered: 0, reminded: 0, emailed: 0 };
  if (!periods.length) return result;

  const longest = periods[periods.length - 1].daysBefore;
  const contracts = await Contract.find({
    statusId: { $in: await activeStatusIds() },
    endDate: { $gte: today, $lte: new Date(today.getTime() + longest * DAY_MS) },
  }).populate('companyId', 'name');
  result.considered = contracts.length;

  for (const contract of contracts) {
    const daysLeft = Math.round((startOfDay(contract.endDate) - today) / DAY_MS);
    const period = periods.find((p) => p.daysBefore >= daysLeft);
    if (!period) continue;
    try {
      const reminder = await remind(contract, period, daysLeft, today);
      if (!reminder) continue;
      result.reminded += 1;
      if (reminder.emailedAt) result.emailed += 1;
    } catch (err) {
      // One bad contract must not stop the others.
      logger.error({ err, contractId: contract.id }, 'Contract reminder failed');
    }
  }
  if (result.expired || result.reminded) logger.info(result, 'Contract reminder check');
  return result;
}
