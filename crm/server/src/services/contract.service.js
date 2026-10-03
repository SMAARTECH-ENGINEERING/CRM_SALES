import mongoose from 'mongoose';
import { CONTRACT_STATUS_CATEGORY, FOLLOW_UP_STATUS, HTTP_STATUS, MESSAGES, USER_STATUS } from '../constants/index.js';
import BillingCycle from '../models/BillingCycle.js';
import Company from '../models/Company.js';
import Contract from '../models/Contract.js';
import ContractReminder from '../models/ContractReminder.js';
import ContractStatus from '../models/ContractStatus.js';
import ContractType from '../models/ContractType.js';
import Customer from '../models/Customer.js';
import FollowUp from '../models/FollowUp.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { paginationMeta, searchFilter } from '../utils/query.js';
import { registerCompanySection } from './companySection.service.js';
import { getDefaultEntry, listEntries, registerLeadConfigUsage } from './leadConfig.service.js';
import { startOfDay } from './lineItems.service.js';
import { round2 } from './quotationTotals.js';
import { nextSequence } from './sequence.service.js';
import { numberFor } from './settings.service.js';
import { diffSnapshots, listEvents, recordEvent } from './timeline.service.js';

export const CONTRACT_ENTITY = 'contract';
const { ACTIVE } = CONTRACT_STATUS_CATEGORY;
const DAY_MS = 24 * 60 * 60 * 1000;
const { ObjectId } = mongoose.Types;

// People may have been deleted since; their names should still show.
const PERSON = { select: 'firstName lastName email', options: { withDeleted: true } };
const POPULATE = [
  { path: 'companyId', select: 'companyCode name email phone' },
  { path: 'customerId', select: 'customerNumber' },
  { path: 'contractTypeId', select: 'name color isActive' },
  { path: 'billingCycleId', select: 'name months isActive' },
  { path: 'statusId', select: 'name color category isActive' },
  { path: 'assignedTo', ...PERSON },
  { path: 'createdBy', ...PERSON },
];

const SEARCH_FIELDS = ['contractNumber', 'description'];
const FILTER_FIELDS = ['statusId', 'contractTypeId', 'billingCycleId', 'assignedTo', 'companyId', 'customerId'];

const TIMELINE_LABELS = {
  contractType: 'Contract type',
  startDate: 'Start date',
  endDate: 'End date',
  renewalDate: 'Renewal date',
  amount: 'Amount',
  billingCycle: 'Billing cycle',
  assignedTo: 'Assigned to',
  description: 'Description',
};

const idOf = (reference) => (reference ? String(reference._id ?? reference) : '');
const dateText = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');
// Whole days from `from` to `to`, both taken as calendar days.
const daysBetween = (from, to) => Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);

function snapshot(contract) {
  return {
    contractType: contract.contractTypeId?.name ?? '',
    startDate: dateText(contract.startDate),
    endDate: dateText(contract.endDate),
    renewalDate: dateText(contract.renewalDate),
    amount: contract.amount == null ? '' : String(contract.amount),
    billingCycle: contract.billingCycleId?.name ?? '',
    assignedTo: contract.assignedTo?.fullName ?? '',
    description: contract.description ?? '',
  };
}

// The contract as the API returns it, with the days left to its end worked
// out here, so no client has to.
function present(contract, now = new Date()) {
  return { ...contract.toJSON(), daysToEnd: daysBetween(now, contract.endDate) };
}

// --- relationships with other modules ----------------------------------------------

registerCompanySection('contracts', { count: (companyId) => Contract.countDocuments({ companyId }), blocksDelete: true });
registerLeadConfigUsage('contractTypes', (contractTypeId) => Contract.countDocuments({ contractTypeId }));
registerLeadConfigUsage('contractStatuses', (statusId) => Contract.countDocuments({ statusId }));
registerLeadConfigUsage('billingCycles', (billingCycleId) => Contract.countDocuments({ billingCycleId }));

