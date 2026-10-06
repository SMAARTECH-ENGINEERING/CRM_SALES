import Joi from 'joi';
import { PAGINATION, SCRAPE_DATA_TYPE, SCRAPE_DECISION, SCRAPE_IMPORT_STATUS, SCRAPE_JOB_STATUS, SCRAPE_MATCH, SCRAPE_PAGE_STATUS } from '../constants/index.js';
import { LIMITS } from '../services/scraper/crawler.js';
import { IMPORT_BATCH } from '../services/scraperImport.service.js';
import { objectId } from './common.validator.js';

const page = { page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE), limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT) };
const reference = objectId.allow('', null);
const text = (max) => Joi.string().trim().max(max).allow('', null);

// A new job. Every limit has a safe default and a ceiling.
export const createJobSchema = Joi.object({
  name: Joi.string().trim().min(2).max(150).required(),
  targets: Joi.array().items(Joi.string().trim().max(2048)).min(1).max(LIMITS.maxTargets).required(),
  dataType: Joi.string().valid(...Object.values(SCRAPE_DATA_TYPE)).default(SCRAPE_DATA_TYPE.BOTH),
  industryId: reference,
  settings: Joi.object({
    maxPages: Joi.number().integer().min(1).max(LIMITS.maxPages).default(20),
    maxRecords: Joi.number().integer().min(1).max(LIMITS.maxRecords).default(200),
    maxDepth: Joi.number().integer().min(0).max(LIMITS.maxDepth).default(1),
    delayMs: Joi.number().integer().min(1000).max(LIMITS.maxDelayMs).default(2000),
    sameDomain: Joi.boolean().default(true),
    followLinks: Joi.boolean().default(true),
    extract: Joi.object({
      emails: Joi.boolean().default(true),
      phones: Joi.boolean().default(true),
      companyNames: Joi.boolean().default(true),
      addresses: Joi.boolean().default(true),
      websites: Joi.boolean().default(true),
      contactNames: Joi.boolean().default(true),
      jobTitles: Joi.boolean().default(true),
    }).default(),
  }).default(),
});

export const listJobsQuery = Joi.object({
  ...page,
  search: Joi.string().trim().max(100).allow(''),
  status: Joi.string().valid(...Object.values(SCRAPE_JOB_STATUS)).empty(''),
  sortBy: Joi.string().valid('createdAt', 'name', 'status', 'finishedAt').default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});

const recordFilters = {
  jobId: objectId.empty(''),
  type: Joi.string().valid('company', 'contact').empty(''),
  match: Joi.string().valid(...Object.values(SCRAPE_MATCH)).empty(''),
  importStatus: Joi.string().valid(...Object.values(SCRAPE_IMPORT_STATUS)).empty(''),
  // Possible duplicates and records already in the CRM.
  duplicates: Joi.boolean().empty(''),
  hasEmail: Joi.boolean().empty(''),
  hasPhone: Joi.boolean().empty(''),
  // City, state, address, country or postal code.
  location: Joi.string().trim().max(100).empty(''),
  // Category, description or name.
  industry: Joi.string().trim().max(100).empty(''),
  minQuality: Joi.number().integer().min(0).max(100).empty(''),
  search: Joi.string().trim().max(200).empty(''),
  from: Joi.date().iso().empty(''),
  to: Joi.date().iso().empty(''),
};

export const listRecordsQuery = Joi.object({
  ...page,
  ...recordFilters,
  sortBy: Joi.string().valid('scrapedAt', 'company', 'contact', 'quality', 'state', 'city', 'match').default('scrapedAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
});
export const recordIdsQuery = Joi.object(recordFilters);
export const exportQuery = Joi.object({ ...recordFilters, format: Joi.string().valid('xlsx', 'csv').default('xlsx') });

export const updateRecordSchema = Joi.object({
  decision: Joi.string().valid(...Object.values(SCRAPE_DECISION)).allow(null),
  // Which CRM company this is, when the user picks it.
  matchCompanyId: reference,
  company: Joi.object({
    name: text(200),
    website: text(2048),
    email: text(254),
    phone: text(30),
    address: text(500),
    city: text(100),
    state: text(100),
    country: text(100),
    postalCode: text(12),
    category: text(200),
  }),
  contact: Joi.object({
    firstName: text(50),
    lastName: text(50),
    designation: text(100),
    email: text(254),
    phone: text(30),
  }),
}).min(1);

export const recheckSchema = Joi.object({ recordIds: Joi.array().items(objectId).min(1).max(500).required() });

const importBody = (max) => Joi.object({
  recordIds: Joi.array().items(objectId).min(1).max(max).unique().required(),
  options: Joi.object({
    createLead: Joi.boolean().default(false),
    lead: Joi.object({
      // "{company}" is replaced with the company name.
      title: text(200),
      // What the customer may need - entered by the user, never taken from the website.
      requirement: text(2000),
      sourceId: reference,
      statusId: reference,
      priorityId: reference,
      assignedTo: reference,
      tags: Joi.array().items(Joi.string().trim().max(30)).max(10),
    }).default({}),
    industryId: reference,
    companyTypeId: reference,
    assignedTo: reference,
  }).default({}),
});
// The import runs in batches; the preview covers everything selected at once.
export const importSchema = importBody(IMPORT_BATCH);
export const importPreviewSchema = importBody(1000);

export const listPagesQuery = Joi.object({ ...page, jobId: objectId.empty(''), status: Joi.string().valid(...Object.values(SCRAPE_PAGE_STATUS)).empty('') });
