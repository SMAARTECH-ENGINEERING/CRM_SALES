import path from 'node:path';
import logger from '../config/logger.js';
import { DOCUMENT_KIND, HTTP_STATUS, MESSAGES } from '../constants/index.js';
import Company from '../models/Company.js';
import Contact from '../models/Contact.js';
import Contract from '../models/Contract.js';
import Customer from '../models/Customer.js';
import Document from '../models/Document.js';
import DocumentStatus from '../models/DocumentStatus.js';
import DocumentType from '../models/DocumentType.js';
import Lead from '../models/Lead.js';
import Opportunity from '../models/Opportunity.js';
import Order from '../models/Order.js';
import Payment from '../models/Payment.js';
import Project from '../models/Project.js';
import ProjectTask from '../models/ProjectTask.js';
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
// nothing. `company` says which company the record belongs to (documents are
// found by customer through it). A module that wants documents adds an entry here.
const byCompany = (record) => record.companyId;
export const DOCUMENT_ENTITIES = Object.freeze({
  company: { Model: Company, permission: 'companies.read', select: 'companyCode name', label: (r) => r.name, company: (r) => r._id },
  contact: { Model: Contact, permission: 'contacts.read', select: 'firstName lastName companyId', label: (r) => r.fullName, company: byCompany },
  lead: { Model: Lead, permission: 'leads.read', select: 'leadNumber title companyId', label: (r) => `${r.leadNumber} - ${r.title}`, company: byCompany },
  opportunity: {
    Model: Opportunity,
    permission: 'opportunities.read',
    select: 'opportunityNumber name companyId',
    label: (r) => `${r.opportunityNumber} - ${r.name}`,
    company: byCompany,
  },
  quotation: { Model: Quotation, permission: 'quotations.read', select: 'quotationNumber companyId', label: (r) => r.quotationNumber, company: byCompany },
  order: { Model: Order, permission: 'orders.read', select: 'orderNumber companyId', label: (r) => r.orderNumber, company: byCompany },
  customer: { Model: Customer, permission: 'customers.read', select: 'customerNumber companyId', label: (r) => r.customerNumber, company: byCompany },
  project: { Model: Project, permission: 'projects.read', select: 'projectNumber name companyId', label: (r) => `${r.projectNumber} - ${r.name}`, company: byCompany },
  // A task is part of a project; its company is the project's.
  task: { Model: ProjectTask, permission: 'projects.read', select: 'title projectId', label: (r) => `Task: ${r.title}`, company: null, project: (r) => r.projectId },
  ticket: { Model: Ticket, permission: 'tickets.read', select: 'ticketNumber subject companyId', label: (r) => `${r.ticketNumber} - ${r.subject}`, company: byCompany },
  contract: { Model: Contract, permission: 'contracts.read', select: 'contractNumber companyId', label: (r) => r.contractNumber, company: byCompany },
  payment: { Model: Payment, permission: 'payments.read', select: 'invoiceNumber companyId', label: (r) => r.invoiceNumber, company: byCompany },
});
export const DOCUMENT_ENTITY_TYPES = Object.freeze(Object.keys(DOCUMENT_ENTITIES));
for (const { permission } of Object.values(DOCUMENT_ENTITIES)) declarePermission(permission);
const DELETE_ANY = declarePermission('documents.delete');
declarePermission('documents.update');
declarePermission('documents.manageVersions');

// People may have been deleted since; their names should still show.
const PERSON = 'firstName lastName email';
const POPULATE = [
  { path: 'uploadedBy', select: PERSON, options: { withDeleted: true } },
  { path: 'updatedBy', select: PERSON, options: { withDeleted: true } },
  { path: 'documentTypeId', select: 'name color' },
  { path: 'statusId', select: 'name color category' },
];
// The upload field of POST /documents.
export const DOCUMENT_FIELD = 'files';
// The upload field of POST /documents/:id/versions.
export const VERSION_FIELD = 'file';

registerCompanySection('documents', { count: (companyId) => Document.countDocuments({ entityType: 'company', entityId: companyId }) });

// --- kinds of file --------------------------------------------------------------------

