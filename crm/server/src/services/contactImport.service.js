import { readSheet } from 'read-excel-file/node';
import writeExcelFile from 'write-excel-file/node';
import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import ApiError from '../utils/ApiError.js';
import { createCompanySchema } from '../validators/company.validator.js';
import { createContactSchema } from '../validators/contact.validator.js';
import { createCompany } from './company.service.js';
import { createContact } from './contact.service.js';
import { findMatchingCompany, findMatchingContact } from './duplicate.service.js';

// Importing contacts - for example from business cards collected at an expo -
// from an Excel sheet. Each row is one person and their company:
//
//  - the company is matched to an existing one (by the configured match
//    fields: GST, email, phone, name ...) or created; several rows for the same
//    new company create it once;
//  - the contact is added to that company, unless it is already there;
//  - every row goes through the same validation and services as the screens,
//    so numbers, duplicate rules and history are exactly as if typed in.
//
// A preview (dryRun) says what would happen to each row without changing
// anything; the import does it and reports the same way.

export const IMPORT_MAX_ROWS = 1000;
export const IMPORT_SHEET = 'Contacts';
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// The columns of the template: header text -> where the value goes.
export const IMPORT_COLUMNS = [
  { header: 'Company name', key: 'company.name', required: true, width: 30, example: 'Maa Tarini Farmers Producer Company' },
  { header: 'Company email', key: 'company.email', width: 28, example: 'office@maatarini.example.com' },
  { header: 'Company phone', key: 'company.phone', width: 18, example: '+91 674 255 0101' },
  { header: 'Website', key: 'company.website', width: 28, example: 'https://maatarini.example.com' },
  { header: 'Address', key: 'company.address', width: 30, example: 'Plot 12, Mandi Road' },
  { header: 'City', key: 'company.city', width: 16, example: 'Cuttack' },
  { header: 'State', key: 'company.state', width: 16, example: 'Odisha' },
  { header: 'Country', key: 'company.country', width: 14, example: 'India' },
  { header: 'Postal code', key: 'company.postalCode', width: 12, example: '753001' },
  { header: 'GST number', key: 'company.gstNumber', width: 18, example: '' },
  { header: 'First name', key: 'contact.firstName', required: true, width: 16, example: 'Ramesh' },
  { header: 'Last name', key: 'contact.lastName', required: true, width: 16, example: 'Behera' },
  { header: 'Designation', key: 'contact.designation', width: 20, example: 'Director' },
  { header: 'Department', key: 'contact.department', width: 16, example: 'Operations' },
  { header: 'Email', key: 'contact.email', width: 28, example: 'ramesh.behera@maatarini.example.com' },
  { header: 'Mobile', key: 'contact.phone', width: 18, example: '+91 98610 12345' },
  { header: 'Other phone', key: 'contact.alternatePhone', width: 18, example: '' },
  { header: 'Met at (event)', key: 'meta.event', width: 22, example: 'Krushi Odisha Expo 2026' },
  { header: 'Interested in', key: 'meta.interest', width: 22, example: 'Cold Storage, IoT monitoring' },
  { header: 'Notes', key: 'contact.notes', width: 30, example: 'Wants 5 MT unit before harvest' },
];

const normalise = (text) => String(text ?? '').toLowerCase().replace(/[*()]/g, '').replace(/\s+/g, ' ').trim();
const COLUMN_BY_HEADER = new Map(IMPORT_COLUMNS.map((column) => [normalise(column.header), column]));

// --- the template ----------------------------------------------------------------------

