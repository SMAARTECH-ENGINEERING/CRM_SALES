import mongoose from 'mongoose';
import writeExcelFile from 'write-excel-file/node';
import { MESSAGES, SCRAPE_IMPORT_STATUS, SCRAPE_JOB_STATUS, SCRAPE_MATCH, SCRAPE_PAGE_STATUS } from '../constants/index.js';
import Industry from '../models/Industry.js';
import ScrapedRecord from '../models/ScrapedRecord.js';
import ScrapeJob from '../models/ScrapeJob.js';
import ScrapePage from '../models/ScrapePage.js';
import ApiError from '../utils/ApiError.js';
import logger from '../config/logger.js';
import { hasPermission } from '../utils/permissions.js';
import { escapeRegex, paginationMeta } from '../utils/query.js';
import { crawl, LIMITS } from './scraper/crawler.js';
import { matchRecords } from './scraper/match.js';
import { canonicalName, domainOf, emailDomain, phoneKey, qualityOf } from './scraper/normalize.js';
import { checkUrl, FetchError } from './scraper/safeFetch.js';

// The web data scraper: jobs that visit public web pages, and the results they
// collect for review. Nothing becomes a CRM record here - importing is in
// scraperImport.service.js, and only for results the user selects.

const VIEW_ALL = 'scraper.viewAll';
const PERSON = 'firstName lastName email';

// --- who sees what -------------------------------------------------------------------------

const ownOnly = (actor) => (hasPermission(actor, VIEW_ALL) ? {} : { createdBy: actor.id });

async function findJob(id, actor) {
  const job = await ScrapeJob.findOne({ _id: id, ...ownOnly(actor) }).populate([
    { path: 'createdBy', select: PERSON, options: { withDeleted: true } },
    { path: 'industryId', select: 'name' },
  ]);
  if (!job) throw ApiError.notFound(MESSAGES.SCRAPE_JOB_NOT_FOUND);
  return job;
}

// The jobs whose results this user may see, as a filter on results and pages.
async function visibleJobFilter(actor, jobId) {
  if (jobId) {
    await findJob(jobId, actor);
    return { jobId: new mongoose.Types.ObjectId(String(jobId)) };
  }
  if (hasPermission(actor, VIEW_ALL)) return {};
  const ids = await ScrapeJob.find({ createdBy: actor.id }).distinct('_id');
  return { jobId: { $in: ids } };
}

// --- the queue: one job at a time, in this process -------------------------------------------

const queue = [];
let running = null;

function enqueue(jobId) {
  queue.push(String(jobId));
  setImmediate(runNext);
}

async function runNext() {
  if (running || !queue.length) return;
  running = queue.shift();
  try {
    await runJob(running);
  } catch (err) {
    logger.error({ err }, 'Scraping job failed');
    await ScrapeJob.updateOne({ _id: running }, { status: SCRAPE_JOB_STATUS.FAILED, message: err.message.slice(0, 500), finishedAt: new Date() });
  } finally {
    running = null;
    if (queue.length) setImmediate(runNext);
  }
}

// Waits until no job is queued or running (tests).
export async function idle() {
  while (running || queue.length) await new Promise((resolve) => setTimeout(resolve, 50));
}

// After a restart: jobs that were running are marked as interrupted; queued ones run.
export async function resumeScrapeJobs() {
  await ScrapeJob.updateMany({ status: SCRAPE_JOB_STATUS.RUNNING }, { status: SCRAPE_JOB_STATUS.FAILED, message: 'Interrupted: the server restarted while the job was running. Re-run it.', finishedAt: new Date() });
  for (const job of await ScrapeJob.find({ status: SCRAPE_JOB_STATUS.QUEUED }).sort({ createdAt: 1 }).select('_id')) enqueue(job._id);
}

// --- turning what was found into results -------------------------------------------------------

function keysFor(company, contact) {
  const domain = domainOf(company.website || '') || (company.emails ?? []).map(emailDomain).find(Boolean) || '';
  return {
    name: canonicalName(company.name),
    domain,
    emails: [...new Set([...(company.emails ?? [])])],
    phones: [...new Set((company.phones ?? []).map(phoneKey).filter(Boolean))],
    person: contact ? (contact.email ? `e:${contact.email}` : `n:${canonicalName(contact.fullName)}|${canonicalName(company.name)}`) : undefined,
  };
}

