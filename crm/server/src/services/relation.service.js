import { MESSAGES } from '../constants/index.js';
import Company from '../models/Company.js';
import Contract from '../models/Contract.js';
import Contact from '../models/Contact.js';
import Lead from '../models/Lead.js';
import Customer from '../models/Customer.js';
import Opportunity from '../models/Opportunity.js';
import Project from '../models/Project.js';
import Ticket from '../models/Ticket.js';
import ApiError from '../utils/ApiError.js';

// The kinds of record an activity or follow-up can be about. A module that adds
// a new kind (customers, projects, tickets) adds an entry here and removes its
// field from PENDING_RELATION_FIELDS.
export const RELATIONS = Object.freeze({
  company: {
    field: 'companyId',
    Model: Company,
    select: 'companyCode name status',
    label: (company) => company.name,
    companyOf: (company) => company.id,
  },
  contact: {
    field: 'contactId',
    Model: Contact,
    select: 'firstName lastName email companyId',
    label: (contact) => contact.fullName,
    companyOf: (contact) => String(contact.companyId),
  },
  lead: {
    field: 'leadId',
    Model: Lead,
    select: 'leadNumber title companyId',
    label: (lead) => `${lead.leadNumber} - ${lead.title}`,
    companyOf: (lead) => (lead.companyId ? String(lead.companyId) : null),
  },
  opportunity: {
    field: 'opportunityId',
    Model: Opportunity,
    select: 'opportunityNumber name companyId',
    label: (opportunity) => `${opportunity.opportunityNumber} - ${opportunity.name}`,
    companyOf: (opportunity) => String(opportunity.companyId),
  },
  customer: {
    field: 'customerId',
    Model: Customer,
    select: 'customerNumber companyId',
    label: (customer) => customer.customerNumber,
    companyOf: (customer) => String(customer.companyId),
  },
  project: {
    field: 'projectId',
    Model: Project,
    select: 'projectNumber name companyId',
    label: (project) => `${project.projectNumber} - ${project.name}`,
    companyOf: (project) => String(project.companyId),
  },
  ticket: {
    field: 'ticketId',
    Model: Ticket,
    select: 'ticketNumber subject companyId',
    label: (ticket) => `${ticket.ticketNumber} - ${ticket.subject}`,
    companyOf: (ticket) => String(ticket.companyId),
  },
  contract: {
    field: 'contractId',
    Model: Contract,
    select: 'contractNumber companyId',
    label: (contract) => contract.contractNumber,
    companyOf: (contract) => String(contract.companyId),
  },
});

export const RELATION_TYPES = Object.freeze(Object.keys(RELATIONS));
export const RELATION_FIELDS = Object.freeze(Object.values(RELATIONS).map((relation) => relation.field));

// Reserved for modules that are not built: an id cannot be checked against a
// collection that does not exist, so these are refused rather than stored blind.
export const PENDING_RELATION_FIELDS = Object.freeze({
});

const notFound = (field, type) => {
  const message = `${MESSAGES.RELATED_RECORD_NOT_FOUND}: ${type}`;
  return ApiError.badRequest(message, [{ field, message }]);
};

// Loads one related record or fails with a 400 naming `field`. Deleted records
// are hidden from queries, so they count as not found.
export async function loadRelated(type, id, field = RELATIONS[type].field) {
  const { Model, select } = RELATIONS[type];
  const record = await Model.findById(id).select(select);
  if (!record) throw notFound(field, type);
  return record;
}

// Given { companyId, contactId, leadId, opportunityId } (any subset), checks
// every id points at a real record and that they all belong to one company.
// Returns the ids to store, with companyId filled in when the others imply it -
// so an activity logged on a lead also appears on that lead's company.
export async function resolveRelations(ids) {
  for (const [field, moduleName] of Object.entries(PENDING_RELATION_FIELDS)) {
    if (ids[field]) {
      const message = `${moduleName} are not available yet`;
      throw ApiError.badRequest(message, [{ field, message }]);
    }
  }

  const stored = {};
  const companies = new Set();
  for (const [type, relation] of Object.entries(RELATIONS)) {
    const id = ids[relation.field];
    if (!id) continue;
    const record = await loadRelated(type, id);
    stored[relation.field] = record._id;
    const companyId = relation.companyOf(record);
    if (companyId) companies.add(companyId);
  }

  if (companies.size > 1) {
    throw ApiError.badRequest(MESSAGES.RELATION_COMPANY_MISMATCH, [
      { field: 'companyId', message: MESSAGES.RELATION_COMPANY_MISMATCH },
    ]);
  }
  if (companies.size === 1 && !stored.companyId) {
    const [companyId] = companies;
    // The implied company may itself have been deleted; then there is nothing to link.
    if (await Company.exists({ _id: companyId })) stored.companyId = companyId;
  }
  return stored;
}

// For a list of { relatedType, relatedId } items, returns a lookup
// "type:id" -> { type, id, label } so callers can show what each is about.
export async function describeRelated(items) {
  const idsByType = new Map();
  for (const { relatedType, relatedId } of items) {
    if (!RELATIONS[relatedType]) continue;
    if (!idsByType.has(relatedType)) idsByType.set(relatedType, new Set());
    idsByType.get(relatedType).add(String(relatedId));
  }

  const described = new Map();
  for (const [type, ids] of idsByType) {
    const { Model, select, label } = RELATIONS[type];
    const records = await Model.find({ _id: { $in: [...ids] } }).select(select);
    for (const record of records) {
      described.set(`${type}:${record.id}`, { type, id: record.id, label: label(record) });
    }
  }
  return described;
}
