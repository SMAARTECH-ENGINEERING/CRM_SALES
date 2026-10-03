import {
  HTTP_STATUS,
  LEAD_STATUS_CATEGORY,
  MESSAGES,
  NOTIFICATION_TYPE,
  USER_STATUS,
} from '../constants/index.js';
import Company from '../models/Company.js';
import Contact from '../models/Contact.js';
import Lead from '../models/Lead.js';
import LeadPriority from '../models/LeadPriority.js';
import LeadSource from '../models/LeadSource.js';
import LeadStatus from '../models/LeadStatus.js';
import Organization from '../models/Organization.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { declarePermission, hasPermission } from '../utils/permissions.js';
import { paginationMeta, searchFilter } from '../utils/query.js';
import { createCompany } from './company.service.js';
import { registerCompanySection } from './companySection.service.js';
import { createContact, registerContactDeleteGuard } from './contact.service.js';
import { findMatchingCompany, findMatchingContact } from './duplicate.service.js';
import { getDefaultEntry, registerLeadConfigUsage } from './leadConfig.service.js';
import { insertOpportunity } from './opportunity.service.js';
import { resolveStartingStage } from './pipeline.service.js';
import { nextSequence } from './sequence.service.js';
import { numberFor } from './settings.service.js';
import { notifyUsers } from './notification.service.js';
import { diffSnapshots, listEvents, recordEvent } from './timeline.service.js';

export const LEAD_ENTITY = 'lead';

const ASSIGN_LEADS = declarePermission('leads.assign');

// People may have been deleted since; their names should still show.
const PERSON = { select: 'firstName lastName email', options: { withDeleted: true } };
const POPULATE = [
  { path: 'companyId', select: 'companyCode name status' },
  { path: 'contactId', select: 'firstName lastName email phone' },
  { path: 'sourceId', select: 'name isActive' },
  { path: 'statusId', select: 'name color category isActive' },
  { path: 'priorityId', select: 'name color level isActive' },
  { path: 'organizationId', select: 'name' },
  { path: 'opportunityId', select: 'opportunityNumber name status' },
  { path: 'assignedTo', ...PERSON },
  { path: 'createdBy', ...PERSON },
  { path: 'convertedBy', ...PERSON },
];

const SEARCH_FIELDS = ['leadNumber', 'title', 'description', 'tags'];
const FILTER_FIELDS = ['statusId', 'sourceId', 'priorityId', 'assignedTo', 'companyId', 'contactId', 'organizationId'];

// Optional plain fields: '' or null clears the stored value.
const OPTIONAL_FIELDS = ['description', 'estimatedValue', 'expectedCloseDate', 'notes'];

// Reference fields that point into a managed list, and the error when unusable.
const CONFIG_REFERENCES = [
  { field: 'sourceId', Model: LeadSource, message: MESSAGES.LEAD_SOURCE_NOT_FOUND },
  { field: 'statusId', Model: LeadStatus, message: MESSAGES.LEAD_STATUS_NOT_FOUND },
  { field: 'priorityId', Model: LeadPriority, message: MESSAGES.LEAD_PRIORITY_NOT_FOUND },
  { field: 'organizationId', Model: Organization, message: MESSAGES.ORGANIZATION_NOT_FOUND },
];

// Fields tracked in the timeline for ordinary edits, with the label shown for each.
const TIMELINE_LABELS = {
  title: 'Title',
  description: 'Description',
  company: 'Company',
  contact: 'Contact',
  source: 'Source',
  priority: 'Priority',
  estimatedValue: 'Estimated value',
  expectedCloseDate: 'Expected close date',
  organization: 'Organization',
  tags: 'Tags',
  notes: 'Notes',
};

const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');
const idOf = (reference) => (reference ? String(reference._id ?? reference) : '');
const empty = (value) => value === undefined || value === null || value === '';

