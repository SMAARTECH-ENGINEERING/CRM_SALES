import mongoose from 'mongoose';
import { ACTIVITY_STATUS, WORK_PRIORITY } from '../constants/index.js';
import { jsonOptions } from './shared/json.js';
import { softDelete } from './shared/softDelete.js';

const { ObjectId } = mongoose.Schema.Types;

// Something done, or to be done, about one or more records: a call with a
// contact about a lead, a site visit to a company, and so on.
const activitySchema = new mongoose.Schema(
  {
    typeId: { type: ObjectId, ref: 'ActivityType', required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000 },

    // What the activity is about. At least one is set; companyId is filled in
    // from the others where they imply a company.
    companyId: { type: ObjectId, ref: 'Company', index: true },
    contactId: { type: ObjectId, ref: 'Contact', index: true },
    leadId: { type: ObjectId, ref: 'Lead', index: true },
    opportunityId: { type: ObjectId, ref: 'Opportunity', index: true },
    customerId: { type: ObjectId, ref: 'Customer', index: true },
    projectId: { type: ObjectId, ref: 'Project', index: true },
    ticketId: { type: ObjectId, ref: 'Ticket', index: true },
    contractId: { type: ObjectId, ref: 'Contract', index: true },

    assignedTo: { type: ObjectId, ref: 'User', index: true },
    dueDate: { type: Date },
    completedAt: { type: Date },
    status: {
      type: String,
      enum: Object.values(ACTIVITY_STATUS),
      default: ACTIVITY_STATUS.PENDING,
      index: true,
    },
    priority: { type: String, enum: Object.values(WORK_PRIORITY), default: WORK_PRIORITY.MEDIUM },
    createdBy: { type: ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: jsonOptions({
      omit: ['deletedAt'],
      aliases: {
        typeId: 'type',
        companyId: 'company',
        contactId: 'contact',
        leadId: 'lead',
        opportunityId: 'opportunity',
        customerId: 'customer',
        projectId: 'project',
        ticketId: 'ticket',
        contractId: 'contract',
        assignedTo: 'assignedToUser',
        createdBy: 'createdByUser',
      },
    }),
  }
);

softDelete(activitySchema);

export default mongoose.model('Activity', activitySchema);
