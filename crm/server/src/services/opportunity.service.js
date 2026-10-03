import { MESSAGES, STAGE_TYPE, USER_STATUS } from '../constants/index.js';
import Company from '../models/Company.js';
import Contact from '../models/Contact.js';
import LeadPriority from '../models/LeadPriority.js';
import Opportunity from '../models/Opportunity.js';
import Pipeline from '../models/Pipeline.js';
import PipelineStage from '../models/PipelineStage.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { declarePermission, hasPermission } from '../utils/permissions.js';
import { paginationMeta, searchFilter } from '../utils/query.js';
import { registerCompanySection } from './companySection.service.js';
import { registerContactDeleteGuard } from './contact.service.js';
import { registerLeadConfigUsage } from './leadConfig.service.js';
import { resolveStartingStage, resolveTargetStage } from './pipeline.service.js';
import { nextSequence } from './sequence.service.js';
import { numberFor } from './settings.service.js';
import { diffSnapshots, listEvents, recordEvent } from './timeline.service.js';

export const OPPORTUNITY_ENTITY = 'opportunity';

const ASSIGN_OPPORTUNITIES = declarePermission('opportunities.assign');

// People may have been deleted since; their names should still show.
const PERSON = { select: 'firstName lastName email', options: { withDeleted: true } };
const POPULATE = [
  { path: 'companyId', select: 'companyCode name status' },
  { path: 'contactId', select: 'firstName lastName email phone' },
  { path: 'leadId', select: 'leadNumber title' },
  { path: 'pipelineId', select: 'name status isDefault' },
  { path: 'stageId', select: 'name color order probability type status' },
  { path: 'sourceId', select: 'name' },
  { path: 'priorityId', select: 'name color level isActive' },
  { path: 'organizationId', select: 'name' },
  { path: 'assignedTo', ...PERSON },
  { path: 'createdBy', ...PERSON },
];

const SEARCH_FIELDS = ['opportunityNumber', 'name', 'notes'];
const FILTER_FIELDS = ['pipelineId', 'stageId', 'status', 'assignedTo', 'companyId', 'contactId', 'priorityId', 'leadId'];
// The filters that narrow a board (its pipeline is chosen separately).
const BOARD_FILTER_FIELDS = ['assignedTo', 'companyId', 'priorityId'];

// Optional plain fields: '' or null clears the stored value.
const OPTIONAL_FIELDS = ['estimatedValue', 'expectedCloseDate', 'notes'];

// Fields tracked in the timeline for ordinary edits, with the label shown for each.
const TIMELINE_LABELS = {
  name: 'Name',
  company: 'Company',
  contact: 'Contact',
  priority: 'Priority',
  estimatedValue: 'Estimated value',
  probability: 'Probability',
  expectedCloseDate: 'Expected close date',
  notes: 'Notes',
};

const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');
const idOf = (reference) => (reference ? String(reference._id ?? reference) : '');
const empty = (value) => value === undefined || value === null || value === '';
const percent = (value) => (empty(value) ? '' : `${value}%`);

// Readable values of a populated opportunity, for comparing before and after an update.
function snapshot(opportunity) {
  return {
    name: opportunity.name ?? '',
    company: opportunity.companyId?.name ?? '',
    contact: opportunity.contactId?.fullName ?? '',
    priority: opportunity.priorityId?.name ?? '',
    estimatedValue: empty(opportunity.estimatedValue) ? '' : String(opportunity.estimatedValue),
    probability: percent(opportunity.probability),
    expectedCloseDate: day(opportunity.expectedCloseDate),
    notes: opportunity.notes ?? '',
  };
}

// --- relationships with other modules ----------------------------------------------

// Opportunities appear on the company page, and a company, contact or priority
// that they point to cannot be deleted.
registerCompanySection('opportunities', {
  count: (companyId) => Opportunity.countDocuments({ companyId }),
  blocksDelete: true,
});
registerContactDeleteGuard('Opportunities', (contactId) => Opportunity.countDocuments({ contactId }));
registerLeadConfigUsage('priorities', (priorityId) => Opportunity.countDocuments({ priorityId }));

// --- helpers -----------------------------------------------------------------

const badReference = (field, message) => ApiError.badRequest(message, [{ field, message }]);

export async function findOpportunity(id) {
  const opportunity = await Opportunity.findById(id).populate(POPULATE);
  if (!opportunity) throw ApiError.notFound(MESSAGES.OPPORTUNITY_NOT_FOUND);
  return opportunity;
}

// An opportunity always has a company; its contact, if any, must work there.
async function assertCompanyAndContact(companyId, contactId) {
  if (!(await Company.exists({ _id: companyId }))) {
    throw badReference('companyId', MESSAGES.CONTACT_COMPANY_NOT_FOUND);
  }
  if (!contactId) return;

  const contact = await Contact.findById(contactId).select('companyId');
  if (!contact) throw badReference('contactId', MESSAGES.LEAD_CONTACT_NOT_FOUND);
  if (String(contact.companyId) !== companyId) {
    throw badReference('contactId', MESSAGES.LEAD_CONTACT_COMPANY_MISMATCH);
  }
}

