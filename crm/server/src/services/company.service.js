import { MESSAGES, USER_STATUS } from '../constants/index.js';
import Company from '../models/Company.js';
import CompanyType from '../models/CompanyType.js';
import Industry from '../models/Industry.js';
import Organization from '../models/Organization.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { paginationMeta, searchFilter } from '../utils/query.js';
import {
  getCompanySections,
  getDeleteBlockers,
  registerCompanySection,
} from './companySection.service.js';
import { assertActiveEntry } from './masterData.service.js';
import { nextSequence } from './sequence.service.js';
import { numberFor } from './settings.service.js';
import { countEvents, diffSnapshots, listEvents, recordEvent } from './timeline.service.js';

const ENTITY = 'company';
const SEQUENCE = 'company';

// People may have been deleted since; their names should still show.
const PERSON = { select: 'firstName lastName email', options: { withDeleted: true } };
const POPULATE = [
  { path: 'industryId', select: 'name' },
  { path: 'companyTypeId', select: 'name' },
  { path: 'organizationId', select: 'name' },
  { path: 'assignedTo', ...PERSON },
  { path: 'createdBy', ...PERSON },
];

const SEARCH_FIELDS = ['companyCode', 'name', 'legalName', 'email', 'phone', 'gstNumber', 'panNumber', 'city'];
const FILTER_FIELDS = ['status', 'industryId', 'companyTypeId', 'organizationId', 'assignedTo'];
const TEXT_FILTER_FIELDS = ['city', 'state', 'country'];

// Optional plain fields: '' or null clears the stored value.
const OPTIONAL_FIELDS = [
  'legalName',
  'email',
  'phone',
  'website',
  'address',
  'city',
  'state',
  'country',
  'postalCode',
  'gstNumber',
  'panNumber',
  'notes',
];

// Reference fields, the list each one points into, and the error when it is not usable.
const REFERENCES = [
  { field: 'industryId', Model: Industry, message: MESSAGES.INDUSTRY_NOT_FOUND },
  { field: 'companyTypeId', Model: CompanyType, message: MESSAGES.COMPANY_TYPE_NOT_FOUND },
  { field: 'organizationId', Model: Organization, message: MESSAGES.ORGANIZATION_NOT_FOUND },
];

// Fields tracked in the timeline, with the label shown for each.
const TIMELINE_LABELS = {
  name: 'Name',
  legalName: 'Legal name',
  industry: 'Industry',
  companyType: 'Company type',
  email: 'Email',
  phone: 'Phone',
  website: 'Website',
  address: 'Address',
  city: 'City',
  state: 'State',
  country: 'Country',
  postalCode: 'Postal code',
  gstNumber: 'GST number',
  panNumber: 'PAN number',
  assignedTo: 'Assigned to',
  organization: 'Organization',
  status: 'Status',
  notes: 'Notes',
};

// Readable values of a populated company, for comparing before and after an update.
function snapshot(company) {
  const plain = Object.fromEntries(
    ['name', 'status', ...OPTIONAL_FIELDS].map((field) => [field, company[field] ?? ''])
  );
  return {
    ...plain,
    industry: company.industryId?.name ?? '',
    companyType: company.companyTypeId?.name ?? '',
    organization: company.organizationId?.name ?? '',
    assignedTo: company.assignedTo?.fullName ?? '',
  };
}

registerCompanySection('timeline', { count: (companyId) => countEvents(ENTITY, companyId) });

// --- helpers -----------------------------------------------------------------

async function findCompany(id) {
  const company = await Company.findById(id).populate(POPULATE);
  if (!company) throw ApiError.notFound(MESSAGES.COMPANY_NOT_FOUND);
  return company;
}

async function assertReferencesUsable(input) {
  for (const { field, Model, message } of REFERENCES) {
    if (input[field]) await assertActiveEntry(Model, input[field], field, message);
  }
  if (input.assignedTo) {
    const assignee = await User.exists({ _id: input.assignedTo, status: USER_STATUS.ACTIVE });
    if (!assignee) {
      throw ApiError.badRequest(MESSAGES.ASSIGNEE_NOT_FOUND, [
        { field: 'assignedTo', message: MESSAGES.ASSIGNEE_NOT_FOUND },
      ]);
    }
  }
}

// A GSTIN identifies one registration, so two live companies sharing one is
// almost certainly a duplicate account. (A PAN can legitimately be shared by
// several registrations of the same legal entity, so it is not checked.)
async function assertGstAvailable(gstNumber, excludeId) {
  if (!gstNumber) return;
  const filter = excludeId ? { gstNumber, _id: { $ne: excludeId } } : { gstNumber };
  const existing = await Company.findOne(filter).select('companyCode name');
  if (existing) {
    const message = `${MESSAGES.GST_TAKEN} (${existing.companyCode} - ${existing.name})`;
    throw ApiError.conflict(MESSAGES.GST_TAKEN, [{ field: 'gstNumber', message }]);
  }
}

