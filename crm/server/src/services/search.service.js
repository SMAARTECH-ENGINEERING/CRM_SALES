import logger from '../config/logger.js';
import Company from '../models/Company.js';
import Contact from '../models/Contact.js';
import Contract from '../models/Contract.js';
import Lead from '../models/Lead.js';
import Opportunity from '../models/Opportunity.js';
import Order from '../models/Order.js';
import Project from '../models/Project.js';
import Quotation from '../models/Quotation.js';
import Ticket from '../models/Ticket.js';
import { declarePermission, hasPermission } from '../utils/permissions.js';
import { escapeRegex } from '../utils/query.js';
import { searchWords } from '../utils/searchKeys.js';
import { resolveScope, scoped } from './dashboard.service.js';

// Global search: one question, asked of every kind of record the user may read.
//
//  - Strategy: each record carries indexed search keys (models/shared/searchable.js).
//    Every word typed must begin one of a record's keys, so each category is
//    one index-backed query that returns at most `limit` records - nothing is
//    scanned, and nothing is loaded to be filtered here.
//  - RBAC: a category is only searched when the user may read that module.
//  - Scope: as on the dashboard - everything with search.viewAll, otherwise the
//    user's organization, otherwise the records that are the user's own.

const VIEW_ALL = declarePermission('search.viewAll');
const MAX_WORDS = 6;
// How many companies matching by name widen the search of records that have
// no name of their own (quotations, orders, contracts).
const MAX_COMPANY_MATCHES = 50;
const BACKFILL_BATCH = 500;

const company = { path: 'companyId', select: 'name' };
const line = (...parts) => parts.filter(Boolean).join(' · ');
const fullName = (record) => [record.firstName, record.lastName].filter(Boolean).join(' ');

// The categories, in the order they are returned. `scope` narrows the records
// for a user who does not see everything; `byCompany` also finds the records
// of a company whose name matches.
const CATEGORIES = [
  {
    key: 'companies',
    type: 'company',
    Model: Company,
    permission: declarePermission('companies.read'),
    select: 'companyCode name city',
    scope: { organization: (s) => ({ organizationId: s.organization._id }), own: (s) => ({ assignedTo: s.userId }) },
    present: (r) => ({ title: r.name, subtitle: line(r.companyCode, r.city) }),
  },
  {
    key: 'contacts',
    type: 'contact',
    Model: Contact,
    permission: declarePermission('contacts.read'),
    select: 'firstName lastName designation email companyId',
    populate: [company],
    scope: {
      organization: (s) => ({ companyId: { $in: s.companyIds } }),
      own: (s) => ({ $or: [{ createdBy: s.userId }, { companyId: { $in: s.ownCompanyIds } }] }),
    },
    present: (r) => ({ title: fullName(r), subtitle: line(r.designation, r.companyId?.name, r.email) }),
  },
  {
    key: 'leads',
    type: 'lead',
    Model: Lead,
    permission: declarePermission('leads.read'),
    select: 'leadNumber title companyId',
    populate: [company],
    present: (r) => ({ title: r.title, subtitle: line(r.leadNumber, r.companyId?.name) }),
  },
  {
    key: 'opportunities',
    type: 'opportunity',
    Model: Opportunity,
    permission: declarePermission('opportunities.read'),
    select: 'opportunityNumber name companyId',
    populate: [company],
    present: (r) => ({ title: r.name, subtitle: line(r.opportunityNumber, r.companyId?.name) }),
  },
  {
    key: 'quotations',
    type: 'quotation',
    Model: Quotation,
    permission: declarePermission('quotations.read'),
    select: 'quotationNumber companyId statusId',
    populate: [company, { path: 'statusId', select: 'name' }],
    byCompany: true,
    present: (r) => ({ title: r.quotationNumber, subtitle: line(r.companyId?.name, r.statusId?.name) }),
  },
  {
    key: 'orders',
    type: 'order',
    Model: Order,
    permission: declarePermission('orders.read'),
    select: 'orderNumber companyId statusId',
    populate: [company, { path: 'statusId', select: 'name' }],
    byCompany: true,
    present: (r) => ({ title: r.orderNumber, subtitle: line(r.companyId?.name, r.statusId?.name) }),
  },
  {
    key: 'projects',
    type: 'project',
    Model: Project,
    permission: declarePermission('projects.read'),
    select: 'projectNumber name companyId',
    populate: [company],
    scope: {
      organization: (s) => ({ companyId: { $in: s.companyIds } }),
      own: (s) => ({ $or: [{ projectManagerId: s.userId }, { teamMembers: s.userId }] }),
    },
    present: (r) => ({ title: r.name, subtitle: line(r.projectNumber, r.companyId?.name) }),
  },
  {
    key: 'tickets',
    type: 'ticket',
    Model: Ticket,
    permission: declarePermission('tickets.read'),
    select: 'ticketNumber subject companyId',
    populate: [company],
    present: (r) => ({ title: r.subject, subtitle: line(r.ticketNumber, r.companyId?.name) }),
  },
  {
    key: 'contracts',
    type: 'contract',
    Model: Contract,
    permission: declarePermission('contracts.read'),
    select: 'contractNumber companyId contractTypeId',
    populate: [company, { path: 'contractTypeId', select: 'name' }],
    byCompany: true,
    present: (r) => ({ title: r.contractNumber, subtitle: line(r.companyId?.name, r.contractTypeId?.name) }),
  },
];