const KIND_TYPES = {
  [DOCUMENT_KIND.PDF]: [/^application\/pdf$/],
  [DOCUMENT_KIND.EXCEL]: [/spreadsheetml/, /^application\/vnd\.ms-excel$/, /^text\/csv$/],
  [DOCUMENT_KIND.WORD]: [/wordprocessingml/, /^application\/msword$/],
  [DOCUMENT_KIND.IMAGE]: [/^image\//],
};
const kindFilter = (kind) => {
  if (kind === DOCUMENT_KIND.OTHER) return { fileType: { $not: new RegExp(Object.values(KIND_TYPES).flat().map((r) => r.source).join('|')) } };
  return { fileType: { $in: KIND_TYPES[kind] } };
};

// What a browser reports is not always useful (a CSV saved by Excel arrives as
// application/vnd.ms-excel, a file of unknown type as application/octet-stream):
// for these the extension decides.
const BY_EXTENSION = {
  '.pdf': 'application/pdf',
  '.csv': 'text/csv',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};
function normaliseType(file) {
  const ext = path.extname(cleanName(file.originalname)).toLowerCase();
  const generic = ['application/octet-stream', ''].includes(file.mimetype);
  if (ext === '.csv' && (generic || file.mimetype === 'application/vnd.ms-excel' || file.mimetype === 'text/plain')) file.mimetype = 'text/csv';
  else if (generic && BY_EXTENSION[ext]) file.mimetype = BY_EXTENSION[ext];
  return file;
}

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

function assertAcceptable(files, field = DOCUMENT_FIELD) {
  const refuse = (status, message, file) => new ApiError(status, message, [{ field, message: `${message}: ${cleanName(file.originalname)}` }]);
  for (const file of files) {
    normaliseType(file);
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
  const document = await Document.findById(id).populate(POPULATE);
  if (!document) throw ApiError.notFound(MESSAGES.DOCUMENT_NOT_FOUND);
  // A document of a kind that no longer exists in the registry is not served.
  if (!DOCUMENT_ENTITIES[document.entityType]) throw ApiError.notFound(MESSAGES.DOCUMENT_NOT_FOUND);
  assertCanSee(actor, document.entityType);
  return document;
}

// The company a record belongs to and how it is named - e.g.
// "QUO-000003 · Maa Samaleswari FPO" - or null when the record does not exist.
async function describeRecord(entityType, entityId) {
  const config = DOCUMENT_ENTITIES[entityType];
  const record = await config.Model.findById(entityId).select(config.select);
  if (!record) return null;
  let companyId = config.company ? config.company(record) : null;
  if (config.project) companyId = (await Project.findById(config.project(record)).select('companyId'))?.companyId ?? null;
  const company = companyId && entityType !== 'company' ? await Company.findById(companyId).select('name').setOptions({ withDeleted: true }) : null;
  return { companyId: companyId ?? undefined, relatedLabel: [config.label(record), company?.name].filter(Boolean).join(' · ').slice(0, 300) };
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
    versionCount: document.versions.length + 1,
    entity: labels.get(`${document.entityType}:${document.entityId}`) ?? null,
  }));
}

const documentEvent = (entityType, entityId, summary, actor) => recordEvent({ entityType, entityId, action: 'updated', summary: summary.slice(0, 500), actor });

async function assertListValue(Model, id, field, message) {
  if (!id) return;
  if (!(await Model.exists({ _id: id, isActive: true }))) throw ApiError.badRequest(message, [{ field, message }]);
}
const defaultStatusId = async () => (await DocumentStatus.findOne({ isDefault: true, isActive: true }).select('_id'))?._id;

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
    kinds: Object.values(DOCUMENT_KIND),
  };
}

export async function listDocuments(query, actor) {
  const { page, limit, sortBy, sortOrder, entityType, entityId, search, uploadedBy, kind, documentTypeId, statusId, companyId, from, to } = query;
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
  if (documentTypeId) filter.documentTypeId = documentTypeId;
  if (statusId) filter.statusId = statusId;
  if (companyId) filter.companyId = companyId;
  if (kind) Object.assign(filter, kindFilter(kind));
  if (from || to) filter.updatedAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: new Date(new Date(to).getTime() + 24 * 3600 * 1000) } : {}) };
  // Every word must be in the file name or in the record it belongs to (its
  // number, its name, its company).
  const words = (search ?? '').split(/\s+/).filter(Boolean);
  if (words.length) filter.$and = words.map((word) => ({ $or: [{ fileName: new RegExp(escapeRegex(word), 'i') }, { relatedLabel: new RegExp(escapeRegex(word), 'i') }] }));

  const [documents, total] = await Promise.all([
    Document.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE),
    Document.countDocuments(filter),
  ]);
  return { documents: await present(documents), pagination: paginationMeta({ page, limit }, total) };
}