// Characters 3-12 of a GSTIN are the holder's PAN.
function assertGstMatchesPan(gstNumber, panNumber) {
  if (gstNumber && panNumber && gstNumber.slice(2, 12) !== panNumber) {
    throw new ApiError(422, MESSAGES.VALIDATION_FAILED, [
      { field: 'gstNumber', message: MESSAGES.GST_PAN_MISMATCH },
    ]);
  }
}

// --- operations --------------------------------------------------------------

export async function listCompanies(query) {
  const { page, limit, search, sortBy, sortOrder } = query;

  const filter = { ...searchFilter(search, SEARCH_FIELDS) };
  for (const field of FILTER_FIELDS) {
    if (query[field]) filter[field] = query[field];
  }
  for (const field of TEXT_FILTER_FIELDS) {
    if (query[field]) filter[field] = query[field];
  }

  const [companies, total] = await Promise.all([
    Company.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      // Makes sorting and the city/state/country filters case-insensitive.
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE),
    Company.countDocuments(filter).collation({ locale: 'en', strength: 2 }),
  ]);

  return { companies, pagination: paginationMeta({ page, limit }, total) };
}

export function getCompany(id) {
  return findCompany(id);
}

export async function createCompany(input, actor) {
  assertGstMatchesPan(input.gstNumber, input.panNumber);
  await assertReferencesUsable(input);
  await assertGstAvailable(input.gstNumber);

  const company = new Company({ name: input.name, status: input.status, createdBy: actor.id });
  for (const field of OPTIONAL_FIELDS) company[field] = input[field] || undefined;
  for (const field of [...REFERENCES.map((r) => r.field), 'assignedTo']) {
    company[field] = input[field] || undefined;
  }

  // Taken last, after everything that can fail, so rejected requests do not
  // leave gaps in the numbering.
  const number = await nextSequence(SEQUENCE);
  company.companyCode = await numberFor('company', number);
  await company.save();

  await recordEvent({ entityType: ENTITY, entityId: company._id, action: 'created', actor });
  return findCompany(company.id);
}

export async function updateCompany(id, input, actor) {
  const company = await findCompany(id);
  const before = snapshot(company);

  // Only references that are actually changing need to be valid/active: a
  // company keeps an industry that was later deactivated.
  const changedRefs = Object.fromEntries(
    [...REFERENCES.map((r) => r.field), 'assignedTo']
      .filter((field) => input[field] && input[field] !== String(company[field]?._id))
      .map((field) => [field, input[field]])
  );
  await assertReferencesUsable(changedRefs);

  const gstNumber = 'gstNumber' in input ? input.gstNumber || '' : (company.gstNumber ?? '');
  const panNumber = 'panNumber' in input ? input.panNumber || '' : (company.panNumber ?? '');
  assertGstMatchesPan(gstNumber, panNumber);
  if (gstNumber !== (company.gstNumber ?? '')) await assertGstAvailable(gstNumber, company._id);

  if (input.name) company.name = input.name;
  if (input.status) company.status = input.status;
  for (const field of OPTIONAL_FIELDS) {
    if (field in input) company[field] = input[field] || undefined;
  }
  for (const field of [...REFERENCES.map((r) => r.field), 'assignedTo']) {
    if (field in input) company[field] = input[field] || undefined;
  }

  await company.save();
  const updated = await findCompany(id);

  const changes = diffSnapshots(before, snapshot(updated), TIMELINE_LABELS);
  if (changes.length) {
    await recordEvent({ entityType: ENTITY, entityId: updated._id, action: 'updated', changes, actor });
  }
  return updated;
}

// Names for company pickers on other screens (e.g. the contact form). Exposes
// code and name only, so it does not need full companies.read access.
export async function listCompanyOptions({ search, id, limit }) {
  const filter = id ? { _id: id } : searchFilter(search, ['companyCode', 'name']);
  const companies = await Company.find(filter)
    .select('companyCode name status')
    .sort({ name: 1, _id: 1 })
    .collation({ locale: 'en', strength: 2 })
    .limit(limit);

  return companies.map(({ id, companyCode, name, status }) => ({ id, companyCode, name, status }));
}

export async function deleteCompany(id, actor) {
  const company = await findCompany(id);

  // Records that belong to the company must not be left pointing at nothing.
  const blockers = await getDeleteBlockers(company._id);
  if (blockers.length) {
    throw ApiError.conflict(
      MESSAGES.COMPANY_HAS_RECORDS,
      blockers.map(({ label, count }) => ({ field: label.toLowerCase(), message: `${label}: ${count}` }))
    );
  }

  company.deletedAt = new Date();
  await company.save();
  await recordEvent({ entityType: ENTITY, entityId: company._id, action: 'deleted', actor });
}

// --- detail page ---------------------------------------------------------------

export async function getSections(id) {
  const company = await findCompany(id);
  return getCompanySections(company._id);
}

export async function getTimeline(id, query) {
  const company = await findCompany(id);
  return listEvents(ENTITY, company._id, query);
}