export const SEARCH_CATEGORIES = CATEGORIES.map((category) => category.key);

// Every word must begin one of the record's keys. Anchored and case-sensitive
// (keys are stored lower-cased), so the index is used.
const keyFilter = (words) => ({ $and: words.map((word) => ({ searchKeys: new RegExp(`^${escapeRegex(word)}`) })) });

function scopeFilter(category, scope) {
  if (scope.type === 'all') return {};
  if (category.scope) return category.scope[scope.type](scope);
  const { deletedAt, ...filter } = scoped(scope, category.key);
  return filter;
}

async function searchCategory(category, { words, scope, companyIds, limit }) {
  const match = keyFilter(words);
  const found = category.byCompany && companyIds.length ? { $or: [match, { companyId: { $in: companyIds } }] } : match;
  const records = await category.Model.find({ $and: [found, scopeFilter(category, scope)] })
    .select(category.select)
    .populate(category.populate ?? [])
    .sort({ updatedAt: -1 })
    .limit(limit);
  return records.map((record) => ({ id: record.id, type: category.type, ...category.present(record) }));
}

// { companies: [...], contacts: [...], ... } - one list per category, each of
// { id, type, title, subtitle }. A category the user may not read is empty.
export async function search(actor, { q, limit }) {
  const results = Object.fromEntries(CATEGORIES.map((category) => [category.key, []]));
  const words = searchWords(q).slice(0, MAX_WORDS);
  const allowed = CATEGORIES.filter((category) => hasPermission(actor, category.permission));
  if (!words.length || !allowed.length) return results;

  const scope = await resolveScope(actor, undefined, VIEW_ALL);
  if (scope.type === 'own') scope.ownCompanyIds = await Company.distinct('_id', { assignedTo: scope.userId });

  // Companies matching by name, for the records that are found through their company.
  const companyIds = allowed.some((category) => category.byCompany)
    ? (await Company.find(keyFilter(words)).select('_id').sort({ updatedAt: -1 }).limit(MAX_COMPANY_MATCHES).lean()).map((c) => c._id)
    : [];

  const lists = await Promise.all(allowed.map((category) => searchCategory(category, { words, scope, companyIds, limit })));
  allowed.forEach((category, index) => {
    results[category.key] = lists[index];
  });
  return results;
}

// Gives search keys to records that have none: those created before global
// search existed, or written to the database directly. Run on every start; it
// costs one indexed lookup per kind of record when there is nothing to do.
export async function backfillSearchKeys() {
  let filled = 0;
  for (const { Model } of CATEGORIES) {
    const cursor = Model.find({ searchKeys: { $exists: false } })
      .setOptions({ withDeleted: true })
      .select(Model.searchFields().join(' '))
      .lean()
      .cursor();
    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      // The record itself is not changed, so its updatedAt stays as it was.
      await Model.bulkWrite(batch, { timestamps: false });
      filled += batch.length;
      batch = [];
    };
    for await (const record of cursor) {
      batch.push({ updateOne: { filter: { _id: record._id }, update: { $set: { searchKeys: Model.searchKeysFor(record) } } } });
      if (batch.length >= BACKFILL_BATCH) await flush();
    }
    await flush();
  }
  if (filled) logger.info(`Global search: ${filled} existing record(s) indexed`);
  return filled;
}
