import { MESSAGES, SCRAPE_DECISION, SCRAPE_IMPORT_STATUS, SCRAPE_MATCH } from '../constants/index.js';
import Company from '../models/Company.js';
import Contact from '../models/Contact.js';
import ScrapedRecord from '../models/ScrapedRecord.js';
import ScrapeJob from '../models/ScrapeJob.js';
import ApiError from '../utils/ApiError.js';
import { hasPermission } from '../utils/permissions.js';
import { createCompanySchema } from '../validators/company.validator.js';
import { createContactSchema } from '../validators/contact.validator.js';
import { createCompany, updateCompany } from './company.service.js';
import { createContact, updateContact } from './contact.service.js';
import { createLead } from './lead.service.js';
import { findRecord, presentRecord } from './scraper.service.js';
import { canonicalName, domainOf } from './scraper/normalize.js';
import { recordEvent } from './timeline.service.js';

// Bringing reviewed results into the CRM. Every record goes through the same
// services as the screens - numbering, validation, duplicate rules, history -
// into the existing companies, contacts and leads. Nothing is merged without
// the user's choice:
//
//   result in the CRM   default            the user may choose
//   new                 create             skip
//   existing            link (no change)   update (fill empty fields only), create new, skip
//   possible            - must choose -    skip, update existing, create new
//
// A lead is created only when asked, with what the user entered: a requirement
// is never inferred from what a website says.

export const IMPORT_BATCH = 50;

const decisionOf = (record) => record.decision ?? { [SCRAPE_MATCH.NEW]: SCRAPE_DECISION.CREATE, [SCRAPE_MATCH.EXISTING]: SCRAPE_DECISION.LINK }[record.match.status] ?? null;

