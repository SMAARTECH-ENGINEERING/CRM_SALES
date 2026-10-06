import mongoose from 'mongoose';
import { SCRAPE_DATA_TYPE, SCRAPE_JOB_STATUS } from '../constants/index.js';
import { jsonOptions } from './shared/json.js';

const { ObjectId } = mongoose.Schema.Types;

// One run of the web data scraper: where to look, how carefully, and what came
// of it. Its results are ScrapedRecords; the pages it visited are ScrapePages.
// Nothing here is a CRM record until the user imports it.
const scrapeJobSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    // The addresses to start from.
    targets: { type: [String], required: true },
    dataType: { type: String, enum: Object.values(SCRAPE_DATA_TYPE), default: SCRAPE_DATA_TYPE.BOTH },
    // What kind of business is being looked for - from the Industry list.
    industryId: { type: ObjectId, ref: 'Industry' },
    settings: {
      maxPages: { type: Number, min: 1 },
      maxRecords: { type: Number, min: 1 },
      maxDepth: { type: Number, min: 0 },
      delayMs: { type: Number, min: 0 },
      sameDomain: { type: Boolean, default: true },
      followLinks: { type: Boolean, default: true },
      extract: {
        emails: { type: Boolean, default: true },
        phones: { type: Boolean, default: true },
        companyNames: { type: Boolean, default: true },
        addresses: { type: Boolean, default: true },
        websites: { type: Boolean, default: true },
        contactNames: { type: Boolean, default: true },
        jobTitles: { type: Boolean, default: true },
      },
    },
    status: { type: String, enum: Object.values(SCRAPE_JOB_STATUS), default: SCRAPE_JOB_STATUS.QUEUED, index: true },
    // Why it failed or stopped, for the user.
    message: { type: String, trim: true, maxlength: 500 },
    stats: {
      pagesVisited: { type: Number, default: 0 },
      pagesFailed: { type: Number, default: 0 },
      records: { type: Number, default: 0 },
      companies: { type: Number, default: 0 },
      contacts: { type: Number, default: 0 },
      new: { type: Number, default: 0 },
      possible: { type: Number, default: 0 },
      existing: { type: Number, default: 0 },
      imported: { type: Number, default: 0 },
    },
    // The job this one re-runs.
    rerunOf: { type: ObjectId, ref: 'ScrapeJob' },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    createdBy: { type: ObjectId, ref: 'User', index: true },
  },
  { timestamps: true, toJSON: jsonOptions({ aliases: { industryId: 'industry', createdBy: 'createdByUser' } }) }
);

scrapeJobSchema.index({ createdAt: -1 });

export default mongoose.model('ScrapeJob', scrapeJobSchema);
