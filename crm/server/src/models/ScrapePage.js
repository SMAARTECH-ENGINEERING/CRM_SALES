import mongoose from 'mongoose';
import { SCRAPE_PAGE_STATUS } from '../constants/index.js';
import { jsonOptions } from './shared/json.js';

const { ObjectId } = mongoose.Schema.Types;

// A page a scraping job visited (or chose not to): what it found, or why it failed.
const scrapePageSchema = new mongoose.Schema(
  {
    jobId: { type: ObjectId, ref: 'ScrapeJob', required: true, index: true },
    url: { type: String, required: true, maxlength: 2048 },
    depth: { type: Number, default: 0 },
    status: { type: String, enum: Object.values(SCRAPE_PAGE_STATUS), required: true, index: true },
    // For failed and skipped pages: timeout, robots, access_denied, http_error,
    // not_html, too_large, invalid_html, blocked_address, unreachable.
    reason: { type: String, maxlength: 40 },
    // The same, for people.
    detail: { type: String, maxlength: 300 },
    httpStatus: { type: Number },
    recordsFound: { type: Number, default: 0 },
    at: { type: Date, default: Date.now },
  },
  { toJSON: jsonOptions() }
);

scrapePageSchema.index({ status: 1, at: -1 });

export default mongoose.model('ScrapePage', scrapePageSchema);
