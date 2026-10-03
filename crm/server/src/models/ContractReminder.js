import mongoose from 'mongoose';
import { jsonOptions } from './shared/json.js';

const { ObjectId } = mongoose.Schema.Types;

// One expiry reminder that was sent for a contract. The unique key - contract,
// period and end date - is claimed before anything is sent, so a reminder goes
// out once even if two servers run the check at the same time; a contract
// whose end date moves (renewal) is reminded again for the new date.
const contractReminderSchema = new mongoose.Schema(
  {
    contractId: { type: ObjectId, ref: 'Contract', required: true, index: true },
    // The period it was sent for, as it was then (the period may change later).
    daysBefore: { type: Number, required: true },
    endDate: { type: Date, required: true },
    // Days to the end date when it was sent.
    daysLeft: { type: Number, required: true },
    recipientId: { type: ObjectId, ref: 'User' },
    // The follow-up created for the recipient.
    followUpId: { type: ObjectId, ref: 'FollowUp' },
    emailedAt: { type: Date },
    // Why it was not emailed (not configured, no address, server refused).
    emailError: { type: String, maxlength: 500 },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: jsonOptions({ aliases: { recipientId: 'recipient', followUpId: 'followUp' } }),
  }
);

contractReminderSchema.index({ contractId: 1, daysBefore: 1, endDate: 1 }, { unique: true });

export default mongoose.model('ContractReminder', contractReminderSchema);