function companyFields(found) {
  return {
    name: found.name,
    website: found.website,
    email: found.emails[0] ?? '',
    phone: found.phones[0] ?? '',
    emails: found.emails.slice(0, 20),
    phones: found.phones.slice(0, 20),
    address: found.address,
    city: found.city,
    state: found.state,
    country: found.country,
    postalCode: found.postalCode,
    category: found.category,
    description: found.description,
  };
}

function buildRecords(job, result) {
  const records = [];
  const scrapedAt = new Date();
  const wantCompanies = job.dataType !== 'contacts';
  const wantContacts = job.dataType !== 'companies';
  // The first person found at each company, shown with it.
  const firstPerson = new Map();
  for (const person of result.contacts.values()) if (person.companyKey && !firstPerson.has(person.companyKey)) firstPerson.set(person.companyKey, person);

  if (wantCompanies) {
    for (const [key, found] of result.companies) {
      if (!found.name) continue;
      const company = companyFields(found);
      const person = firstPerson.get(key);
      const record = { _id: new mongoose.Types.ObjectId(), jobId: job._id, type: 'company', company, contact: person ? { fullName: person.fullName, designation: person.designation } : {}, origin: found.origin, sourceUrls: [...found.sources].slice(0, 10), sourceUrl: [...found.sources][0], scrapedAt, keys: keysFor(company) };
      records.push(Object.assign(record, qualityOf(record)));
    }
  }
  if (wantContacts) {
    for (const person of result.contacts.values()) {
      const found = (person.companyKey && result.companies.get(person.companyKey)) || null;
      const company = found ? companyFields(found) : { name: person.companyName ?? '', emails: [], phones: [] };
      const contact = { firstName: person.firstName, lastName: person.lastName, fullName: person.fullName, designation: person.designation, email: person.email, phone: person.phone, profileUrl: person.profileUrl };
      const record = { _id: new mongoose.Types.ObjectId(), jobId: job._id, type: 'contact', company, contact, origin: found?.origin ?? 'listing', sourceUrls: [...person.sources].slice(0, 10), sourceUrl: [...person.sources][0], scrapedAt, keys: keysFor(company, contact) };
      records.push(Object.assign(record, qualityOf(record)));
    }
  }
  return records.slice(0, job.settings.maxRecords);
}

async function runJob(jobId) {
  const job = await ScrapeJob.findById(jobId);
  if (!job || job.status !== SCRAPE_JOB_STATUS.QUEUED) return;
  job.status = SCRAPE_JOB_STATUS.RUNNING;
  job.startedAt = new Date();
  await job.save();

  let visited = 0;
  let failed = 0;
  const result = await crawl(job, {
    onPage: async (page) => {
      await ScrapePage.create({ jobId: job._id, ...page });
      if (page.status === SCRAPE_PAGE_STATUS.DONE) visited += 1;
      if (page.status === SCRAPE_PAGE_STATUS.FAILED) failed += 1;
      await ScrapeJob.updateOne({ _id: job._id }, { 'stats.pagesVisited': visited, 'stats.pagesFailed': failed });
    },
    // A cancelled job stops after the page it is on.
    shouldStop: async () => (await ScrapeJob.findById(job._id).select('status').lean())?.status === SCRAPE_JOB_STATUS.CANCELLED,
  });

  const records = await matchRecords(buildRecords(job, result));
  if (records.length) await ScrapedRecord.insertMany(records);
  const count = (test) => records.filter(test).length;
  const current = await ScrapeJob.findById(job._id).select('status').lean();
  const cancelled = current?.status === SCRAPE_JOB_STATUS.CANCELLED;
  const nothing = !records.length && !visited;
  await ScrapeJob.updateOne(
    { _id: job._id },
    {
      status: cancelled ? SCRAPE_JOB_STATUS.CANCELLED : nothing ? SCRAPE_JOB_STATUS.FAILED : SCRAPE_JOB_STATUS.COMPLETED,
      message: cancelled ? 'Cancelled; the results found until then are kept.' : nothing ? 'No page could be read. See Failed pages for why.' : records.length ? '' : 'The pages were read, but no business details were found on them.',
      finishedAt: new Date(),
      stats: {
        pagesVisited: visited,
        pagesFailed: failed,
        records: records.length,
        companies: count((r) => r.type === 'company'),
        contacts: count((r) => r.type === 'contact'),
        new: count((r) => r.match.status === SCRAPE_MATCH.NEW),
        possible: count((r) => r.match.status === SCRAPE_MATCH.POSSIBLE),
        existing: count((r) => r.match.status === SCRAPE_MATCH.EXISTING),
        imported: 0,
      },
    }
  );
}