export async function getDocument(id, actor) {
  return (await present([await findDocument(id, actor)]))[0];
}

// The file itself, for downloading - the current version, or an earlier one.
export async function openDocument(id, actor, version) {
  const document = await findDocument(id, actor);
  const source = !version || version === document.version ? document : document.versions.find((v) => v.version === version);
  if (!source) throw ApiError.notFound(MESSAGES.DOCUMENT_VERSION_NOT_FOUND);
  const stream = await openFile(source.storageKey);
  return { stream, fileName: source.fileName, mimeType: source.fileType, size: source.fileSize };
}

// Stores the files of one request against one record. Every check - who is
// asking, the record, each file - comes before anything is written.
export async function uploadDocuments({ entityType, entityId, documentTypeId, statusId }, files = [], actor) {
  if (!files.length) throw ApiError.badRequest(MESSAGES.DOCUMENT_NO_FILE, [{ field: DOCUMENT_FIELD, message: MESSAGES.DOCUMENT_NO_FILE }]);
  assertCanSee(actor, entityType);
  const described = await describeRecord(entityType, entityId);
  if (!described) throw ApiError.badRequest(MESSAGES.DOCUMENT_ENTITY_NOT_FOUND, [{ field: 'entityId', message: MESSAGES.DOCUMENT_ENTITY_NOT_FOUND }]);
  await assertListValue(DocumentType, documentTypeId, 'documentTypeId', MESSAGES.DOCUMENT_TYPE_NOT_FOUND);
  await assertListValue(DocumentStatus, statusId, 'statusId', MESSAGES.DOCUMENT_STATUS_NOT_FOUND);
  assertAcceptable(files);
  const status = statusId || (await defaultStatusId());

  const saved = await storeFiles(files, `documents/${entityType}/${entityId}`);
  let documents;
  try {
    // One at a time, so each gets its search keys (insertMany skips save hooks).
    documents = [];
    for (const file of saved) {
      documents.push(
        await Document.create({
          fileName: file.fileName,
          fileType: file.mimeType,
          fileSize: file.size,
          entityType,
          entityId,
          ...described,
          documentTypeId: documentTypeId || undefined,
          statusId: status,
          uploadedBy: actor.id,
          updatedBy: actor.id,
          storageKey: file.storedName,
          storageDriver: storageName(),
        })
      );
    }
  } catch (err) {
    await Document.deleteMany({ _id: { $in: (documents ?? []).map((d) => d._id) } });
    await removeFiles(saved);
    throw err;
  }

  await documentEvent(entityType, entityId, `Document uploaded: ${saved.map((file) => file.fileName).join(', ')}`, actor);
  await Document.populate(documents, POPULATE);
  return present(documents);
}

// Rename, and set what the document is and where it stands.
export async function updateDocument(id, input, actor) {
  const document = await findDocument(id, actor);
  await assertListValue(DocumentType, input.documentTypeId, 'documentTypeId', MESSAGES.DOCUMENT_TYPE_NOT_FOUND);
  await assertListValue(DocumentStatus, input.statusId, 'statusId', MESSAGES.DOCUMENT_STATUS_NOT_FOUND);
  const changes = [];
  if (input.fileName !== undefined && input.fileName !== document.fileName) {
    // A new name keeps the file's extension: the type of the file has not changed.
    const ext = path.extname(document.fileName);
    let name = cleanName(input.fileName);
    if (ext && path.extname(name).toLowerCase() !== ext.toLowerCase()) name = `${name}${ext}`;
    changes.push(`renamed "${document.fileName}" to "${name}"`);
    document.fileName = name;
  }
  if (input.documentTypeId !== undefined) document.documentTypeId = input.documentTypeId || undefined;
  if (input.statusId !== undefined) document.statusId = input.statusId || (await defaultStatusId());
  document.updatedBy = actor.id;
  await document.save();
  if (changes.length) await documentEvent(document.entityType, document.entityId, `Document ${changes.join(', ')}`, actor);
  return getDocument(document.id, actor);
}

// The versions, newest first: the current one and every earlier one kept.
export async function listVersions(id, actor) {
  const document = await findDocument(id, actor);
  await Document.populate(document, { path: 'versions.uploadedBy', select: PERSON, options: { withDeleted: true } });
  const person = (user) => (user ? { id: user.id, fullName: [user.firstName, user.lastName].filter(Boolean).join(' ') } : null);
  const current = { version: document.version, fileName: document.fileName, fileType: document.fileType, fileSize: document.fileSize, createdAt: document.updatedAt ?? document.createdAt, uploadedBy: person(document.updatedBy ?? document.uploadedBy), current: true };
  const earlier = [...document.versions]
    .sort((a, b) => b.version - a.version)
    .map((v) => ({ version: v.version, fileName: v.fileName, fileType: v.fileType, fileSize: v.fileSize, createdAt: v.createdAt, uploadedBy: person(v.uploadedBy), note: v.note, current: false }));
  return [current, ...earlier];
}

