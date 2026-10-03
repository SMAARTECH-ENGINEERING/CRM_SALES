import mongoose from 'mongoose';
import { jsonOptions } from './shared/json.js';
import { softDelete } from './shared/softDelete.js';

const { ObjectId } = mongoose.Schema.Types;

// A piece of work inside a project.
const projectTaskSchema = new mongoose.Schema(
  {
    projectId: { type: ObjectId, ref: 'Project', required: true, immutable: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000 },
    // Optional; must be a milestone of the same project.
    milestoneId: { type: ObjectId, ref: 'Milestone', index: true },
    statusId: { type: ObjectId, ref: 'TaskStatus', required: true, index: true },
    priorityId: { type: ObjectId, ref: 'LeadPriority' },
    // The project manager or a team member.
    assignedTo: { type: ObjectId, ref: 'User', index: true },
    startDate: { type: Date },
    dueDate: { type: Date, index: true },
    // Set when the task enters a "done" status; cleared when it leaves it.
    completedAt: { type: Date },
    estimatedHours: { type: Number, min: 0 },
    createdBy: { type: ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: jsonOptions({
      omit: ['deletedAt'],
      aliases: {
        milestoneId: 'milestone',
        statusId: 'status',
        priorityId: 'priority',
        assignedTo: 'assignedToUser',
        createdBy: 'createdByUser',
      },
    }),
  }
);

softDelete(projectTaskSchema);

export default mongoose.model('ProjectTask', projectTaskSchema);
