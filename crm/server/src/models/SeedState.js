import mongoose from 'mongoose';

// Remembers which one-time seeds have been applied, so initial values are not
// re-created after an administrator has changed or removed them.
const seedStateSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    appliedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

export default mongoose.model('SeedState', seedStateSchema);
