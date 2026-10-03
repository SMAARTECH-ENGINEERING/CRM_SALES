import mongoose from 'mongoose';
import { AUDIT_ACTION } from '../constants/index.js';
import { jsonOptions } from './shared/json.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;

// One thing somebody did: who, what, to which record, from where and when.
// Append-only - there is no API to change or remove an entry, and the model
// refuses updates and deletes (see the guards below).
const auditLogSchema = new mongoose.Schema(
  {
    // Who did it. Empty for a failed sign-in (nobody was identified).
    userId: { type: ObjectId, ref: 'User', index: true },
    // The organization that user belonged to at the time.
    organizationId: { type: ObjectId, ref: 'Organization', index: true },
    action: { type: String, required: true, enum: Object.values(AUDIT_ACTION), index: true },
    // The kind of record ("lead", "role", ...) and which one.
    entityType: { type: String, index: true },
    entityId: { type: ObjectId, index: true },
    // For a change: the fields that changed, before and after. For a create,
    // newData is the record; for a delete, oldData is. Secrets are removed
    // before anything is stored (see audit.service.js).
    oldData: { type: Mixed },
    newData: { type: Mixed },
    ipAddress: { type: String },
    userAgent: { type: String, maxlength: 500 },
    // The request that did it, and how it ended.
    method: { type: String },
    path: { type: String, maxlength: 500 },
    statusCode: { type: Number },
    // false: it was attempted and refused (a failed sign-in, for example).
    success: { type: Boolean, default: true, index: true },
    timestamp: { type: Date, default: Date.now, immutable: true, index: true },
  },
  {
    // `timestamp` is the only date; nothing is ever updated.
    timestamps: false,
    minimize: false,
    toJSON: jsonOptions({ aliases: { userId: 'user', organizationId: 'organization' } }),
  }
);

auditLogSchema.index({ entityType: 1, entityId: 1, timestamp: -1 });

// An audit trail that can be edited is not one.
const refuse = () => {
  throw new Error('Audit log entries cannot be changed or deleted');
};
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  auditLogSchema.pre(operation, refuse);
}
auditLogSchema.pre('save', function onlyNew() {
  if (!this.isNew) refuse();
});

export default mongoose.model('AuditLog', auditLogSchema);
