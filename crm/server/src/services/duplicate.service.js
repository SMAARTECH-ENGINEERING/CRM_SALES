import env from '../config/env.js';
import Company from '../models/Company.js';
import Contact from '../models/Contact.js';

// Finds an existing company / contact that a new one would duplicate, using the
// fields configured in COMPANY_MATCH_FIELDS / CONTACT_MATCH_FIELDS. Fields are
// tried in the configured order and the first match wins. A field the input
// leaves empty is skipped - blank never matches blank.

const CASE_INSENSITIVE = { locale: 'en', strength: 2 };
const clean = (value) => (typeof value === 'string' ? value.trim() : '');

// How each configured field turns into a query.
const COMPANY_FILTERS = {
  gstNumber: (input) => clean(input.gstNumber) && { gstNumber: clean(input.gstNumber).toUpperCase() },
  panNumber: (input) => clean(input.panNumber) && { panNumber: clean(input.panNumber).toUpperCase() },
  email: (input) => clean(input.email) && { email: clean(input.email).toLowerCase() },
  phone: (input) => clean(input.phone) && { phone: clean(input.phone) },
  website: (input) => clean(input.website) && { website: clean(input.website) },
  name: (input) => clean(input.name) && { name: clean(input.name) },
};

const CONTACT_FILTERS = {
  email: (input) => clean(input.email) && { email: clean(input.email).toLowerCase() },
  phone: (input) => clean(input.phone) && { phone: clean(input.phone) },
  alternatePhone: (input) => clean(input.alternatePhone) && { alternatePhone: clean(input.alternatePhone) },
  // First and last name together.
  name: (input) =>
    clean(input.firstName) &&
    clean(input.lastName) && { firstName: clean(input.firstName), lastName: clean(input.lastName) },
};

async function firstMatch(Model, fields, filters, input, scope = {}) {
  for (const field of fields) {
    const filter = filters[field](input);
    if (!filter) continue;
    // Names and addresses are compared regardless of case. Deleted records are
    // hidden from queries, so they never match.
    const record = await Model.findOne({ ...scope, ...filter }).collation(CASE_INSENSITIVE);
    if (record) return { record, matchedBy: field };
  }
  return null;
}

// -> { record, matchedBy } or null
export function findMatchingCompany(input) {
  return firstMatch(Company, env.matchFields.company, COMPANY_FILTERS, input);
}

// Contacts are matched within one company: the same person at another company
// is a different contact.
export function findMatchingContact(companyId, input) {
  return firstMatch(Contact, env.matchFields.contact, CONTACT_FILTERS, input, { companyId });
}