// Readable values of a populated lead, for comparing before and after an update.
function snapshot(lead) {
  return {
    title: lead.title ?? '',
    description: lead.description ?? '',
    company: lead.companyId?.name ?? '',
    contact: lead.contactId?.fullName ?? '',
    source: lead.sourceId?.name ?? '',
    priority: lead.priorityId?.name ?? '',
    estimatedValue: empty(lead.estimatedValue) ? '' : String(lead.estimatedValue),
    expectedCloseDate: day(lead.expectedCloseDate),
    organization: lead.organizationId?.name ?? '',
    tags: (lead.tags ?? []).join(', '),
    notes: lead.notes ?? '',
  };
}

// --- relationships with other modules ----------------------------------------------

// Leads appear on the company page, and a company or contact that they point
// to cannot be deleted. Lead configuration values in use cannot be deleted
// either - only deactivated.
registerCompanySection('leads', { count: (companyId) => Lead.countDocuments({ companyId }), blocksDelete: true });
registerContactDeleteGuard('Leads', (contactId) => Lead.countDocuments({ contactId }));
registerLeadConfigUsage('sources', (sourceId) => Lead.countDocuments({ sourceId }));
registerLeadConfigUsage('statuses', (statusId) => Lead.countDocuments({ statusId }));
registerLeadConfigUsage('priorities', (priorityId) => Lead.countDocuments({ priorityId }));

// --- helpers -----------------------------------------------------------------

const badReference = (field, message) => ApiError.badRequest(message, [{ field, message }]);
const unprocessable = (field, message) =>
  new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, MESSAGES.VALIDATION_FAILED, [{ field, message }]);

export async function findLead(id) {
  const lead = await Lead.findById(id).populate(POPULATE);
  if (!lead) throw ApiError.notFound(MESSAGES.LEAD_NOT_FOUND);
  return lead;
}

// Checks the company and contact a lead is about to point to, and returns the
// pair to store. A contact always implies its own company.
async function resolveCompanyAndContact(companyId, contactId) {
  let company = companyId || null;

  if (contactId) {
    const contact = await Contact.findById(contactId).select('companyId');
    if (!contact) throw badReference('contactId', MESSAGES.LEAD_CONTACT_NOT_FOUND);

    const owner = String(contact.companyId);
    if (company && company !== owner) {
      throw badReference('contactId', MESSAGES.LEAD_CONTACT_COMPANY_MISMATCH);
    }
    company = owner;
  }

  if (company && !(await Company.exists({ _id: company }))) {
    throw badReference('companyId', MESSAGES.CONTACT_COMPANY_NOT_FOUND);
  }
  return { companyId: company || undefined, contactId: contactId || undefined };
}

async function assertConfigReferences(values) {
  for (const { field, Model, message } of CONFIG_REFERENCES) {
    if (values[field] && !(await Model.exists({ _id: values[field], isActive: true }))) {
      throw badReference(field, message);
    }
  }
}

async function assertActiveUser(userId, field = 'assignedTo') {
  if (!(await User.exists({ _id: userId, status: USER_STATUS.ACTIVE }))) {
    throw badReference(field, MESSAGES.ASSIGNEE_NOT_FOUND);
  }
}

// Anyone may take a lead themselves; giving it to someone else needs leads.assign.
function assertMayAssign(actor, userId) {
  if (userId && userId !== actor.id && !hasPermission(actor, ASSIGN_LEADS)) {
    throw ApiError.forbidden(MESSAGES.LEAD_ASSIGN_FORBIDDEN);
  }
}

function applyOptional(lead, input) {
  for (const field of OPTIONAL_FIELDS) {
    if (field in input) lead[field] = empty(input[field]) ? undefined : input[field];
  }
  if ('tags' in input) lead.tags = input.tags ?? [];
}

// --- operations --------------------------------------------------------------

export async function listLeads(query) {
  const { page, limit, search, sortBy, sortOrder, converted, statusCategory } = query;

  const filter = { ...searchFilter(search, SEARCH_FIELDS) };
  for (const field of FILTER_FIELDS) {
    if (query[field]) filter[field] = query[field];
  }
  if (typeof converted === 'boolean') filter.convertedAt = converted ? { $ne: null } : null;
  // "All open leads" etc. - by what the status means, whatever the statuses are called.
  if (statusCategory && !filter.statusId) {
    filter.statusId = { $in: await LeadStatus.distinct('_id', { category: statusCategory }) };
  }

  const [leads, total] = await Promise.all([
    Lead.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE),
    Lead.countDocuments(filter),
  ]);

  return { leads, pagination: paginationMeta({ page, limit }, total) };
}

