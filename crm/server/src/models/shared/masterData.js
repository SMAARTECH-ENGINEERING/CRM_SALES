import mongoose from 'mongoose';
import { jsonOptions } from './json.js';

// Simple named lists that other records point to (industries, company types,
// organizations). They are data - nothing in code depends on their contents.
export function createMasterDataModel(modelName) {
  const schema = new mongoose.Schema(
    {
      name: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
      description: { type: String, trim: true, maxlength: 500 },
      // Inactive entries stay on existing records but are not offered for new ones.
      isActive: { type: Boolean, default: true },
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { timestamps: true, toJSON: jsonOptions() }
  );

  return mongoose.model(modelName, schema);
}