// --- jobs ------------------------------------------------------------------------------------

export async function createJob(input, actor) {
  const problems = [];
  const targets = [];
  for (const [index, raw] of input.targets.entries()) {
    try {
      targets.push(checkUrl(raw).href);
    } catch (err) {
      problems.push({ field: `targets.${index}`, message: `${raw}: ${err instanceof FetchError ? err.message : MESSAGES.SCRAPE_URL_NOT_ALLOWED}` });
    }
  }
  if (problems.length) throw ApiError.badRequest(MESSAGES.SCRAPE_URL_NOT_ALLOWED, problems);
  if (input.industryId && !(await Industry.exists({ _id: input.industryId }))) throw ApiError.badRequest(MESSAGES.VALIDATION_FAILED, [{ field: 'industryId', message: 'Unknown industry' }]);
  const job = await ScrapeJob.create({ ...input, targets: [...new Set(targets)], status: SCRAPE_JOB_STATUS.QUEUED, createdBy: actor.id });
  enqueue(job._id);
  return findJob(job._id, actor);
}

export async function listJobs({ page, limit, search, status, sortBy, sortOrder }, actor) {
  const filter = { ...ownOnly(actor), ...(status ? { status } : {}), ...(search ? { name: new RegExp(escapeRegex(search), 'i') } : {}) };
  const [jobs, total] = await Promise.all([
    ScrapeJob.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate([
        { path: 'createdBy', select: PERSON, options: { withDeleted: true } },
        { path: 'industryId', select: 'name' },
      ]),
    ScrapeJob.countDocuments(filter),
  ]);
  return { jobs, pagination: paginationMeta({ page, limit }, total) };
}

export const getJob = findJob;

export async function cancelJob(id, actor) {
  const job = await findJob(id, actor);
  if (![SCRAPE_JOB_STATUS.QUEUED, SCRAPE_JOB_STATUS.RUNNING].includes(job.status)) throw ApiError.conflict(MESSAGES.SCRAPE_JOB_NOT_RUNNING);
  const wasQueued = job.status === SCRAPE_JOB_STATUS.QUEUED;
  job.status = SCRAPE_JOB_STATUS.CANCELLED;
  if (wasQueued) {
    job.finishedAt = new Date();
    job.message = 'Cancelled before it started.';
    const at = queue.indexOf(String(job._id));
    if (at >= 0) queue.splice(at, 1);
  }
  await job.save();
  return findJob(id, actor);
}

// A new job with the same name, sources and settings; the earlier one stays in the history.
export async function rerunJob(id, actor) {
  const job = await findJob(id, actor);
  const copy = await ScrapeJob.create({
    name: job.name,
    targets: job.targets,
    dataType: job.dataType,
    industryId: job.industryId?._id ?? job.industryId,
    settings: job.settings.toObject(),
    rerunOf: job._id,
    createdBy: actor.id,
  });
  enqueue(copy._id);
  return findJob(copy._id, actor);
}

// Deletes the job and its results - not anything already imported into the CRM.
export async function deleteJob(id, actor) {
  const job = await findJob(id, actor);
  if ([SCRAPE_JOB_STATUS.QUEUED, SCRAPE_JOB_STATUS.RUNNING].includes(job.status)) throw ApiError.conflict(MESSAGES.SCRAPE_JOB_BUSY);
  await Promise.all([ScrapedRecord.deleteMany({ jobId: job._id }), ScrapePage.deleteMany({ jobId: job._id })]);
  await job.deleteOne();
}

// --- results ---------------------------------------------------------------------------------