export function getLead(id) {
  return findLead(id);
}

export async function createLead(input, actor) {
  assertMayAssign(actor, input.assignedTo);

  // A new lead starts at the configured default status unless one is given.
  const statusId = input.statusId || (await getDefaultEntry('statuses'))?.id;
  if (!statusId) throw ApiError.conflict(MESSAGES.LEAD_NO_DEFAULT_STATUS);
  const priorityId = input.priorityId || (await getDefaultEntry('priorities'))?.id;

  const links = await resolveCompanyAndContact(input.companyId, input.contactId);
  await assertConfigReferences({ ...input, statusId, priorityId });
  if (input.assignedTo) await assertActiveUser(input.assignedTo);

  const lead = new Lead({
    title: input.title,
    ...links,
    sourceId: input.sourceId || undefined,
    statusId,
    priorityId: priorityId || undefined,
    organizationId: input.organizationId || undefined,
    assignedTo: input.assignedTo || undefined,
    createdBy: actor.id,
  });
  applyOptional(lead, input);

  // Taken last, after everything that can fail, so rejected requests do not
  // leave gaps in the numbering.
  const number = await nextSequence(LEAD_ENTITY);
  lead.leadNumber = await numberFor('lead', number);
  await lead.save();

  await recordEvent({ entityType: LEAD_ENTITY, entityId: lead._id, action: 'created', actor });
  await notifyLeadAssigned(lead, actor);
  return findLead(lead.id);
}

// Edits everything except status and assignment, which have their own endpoints.
export async function updateLead(id, input, actor) {
  const lead = await findLead(id);
  const before = snapshot(lead);

  // The company/contact pair as it will be once the sent fields are applied.
  const companyId = 'companyId' in input ? input.companyId || '' : idOf(lead.companyId);
  const contactId = 'contactId' in input ? input.contactId || '' : idOf(lead.contactId);
  if (companyId !== idOf(lead.companyId) || contactId !== idOf(lead.contactId)) {
    const links = await resolveCompanyAndContact(companyId, contactId);
    lead.companyId = links.companyId;
    lead.contactId = links.contactId;
  }

  // Only references that are actually changing need to be active: a lead keeps
  // a source that was later deactivated.
  const changed = Object.fromEntries(
    ['sourceId', 'priorityId', 'organizationId']
      .filter((field) => input[field] && input[field] !== idOf(lead[field]))
      .map((field) => [field, input[field]])
  );
  await assertConfigReferences(changed);
  for (const field of ['sourceId', 'priorityId', 'organizationId']) {
    if (field in input) lead[field] = input[field] || undefined;
  }

  if (input.title) lead.title = input.title;
  applyOptional(lead, input);

  await lead.save();
  const updated = await findLead(id);

  const changes = diffSnapshots(before, snapshot(updated), TIMELINE_LABELS);
  if (changes.length) {
    await recordEvent({ entityType: LEAD_ENTITY, entityId: updated._id, action: 'updated', changes, actor });
  }
  return updated;
}

// Tells the person a lead was given to - unless they took it themselves.
function notifyLeadAssigned(lead, actor) {
  return notifyUsers({
    recipients: [lead.assignedTo],
    exclude: actor,
    type: NOTIFICATION_TYPE.LEAD_ASSIGNED,
    title: 'Lead assigned to you',
    message: `${lead.leadNumber} - ${lead.title}${actor ? ` was assigned to you by ${actor.fullName}` : ' was assigned to you'}`,
    entityType: LEAD_ENTITY,
    entityId: lead._id,
  });
}

export async function assignLead(id, userId, actor) {
  const lead = await findLead(id);
  const from = lead.assignedTo?.fullName;
  if ((userId || '') === idOf(lead.assignedTo)) return lead;

  if (userId) await assertActiveUser(userId);
  lead.assignedTo = userId || undefined;
  await lead.save();

  const updated = await findLead(id);
  await recordEvent({
    entityType: LEAD_ENTITY,
    entityId: updated._id,
    action: 'assigned',
    changes: [{ field: 'assignedTo', label: 'Assigned to', from, to: updated.assignedTo?.fullName }],
    actor,
  });
  await notifyLeadAssigned(updated, actor);
  return updated;
}

