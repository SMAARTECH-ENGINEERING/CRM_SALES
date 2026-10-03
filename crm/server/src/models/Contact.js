import mongoose from 'mongoose';
import { CONTACT_METHODS, CONTACT_STATUS } from '../constants/index.js';
import { jsonOptions } from './shared/json.js';
import { searchable } from './shared/searchable.js';

const { ObjectId } = mongoose.Schema.Types;

const contactSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 50 },
    lastName: { type: String, required: true, trim: true, maxlength: 50 },
    // Every contact belongs to exactly one company.
    companyId: { type: ObjectId, ref: 'Company', required: true, index: true },
    designation: { type: String, trim: true, maxlength: 100 },
    // The contact's department at their company (free text - not our Department list).
    department: { type: String, trim: true, maxlength: 100 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 20 },
    alternatePhone: { type: String, trim: true, maxlength: 20 },
    preferredContactMethod: { type: String, enum: Object.keys(CONTACT_METHODS) },
    status: {
      type: String,
      enum: Object.values(CONTACT_STATUS),
      default: CONTACT_STATUS.ACTIVE,
      index: true,
    },
    notes: { type: String, trim: true, maxlength: 5000 },
    createdBy: { type: ObjectId, ref: 'User' },
    // Soft delete: the record is kept so references from other records stay valid.
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: jsonOptions({
      omit: ['deletedAt'],
      aliases: { companyId: 'company', createdBy: 'createdByUser' },
    }),
  }
);

contactSchema.index({ companyId: 1, email: 1 });

contactSchema.virtual('fullName').get(function fullName() {
  return [this.firstName, this.lastName].filter(Boolean).join(' ');
});

// Deleted contacts are invisible to every read unless a query opts in with
// .setOptions({ withDeleted: true }).
function excludeDeleted() {
  if (!this.getOptions().withDeleted) this.where({ deletedAt: null });
}
contactSchema.pre(/^find/, excludeDeleted);
contactSchema.pre('countDocuments', excludeDeleted);

// Found by global search on these fields.
searchable(contactSchema, ['firstName', 'lastName', 'email', 'phone', 'alternatePhone', 'designation']);

export default mongoose.model('Contact', contactSchema);