export async function recordFilter(query, actor) {
  const filter = { ...(await visibleJobFilter(actor, query.jobId)) };
  if (query.type) filter.type = query.type;
  if (query.match) filter['match.status'] = query.match;
  if (query.importStatus) filter.importStatus = query.importStatus;
  if (query.duplicates) filter.$or = [{ 'match.status': { $in: [SCRAPE_MATCH.POSSIBLE, SCRAPE_MATCH.EXISTING] } }, { 'match.duplicateOf': { $exists: true } }];
  if (query.hasEmail !== undefined) filter.$and = [...(filter.$and ?? []), query.hasEmail ? { $or: [{ 'company.email': { $nin: ['', null] } }, { 'contact.email': { $nin: ['', null] } }] } : { 'company.email': { $in: ['', null] }, 'contact.email': { $in: ['', null] } }];
  if (query.hasPhone !== undefined) filter.$and = [...(filter.$and ?? []), query.hasPhone ? { $or: [{ 'company.phone': { $nin: ['', null] } }, { 'contact.phone': { $nin: ['', null] } }] } : { 'company.phone': { $in: ['', null] }, 'contact.phone': { $in: ['', null] } }];
  if (query.location) {
    const pattern = new RegExp(escapeRegex(query.location), 'i');
    filter.$and = [...(filter.$and ?? []), { $or: [{ 'company.city': pattern }, { 'company.state': pattern }, { 'company.address': pattern }, { 'company.country': pattern }, { 'company.postalCode': pattern }] }];
  }
  if (query.industry) {
    const pattern = new RegExp(escapeRegex(query.industry), 'i');
    filter.$and = [...(filter.$and ?? []), { $or: [{ 'company.category': pattern }, { 'company.description': pattern }, { 'company.name': pattern }] }];
  }
  if (query.minQuality) filter.quality = { $gte: query.minQuality };
  if (query.from || query.to) filter.scrapedAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lt: new Date(new Date(query.to).getTime() + 24 * 3600 * 1000) } : {}) };
  for (const word of (query.search ?? '').split(/\s+/).filter(Boolean)) {
    const pattern = new RegExp(escapeRegex(word), 'i');
    filter.$and = [...(filter.$and ?? []), { $or: [{ 'company.name': pattern }, { 'company.website': pattern }, { 'company.email': pattern }, { 'company.phone': pattern }, { 'contact.fullName': pattern }, { 'contact.email': pattern }, { 'contact.designation': pattern }] }];
  }
  return filter;
}

const RECORD_POPULATE = [
  { path: 'jobId', select: 'name' },
  { path: 'match.companyId', select: 'name companyCode website email phone city state', options: { withDeleted: true } },
  { path: 'match.contactId', select: 'firstName lastName email phone designation', options: { withDeleted: true } },
  { path: 'imported.companyId', select: 'name companyCode', options: { withDeleted: true } },
  { path: 'imported.contactId', select: 'firstName lastName', options: { withDeleted: true } },
  { path: 'imported.leadId', select: 'leadNumber title', options: { withDeleted: true } },
];

export function presentRecord(record) {
  const json = record.toJSON();
  const ref = (value) => (value && typeof value === 'object' && value._id ? { ...value, id: String(value._id), _id: undefined } : value);
  const job = record.populated('jobId') ? { id: String(record.jobId._id), name: record.jobId.name } : null;
  return {
    ...json,
    jobId: job?.id ?? String(record.jobId),
    job,
    match: { ...json.match, company: record.populated('match.companyId') ? ref(record.match.companyId?.toObject?.() ?? null) : null, contact: record.populated('match.contactId') ? ref(record.match.contactId?.toObject?.() ?? null) : null, companyId: record.match.companyId?._id ? String(record.match.companyId._id) : record.match.companyId ? String(record.match.companyId) : undefined, contactId: record.match.contactId?._id ? String(record.match.contactId._id) : record.match.contactId ? String(record.match.contactId) : undefined },
    imported: json.imported?.at
      ? {
          ...json.imported,
          company: record.imported.companyId?._id ? { id: String(record.imported.companyId._id), name: record.imported.companyId.name, companyCode: record.imported.companyId.companyCode } : null,
          contact: record.imported.contactId?._id ? { id: String(record.imported.contactId._id), fullName: [record.imported.contactId.firstName, record.imported.contactId.lastName].join(' ') } : null,
          lead: record.imported.leadId?._id ? { id: String(record.imported.leadId._id), leadNumber: record.imported.leadId.leadNumber, title: record.imported.leadId.title } : null,
          companyId: undefined,
          contactId: undefined,
          leadId: undefined,
        }
      : null,
  };
}