// --- helpers -----------------------------------------------------------------

const badReference = (field, message) => ApiError.badRequest(message, [{ field, message }]);
const unprocessable = (field, message) =>
  new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, MESSAGES.VALIDATION_FAILED, [{ field, message }]);

async function findContract(id) {
  const contract = await Contract.findById(id).populate(POPULATE);
  if (!contract) throw ApiError.notFound(MESSAGES.CONTRACT_NOT_FOUND);
  return contract;
}

async function assertActive(Model, id, field, message) {
  if (id && !(await Model.exists({ _id: id, isActive: true }))) throw badReference(field, message);
}

async function assertActiveUser(userId) {
  if (userId && !(await User.exists({ _id: userId, status: USER_STATUS.ACTIVE }))) {
    throw badReference('assignedTo', MESSAGES.ASSIGNEE_NOT_FOUND);
  }
}

// The end and renewal dates must not come before the start.
function assertDates({ startDate, endDate, renewalDate }) {
  if (endDate < startDate) throw unprocessable('endDate', MESSAGES.CONTRACT_END_BEFORE_START);
  if (renewalDate && renewalDate < startDate) throw unprocessable('renewalDate', MESSAGES.CONTRACT_RENEWAL_BEFORE_START);
}

const statusIdsOf = (categories) => ContractStatus.distinct('_id', { category: { $in: categories } });

const contractEvent = (contract, action, actor, extra = {}) =>
  recordEvent({ entityType: CONTRACT_ENTITY, entityId: contract._id, action, actor, ...extra });

// Reminder follow-ups still waiting to be done become pointless when the
// contract stops being active, is deleted or gets a new end date.
export async function cancelPendingReminders(contractId, { keepEndDate } = {}) {
  const reminders = await ContractReminder.find({
    contractId,
    followUpId: { $ne: null },
    ...(keepEndDate ? { endDate: { $ne: keepEndDate } } : {}),
  }).select('followUpId');
  if (!reminders.length) return;
  await FollowUp.updateMany(
    { _id: { $in: reminders.map((reminder) => reminder.followUpId) }, status: FOLLOW_UP_STATUS.PENDING },
    { $set: { status: FOLLOW_UP_STATUS.CANCELLED } }
  );
}

// --- list and stats ------------------------------------------------------------

async function buildFilter(query, now) {
  const filter = { ...searchFilter(query.search, SEARCH_FIELDS) };
  for (const field of FILTER_FIELDS) {
    if (query[field]) filter[field] = query[field];
  }
  if (query.statusCategory && !filter.statusId) filter.statusId = { $in: await statusIdsOf([query.statusCategory]) };
  // Active contracts ending within the next N days (today included).
  if (query.expiringWithin != null) {
    const today = startOfDay(now);
    if (!filter.statusId) filter.statusId = { $in: await statusIdsOf([ACTIVE]) };
    filter.endDate = { $gte: today, $lte: new Date(today.getTime() + query.expiringWithin * DAY_MS) };
  }
  if (query.endFrom || query.endTo) {
    filter.endDate = { ...(filter.endDate ?? {}), ...(query.endFrom ? { $gte: query.endFrom } : {}), ...(query.endTo ? { $lte: query.endTo } : {}) };
  }
  return filter;
}

export async function listContracts(query, now = new Date()) {
  const { page, limit, sortBy, sortOrder } = query;
  const filter = await buildFilter(query, now);
  const [contracts, total] = await Promise.all([
    Contract.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE),
    Contract.countDocuments(filter),
  ]);
  return { contracts: contracts.map((contract) => present(contract, now)), pagination: paginationMeta({ page, limit }, total) };
}

// The longest active reminder period: how far ahead "expiring soon" looks.
// None when no period is active.
async function reminderWindow() {
  const periods = await listEntries('contractReminderPeriods', { isActive: true });
  return periods.length ? Math.max(...periods.map((period) => period.daysBefore)) : null;
}

