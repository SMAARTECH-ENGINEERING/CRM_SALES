import path from 'node:path';
import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import Company from '../models/Company.js';
import Contact from '../models/Contact.js';
import Contract from '../models/Contract.js';
import Document from '../models/Document.js';
import Lead from '../models/Lead.js';
import Opportunity from '../models/Opportunity.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Project from '../models/Project.js';
import Quotation from '../models/Quotation.js';
import Ticket from '../models/Ticket.js';
import ApiError from '../utils/ApiError.js';
import { declarePermission, hasPermission } from '../utils/permissions.js';
import { escapeRegex, paginationMeta } from '../utils/query.js';
import { registerCompanySection } from './companySection.service.js';
import { getSettings } from './settings.service.js';
import { storageName } from './storage.service.js';
import { recordEvent } from './timeline.service.js';
import { cleanName, openFile, removeFiles, storeFiles } from './upload.service.js';

// What a document can belong to. `permission` is what a user needs to see that
// kind of record - and therefore its documents: documents.read alone opens
// nothing. A module that wants documents adds an entry here.
export const DOCUMENT_ENTITIES = Object.freeze({
  company: { Model: Company, permission: 'companies.read', select: 'companyCode name', label: (r) => r.name },
  contact: { Model: Contact, permission: 'contacts.read', select: 'firstName lastName', label: (r) => r.fullName },
  lead: { Model: Lead, permission: 'leads.read', select: 'leadNumber title', label: (r) => `${r.leadNumber} - ${r.title}` },
  opportunity: {
    Model: Opportunity,
    permission: 'opportunities.read',
    select: 'opportunityNumber name',
    label: (r) => `${r.opportunityNumber} - ${r.name}`,
  },
  quotation: { Model: Quotation, permission: 'quotations.read', select: 'quotationNumber', label: (r) => r.quotationNumber },
  order: { Model: Order, permission: 'orders.read', select: 'orderNumber', label: (r) => r.orderNumber },
  project: { Model: Project, permission: 'projects.read', select: 'projectNumber name', label: (r) => `${r.projectNumber} - ${r.name}` },
  ticket: { Model: Ticket, permission: 'tickets.read', select: 'ticketNumber subject', label: (r) => `${r.ticketNumber} - ${r.subject}` },
  contract: { Model: Contract, permission: 'contracts.read', select: 'contractNumber', label: (r) => r.contractNumber },
  payment: { Model: Payment, permission: 'payments.read', select: 'invoiceNumber', label: (r) => r.invoiceNumber },
});
export const DOCUMENT_ENTITY_TYPES = Object.freeze(Object.keys(DOCUMENT_ENTITIES));
for (const { permission } of Object.values(DOCUMENT_ENTITIES)) declarePermission(permission);
const DELETE_ANY = declarePermission('documents.delete');

// People may have been deleted since; their names should still show.
const UPLOADER = { path: 'uploadedBy', select: 'firstName lastName email', options: { withDeleted: true } };
// The upload field of POST /documents.
export const DOCUMENT_FIELD = 'files';

registerCompanySection('documents', { count: (companyId) => Document.countDocuments({ entityType: 'company', entityId: companyId }) });

// --- authorization -----------------------------------------------------------------

const canSee = (actor, entityType) => hasPermission(actor, DOCUMENT_ENTITIES[entityType].permission);
const readableTypes = (actor) => DOCUMENT_ENTITY_TYPES.filter((type) => canSee(actor, type));

function assertCanSee(actor, entityType) {
  if (!canSee(actor, entityType)) throw ApiError.forbidden(MESSAGES.DOCUMENT_ENTITY_FORBIDDEN);
}

// --- what a file must be ---------------------------------------------------------------

const ascii = (text) => (buffer) => buffer.subarray(0, text.length).toString('latin1') === text;
const bytes = (...values) => (buffer) => values.every((value, index) => buffer[index] === value);
const zip = (buffer) => ascii('PK\u0003\u0004')(buffer) || ascii('PK\u0005\u0006')(buffer);
const ole = bytes(0xd0, 0xcf, 0x11, 0xe0);

// How the content of a type must begin. A file that claims one of these types
// but does not look like it is refused - the type a client sends proves nothing.
const SIGNATURES = {
  'application/pdf': ascii('%PDF-'),
  'image/png': bytes(0x89, 0x50, 0x4e, 0x47),
  'image/jpeg': bytes(0xff, 0xd8, 0xff),
  'image/gif': ascii('GIF8'),
  'image/webp': (buffer) => ascii('RIFF')(buffer) && buffer.subarray(8, 12).toString('latin1') === 'WEBP',
  'application/zip': zip,
  'application/x-zip-compressed': zip,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': zip,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': zip,
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': zip,
  'application/msword': ole,
  'application/vnd.ms-excel': ole,
  'application/vnd.ms-powerpoint': ole,
};
const TEXT_SAMPLE_BYTES = 8192;
// Never accepted, whatever type they are sent as: programs and pages a browser would run.
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.dll', '.com', '.scr', '.msi', '.bat', '.cmd', '.ps1', '.vbs', '.js', '.mjs', '.jar', '.sh', '.php', '.html', '.htm', '.svg',
]);

function assertAcceptable(files) {
  const refuse = (status, message, file) =>
    new ApiError(status, message, [{ field: DOCUMENT_FIELD, message: `${message}: ${cleanName(file.originalname)}` }]);
  for (const file of files) {
    if (!file.size) throw refuse(HTTP_STATUS.BAD_REQUEST, MESSAGES.DOCUMENT_EMPTY_FILE, file);
    if (BLOCKED_EXTENSIONS.has(path.extname(cleanName(file.originalname)).toLowerCase())) {
      throw refuse(HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE, MESSAGES.DOCUMENT_EXTENSION, file);
    }
    const matches = SIGNATURES[file.mimetype];
    const isText = file.mimetype.startsWith('text/');
    if ((matches && !matches(file.buffer)) || (isText && file.buffer.subarray(0, TEXT_SAMPLE_BYTES).includes(0))) {
      throw refuse(HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE, MESSAGES.DOCUMENT_CONTENT_MISMATCH, file);
    }
  }
}