async function assertActivePriority(priorityId) {
  if (priorityId && !(await LeadPriority.exists({ _id: priorityId, isActive: true }))) {
    throw badReference('priorityId', MESSAGES.LEAD_PRIORITY_NOT_FOUND);
  }
}

async function assertActiveUser(userId) {
  if (!(await User.exists({ _id: userId, status: USER_STATUS.ACTIVE }))) {
    throw badReference('assignedTo', MESSAGES.ASSIGNEE_NOT_FOUND);
  }
}

// Anyone may take an opportunity themselves; giving it to someone else needs
// opportunities.assign.
function assertMayAssign(actor, userId) {
  if (userId && userId !== actor.id && !hasPermission(actor, ASSIGN_OPPORTUNITIES)) {
    throw ApiError.forbidden(MESSAGES.OPPORTUNITY_ASSIGN_FORBIDDEN);
  }
}

// Puts the opportunity in a stage: its status follows what the stage means.
function enterStage(opportunity, stage) {
  opportunity.stageId = stage._id;
  opportunity.status = stage.type;
  opportunity.closedAt = stage.type === STAGE_TYPE.OPEN ? undefined : new Date();
}

function applyOptional(opportunity, input) {
  for (const field of OPTIONAL_FIELDS) {
    if (field in input) opportunity[field] = empty(input[field]) ? undefined : input[field];
  }
}

// Saves a new opportunity at `start` ({ pipeline, stage }, from resolveStartingStage).
// Everything in `fields` must already be validated. Shared with lead conversion.
export async function insertOpportunity(fields, start, actor) {
  const opportunity = new Opportunity({
    ...fields,
    pipelineId: start.pipeline._id,
    probability: empty(fields.probability) ? start.stage.probability : fields.probability,
    createdBy: actor.id,
  });
  enterStage(opportunity, start.stage);

  // Taken last, after everything that can fail, so rejected requests do not
  // leave gaps in the numbering.
  const number = await nextSequence(OPPORTUNITY_ENTITY);
  opportunity.opportunityNumber = await numberFor('opportunity', number);
  await opportunity.save();

  await recordEvent({
    entityType: OPPORTUNITY_ENTITY,
    entityId: opportunity._id,
    action: 'created',
    summary: `Started in ${start.pipeline.name} / ${start.stage.name}`,
    actor,
  });
  return findOpportunity(opportunity.id);
}

// --- operations --------------------------------------------------------------

function buildFilter(query, fields) {
  const filter = { ...searchFilter(query.search, SEARCH_FIELDS) };
  for (const field of fields) {
    if (query[field]) filter[field] = query[field];
  }
  return filter;
}

export async function listOpportunities(query) {
  const { page, limit, sortBy, sortOrder } = query;
  const filter = buildFilter(query, FILTER_FIELDS);

  const [opportunities, total] = await Promise.all([
    Opportunity.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE),
    Opportunity.countDocuments(filter),
  ]);

  return { opportunities, pagination: paginationMeta({ page, limit }, total) };
}

// One pipeline as a board: a column per stage, in stage order, each with its
// real total and value and its most recently changed opportunities (up to `limit`).
// Without a pipelineId: the default pipeline.
export async function getBoard(query) {
  const pipeline = query.pipelineId
    ? await Pipeline.findById(query.pipelineId)
    : await Pipeline.findOne({ isDefault: true });
  if (!pipeline) {
    if (query.pipelineId) throw ApiError.notFound(MESSAGES.PIPELINE_NOT_FOUND);
    return { pipeline: null, columns: [] };
  }

  // Inactive stages are included: they may still hold opportunities.
  const stages = await PipelineStage.find({ pipelineId: pipeline._id }).sort({ order: 1, _id: 1 });
  const filter = { ...buildFilter(query, BOARD_FILTER_FIELDS), pipelineId: pipeline._id };

  // aggregate() neither casts ids nor applies the soft-delete filter.
  const match = Opportunity.find(filter).cast(Opportunity);
  const totals = await Opportunity.aggregate([
    { $match: { ...match, deletedAt: null } },
    { $group: { _id: '$stageId', total: { $sum: 1 }, totalValue: { $sum: { $ifNull: ['$estimatedValue', 0] } } } },
  ]);
  const totalsByStage = new Map(totals.map((row) => [String(row._id), row]));

  const columns = await Promise.all(
    stages.map(async (stage) => {
      const summary = totalsByStage.get(stage.id);
      const opportunities = summary
        ? await Opportunity.find({ ...filter, stageId: stage._id })
            .sort({ updatedAt: -1, _id: 1 })
            .limit(query.limit)
            .populate(POPULATE)
        : [];
      return { stage, total: summary?.total ?? 0, totalValue: summary?.totalValue ?? 0, opportunities };
    })
  );

  return { pipeline, columns };
}

