import mongoose from 'mongoose';
import env from '../config/env.js';
import { jsonOptions } from './shared/json.js';
import { searchable } from './shared/searchable.js';

const { ObjectId } = mongoose.Schema.Types;

// An earlier version of a document's file, kept when a new one is saved.
const versionSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true, min: 1 },
    fileName: { type: String, required: true, trim: true, maxlength: 255 },
    fileType: { type: String, required: true },
    fileSize: { type: Number, required: true, min: 0 },
    storageKey: { type: String, required: true },
    storageDriver: { type: String, required: true },
    uploadedBy: { type: ObjectId, ref: 'User' },
    // When this version was saved.
    createdAt: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 300 },
  },
  { _id: false }
);

// The details of one uploaded file. The file itself is in object storage (see
// services/storage.service.js) - never in MongoDB. The fields at the top level
// are the current version; earlier ones are in `versions`.
const documentSchema = new mongoose.Schema(
  {
    // The name it was uploaded with (or renamed to), cleaned; data only, never a path.
    fileName: { type: String, required: true, trim: true, maxlength: 255 },
    // Its MIME type.
    fileType: { type: String, required: true },
    // In bytes.
    fileSize: { type: Number, required: true, min: 0 },
    // The record it belongs to: entityType names the kind (see
    // services/document.service.js) and entityId is that record's id.
    entityType: { type: String, required: true, immutable: true },
    entityId: { type: ObjectId, required: true, immutable: true },
    // The company that record belongs to, and how the record is named - kept
    // here so documents can be found by customer and by record without a join.
    companyId: { type: ObjectId, ref: 'Company', index: true },
    relatedLabel: { type: String, trim: true, maxlength: 300 },
    // What it is and where it stands: both from administrator-managed lists.
    documentTypeId: { type: ObjectId, ref: 'DocumentType', index: true },
    statusId: { type: ObjectId, ref: 'DocumentStatus', index: true },
    uploadedBy: { type: ObjectId, ref: 'User', index: true },
    // Who saved the current version.
    updatedBy: { type: ObjectId, ref: 'User' },
    // The current version's number, and the earlier ones.
    version: { type: Number, default: 1, min: 1 },
    versions: { type: [versionSchema], default: [] },
    // Where the file is in storage. Never sent to clients.
    storageKey: { type: String, required: true },
    storageDriver: { type: String, required: true },
  },
  {
    timestamps: true,
    toJSON: jsonOptions({
      omit: ['storageKey', 'storageDriver', 'versions'],
      aliases: { uploadedBy: 'uploadedByUser', updatedBy: 'updatedByUser', documentTypeId: 'documentType', statusId: 'status' },
    }),
  }
);

// Where to get the file: the API's own download route, which checks who is
// asking. Storage addresses are never handed out.
documentSchema.virtual('fileUrl').get(function fileUrl() {
  return `${env.apiPrefix}/documents/${this.id}/download`;
});

documentSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
documentSchema.index({ updatedAt: -1 });

// Found by global search by its name and by the record it belongs to.
searchable(documentSchema, ['fileName', 'relatedLabel']);

export default mongoose.model('Document', documentSchema);