export async function buildTemplate() {
  const header = IMPORT_COLUMNS.map((column) => ({ value: column.required ? `${column.header} *` : column.header, fontWeight: 'bold', backgroundColor: column.required ? '#FFF2CC' : '#E8EEF7' }));
  const text = (value) => ({ value: String(value), type: String });
  const example = IMPORT_COLUMNS.map((column) => (column.example ? text(column.example) : null));
  const instructions = [
    [{ value: 'How to fill in the Contacts sheet', fontWeight: 'bold' }],
    [text('One row per person (one business card = one row). Columns marked * are required: Company name, First name, Last name.')],
    [text('If several people work at the same company, write the company name the same way on each row - the company is created once.')],
    [text('A company that is already in the CRM (same GST number, email, phone or name) is not created again: the person is added to it.')],
    [text('A person who is already a contact of that company (same email or phone) is skipped, not duplicated.')],
    [text('Phone numbers: digits, spaces, + - ( ) only. Website must start with http:// or https://.')],
    [text('"Met at (event)", "Interested in" and "Notes" are kept in the contact\'s notes.')],
    [text('Do not rename or delete the column headings. Up to 1000 rows per file.')],
    [text('See the Example sheet for a filled-in row. Delete nothing there - only the Contacts sheet is read.')],
  ];
  return writeExcelFile(
    [
      { data: [header], sheet: IMPORT_SHEET, columns: IMPORT_COLUMNS.map((column) => ({ width: column.width })), stickyRowsCount: 1 },
      { data: [header, example], sheet: 'Example', columns: IMPORT_COLUMNS.map((column) => ({ width: column.width })), stickyRowsCount: 1 },
      { data: instructions, sheet: 'Instructions', columns: [{ width: 120 }] },
    ]
  ).toBuffer();
}

export const TEMPLATE_FILE = { name: 'contacts-import-template.xlsx', type: XLSX };

// --- reading the file -------------------------------------------------------------------

const cellText = (value) => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  // Excel keeps long numbers (phones, postal codes) as numbers: write them out in full.
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(value);
  return String(value).trim();
};

async function readRows(buffer) {
  let rows;
  try {
    rows = await readSheet(buffer, IMPORT_SHEET).catch(() => readSheet(buffer));
  } catch {
    throw ApiError.badRequest(MESSAGES.IMPORT_UNREADABLE, [{ field: 'file', message: MESSAGES.IMPORT_UNREADABLE }]);
  }
  const [headerRow = [], ...body] = rows;
  // Columns are found by their heading, so their order does not matter.
  const map = headerRow.map((cell) => COLUMN_BY_HEADER.get(normalise(cell)) ?? null);
  const missing = IMPORT_COLUMNS.filter((column) => column.required && !map.includes(column)).map((column) => column.header);
  if (missing.length) {
    throw ApiError.badRequest(MESSAGES.IMPORT_COLUMNS_MISSING, missing.map((header) => ({ field: 'file', message: `Missing column: ${header}` })));
  }
  const records = [];
  body.forEach((cells, index) => {
    const record = { rowNumber: index + 2, company: {}, contact: {}, meta: {} };
    map.forEach((column, at) => {
      if (!column) return;
      const [part, field] = column.key.split('.');
      const value = cellText(cells[at]);
      if (value) record[part][field] = value;
    });
    // Completely empty rows are ignored.
    if (Object.keys(record.company).length || Object.keys(record.contact).length) records.push(record);
  });
  if (!records.length) throw ApiError.badRequest(MESSAGES.IMPORT_EMPTY, [{ field: 'file', message: MESSAGES.IMPORT_EMPTY }]);
  if (records.length > IMPORT_MAX_ROWS) throw ApiError.badRequest(MESSAGES.IMPORT_TOO_MANY, [{ field: 'file', message: MESSAGES.IMPORT_TOO_MANY }]);
  return records;
}

// --- one row ------------------------------------------------------------------------------

const LABELS = Object.fromEntries(IMPORT_COLUMNS.map((column) => [column.key, column.header]));
const problemsOf = (error, part) => error.details.map((detail) => {
  const field = detail.path.join('.');
  return `${LABELS[`${part}.${field}`] ?? field}: ${detail.message.replace(/^"[^"]*" /, '')}`;
});
const PLACEHOLDER_ID = '000000000000000000000000';

function check(record) {
  const notes = [record.meta.event && `Met at: ${record.meta.event}`, record.meta.interest && `Interested in: ${record.meta.interest}`, record.contact.notes].filter(Boolean).join('\n');
  const company = createCompanySchema.validate(record.company, { abortEarly: false, stripUnknown: true });
  const contact = createContactSchema.validate({ ...record.contact, notes: notes || undefined, companyId: PLACEHOLDER_ID }, { abortEarly: false, stripUnknown: true });
  const problems = [...(company.error ? problemsOf(company.error, 'company') : []), ...(contact.error ? problemsOf(contact.error, 'contact') : [])];
  const { companyId: _placeholder, ...contactValue } = contact.value ?? {};
  return { company: company.value, contact: contactValue, problems };
}