const dateText = (date) => new Date(date).toISOString().slice(0, 10);
const nameOf = (user) => user?.fullName ?? ([user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'a user');

// Where it came from, kept in the record's notes.
function sourceNote(record, job, actor) {
  return [
    'Source: Web data scraper',
    `Source URL: ${record.sourceUrl}`,
    record.type === 'contact' && record.contact.profileUrl ? `Profile: ${record.contact.profileUrl}` : '',
    `Scraping job: ${job?.name ?? ''}`,
    `Scraped: ${dateText(record.scrapedAt)}`,
    `Imported: ${dateText(new Date())} by ${nameOf(actor)}`,
  ]
    .filter(Boolean)
    .join('\n');
}
const appendNote = (existing, note) => [existing, note].filter(Boolean).join('\n\n').slice(-5000);

// The fields of a CRM company from a result. A value the CRM would refuse (a
// phone in an odd format, an address too long) is left out rather than
// failing the whole record.
function companyInput(record, options) {
  const c = record.company;
  const input = {
    name: (c.name ?? '').slice(0, 200),
    website: c.website,
    email: c.email,
    phone: c.phone,
    address: c.address,
    city: c.city,
    state: c.state,
    country: c.country,
    postalCode: c.postalCode,
    industryId: options.industryId || undefined,
    companyTypeId: options.companyTypeId || undefined,
    assignedTo: options.assignedTo || undefined,
  };
  for (const [field, value] of Object.entries(input)) {
    if (value === undefined || value === '' || value === null) {
      delete input[field];
      continue;
    }
    if (field === 'name') continue;
    const { error } = createCompanySchema.extract(field).validate(value);
    if (error) delete input[field];
  }
  return input;
}

function contactInput(record) {
  const p = record.contact;
  const input = { firstName: p.firstName, lastName: p.lastName, designation: p.designation, email: p.email, phone: p.phone };
  for (const [field, value] of Object.entries(input)) {
    if (!value) {
      delete input[field];
      continue;
    }
    if (field === 'firstName' || field === 'lastName') continue;
    const { error } = createContactSchema.extract(field).validate(value);
    if (error) delete input[field];
  }
  return input;
}

// Only fields that are empty in the CRM are filled: nothing there is overwritten.
async function fillEmptyCompany(companyId, record, options, note, actor) {
  const existing = await Company.findById(companyId);
  if (!existing) throw ApiError.notFound('The matching CRM company no longer exists');
  const input = companyInput(record, options);
  const changes = {};
  for (const field of ['website', 'email', 'phone', 'address', 'city', 'state', 'country', 'postalCode', 'industryId', 'companyTypeId']) if (input[field] && !existing[field]) changes[field] = input[field];
  changes.notes = appendNote(existing.notes, note);
  await updateCompany(String(companyId), changes, actor);
  return Object.keys(changes).filter((f) => f !== 'notes');
}

async function fillEmptyContact(contactId, record, note, actor) {
  const existing = await Contact.findById(contactId);
  if (!existing) throw ApiError.notFound('The matching CRM contact no longer exists');
  const input = contactInput(record);
  const changes = {};
  for (const field of ['designation', 'email', 'phone']) if (input[field] && !existing[field]) changes[field] = input[field];
  changes.notes = appendNote(existing.notes, note);
  await updateContact(String(contactId), changes, actor);
  return Object.keys(changes).filter((f) => f !== 'notes');
}

const companyKeyOf = (record) => (record.company.website ? `d:${domainOf(record.company.website)}` : `n:${canonicalName(record.company.name)}`);

// What happens to one record - planned (dryRun) or done.
// -> { id, type, name, company: 'create'|'update'|'link'|'none', contact: ..., lead: 'create'|'none', outcome, message }
async function importOne(record, job, context, options, actor, dryRun) {
  const out = { id: String(record._id), type: record.type, name: record.type === 'company' ? record.company.name : record.contact.fullName, company: 'none', contact: 'none', lead: 'none' };
  if (record.importStatus === SCRAPE_IMPORT_STATUS.IMPORTED) return { ...out, outcome: 'already', message: MESSAGES.SCRAPE_ALREADY_IMPORTED };
  const decision = decisionOf(record);
  if (!decision) return { ...out, outcome: 'choose', message: MESSAGES.SCRAPE_CHOOSE };
  if (decision === SCRAPE_DECISION.SKIP) return { ...out, outcome: 'skip', message: 'Skipped' };
  const note = sourceNote(record, job, actor);
  const key = companyKeyOf(record);

  // --- the company ---
  let companyId;
  const matched = record.match.companyId?._id ?? record.match.companyId;
  if (record.type === 'company') {
    if (decision === SCRAPE_DECISION.CREATE) out.company = 'create';
    else if (decision === SCRAPE_DECISION.UPDATE) out.company = matched ? 'update' : 'create';
    else out.company = matched ? 'link' : 'create';
  } else if (matched && decision !== SCRAPE_DECISION.CREATE) {
    out.company = 'link';
  } else if (context.companies.has(key)) {
    out.company = 'link';
  } else if (record.company.name) {
    out.company = 'create';
  } else {
    return { ...out, outcome: 'failed', message: MESSAGES.SCRAPE_NO_COMPANY };
  }

  // --- the person ---
  if (record.type === 'contact') {
    if (!record.contact.firstName || !record.contact.lastName) return { ...out, outcome: 'failed', message: 'A first and a last name are needed: add the missing one before importing' };
    const matchedContact = record.match.contactId?._id ?? record.match.contactId;
    out.contact = decision === SCRAPE_DECISION.UPDATE && matchedContact ? 'update' : decision === SCRAPE_DECISION.LINK && matchedContact ? 'link' : decision === SCRAPE_DECISION.CREATE || !matchedContact ? 'create' : 'link';
  }

  // --- the lead (only when asked; one per company per import) ---
  if (options.createLead) out.lead = context.leads.has(key) ? 'none' : 'create';
  if (dryRun) {
    if (out.company === 'create') context.companies.set(key, 'planned');
    if (out.lead === 'create') context.leads.add(key);
    return { ...out, outcome: 'ready' };
  }

  // Doing it.
  if (out.company === 'create') {
    const created = await createCompany({ ...companyInput(record, options), notes: note }, actor);
    companyId = created.id;
    await recordEvent({ entityType: 'company', entityId: created._id, action: 'imported', summary: `Imported from the web data scraper (${record.sourceUrl})`.slice(0, 500), actor });
  } else if (out.company === 'update') {
    companyId = String(matched);
    const filled = await fillEmptyCompany(companyId, record, options, note, actor);
    out.filled = filled;
    await recordEvent({ entityType: 'company', entityId: companyId, action: 'imported', summary: `Updated from the web data scraper${filled.length ? `: ${filled.join(', ')}` : ''} (${record.sourceUrl})`.slice(0, 500), actor });
  } else {
    companyId = String(matched ?? context.companies.get(key));
  }
  if (record.type === 'company' || out.company === 'create') context.companies.set(key, companyId);

  let contactId = null;
  if (record.type === 'contact') {
    const matchedContact = record.match.contactId?._id ?? record.match.contactId;
    if (out.contact === 'create') {
      const created = await createContact({ ...contactInput(record), companyId, notes: note }, actor);
      contactId = created.id;
      await recordEvent({ entityType: 'contact', entityId: created._id, action: 'imported', summary: `Imported from the web data scraper (${record.sourceUrl})`.slice(0, 500), actor });
    } else if (out.contact === 'update') {
      contactId = String(matchedContact);
      out.filled = await fillEmptyContact(contactId, record, note, actor);
    } else contactId = String(matchedContact);
  }

  let leadId = null;
  if (out.lead === 'create') {
    const lead = options.lead ?? {};
    const companyName = (await Company.findById(companyId).select('name').lean())?.name ?? record.company.name;
    const created = await createLead(
      {
        title: (lead.title?.trim() ? lead.title.trim().replace(/\{company\}/gi, companyName) : companyName).slice(0, 200),
        companyId,
        contactId: contactId ?? undefined,
        sourceId: lead.sourceId || undefined,
        statusId: lead.statusId || undefined,
        priorityId: lead.priorityId || undefined,
        assignedTo: lead.assignedTo || undefined,
        // The requirement, as the user entered it - not taken from the website.
        description: lead.requirement?.trim() || undefined,
        notes: note,
        tags: lead.tags?.length ? lead.tags : undefined,
      },
      actor
    );
    leadId = created.id;
    context.leads.add(key);
  }

  record.importStatus = SCRAPE_IMPORT_STATUS.IMPORTED;
  record.importError = undefined;
  record.imported = { companyId, contactId: contactId ?? undefined, leadId: leadId ?? undefined, action: record.type === 'contact' ? out.contact : out.company, at: new Date(), by: actor.id };
  await record.save();
  return { ...out, outcome: 'imported', companyId, contactId, leadId };
}

function summarize(results) {
  const count = (test) => results.filter(test).length;
  const companyRows = results.filter((r) => r.type === 'company');
  const contactRows = results.filter((r) => r.type === 'contact');
  return {
    selected: results.length,
    companies: {
      create: count((r) => r.company === 'create' && ['ready', 'imported'].includes(r.outcome)),
      update: count((r) => r.company === 'update' && ['ready', 'imported'].includes(r.outcome)),
      link: companyRows.filter((r) => r.company === 'link' && ['ready', 'imported'].includes(r.outcome)).length,
    },
    contacts: {
      create: contactRows.filter((r) => r.contact === 'create' && ['ready', 'imported'].includes(r.outcome)).length,
      update: contactRows.filter((r) => r.contact === 'update' && ['ready', 'imported'].includes(r.outcome)).length,
      link: contactRows.filter((r) => r.contact === 'link' && ['ready', 'imported'].includes(r.outcome)).length,
    },
    leads: count((r) => r.lead === 'create' && ['ready', 'imported'].includes(r.outcome)),
    ready: count((r) => r.outcome === 'ready'),
    imported: count((r) => r.outcome === 'imported'),
    needChoice: count((r) => r.outcome === 'choose'),
    skipped: count((r) => r.outcome === 'skip'),
    already: count((r) => r.outcome === 'already'),
    failed: count((r) => r.outcome === 'failed'),
  };
}

// recordIds: up to IMPORT_BATCH per call (the screen sends batches and shows progress).
// options: { createLead, lead: { title, requirement, sourceId, statusId, priorityId, assignedTo, tags }, industryId, companyTypeId, assignedTo }
export async function importRecords({ recordIds, options = {} }, actor, { dryRun = false } = {}) {
  if (options.createLead && !hasPermission(actor, 'leads.create')) throw ApiError.forbidden('Creating leads needs the leads.create permission');
  const records = [];
  for (const id of recordIds) records.push(await findRecord(id, actor));
  // Companies before their people, so a person joins the company imported with them.
  records.sort((a, b) => (a.type === b.type ? 0 : a.type === 'company' ? -1 : 1));

  const jobs = new Map();
  const context = { companies: new Map(), leads: new Set() };
  // Companies imported earlier from the same jobs count as known.
  for (const record of await ScrapedRecord.find({ jobId: { $in: [...new Set(records.map((r) => String(r.jobId._id ?? r.jobId)))] }, type: 'company', importStatus: SCRAPE_IMPORT_STATUS.IMPORTED }).select('company imported').lean()) {
    if (record.imported?.companyId) context.companies.set(companyKeyOf(record), String(record.imported.companyId));
  }

  const results = [];
  for (const record of records) {
    const jobId = String(record.jobId._id ?? record.jobId);
    if (!jobs.has(jobId)) jobs.set(jobId, await ScrapeJob.findById(jobId).select('name').lean());
    try {
      results.push(await importOne(record, jobs.get(jobId), context, options, actor, dryRun));
    } catch (err) {
      const message = [err.message, ...(err.errors ?? []).map((e) => e.message).filter((m) => m !== err.message)].join(': ').slice(0, 500);
      results.push({ id: String(record._id), type: record.type, name: record.type === 'company' ? record.company.name : record.contact.fullName, outcome: 'failed', message });
      if (!dryRun) {
        record.importStatus = SCRAPE_IMPORT_STATUS.FAILED;
        record.importError = message;
        await record.save();
      }
    }
  }
  if (!dryRun) {
    for (const jobId of jobs.keys()) {
      const imported = await ScrapedRecord.countDocuments({ jobId, importStatus: SCRAPE_IMPORT_STATUS.IMPORTED });
      await ScrapeJob.updateOne({ _id: jobId }, { 'stats.imported': imported });
    }
  }
  return { dryRun, results, summary: summarize(results), records: dryRun ? undefined : await Promise.all(records.map(async (r) => presentRecord(await findRecord(r._id, actor)))) };
}