export async function changeLeadStatus(id, statusId, actor) {
  const lead = await findLead(id);
  const from = lead.statusId?.name;
  if (statusId === idOf(lead.statusId)) return lead;

  await assertConfigReferences({ statusId });
  lead.statusId = statusId;
  await lead.save();

  const updated = await findLead(id);
  await recordEvent({
    entityType: LEAD_ENTITY,
    entityId: updated._id,
    action: 'status_changed',
    changes: [{ field: 'status', label: 'Status', from, to: updated.statusId?.name }],
    actor,
  });
  return updated;
}

export async function deleteLead(id, actor) {
  const lead = await findLead(id);
  lead.deletedAt = new Date();
  await lead.save();
  await recordEvent({ entityType: LEAD_ENTITY, entityId: lead._id, action: 'deleted', actor });
}

export async function getLeadTimeline(id, query) {
  const lead = await findLead(id);
  return listEvents(LEAD_ENTITY, lead._id, query);
}

// --- conversion ----------------------------------------------------------------

// Decides, without changing anything, what converting the lead will do about
// its company and contact:
//   linked  - the lead already points at one; it is used as is
//   matched - details were sent and an existing record matches them; it is linked
//   create  - details were sent and nothing matches; a new record will be created
async function planConversion(lead, { company: companyInput, contact: contactInput }) {
  if (lead.companyId && companyInput) throw unprocessable('company', MESSAGES.LEAD_CONVERT_COMPANY_SET);
  if (lead.contactId && contactInput) throw unprocessable('contact', MESSAGES.LEAD_CONVERT_CONTACT_SET);
  if (!lead.companyId && !companyInput) throw unprocessable('company', MESSAGES.LEAD_CONVERT_COMPANY_REQUIRED);

  let company;
  if (lead.companyId) {
    company = { action: 'linked', record: lead.companyId };
  } else {
    const match = await findMatchingCompany(companyInput);
    company = match
      ? { action: 'matched', matchedBy: match.matchedBy, record: match.record }
      : { action: 'create', input: companyInput };
  }

  let contact = null;
  if (lead.contactId) {
    contact = { action: 'linked', record: lead.contactId };
  } else if (contactInput) {
    // A company that does not exist yet cannot already have this contact.
    const match = company.record ? await findMatchingContact(company.record._id, contactInput) : null;
    contact = match
      ? { action: 'matched', matchedBy: match.matchedBy, record: match.record }
      : { action: 'create', input: contactInput };
  }

  return { company, contact };
}

// The status a converted lead moves to: the one named, or the first active "won" status.
async function resolveWonStatus(statusId) {
  if (statusId) {
    const status = await LeadStatus.findOne({ _id: statusId, isActive: true, category: LEAD_STATUS_CATEGORY.WON });
    if (!status) throw unprocessable('statusId', MESSAGES.LEAD_CONVERT_STATUS_NOT_WON);
    return status;
  }
  return LeadStatus.findOne({ isActive: true, category: LEAD_STATUS_CATEGORY.WON }).sort({ sortOrder: 1, name: 1 });
}

const describe = (step) =>
  step && {
    action: step.action === 'create' ? 'created' : step.action,
    ...(step.matchedBy ? { matchedBy: step.matchedBy } : {}),
  };