const companyKey = (company) => (company.gstNumber ? `gst:${company.gstNumber.toUpperCase()}` : `name:${normalise(company.name)}`);
const personKey = (contact) => (contact.email ? `email:${contact.email.toLowerCase()}` : contact.phone ? `phone:${contact.phone.replace(/\D/g, '')}` : `name:${normalise(contact.firstName)} ${normalise(contact.lastName)}`);

// --- the import -------------------------------------------------------------------------

// -> { rows: [{ rowNumber, company, contact, companyAction, contactAction, problems }], summary }
//    companyAction: new | existing | none     contactAction: new | existing | none
export async function importContacts(buffer, { dryRun = true } = {}, actor) {
  const records = await readRows(buffer);
  // Companies created (or planned) earlier in this file, by name / GST.
  const fromThisFile = new Map();
  // People already added (or planned) in this file, per company.
  const peopleInFile = new Set();
  const rows = [];

  for (const record of records) {
    const { company, contact, problems } = check(record);
    const row = {
      rowNumber: record.rowNumber,
      company: { name: record.company.name ?? '' },
      contact: { name: [record.contact.firstName, record.contact.lastName].filter(Boolean).join(' '), email: record.contact.email ?? '' },
      companyAction: 'none',
      contactAction: 'none',
      problems,
    };
    rows.push(row);
    if (problems.length) continue;

    try {
      // The company: an earlier row of this file, one already in the CRM, or a new one.
      const key = companyKey(company);
      let companyId = fromThisFile.get(key)?.id;
      if (companyId) {
        row.companyAction = fromThisFile.get(key).action;
        row.company.code = fromThisFile.get(key).code;
      } else {
        const match = await findMatchingCompany(company);
        if (match) {
          companyId = match.record.id;
          row.companyAction = 'existing';
          row.company.code = match.record.companyCode;
          row.company.matchedBy = match.matchedBy;
        } else if (dryRun) {
          companyId = `new:${key}`;
          row.companyAction = 'new';
        } else {
          const created = await createCompany(company, actor);
          companyId = created.id;
          row.companyAction = 'new';
          row.company.code = created.companyCode;
        }
        fromThisFile.set(key, { id: companyId, action: row.companyAction === 'existing' ? 'existing' : 'new', code: row.company.code });
      }
      row.company.id = companyId.startsWith?.('new:') ? undefined : companyId;

      // The person: once per company, never twice.
      const person = `${companyId}|${personKey(contact)}`;
      if (peopleInFile.has(person)) {
        row.contactAction = 'existing';
        row.problems.push(MESSAGES.IMPORT_DUPLICATE_ROW);
        continue;
      }
      peopleInFile.add(person);
      const existing = row.company.id ? await findMatchingContact(row.company.id, contact) : null;
      if (existing) {
        row.contactAction = 'existing';
        row.contact.id = existing.record.id;
        row.contact.matchedBy = existing.matchedBy;
      } else if (!dryRun) {
        const created = await createContact({ ...contact, companyId: row.company.id }, actor);
        row.contactAction = 'new';
        row.contact.id = created.id;
      } else {
        row.contactAction = 'new';
      }
    } catch (error) {
      // A rule of the services (a GST number already used, ...): reported on the row.
      row.problems.push(error.message);
      for (const detail of error.errors ?? []) if (detail.message && detail.message !== error.message) row.problems.push(detail.message);
    }
  }

  const count = (test) => rows.filter(test).length;
  return {
    dryRun,
    rows,
    summary: {
      rows: rows.length,
      companiesNew: new Set(rows.filter((r) => r.companyAction === 'new').map((r) => r.company.code ?? r.company.name.toLowerCase())).size,
      companiesExisting: new Set(rows.filter((r) => r.companyAction === 'existing').map((r) => r.company.code)).size,
      contactsNew: count((r) => r.contactAction === 'new'),
      contactsExisting: count((r) => r.contactAction === 'existing' && !r.problems.length),
      rowsWithProblems: count((r) => r.problems.length > 0),
    },
  };
}

export const IMPORT_ERROR_STATUS = HTTP_STATUS.BAD_REQUEST;
