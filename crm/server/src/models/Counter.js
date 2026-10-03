import mongoose from 'mongoose';

// One document per numbered series (e.g. "company"); `seq` is the last number issued.
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

export default mongoose.model('Counter', counterSchema);
