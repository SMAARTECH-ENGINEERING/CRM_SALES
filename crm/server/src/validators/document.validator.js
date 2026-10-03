import Joi from 'joi';
import { PAGINATION } from '../constants/index.js';
import { DOCUMENT_ENTITY_TYPES } from '../services/document.service.js';
import { objectId } from './common.validator.js';

const entityType = Joi.string().valid(...DOCUMENT_ENTITY_TYPES);

export const DOCUMENT_SORT_FIELDS = ['fileName', 'fileSize', 'fileType', 'createdAt'];

export const listDocumentsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  search: Joi.string().trim().max(200).allow(''),
  entityType: entityType.empty(''),
  // The documents of one record: both together.
  entityId: objectId.empty(''),
  uploadedBy: objectId.empty(''),
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
  fileName: Joi.forbidden(),
  fileUrl: Joi.forbidden(),
  fileType: Joi.forbidden(),
  fileSize: Joi.forbidden(),
  uploadedBy: Joi.forbidden(),
});
