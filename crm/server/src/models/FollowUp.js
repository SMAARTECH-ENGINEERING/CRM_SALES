import mongoose from 'mongoose';
import { FOLLOW_UP_STATUS, WORK_PRIORITY } from '../constants/index.js';
import { jsonOptions } from './shared/json.js';

const { ObjectId } = mongoose.Schema.Types;

// Something to do about one record by a certain time.
const followUpSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, trim: true, maxlength: 5000 },
    // The record it is about: relatedType names the kind (see
    // services/relation.service.js) and relatedId is that record's id.
    relatedType: { type: String, required: true },
    relatedId: { type: ObjectId, required: true },
    assignedTo: { type: ObjectId, ref: 'User', index: true },
    dueDate: { type: Date, required: true },
    priority: { type: String, enum: Object.values(WORK_PRIORITY), default: WORK_PRIORITY.MEDIUM },
    status: {
      type: String,
      enum: Object.values(FOLLOW_UP_STATUS),
      default: FOLLOW_UP_STATUS.PENDING,
      index: true,
    },
    // When to be reminded; never after dueDate.
    reminderDate: { type: Date },
    completedAt: { type: Date },
    completedBy: { type: ObjectId, ref: 'User' },
    createdBy: { type: ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: jsonOptions({
      aliases: { assignedTo: 'assignedToUser', completedBy: 'completedByUser', createdBy: 'createdByUser' },
    }),
  }
);

followUpSchema.index({ relatedType: 1, relatedId: 1, status: 1, dueDate: 1 });
followUpSchema.index({ assignedTo: 1, status: 1, dueDate: 1 });

export default mongoose.model('FollowUp', followUpSchema);