// Converts a lead into an opportunity, linking or creating its company and
// contact. Existing records are always preferred over new ones.
//
// With `dryRun`, nothing is written: the response says what would happen.
export async function convertLead(id, input, actor) {
  const lead = await findLead(id);
  if (lead.convertedAt) throw ApiError.conflict(MESSAGES.LEAD_ALREADY_CONVERTED);

  const plan = await planConversion(lead, input);
  const wonStatus = await resolveWonStatus(input.statusId);
  // Where the opportunity starts: the stage named, or the first stage of the
  // named (else the default) pipeline. Checked before anything is written.
  const details = input.opportunity ?? {};
  const start = await resolveStartingStage({ pipelineId: details.pipelineId, stageId: details.stageId });

  if (input.dryRun) {
    // action here is linked | matched | create ("create" = would be created).
    const preview = (step) =>
      step && {
        action: step.action,
        ...(step.matchedBy ? { matchedBy: step.matchedBy } : {}),
        record: step.record ?? null,
      };
    return {
      dryRun: true,
      company: preview(plan.company),
      contact: preview(plan.contact),
      status: wonStatus,
      pipeline: start.pipeline,
      stage: start.stage,
    };
  }

  // Claim the lead first: of two simultaneous conversions only one gets past
  // this point, so a lead can never produce two opportunities.
  const claimed = await Lead.findOneAndUpdate(
    { _id: lead._id, convertedAt: null },
    { $set: { convertedAt: new Date(), convertedBy: actor._id } }
  );
  if (!claimed) throw ApiError.conflict(MESSAGES.LEAD_ALREADY_CONVERTED);

  try {
    // Company: use the existing one, or create it with the lead's owner and organization.
    const company =
      plan.company.record ??
      (await createCompany(
        {
          assignedTo: idOf(lead.assignedTo) || undefined,
          organizationId: idOf(lead.organizationId) || undefined,
          ...plan.company.input,
        },
        actor
      ));

    // Contact: a company created just now has no contacts, but one that was
    // matched or linked may - so look again now that the company is known.
    let contact = plan.contact?.record ?? null;
    let contactStep = plan.contact;
    if (plan.contact?.action === 'create') {
      const match = await findMatchingContact(company._id, plan.contact.input);
      if (match) {
        contact = match.record;
        contactStep = { action: 'matched', matchedBy: match.matchedBy };
      } else {
        contact = await createContact({ ...plan.contact.input, companyId: company.id }, actor);
      }
    }

    const pick = (field) => (empty(details[field]) ? lead[field] : details[field]);
    const opportunity = await insertOpportunity(
      {
        name: details.name || lead.title,
        companyId: company._id,
        contactId: contact?._id,
        leadId: lead._id,
        sourceId: idOf(lead.sourceId) || undefined,
        priorityId: idOf(lead.priorityId) || undefined,
        estimatedValue: pick('estimatedValue') ?? undefined,
        expectedCloseDate: pick('expectedCloseDate') ?? undefined,
        assignedTo: idOf(lead.assignedTo) || undefined,
        organizationId: idOf(lead.organizationId) || undefined,
        notes: details.notes || undefined,
      },
      start,
      actor
    );

    await Lead.updateOne(
      { _id: lead._id },
      {
        $set: {
          companyId: company._id,
          ...(contact ? { contactId: contact._id } : {}),
          opportunityId: opportunity._id,
          ...(wonStatus ? { statusId: wonStatus._id } : {}),
        },
      }
    );

    const converted = await findLead(id);
    const companyResult = describe(plan.company);
    const contactResult = describe(contactStep);
    await recordEvent({
      entityType: LEAD_ENTITY,
      entityId: lead._id,
      action: 'converted',
      summary: [
        `Opportunity ${opportunity.opportunityNumber} created`,
        `company ${company.name} ${companyResult.action}`,
        contact ? `contact ${contact.fullName} ${contactResult.action}` : null,
      ]
        .filter(Boolean)
        .join('; '),
      changes:
        wonStatus && idOf(lead.statusId) !== wonStatus.id
          ? [{ field: 'status', label: 'Status', from: lead.statusId?.name, to: wonStatus.name }]
          : [],
      actor,
    });

    return {
      lead: converted,
      company: { ...companyResult, record: await Company.findById(company._id).select('companyCode name status') },
      contact: contact
        ? { ...contactResult, record: await Contact.findById(contact._id).select('firstName lastName email phone companyId') }
        : null,
      opportunity,
    };
  } catch (err) {
    // Release the claim so the conversion can be retried. Anything already
    // created is found again by the duplicate search, not created twice.
    await Lead.updateOne({ _id: lead._id }, { $set: { convertedAt: null }, $unset: { convertedBy: 1 } });
    throw err;
  }
}
