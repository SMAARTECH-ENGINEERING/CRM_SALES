import mongoose from 'mongoose';
import { jsonOptions } from './shared/json.js';

export const COMPANY_PROFILE_KEY = 'default';

// Who *we* are: the details printed on quotations and other documents sent to
// customers. One document, edited on the Company profile screen. Nothing about
// the business is written in code.
const companyProfileSchema = new mongoose.Schema(
  {
    // There is exactly one profile.
    key: { type: String, default: COMPANY_PROFILE_KEY, unique: true, immutable: true },
    name: { type: String, trim: true, maxlength: 200 },
    legalName: { type: String, trim: true, maxlength: 200 },
    address: { type: String, trim: true, maxlength: 500 },
    city: { type: String, trim: true, maxlength: 100 },
    state: { type: String, trim: true, maxlength: 100 },
    country: { type: String, trim: true, maxlength: 100 },
    postalCode: { type: String, trim: true, maxlength: 12 },
    phone: { type: String, trim: true, maxlength: 20 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    website: { type: String, trim: true, maxlength: 2048 },
    // Address (https) of the logo image, shown in the app header.
    logo: { type: String, trim: true, maxlength: 2048 },
    gstNumber: { type: String, trim: true, uppercase: true, maxlength: 15 },
    panNumber: { type: String, trim: true, uppercase: true, maxlength: 10 },
    // Printed next to amounts, e.g. "INR". Amounts themselves are plain numbers.
    currency: { type: String, trim: true, uppercase: true, maxlength: 3 },
    // Printed at the foot of documents, e.g. where to pay.
    bankDetails: { type: String, trim: true, maxlength: 1000 },
    // Defaults for new quotations.
    quotationValidityDays: { type: Number, min: 1, max: 365, default: 30 },
    quotationTerms: { type: String, trim: true, maxlength: 5000 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOptions({ omit: ['key'] }) }
);

export default mongoose.model('CompanyProfile', companyProfileSchema);
