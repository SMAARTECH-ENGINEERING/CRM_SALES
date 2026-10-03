import mongoose from 'mongoose';
import { jsonOptions } from './shared/json.js';

const { ObjectId } = mongoose.Schema.Types;

// A checkpoint in a project. Tasks may belong to one.
const milestoneSchema = new mongoose.Schema(
  {
    projectId: { type: ObjectId, ref: 'Project', required: true, immutable: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    dueDate: { type: Date },
    // Set when the milestone is marked reached.
    completedAt: { type: Date },
    createdBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: jsonOptions({ aliases: { createdBy: 'createdByUser' } }) }
);

export default mongoose.model('Milestone', milestoneSchema);