// Counts and values by what the status means, plus active contracts ending
// within the reminder window and active ones whose end date has passed.
export async function getContractStats({ companyId, assignedTo } = {}, now = new Date()) {
  const match = {
    deletedAt: null,
    ...(companyId ? { companyId: new ObjectId(companyId) } : {}),
    ...(assignedTo ? { assignedTo: new ObjectId(assignedTo) } : {}),
  };
  const statuses = await ContractStatus.find().select('category');
  const categoryOf = new Map(statuses.map((status) => [status.id, status.category]));
  const activeIds = statuses.filter((status) => status.category === ACTIVE).map((status) => status._id);
  const today = startOfDay(now);
  const windowDays = await reminderWindow();
  const sumOf = (filter) =>
    Contract.aggregate([{ $match: filter }, { $group: { _id: null, count: { $sum: 1 }, value: { $sum: '$amount' } } }]);

  const [rows, [expiring], [overdue]] = await Promise.all([
    Contract.aggregate([{ $match: match }, { $group: { _id: '$statusId', count: { $sum: 1 }, value: { $sum: '$amount' } } }]),
    windowDays == null
      ? [null]
      : sumOf({ ...match, statusId: { $in: activeIds }, endDate: { $gte: today, $lte: new Date(today.getTime() + windowDays * DAY_MS) } }),
    sumOf({ ...match, statusId: { $in: activeIds }, endDate: { $lt: today } }),
  ]);

  const byCategory = Object.fromEntries(Object.values(CONTRACT_STATUS_CATEGORY).map((category) => [category, { count: 0, value: 0 }]));
  for (const row of rows) {
    const group = byCategory[categoryOf.get(String(row._id))];
    if (!group) continue;
    group.count += row.count;
    group.value = round2(group.value + row.value);
  }
  return {
    byCategory,
    total: Object.values(byCategory).reduce((sum, group) => sum + group.count, 0),
    // Active contracts ending within the longest active reminder period
    // (withinDays is null when no period is active).
    expiringSoon: { withinDays: windowDays, count: expiring?.count ?? 0, value: round2(expiring?.value ?? 0) },
    // Active although the end date has passed: the reminder job marks these
    // expired on its next run (if an "expired" status exists).
    pastEndDate: overdue?.count ?? 0,
  };
}

export async function getContract(id) {
  return present(await findContract(id));
}

export async function getContractTimeline(id, paging) {
  const contract = await findContract(id);
  return listEvents(CONTRACT_ENTITY, contract._id, paging);
}

export async function listContractReminders(id) {
  const contract = await findContract(id);
  const reminders = await ContractReminder.find({ contractId: contract._id })
    .sort({ createdAt: -1, _id: -1 })
    .populate({ path: 'recipientId', ...PERSON })
    .populate({ path: 'followUpId', select: 'title status dueDate' });
  return { reminders };
}

// --- changes -------------------------------------------------------------------

export async function createContract(input, actor) {
  if (!(await Company.exists({ _id: input.companyId }))) throw badReference('companyId', MESSAGES.CONTACT_COMPANY_NOT_FOUND);
  await assertActive(ContractType, input.contractTypeId, 'contractTypeId', MESSAGES.CONTRACT_TYPE_NOT_FOUND);
  const billingCycleId = input.billingCycleId || (await getDefaultEntry('billingCycles'))?.id;
  await assertActive(BillingCycle, billingCycleId, 'billingCycleId', MESSAGES.CONTRACT_BILLING_CYCLE_NOT_FOUND);
  const statusId = input.statusId || (await getDefaultEntry('contractStatuses'))?.id;
  if (!statusId) throw ApiError.conflict(MESSAGES.CONTRACT_NO_DEFAULT_STATUS);
  await assertActive(ContractStatus, statusId, 'statusId', MESSAGES.CONTRACT_STATUS_NOT_FOUND);
  await assertActiveUser(input.assignedTo);
  const dates = {
    startDate: startOfDay(input.startDate),
    endDate: startOfDay(input.endDate),
    renewalDate: input.renewalDate ? startOfDay(input.renewalDate) : undefined,
  };
  assertDates(dates);
  const customer = await Customer.findOne({ companyId: input.companyId }).select('_id');

  const contract = new Contract({
    companyId: input.companyId,
    customerId: customer?._id,
    contractTypeId: input.contractTypeId || undefined,
    ...dates,
    amount: round2(input.amount),
    billingCycleId: billingCycleId || undefined,
    statusId,
    assignedTo: input.assignedTo || undefined,
    description: input.description || undefined,
    createdBy: actor.id,
  });
  // The number is taken last, after every check, so refused requests use none.
  const number = await nextSequence(CONTRACT_ENTITY);
  contract.contractNumber = await numberFor('contract', number);
  await contract.save();

  await contractEvent(contract, 'created', actor);
  return getContract(contract.id);
}

