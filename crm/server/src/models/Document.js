import mongoose from 'mongoose';
import env from '../config/env.js';
import { jsonOptions } from './shared/json.js';

const { ObjectId } = mongoose.Schema.Types;

// The details of one uploaded file. The file itself is in object storage (see
// services/storage.service.js) - never in MongoDB.
const documentSchema = new mongoose.Schema(
  {
    // The name it was uploaded with, cleaned; data only, never a path.
    fileName: { type: String, required: true, trim: true, maxlength: 255 },
    // Its MIME type.
    fileType: { type: String, required: true },
    // In bytes.
    fileSize: { type: Number, required: true, min: 0 },
    // The record it belongs to: entityType names the kind (see
    // services/document.service.js) and entityId is that record's id.
    entityType: { type: String, required: true, immutable: true },
    entityId: { type: ObjectId, required: true, immutable: true },
    uploadedBy: { type: ObjectId, ref: 'User', index: true },
    // Where the file is in storage. Never sent to clients.
    storageKey: { type: String, required: true },
    storageDriver: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: jsonOptions({ omit: ['storageKey', 'storageDriver'], aliases: { uploadedBy: 'uploadedByUser' } }),
  }
);

// Where to get the file: the API's own download route, which checks who is
// asking. Storage addresses are never handed out.
documentSchema.virtual('fileUrl').get(function fileUrl() {
  return `${env.apiPrefix}/documents/${this.id}/download`;
});

documentSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

export default mongoose.model('Document', documentSchema);