// --- helpers -----------------------------------------------------------------

async function findDocument(id, actor) {
  const document = await Document.findById(id).populate(UPLOADER);
  if (!document) throw ApiError.notFound(MESSAGES.DOCUMENT_NOT_FOUND);
  // A document of a kind that no longer exists in the registry is not served.
  if (!DOCUMENT_ENTITIES[document.entityType]) throw ApiError.notFound(MESSAGES.DOCUMENT_NOT_FOUND);
  assertCanSee(actor, document.entityType);
  return document;
}

// Adds `entity: { type, id, label }` - the record each document belongs to -
// or null when that record no longer exists.
async function present(documents) {
  const idsByType = new Map();
  for (const { entityType, entityId } of documents) {
    if (!idsByType.has(entityType)) idsByType.set(entityType, new Set());
    idsByType.get(entityType).add(String(entityId));
  }
  const labels = new Map();
  for (const [type, ids] of idsByType) {
    const { Model, select, label } = DOCUMENT_ENTITIES[type] ?? {};
    if (!Model) continue;
    for (const record of await Model.find({ _id: { $in: [...ids] } }).select(select)) {
      labels.set(`${type}:${record.id}`, { type, id: record.id, label: label(record) });
    }
  }
  return documents.map((document) => ({
    ...document.toJSON(),
    entity: labels.get(`${document.entityType}:${document.entityId}`) ?? null,
  }));
}

const documentEvent = (entityType, entityId, summary, actor) =>
  recordEvent({ entityType, entityId, action: 'updated', summary, actor });

// --- operations --------------------------------------------------------------

// What the upload form needs to know, so it has no rules of its own.
export async function getUploadConfig(actor) {
  const { maxFileMb, maxFiles, allowedTypes } = (await getSettings()).documents;
  return {
    field: DOCUMENT_FIELD,
    maxFileBytes: Math.round(maxFileMb * 1024 * 1024),
    maxFiles,
    allowedTypes,
    entityTypes: readableTypes(actor),
  };
}

export async function listDocuments(query, actor) {
  const { page, limit, sortBy, sortOrder, entityType, entityId, search, uploadedBy } = query;
  const filter = {};
  if (entityType) {
    assertCanSee(actor, entityType);
    filter.entityType = entityType;
  } else {
    // Across everything: only the kinds of record this user can see.
    filter.entityType = { $in: readableTypes(actor) };
  }
  if (entityId) filter.entityId = entityId;
  if (uploadedBy) filter.uploadedBy = uploadedBy;
  if (search) filter.fileName = new RegExp(escapeRegex(search), 'i');

  const [documents, total] = await Promise.all([
    Document.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(UPLOADER),
    Document.countDocuments(filter),
  ]);
  return { documents: await present(documents), pagination: paginationMeta({ page, limit }, total) };
}

export async function getDocument(id, actor) {
  return (await present([await findDocument(id, actor)]))[0];
}

// The file itself, for downloading.
export async function openDocument(id, actor) {
  const document = await findDocument(id, actor);
  const stream = await openFile(document.storageKey);
  return { stream, fileName: document.fileName, mimeType: document.fileType, size: document.fileSize };
}

// Stores the files of one request against one record. Every check - who is
// asking, the record, each file - comes before anything is written.
export async function uploadDocuments({ entityType, entityId }, files = [], actor) {
  if (!files.length) throw ApiError.badRequest(MESSAGES.DOCUMENT_NO_FILE, [{ field: DOCUMENT_FIELD, message: MESSAGES.DOCUMENT_NO_FILE }]);
  assertCanSee(actor, entityType);
  if (!(await DOCUMENT_ENTITIES[entityType].Model.exists({ _id: entityId }))) {
    throw ApiError.badRequest(MESSAGES.DOCUMENT_ENTITY_NOT_FOUND, [{ field: 'entityId', message: MESSAGES.DOCUMENT_ENTITY_NOT_FOUND }]);
  }
  assertAcceptable(files);

  const saved = await storeFiles(files, `documents/${entityType}/${entityId}`);
  let documents;
  try {
    documents = await Document.insertMany(
      saved.map((file) => ({
        fileName: file.fileName,
        fileType: file.mimeType,
        fileSize: file.size,
        entityType,
        entityId,
        uploadedBy: actor.id,
        storageKey: file.storedName,
        storageDriver: storageName(),
      }))
    );
  } catch (err) {
    await removeFiles(saved);
    throw err;
  }

  await documentEvent(entityType, entityId, `Document uploaded: ${saved.map((file) => file.fileName).join(', ')}`.slice(0, 500), actor);
  await Document.populate(documents, UPLOADER);
  return present(documents);
}

// Anyone who may upload can delete what they uploaded; deleting someone
// else's needs documents.delete. The file goes from storage too.
export async function deleteDocument(id, actor) {
  const document = await findDocument(id, actor);
  const own = String(document.uploadedBy?._id ?? '') === String(actor.id);
  if (!own && !hasPermission(actor, DELETE_ANY)) throw ApiError.forbidden(MESSAGES.DOCUMENT_DELETE_FORBIDDEN);

  await document.deleteOne();
  await removeFiles([{ storedName: document.storageKey }]);
  await documentEvent(document.entityType, document.entityId, `Document deleted: ${document.fileName}`.slice(0, 500), actor);
}