// Edits the details. The status has its own endpoint; the company is fixed.
export async function updateContract(id, input, actor) {
  const contract = await findContract(id);
  const before = snapshot(contract);
  const previousEnd = contract.endDate.getTime();

  if ('contractTypeId' in input && (input.contractTypeId || '') !== idOf(contract.contractTypeId)) {
    await assertActive(ContractType, input.contractTypeId, 'contractTypeId', MESSAGES.CONTRACT_TYPE_NOT_FOUND);
    contract.contractTypeId = input.contractTypeId || undefined;
  }
  if ('billingCycleId' in input && (input.billingCycleId || '') !== idOf(contract.billingCycleId)) {
    await assertActive(BillingCycle, input.billingCycleId, 'billingCycleId', MESSAGES.CONTRACT_BILLING_CYCLE_NOT_FOUND);
    contract.billingCycleId = input.billingCycleId || undefined;
  }
  if ('assignedTo' in input && (input.assignedTo || '') !== idOf(contract.assignedTo)) {
    await assertActiveUser(input.assignedTo);
    contract.assignedTo = input.assignedTo || undefined;
  }
  if (input.startDate) contract.startDate = startOfDay(input.startDate);
  if (input.endDate) contract.endDate = startOfDay(input.endDate);
  if ('renewalDate' in input) contract.renewalDate = input.renewalDate ? startOfDay(input.renewalDate) : undefined;
  if (input.amount != null) contract.amount = round2(input.amount);
  if ('description' in input) contract.description = input.description || undefined;
  assertDates(contract);

  await contract.save();
  // A new end date starts a new round of reminders; the old ones are void.
  if (contract.endDate.getTime() !== previousEnd) await cancelPendingReminders(contract._id, { keepEndDate: contract.endDate });
  const updated = await findContract(id);
  const changes = diffSnapshots(before, snapshot(updated), TIMELINE_LABELS);
  if (changes.length) await contractEvent(updated, 'updated', actor, { changes });
  return present(updated);
}

export async function changeContractStatus(id, statusId, actor) {
  const contract = await findContract(id);
  if (statusId === idOf(contract.statusId)) return present(contract);
  const status = await ContractStatus.findOne({ _id: statusId, isActive: true });
  if (!status) throw badReference('statusId', MESSAGES.CONTRACT_STATUS_NOT_FOUND);

  const from = contract.statusId?.name;
  contract.statusId = status._id;
  await contract.save();
  if (status.category !== ACTIVE) await cancelPendingReminders(contract._id);
  const updated = await findContract(id);
  await contractEvent(updated, 'status_changed', actor, { changes: [{ field: 'status', label: 'Status', from, to: status.name }] });
  return present(updated);
}

export async function deleteContract(id, actor) {
  const contract = await findContract(id);
  contract.deletedAt = new Date();
  await contract.save();
  await cancelPendingReminders(contract._id);
  await contractEvent(contract, 'deleted', actor);
}
