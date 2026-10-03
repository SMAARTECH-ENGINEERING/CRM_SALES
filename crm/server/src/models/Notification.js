import mongoose from 'mongoose';
import { NOTIFICATION_TYPE } from '../constants/index.js';
import { jsonOptions } from './shared/json.js';

const { ObjectId } = mongoose.Schema.Types;

// Something one user should know about. Each notification belongs to exactly
// one user; only that user can read, mark or delete it.
const notificationSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: 'User', required: true, immutable: true },
    type: { type: String, required: true, enum: Object.values(NOTIFICATION_TYPE) },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    // The record to open: entityType names the kind, entityId is its id.
    entityType: { type: String },
    entityId: { type: ObjectId },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    // For events found by a recurring check ("this follow-up is due"): the
    // same event is notified to the same user once. Never sent to clients.
    dedupeKey: { type: String },
    // Set instead of removing a notification that has a dedupeKey, so it is not sent again.
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: jsonOptions({ omit: ['dedupeKey', 'deletedAt'] }),
  }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);

export default mongoose.model('Notification', notificationSchema);
