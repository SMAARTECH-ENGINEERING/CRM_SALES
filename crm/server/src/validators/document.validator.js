import Joi from 'joi';
import { DOCUMENT_KIND, PAGINATION } from '../constants/index.js';
import { DOCUMENT_ENTITY_TYPES } from '../services/document.service.js';
import { objectId } from './common.validator.js';

const entityType = Joi.string().valid(...DOCUMENT_ENTITY_TYPES);
const listValue = objectId.allow('', null);

export const DOCUMENT_SORT_FIELDS = ['fileName', 'fileSize', 'fileType', 'createdAt', 'updatedAt'];

export const listDocumentsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  // Words in the file name or in the record it belongs to (number, name, company).
  search: Joi.string().trim().max(200).allow(''),
  entityType: entityType.empty(''),
  // The documents of one record: both together.
  entityId: objectId.empty(''),
  uploadedBy: objectId.empty(''),
  // pdf | excel | word | image | other
  kind: Joi.string().valid(...Object.values(DOCUMENT_KIND)).empty(''),
  documentTypeId: objectId.empty(''),
  statusId: objectId.empty(''),
  // Every document of a company's records (its quotations, projects, ...).
  companyId: objectId.empty(''),
  // Last changed between these dates (inclusive).
  from: Joi.date().iso().empty(''),
  to: Joi.date().iso().min(Joi.ref('from')).empty(''),
  sortBy: Joi.string()
    .valid(...DOCUMENT_SORT_FIELDS)
    .default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
}).with('entityId', 'entityType');

// The text fields of the multipart upload; the files are in "files". Everything
// else about a document is taken from the file and the signed-in user.
export const uploadDocumentsSchema = Joi.object({
  entityType: entityType.required(),
  entityId: objectId.required(),
  documentTypeId: listValue,
  statusId: listValue,
  fileName: Joi.forbidden(),
  fileUrl: Joi.forbidden(),
  fileType: Joi.forbidden(),
  fileSize: Joi.forbidden(),
  uploadedBy: Joi.forbidden(),
});

// PATCH /documents/:id - only what is sent changes.
export const updateDocumentSchema = Joi.object({
  fileName: Joi.string().trim().min(1).max(200),
  documentTypeId: listValue,
  statusId: listValue,
}).min(1);

// POST /documents/:id/versions - the file is in "file".
export const addVersionSchema = Joi.object({
  note: Joi.string().trim().max(300).allow(''),
  // The name to save it under; the uploaded file's own name otherwise.
  fileName: Joi.string().trim().max(200).allow(''),
});

export const versionParams = Joi.object({ id: objectId.required(), version: Joi.number().integer().min(1).required() });
export const downloadQuery = Joi.object({ version: Joi.number().integer().min(1).empty('') });