function keepCurrentAsVersion(document, note) {
  document.versions.push({
    version: document.version,
    fileName: document.fileName,
    fileType: document.fileType,
    fileSize: document.fileSize,
    storageKey: document.storageKey,
    storageDriver: document.storageDriver,
    uploadedBy: document.updatedBy?._id ?? document.updatedBy ?? document.uploadedBy?._id ?? document.uploadedBy,
    createdAt: document.updatedAt ?? document.createdAt,
    note,
  });
}

// A new file for the same document - an edited PDF, an updated sheet. The
// file it replaces is kept as the previous version.
export async function addVersion(id, file, { note, fileName } = {}, actor) {
  if (!file) throw ApiError.badRequest(MESSAGES.DOCUMENT_ONE_FILE, [{ field: VERSION_FIELD, message: MESSAGES.DOCUMENT_ONE_FILE }]);
  const document = await findDocument(id, actor);
  assertAcceptable([file], VERSION_FIELD);
  const [saved] = await storeFiles([file], `documents/${document.entityType}/${document.entityId}`);
  try {
    keepCurrentAsVersion(document, note);
    document.version += 1;
    document.fileName = fileName ? cleanName(fileName) : saved.fileName;
    document.fileType = saved.mimeType;
    document.fileSize = saved.size;
    document.storageKey = saved.storedName;
    document.storageDriver = storageName();
    document.updatedBy = actor.id;
    await document.save();
  } catch (err) {
    await removeFiles([saved]);
    throw err;
  }
  await documentEvent(document.entityType, document.entityId, `Document "${document.fileName}" saved as version ${document.version}`, actor);
  return getDocument(document.id, actor);
}

// Makes an earlier version current again - as a new version, so nothing is
// lost: the one it replaces is kept too.
export async function restoreVersion(id, version, actor) {
  const document = await findDocument(id, actor);
  const old = document.versions.find((v) => v.version === version);
  if (!old) throw ApiError.notFound(MESSAGES.DOCUMENT_VERSION_NOT_FOUND);
  keepCurrentAsVersion(document, `Replaced when version ${version} was restored`);
  document.version += 1;
  Object.assign(document, { fileName: old.fileName, fileType: old.fileType, fileSize: old.fileSize, storageKey: old.storageKey, storageDriver: old.storageDriver, updatedBy: actor.id });
  await document.save();
  await documentEvent(document.entityType, document.entityId, `Document "${document.fileName}": version ${version} restored as version ${document.version}`, actor);
  return getDocument(document.id, actor);
}

// Anyone who may upload can delete what they uploaded; deleting someone
// else's needs documents.delete. Every version's file goes from storage too.
export async function deleteDocument(id, actor) {
  const document = await findDocument(id, actor);
  const own = String(document.uploadedBy?._id ?? '') === String(actor.id);
  if (!own && !hasPermission(actor, DELETE_ANY)) throw ApiError.forbidden(MESSAGES.DOCUMENT_DELETE_FORBIDDEN);

  await document.deleteOne();
  const keys = [...new Set([document.storageKey, ...document.versions.map((v) => v.storageKey)])];
  await removeFiles(keys.map((storedName) => ({ storedName })));
  await documentEvent(document.entityType, document.entityId, `Document deleted: ${document.fileName}`, actor);
}

// Documents saved before they knew their company and record name get them.
// Run at start; one indexed query when there is nothing to do.
export async function backfillDocumentDetails() {
  let filled = 0;
  for (const document of await Document.find({ relatedLabel: { $exists: false } }).limit(5000)) {
    if (!DOCUMENT_ENTITIES[document.entityType]) continue;
    const described = await describeRecord(document.entityType, document.entityId);
    if (!described) continue;
    await Document.updateOne({ _id: document._id }, { $set: { ...described, searchKeys: Document.searchKeysFor({ ...document.toObject(), ...described }) } }, { timestamps: false });
    filled += 1;
  }
  if (filled) logger.info(`Documents: ${filled} existing document(s) given their company and record name`);
  return filled;
}
