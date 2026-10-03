import mongoose from 'mongoose';
import { jsonOptions } from './json.js';

// Fields shared by the lead configuration lists (sources, statuses, priorities).
export function createLeadConfigModel(modelName, extraFields = {}) {
  const schema = new mongoose.Schema(
    {
      name: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
      description: { type: String, trim: true, maxlength: 300 },
      // Position in dropdowns and lists (ascending).
      sortOrder: { type: Number, default: 0, index: true },
      // Inactive values stay on existing leads but are not offered for new ones.
      isActive: { type: Boolean, default: true },
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      ...extraFields,
    },
    { timestamps: true, toJSON: jsonOptions() }
  );

  return mongoose.model(modelName, schema);
}

export const colorField = { type: String, trim: true, lowercase: true, match: /^#[0-9a-f]{6}$/ };
// The value given to new leads when none is chosen. Exactly one per list.
export const defaultField = { type: Boolean, default: false };
