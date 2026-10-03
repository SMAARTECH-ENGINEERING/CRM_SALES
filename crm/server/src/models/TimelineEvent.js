import mongoose from 'mongoose';
import { TIMELINE_ACTIONS } from '../constants/index.js';
import { jsonOptions } from './shared/json.js';

const { ObjectId } = mongoose.Schema.Types;

// What happened to a record, by whom and when. Append-only.
const timelineEventSchema = new mongoose.Schema(
  {
    entityType: { type: String, required: true },
    entityId: { type: ObjectId, required: true },
    action: { type: String, required: true, enum: TIMELINE_ACTIONS },
    // Optional one-line description, e.g. what a conversion produced.
    summary: { type: String, trim: true, maxlength: 500 },
    // For updates: one entry per changed field, with readable before/after values.
    changes: [
      {
        _id: false,
        field: { type: String, required: true },
        label: { type: String, required: true },
        from: { type: String },
        to: { type: String },
      },
    ],
    actorId: { type: ObjectId, ref: 'User' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: jsonOptions({ aliases: { actorId: 'actor' } }),
  }
);

timelineEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

export default mongoose.model('TimelineEvent', timelineEventSchema);