export async function listRecords(query, actor) {
  const { page, limit, sortBy, sortOrder } = query;
  const filter = await recordFilter(query, actor);
  const sortField = { company: 'company.name', contact: 'contact.fullName', quality: 'quality', scrapedAt: 'scrapedAt', state: 'company.state', city: 'company.city', match: 'match.status' }[sortBy] ?? 'scrapedAt';
  const [records, total] = await Promise.all([
    ScrapedRecord.find(filter)
      .sort({ [sortField]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(RECORD_POPULATE),
    ScrapedRecord.countDocuments(filter),
  ]);
  return { records: records.map(presentRecord), pagination: paginationMeta({ page, limit }, total) };
}

// All ids matching the filters - for "select all N results".
export async function listRecordIds(query, actor) {
  const ids = await ScrapedRecord.find(await recordFilter(query, actor)).select('_id').limit(5000).lean();
  return ids.map((r) => String(r._id));
}

export async function findRecord(id, actor) {
  const record = await ScrapedRecord.findOne({ _id: id, ...(await visibleJobFilter(actor)) }).populate(RECORD_POPULATE);
  if (!record) throw ApiError.notFound(MESSAGES.SCRAPE_RECORD_NOT_FOUND);
  return record;
}

export async function getRecord(id, actor) {
  return presentRecord(await findRecord(id, actor));
}

// The user's corrections and choices before importing: cleaned fields, the
// decision for a possible duplicate, which CRM company it is.
export async function updateRecord(id, input, actor) {
  const record = await findRecord(id, actor);
  if (record.importStatus === SCRAPE_IMPORT_STATUS.IMPORTED) throw ApiError.conflict(MESSAGES.SCRAPE_ALREADY_IMPORTED);
  if (input.company) for (const [field, value] of Object.entries(input.company)) record.company[field] = value || undefined;
  if (input.contact) {
    for (const [field, value] of Object.entries(input.contact)) record.contact[field] = value || undefined;
    if (input.contact.firstName !== undefined || input.contact.lastName !== undefined) record.contact.fullName = [record.contact.firstName, record.contact.lastName].filter(Boolean).join(' ');
  }
  if (input.company?.email !== undefined) record.company.emails = [input.company.email, ...record.company.emails.filter((e) => e !== input.company.email)].filter(Boolean);
  if (input.company?.phone !== undefined) record.company.phones = [input.company.phone, ...record.company.phones.filter((p) => p !== input.company.phone)].filter(Boolean);
  if (input.decision !== undefined) record.decision = input.decision;
  if (input.matchCompanyId !== undefined) record.match.companyId = input.matchCompanyId || undefined;
  if (input.company || input.contact) {
    const plain = record.toObject();
    Object.assign(record, qualityOf(plain));
    record.keys = keysFor(plain.company, plain.type === 'contact' ? plain.contact : null);
  }
  if (record.importStatus === SCRAPE_IMPORT_STATUS.SKIPPED || record.importStatus === SCRAPE_IMPORT_STATUS.FAILED) {
    record.importStatus = SCRAPE_IMPORT_STATUS.PENDING;
    record.importError = undefined;
  }
  await record.save();
  return getRecord(id, actor);
}

// Checks results against the CRM again (after edits, or after others were imported).
export async function recheckRecords(ids, actor) {
  const records = await ScrapedRecord.find({ _id: { $in: ids }, importStatus: { $ne: SCRAPE_IMPORT_STATUS.IMPORTED }, ...(await visibleJobFilter(actor)) });
  const plain = records.map((r) => ({ ...r.toObject(), match: {} }));
  await matchRecords(plain);
  for (const [i, record] of records.entries()) {
    record.match = plain[i].match;
    await record.save();
  }
  return records.length;
}

// --- pages, figures, export ----------------------------------------------------------------------

export async function listPages({ jobId, status, page, limit }, actor) {
  const filter = { ...(await visibleJobFilter(actor, jobId)), ...(status ? { status } : {}) };
  const [pages, total] = await Promise.all([ScrapePage.find(filter).sort({ at: -1 }).skip((page - 1) * limit).limit(limit).populate({ path: 'jobId', select: 'name' }), ScrapePage.countDocuments(filter)]);
  return {
    pages: pages.map((p) => ({ ...p.toJSON(), jobId: String(p.jobId?._id ?? p.jobId), job: p.jobId?.name ? { id: String(p.jobId._id), name: p.jobId.name } : null })),
    pagination: paginationMeta({ page, limit }, total),
  };
}

export async function getStats(actor) {
  const jobs = ownOnly(actor);
  const records = await visibleJobFilter(actor);
  const [jobCount, running, byStatus, imported, failedPages] = await Promise.all([
    ScrapeJob.countDocuments(jobs),
    ScrapeJob.countDocuments({ ...jobs, status: { $in: [SCRAPE_JOB_STATUS.QUEUED, SCRAPE_JOB_STATUS.RUNNING] } }),
    ScrapedRecord.aggregate([{ $match: records }, { $group: { _id: { type: '$type', match: '$match.status' }, count: { $sum: 1 } } }]),
    ScrapedRecord.countDocuments({ ...records, importStatus: SCRAPE_IMPORT_STATUS.IMPORTED }),
    ScrapePage.countDocuments({ ...records, status: SCRAPE_PAGE_STATUS.FAILED }),
  ]);
  const of = (type, match) => byStatus.filter((g) => (!type || g._id.type === type) && (!match || g._id.match === match)).reduce((n, g) => n + g.count, 0);
  return {
    jobs: jobCount,
    running,
    records: of(),
    newCompanies: of('company', SCRAPE_MATCH.NEW),
    newContacts: of('contact', SCRAPE_MATCH.NEW),
    duplicates: of(null, SCRAPE_MATCH.POSSIBLE) + of(null, SCRAPE_MATCH.EXISTING),
    imported,
    failedPages,
    limits: LIMITS,
  };
}

const EXPORT_COLUMNS = [
  ['Type', (r) => (r.type === 'company' ? 'Company' : 'Contact')],
  ['Company', (r) => r.company?.name],
  ['Website', (r) => r.company?.website],
  ['Company email', (r) => r.company?.email],
  ['Company phone', (r) => r.company?.phone],
  ['Other emails', (r) => (r.company?.emails ?? []).slice(1).join(', ')],
  ['Other phones', (r) => (r.company?.phones ?? []).slice(1).join(', ')],
  ['Address', (r) => r.company?.address],
  ['City', (r) => r.company?.city],
  ['State', (r) => r.company?.state],
  ['Country', (r) => r.company?.country],
  ['Postal code', (r) => r.company?.postalCode],
  ['Category', (r) => r.company?.category],
  ['Contact', (r) => r.contact?.fullName],
  ['Designation', (r) => r.contact?.designation],
  ['Contact email', (r) => r.contact?.email],
  ['Contact phone', (r) => r.contact?.phone],
  ['Profile URL', (r) => r.contact?.profileUrl],
  ['In the CRM', (r) => ({ new: 'New', possible: 'Possible duplicate', existing: 'Existing' })[r.match?.status]],
  ['Quality %', (r) => r.quality],
  ['Imported', (r) => ({ pending: 'No', imported: 'Yes', skipped: 'Skipped', failed: 'Failed' })[r.importStatus]],
  ['Source URL', (r) => r.sourceUrl],
  ['Scraped', (r) => (r.scrapedAt ? new Date(r.scrapedAt).toISOString().slice(0, 10) : '')],
  ['Job', (r) => r.jobId?.name],
];
export const EXPORT_MAX_ROWS = 10000;

// -> { buffer, fileName, type }
export async function exportRecords(query, format, actor) {
  const records = await ScrapedRecord.find(await recordFilter(query, actor)).sort({ scrapedAt: -1, _id: 1 }).limit(EXPORT_MAX_ROWS).populate({ path: 'jobId', select: 'name' }).lean();
  const rows = records.map((r) => EXPORT_COLUMNS.map(([, get]) => get(r) ?? ''));
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'csv') {
    // Cells that start like a formula are prefixed, so a spreadsheet does not run them.
    const cell = (value) => {
      let text = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = [EXPORT_COLUMNS.map(([h]) => h), ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
    return { buffer: Buffer.from(`\uFEFF${csv}`, 'utf8'), fileName: `scraped-results-${stamp}.csv`, type: 'text/csv; charset=utf-8' };
  }
  const data = [EXPORT_COLUMNS.map(([h]) => ({ value: h, fontWeight: 'bold', backgroundColor: '#E8EEF7' })), ...rows.map((row) => row.map((value) => (value === '' ? null : typeof value === 'number' ? { value, type: Number } : { value: String(value), type: String })))];
  const buffer = await writeExcelFile([{ data, sheet: 'Scraped results', columns: EXPORT_COLUMNS.map(([h]) => ({ width: Math.min(40, Math.max(12, h.length + 6)) })), stickyRowsCount: 1 }]).toBuffer();
  return { buffer, fileName: `scraped-results-${stamp}.xlsx`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}
