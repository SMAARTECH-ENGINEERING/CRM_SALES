import { MESSAGES } from '../constants/index.js';
import ActivityType from '../models/ActivityType.js';
import LeadPriority from '../models/LeadPriority.js';
import LeadSource from '../models/LeadSource.js';
import LeadStatus from '../models/LeadStatus.js';
import ProductCategory from '../models/ProductCategory.js';
import OrderStatus from '../models/OrderStatus.js';
import ProjectStatus from '../models/ProjectStatus.js';
import TaskStatus from '../models/TaskStatus.js';
import TicketCategory from '../models/TicketCategory.js';
import TicketPriority from '../models/TicketPriority.js';
import TicketStatus from '../models/TicketStatus.js';
import QuotationStatus from '../models/QuotationStatus.js';
import BillingCycle from '../models/BillingCycle.js';
import ContractReminderPeriod from '../models/ContractReminderPeriod.js';
import ContractStatus from '../models/ContractStatus.js';
import ContractType from '../models/ContractType.js';
import DocumentStatus from '../models/DocumentStatus.js';
import DocumentType from '../models/DocumentType.js';
import PaymentMethod from '../models/PaymentMethod.js';
import PaymentStatus from '../models/PaymentStatus.js';
import Tax from '../models/Tax.js';
import Unit from '../models/Unit.js';
import ApiError from '../utils/ApiError.js';
import { escapeRegex } from '../utils/query.js';

// The administrator-managed lists: lead configuration, activity types and the
// product catalogue lists. They share every operation; they differ only in
// their extra fields, in which of those must be unique, and in whether one
// entry is "the default".
export const LEAD_CONFIG = Object.freeze({
  sources: { Model: LeadSource, extraFields: [], hasDefault: false },
  statuses: { Model: LeadStatus, extraFields: ['category', 'color', 'isQualified'], hasDefault: true },
  priorities: { Model: LeadPriority, extraFields: ['level', 'color'], hasDefault: true },
  activityTypes: { Model: ActivityType, extraFields: ['color'], hasDefault: false },
  productCategories: { Model: ProductCategory, extraFields: ['skuPrefix'], hasDefault: false },
  units: { Model: Unit, extraFields: ['symbol'], uniqueFields: ['symbol'], hasDefault: false },
  taxes: { Model: Tax, extraFields: ['rate'], hasDefault: false },
  quotationStatuses: { Model: QuotationStatus, extraFields: ['category', 'color'], hasDefault: true },
  orderStatuses: { Model: OrderStatus, extraFields: ['category', 'color'], hasDefault: true },
  projectStatuses: { Model: ProjectStatus, extraFields: ['category', 'color'], hasDefault: true },
  taskStatuses: { Model: TaskStatus, extraFields: ['category', 'color'], hasDefault: true },
  ticketCategories: { Model: TicketCategory, extraFields: ['color'], hasDefault: false },
  ticketPriorities: { Model: TicketPriority, extraFields: ['level', 'color'], hasDefault: true },
  ticketStatuses: { Model: TicketStatus, extraFields: ['category', 'color'], hasDefault: true },
  contractTypes: { Model: ContractType, extraFields: ['color'], hasDefault: false },
  documentTypes: { Model: DocumentType, extraFields: ['color'], hasDefault: false },
  documentStatuses: { Model: DocumentStatus, extraFields: ['category', 'color'], hasDefault: true },
  contractStatuses: { Model: ContractStatus, extraFields: ['category', 'color'], hasDefault: true },
  billingCycles: { Model: BillingCycle, extraFields: ['months'], hasDefault: true },
  paymentMethods: { Model: PaymentMethod, extraFields: ['color'], hasDefault: false },
  paymentStatuses: { Model: PaymentStatus, extraFields: ['category', 'color'], hasDefault: false },
  contractReminderPeriods: {
    Model: ContractReminderPeriod,
    extraFields: ['daysBefore'],
    uniqueFields: ['daysBefore'],
    hasDefault: false,
  },
});

const SORT = { sortOrder: 1, name: 1 };
const CASE_INSENSITIVE = { locale: 'en', strength: 2 };
const ORDER_STEP = 10;
// Optional extra fields: '' or null removes the stored value. The others are
// required once set and can only be replaced.
const CLEARABLE_FIELDS = ['color', 'skuPrefix', 'months'];

// A module registers how to count its records that use a value, so a value in
// use cannot be deleted. Several modules may use the same list:
//   registerLeadConfigUsage('statuses', (id) => Lead.countDocuments({ statusId: id }));
const usageCounters = new Map();

export function registerLeadConfigUsage(kind, counter) {
  if (!LEAD_CONFIG[kind]) throw new Error(`Unknown lead configuration list: ${kind}`);
  usageCounters.set(kind, [...(usageCounters.get(kind) ?? []), counter]);
}

async function isInUse(kind, id) {
  for (const counter of usageCounters.get(kind) ?? []) {
    if (await counter(id)) return true;
  }
  return false;
}

// --- helpers -----------------------------------------------------------------

async function findEntry({ Model }, id) {
  const entry = await Model.findById(id);
  if (!entry) throw ApiError.notFound(MESSAGES.LEAD_CONFIG_NOT_FOUND);
  return entry;
}

