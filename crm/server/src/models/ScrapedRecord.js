import mongoose from 'mongoose';
import { SCRAPE_DECISION, SCRAPE_IMPORT_STATUS, SCRAPE_MATCH } from '../constants/index.js';
import { jsonOptions } from './shared/json.js';

const { ObjectId } = mongoose.Schema.Types;

// One result of a scraping job, as found on the web: a company, or a person
// at a company. It only becomes a CRM company / contact / lead when imported.
// Everything here is a scraped fact; nothing is assumed about what the
// business needs.
const scrapedRecordSchema = new mongoose.Schema(
  {
    jobId: { type: ObjectId, ref: 'ScrapeJob', required: true, index: true },
    type: { type: String, enum: ['company', 'contact'], required: true, index: true },
    company: {
      name: { type: String, trim: true, maxlength: 200 },
      website: { type: String, trim: true, maxlength: 2048 },
      email: { type: String, trim: true, lowercase: true, maxlength: 254 },
      phone: { type: String, trim: true, maxlength: 30 },
      // Every address / number found for it, the first being the one shown.
      emails: [{ type: String, maxlength: 254 }],
      phones: [{ type: String, maxlength: 30 }],
      address: { type: String, trim: true, maxlength: 500 },
      city: { type: String, trim: true, maxlength: 100 },
      state: { type: String, trim: true, maxlength: 100 },
      country: { type: String, trim: true, maxlength: 100 },
      postalCode: { type: String, trim: true, maxlength: 12 },
      category: { type: String, trim: true, maxlength: 200 },
      description: { type: String, trim: true, maxlength: 1000 },
    },
    contact: {
      firstName: { type: String, trim: true, maxlength: 50 },
      lastName: { type: String, trim: true, maxlength: 50 },
      fullName: { type: String, trim: true, maxlength: 120 },
      designation: { type: String, trim: true, maxlength: 100 },
      email: { type: String, trim: true, lowercase: true, maxlength: 254 },
      phone: { type: String, trim: true, maxlength: 30 },
      profileUrl: { type: String, trim: true, maxlength: 2048 },
    },
    // How it was found: the website's own details ("site"), structured data the
    // site publishes about itself ("structured"), or a listing of other
    // businesses on the page - a directory ("listing").
    origin: { type: String, enum: ['site', 'structured', 'listing'], default: 'site' },
    // Where it was found (the first page), and every page that mentioned it.
    sourceUrls: [{ type: String, maxlength: 2048 }],
    sourceUrl: { type: String, required: true, maxlength: 2048 },
    scrapedAt: { type: Date, default: Date.now },
    // Normalised forms, for finding duplicates.
    keys: {
      name: { type: String, index: true },
      domain: { type: String, index: true },
      emails: [String],
      phones: [String],
      person: String,
    },
    // 0-100: how complete it is, and what is missing.
    quality: { type: Number, default: 0 },
    missing: [String],
    // How it compares with the CRM (and with the other results of the job).
    match: {
      status: { type: String, enum: Object.values(SCRAPE_MATCH), default: SCRAPE_MATCH.NEW, index: true },
      companyId: { type: ObjectId, ref: 'Company' },
      contactId: { type: ObjectId, ref: 'Contact' },
      reasons: [String],
      // Another result of this job that looks like the same company or person.
      duplicateOf: { type: ObjectId, ref: 'ScrapedRecord' },
    },
    // The user's choice for the import; null = follow the match.
    decision: { type: String, enum: [...Object.values(SCRAPE_DECISION), null], default: null },
    importStatus: { type: String, enum: Object.values(SCRAPE_IMPORT_STATUS), default: SCRAPE_IMPORT_STATUS.PENDING, index: true },
    importError: { type: String, maxlength: 500 },
    imported: {
      companyId: { type: ObjectId, ref: 'Company' },
      contactId: { type: ObjectId, ref: 'Contact' },
      leadId: { type: ObjectId, ref: 'Lead' },
      action: { type: String, maxlength: 20 },
      at: Date,
      by: { type: ObjectId, ref: 'User' },
    },
  },
  { timestamps: true, toJSON: jsonOptions({ omit: ['keys'] }) }
);

scrapedRecordSchema.index({ jobId: 1, createdAt: 1 });
scrapedRecordSchema.index({ 'company.state': 1 });
scrapedRecordSchema.index({ 'company.city': 1 });

export default mongoose.model('ScrapedRecord', scrapedRecordSchema);