// What an opportunity picker needs. Newest first; one company only, when asked.
export async function listOpportunityOptions({ search, companyId, id, limit }) {
  const filter = id
    ? { _id: id }
    : { ...searchFilter(search, ['opportunityNumber', 'name']), ...(companyId ? { companyId } : {}) };
  const opportunities = await Opportunity.find(filter)
    .select('opportunityNumber name companyId status')
    .sort({ createdAt: -1, _id: 1 })
    .limit(limit);
  return opportunities.map((opportunity) => ({
    id: opportunity.id,
    opportunityNumber: opportunity.opportunityNumber,
    name: opportunity.name,
    companyId: String(opportunity.companyId),
    status: opportunity.status,
  }));
}

export function getOpportunity(id) {
  return findOpportunity(id);
}

export async function createOpportunity(input, actor) {
  assertMayAssign(actor, input.assignedTo);

  await assertCompanyAndContact(input.companyId, input.contactId);
  await assertActivePriority(input.priorityId);
  if (input.assignedTo) await assertActiveUser(input.assignedTo);
  const start = await resolveStartingStage({ pipelineId: input.pipelineId, stageId: input.stageId });

  const fields = {
    name: input.name,
    companyId: input.companyId,
    contactId: input.contactId || undefined,
    priorityId: input.priorityId || undefined,
    assignedTo: input.assignedTo || undefined,
    probability: input.probability,
  };
  applyOptional(fields, input);
  return insertOpportunity(fields, start, actor);
}

// Edits everything except stage and assignment, which have their own endpoints.
export async function updateOpportunity(id, input, actor) {
  const opportunity = await findOpportunity(id);
  const before = snapshot(opportunity);

  // The company/contact pair as it will be once the sent fields are applied.
  const companyId = input.companyId || idOf(opportunity.companyId);
  let contactId = 'contactId' in input ? input.contactId || '' : idOf(opportunity.contactId);
  // Moving to another company without naming a contact drops the old one.
  if (companyId !== idOf(opportunity.companyId) && !('contactId' in input)) contactId = '';
  if (companyId !== idOf(opportunity.companyId) || contactId !== idOf(opportunity.contactId)) {
    await assertCompanyAndContact(companyId, contactId);
    opportunity.companyId = companyId;
    opportunity.contactId = contactId || undefined;
  }

  // Only a priority that is actually changing needs to be active.
  if ('priorityId' in input) {
    if (input.priorityId && input.priorityId !== idOf(opportunity.priorityId)) {
      await assertActivePriority(input.priorityId);
    }
    opportunity.priorityId = input.priorityId || undefined;
  }

  if (input.name) opportunity.name = input.name;
  if (!empty(input.probability)) opportunity.probability = input.probability;
  applyOptional(opportunity, input);

  await opportunity.save();
  const updated = await findOpportunity(id);

  const changes = diffSnapshots(before, snapshot(updated), TIMELINE_LABELS);
  if (changes.length) {
    await recordEvent({ entityType: OPPORTUNITY_ENTITY, entityId: updated._id, action: 'updated', changes, actor });
  }
  return updated;
}

// Moves the opportunity to another stage of its own pipeline. The probability
// and the open / won / lost status follow the stage.
export async function moveOpportunity(id, stageId, actor) {
  const opportunity = await findOpportunity(id);
  if (stageId === idOf(opportunity.stageId)) return opportunity;

  const from = opportunity.stageId?.name;
  const stage = await resolveTargetStage(idOf(opportunity.pipelineId), stageId);
  enterStage(opportunity, stage);
  opportunity.probability = stage.probability;
  await opportunity.save();

  const updated = await findOpportunity(id);
  await recordEvent({
    entityType: OPPORTUNITY_ENTITY,
    entityId: updated._id,
    action: 'stage_changed',
    changes: [{ field: 'stage', label: 'Stage', from, to: stage.name }],
    actor,
  });
  return updated;
}

export async function assignOpportunity(id, userId, actor) {
  const opportunity = await findOpportunity(id);
  const from = opportunity.assignedTo?.fullName;
  if ((userId || '') === idOf(opportunity.assignedTo)) return opportunity;

  if (userId) await assertActiveUser(userId);
  opportunity.assignedTo = userId || undefined;
  await opportunity.save();

  const updated = await findOpportunity(id);
  await recordEvent({
    entityType: OPPORTUNITY_ENTITY,
    entityId: updated._id,
    action: 'assigned',
    changes: [{ field: 'assignedTo', label: 'Assigned to', from, to: updated.assignedTo?.fullName }],
    actor,
  });
  return updated;
}

export async function deleteOpportunity(id, actor) {
  const opportunity = await findOpportunity(id);
  opportunity.deletedAt = new Date();
  await opportunity.save();
  await recordEvent({ entityType: OPPORTUNITY_ENTITY, entityId: opportunity._id, action: 'deleted', actor });
}

export async function getOpportunityTimeline(id, query) {
  const opportunity = await findOpportunity(id);
  return listEvents(OPPORTUNITY_ENTITY, opportunity._id, query);
}