async function assertNameAvailable({ Model }, name, excludeId) {
  const filter = excludeId ? { name, _id: { $ne: excludeId } } : { name };
  if (await Model.exists(filter).collation(CASE_INSENSITIVE)) {
    throw ApiError.conflict(MESSAGES.LEAD_CONFIG_NAME_TAKEN, [
      { field: 'name', message: MESSAGES.LEAD_CONFIG_NAME_TAKEN },
    ]);
  }
}

// Extra fields that must not repeat within a list (e.g. a unit's symbol).
async function assertUniqueFields({ Model, uniqueFields = [] }, input, excludeId) {
  for (const field of uniqueFields) {
    if (input[field] == null || input[field] === '') continue;
    const filter = { [field]: input[field], ...(excludeId ? { _id: { $ne: excludeId } } : {}) };
    if (await Model.exists(filter).collation(CASE_INSENSITIVE)) {
      const message = `A record with this ${field} already exists`;
      throw ApiError.conflict(message, [{ field, message }]);
    }
  }
}

// New entries go to the end of the list unless a position is given.
async function nextSortOrder({ Model }) {
  const last = await Model.findOne().sort({ sortOrder: -1 }).select('sortOrder');
  return (last?.sortOrder ?? 0) + ORDER_STEP;
}

// Exactly one default: making an entry the default takes it away from the others.
function clearOtherDefaults({ Model }, keepId) {
  return Model.updateMany({ _id: { $ne: keepId }, isDefault: true }, { $set: { isDefault: false } });
}

const conflict = (message, field) => ApiError.conflict(message, [{ field, message }]);

// --- operations --------------------------------------------------------------

// Everything by default (the settings screen); forms pass isActive=true.
export function listEntries(kind, { isActive, search } = {}) {
  const { Model } = LEAD_CONFIG[kind];
  const filter = {};
  if (typeof isActive === 'boolean') filter.isActive = isActive;
  if (search) filter.name = new RegExp(escapeRegex(search), 'i');
  return Model.find(filter).sort(SORT).collation(CASE_INSENSITIVE);
}

// The value a new lead gets when none is chosen (statuses and priorities).
export function getDefaultEntry(kind) {
  return LEAD_CONFIG[kind].Model.findOne({ isDefault: true, isActive: true });
}

export async function createEntry(kind, input, actor) {
  const config = LEAD_CONFIG[kind];
  await assertNameAvailable(config, input.name);
  await assertUniqueFields(config, input);

  const entry = new config.Model({
    name: input.name,
    description: input.description || undefined,
    sortOrder: input.sortOrder ?? (await nextSortOrder(config)),
    isActive: input.isActive ?? true,
    createdBy: actor?.id,
  });
  for (const field of config.extraFields) {
    if (input[field] != null && input[field] !== '') entry[field] = input[field];
  }

  if (config.hasDefault) {
    // The first entry of a list becomes the default: there must always be one.
    const hasDefault = await config.Model.exists({ isDefault: true });
    entry.isDefault = Boolean(input.isDefault) || !hasDefault;
    if (entry.isDefault && !entry.isActive) {
      throw conflict(MESSAGES.LEAD_CONFIG_DEFAULT_INACTIVE, 'isActive');
    }
  }

  await entry.save();
  if (entry.isDefault) await clearOtherDefaults(config, entry._id);
  return entry;
}

export async function updateEntry(kind, id, input) {
  const config = LEAD_CONFIG[kind];
  const entry = await findEntry(config, id);

  if (input.name && input.name !== entry.name) {
    await assertNameAvailable(config, input.name, entry._id);
    entry.name = input.name;
  }
  if ('description' in input) entry.description = input.description || undefined;
  if (input.sortOrder != null) entry.sortOrder = input.sortOrder;
  await assertUniqueFields(config, input, entry._id);
  for (const field of config.extraFields) {
    if (!(field in input)) continue;
    if (input[field] == null || input[field] === '') {
      if (CLEARABLE_FIELDS.includes(field)) entry[field] = undefined;
    } else {
      entry[field] = input[field];
    }
  }

  let becameDefault = false;
  if (config.hasDefault && typeof input.isDefault === 'boolean' && input.isDefault !== entry.isDefault) {
    // The default can only be moved, never simply switched off.
    if (!input.isDefault) throw conflict(MESSAGES.LEAD_CONFIG_DEFAULT_REQUIRED, 'isDefault');
    entry.isDefault = true;
    becameDefault = true;
  }
  if (typeof input.isActive === 'boolean') entry.isActive = input.isActive;
  if (entry.isDefault && !entry.isActive) {
    throw conflict(MESSAGES.LEAD_CONFIG_DEFAULT_INACTIVE, 'isActive');
  }

  await entry.save();
  if (becameDefault) await clearOtherDefaults(config, entry._id);
  return entry;
}

export async function deleteEntry(kind, id) {
  const config = LEAD_CONFIG[kind];
  const entry = await findEntry(config, id);

  if (entry.isDefault) throw ApiError.conflict(MESSAGES.LEAD_CONFIG_DEFAULT_DELETE);

  // A value that records still point to must stay; it can be deactivated instead.
  if (await isInUse(kind, entry._id)) throw ApiError.conflict(MESSAGES.LEAD_CONFIG_IN_USE);

  await entry.deleteOne();
}
