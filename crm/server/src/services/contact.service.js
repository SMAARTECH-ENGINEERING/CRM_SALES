import { CONTACT_METHODS, HTTP_STATUS, MESSAGES } from '../constants/index.js';
import Company from '../models/Company.js';
import Contact from '../models/Contact.js';
import ApiError from '../utils/ApiError.js';
import { paginationMeta, searchFilter } from '../utils/query.js';
import { registerCompanySection } from './companySection.service.js';

const POPULATE = [
  { path: 'companyId', select: 'companyCode name status' },
  // The creator may since have been deleted; their name should still show.
  { path: 'createdBy', select: 'firstName lastName email', options: { withDeleted: true } },
];

const SEARCH_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'alternatePhone', 'designation', 'department'];

// Optional fields: '' or null clears the stored value.
const OPTIONAL_FIELDS = [
  'designation',
  'department',
  'email',
  'phone',
  'alternatePhone',
  'preferredContactMethod',
  'notes',
];

// Contacts appear on the company page, and a company that still has contacts
// cannot be deleted (they would be left without a company).
registerCompanySection('contacts', {
  count: (companyId) => Contact.countDocuments({ companyId }),
  blocksDelete: true,
});

// Modules whose records refer to contacts register here so that a contact in
// use cannot be deleted:
//   registerContactDeleteGuard('Leads', (contactId) => Lead.countDocuments({ contactId }));
const deleteGuards = [];

export function registerContactDeleteGuard(label, count) {
  deleteGuards.push({ label, count });
}

// --- helpers -----------------------------------------------------------------

async function findContact(id) {
  const contact = await Contact.findById(id).populate(POPULATE);
  if (!contact) throw ApiError.notFound(MESSAGES.CONTACT_NOT_FOUND);
  return contact;
}

// The id must point at a company that exists (deleted companies do not count).
async function assertCompanyExists(companyId) {
  if (!(await Company.exists({ _id: companyId }))) {
    throw ApiError.badRequest(MESSAGES.CONTACT_COMPANY_NOT_FOUND, [
      { field: 'companyId', message: MESSAGES.CONTACT_COMPANY_NOT_FOUND },
    ]);
  }
}

// The same person entered twice under one company is the usual duplicate.
async function assertEmailFreeInCompany(companyId, email, excludeId) {
  if (!email) return;
  const filter = { companyId, email };
  if (excludeId) filter._id = { $ne: excludeId };
  if (await Contact.exists(filter)) {
    throw ApiError.conflict(MESSAGES.CONTACT_EMAIL_TAKEN, [
      { field: 'email', message: MESSAGES.CONTACT_EMAIL_TAKEN },
    ]);
  }
}

// A preferred method is only meaningful if the detail it uses is on record.
function assertPreferredMethodUsable({ preferredContactMethod, email, phone }) {
  if (!preferredContactMethod) return;
  const needs = CONTACT_METHODS[preferredContactMethod];
  if (!{ email, phone }[needs]) {
    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, MESSAGES.VALIDATION_FAILED, [
      {
        field: 'preferredContactMethod',
        message: `preferredContactMethod "${preferredContactMethod}" needs ${needs === 'email' ? 'an email' : 'a phone number'}`,
      },
    ]);
  }
}

// --- operations --------------------------------------------------------------

export async function listContacts({ page, limit, search, companyId, status, sortBy, sortOrder }) {
  const filter = { ...searchFilter(search, SEARCH_FIELDS) };
  if (companyId) filter.companyId = companyId;
  if (status) filter.status = status;

  const [contacts, total] = await Promise.all([
    Contact.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE),
    Contact.countDocuments(filter),
  ]);

  return { contacts, pagination: paginationMeta({ page, limit }, total) };
}

export function getContact(id) {
  return findContact(id);
}

export async function createContact(input, actor) {
  assertPreferredMethodUsable(input);
  await assertCompanyExists(input.companyId);
  await assertEmailFreeInCompany(input.companyId, input.email);

  const contact = new Contact({
    firstName: input.firstName,
    lastName: input.lastName,
    companyId: input.companyId,
    status: input.status,
    createdBy: actor.id,
  });
  for (const field of OPTIONAL_FIELDS) contact[field] = input[field] || undefined;
  await contact.save();

  return findContact(contact.id);
}

export async function updateContact(id, input) {
  const contact = await findContact(id);

  // What the record will look like once the sent fields are applied.
  const next = (field) => (field in input ? input[field] || '' : (contact[field] ?? ''));
  const companyId = input.companyId ?? String(contact.companyId?._id ?? contact.companyId);
  const companyChanged = companyId !== String(contact.companyId?._id ?? contact.companyId);
  const email = next('email');

  assertPreferredMethodUsable({
    preferredContactMethod: next('preferredContactMethod'),
    email,
    phone: next('phone'),
  });
  if (companyChanged) await assertCompanyExists(companyId);
  if (companyChanged || email !== (contact.email ?? '')) {
    await assertEmailFreeInCompany(companyId, email, contact._id);
  }

  if (input.firstName) contact.firstName = input.firstName;
  if (input.lastName) contact.lastName = input.lastName;
  if (input.status) contact.status = input.status;
  if (companyChanged) contact.companyId = companyId;
  for (const field of OPTIONAL_FIELDS) {
    if (field in input) contact[field] = input[field] || undefined;
  }

  await contact.save();
  return findContact(id);
}

// Names for contact pickers on other screens (e.g. the lead form). Pass
// companyId to list one company's contacts, or id to fetch a single contact.
export async function listContactOptions({ search, companyId, id, limit }) {
  const filter = id ? { _id: id } : { ...searchFilter(search, ['firstName', 'lastName', 'email']) };
  if (!id && companyId) filter.companyId = companyId;

  const contacts = await Contact.find(filter)
    .select('firstName lastName email companyId status')
    .sort({ firstName: 1, lastName: 1, _id: 1 })
    .collation({ locale: 'en', strength: 2 })
    .limit(limit);

  return contacts.map((contact) => ({
    id: contact.id,
    fullName: contact.fullName,
    email: contact.email,
    companyId: String(contact.companyId),
    status: contact.status,
  }));
}

export async function deleteContact(id) {
  const contact = await findContact(id);

  // Records that point at the contact must not be left pointing at nothing.
  const blockers = [];
  for (const { label, count } of deleteGuards) {
    const total = await count(contact._id);
    if (total) blockers.push({ field: label.toLowerCase(), message: `${label}: ${total}` });
  }
  if (blockers.length) throw ApiError.conflict(MESSAGES.CONTACT_HAS_RECORDS, blockers);

  contact.deletedAt = new Date();
  await contact.save();
}
