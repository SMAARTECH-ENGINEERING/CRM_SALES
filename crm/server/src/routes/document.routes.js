import { Router } from 'express';
import multer from 'multer';
import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import * as documentService from '../services/document.service.js';
import { getSettings } from '../services/settings.service.js';
import { sendFile, uploadFiles } from '../services/upload.service.js';
import ApiError from '../utils/ApiError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { idParam } from '../validators/common.validator.js';
import { addVersionSchema, downloadQuery, listDocumentsQuery, updateDocumentSchema, uploadDocumentsSchema, versionParams } from '../validators/document.validator.js';

// Every route also checks, in the service, that the user may see the record a
// document belongs to (quotations.read for a quotation's documents, and so on).
//
//   documents.read            view, download, print
//   documents.create          upload; delete your own uploads
//   documents.update          rename, set type and status, save a new version (edited, converted)
//   documents.manageVersions  restore an earlier version
//   documents.delete          delete anyone's document
const router = Router();
router.use(authenticate);

const read = requirePermission('documents.read');
const update = requirePermission('documents.update');

// One file for a new version, within the configured size limit.
async function receiveVersion(req, res, next) {
  const { maxFileMb } = (await getSettings()).documents;
  multer({ storage: multer.memoryStorage(), limits: { fileSize: Math.round(maxFileMb * 1024 * 1024), files: 1 } }).single(documentService.VERSION_FIELD)(req, res, (err) => {
    if (err) return next(new ApiError(err.code === 'LIMIT_FILE_SIZE' ? HTTP_STATUS.PAYLOAD_TOO_LARGE ?? 413 : HTTP_STATUS.BAD_REQUEST, err.code === 'LIMIT_FILE_SIZE' ? MESSAGES.ATTACHMENT_TOO_LARGE : MESSAGES.DOCUMENT_ONE_FILE, [{ field: documentService.VERSION_FIELD, message: err.message }]));
    return next();
  });
}

router.get('/', read, validate({ query: listDocumentsQuery }), async (req, res) => {
  const data = await documentService.listDocuments(req.validated.query, req.user);
  return sendSuccess(res, { message: MESSAGES.DOCUMENTS_LISTED, data });
});
// Size, count and type limits, for upload forms. Declared before /:id.
router.get('/config', authorize('documents.read', 'documents.create'), async (req, res) =>
  sendSuccess(res, { message: MESSAGES.DOCUMENT_CONFIG, data: await documentService.getUploadConfig(req.user) })
);
// multipart/form-data: entityType, entityId (and optionally documentTypeId,
// statusId) and one or more files in "files".
router.post(
  '/',
  requirePermission('documents.create'),
  uploadFiles(documentService.DOCUMENT_FIELD),
  validate({ body: uploadDocumentsSchema }),
  async (req, res) => {
    const documents = await documentService.uploadDocuments(req.body, req.files, req.user);
    return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: MESSAGES.DOCUMENTS_UPLOADED, data: { documents } });
  }
);
router.get('/:id', read, validate({ params: idParam }), async (req, res) => {
  const document = await documentService.getDocument(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.DOCUMENT_RETRIEVED, data: { document } });
});
router.patch('/:id', update, validate({ params: idParam, body: updateDocumentSchema }), async (req, res) => {
  const document = await documentService.updateDocument(req.validated.params.id, req.validated.body, req.user);
  return sendSuccess(res, { message: MESSAGES.DOCUMENT_UPDATED, data: { document } });
});
// The file itself (what `fileUrl` points to); ?version=N for an earlier one.
router.get('/:id/download', read, validate({ params: idParam, query: downloadQuery }), async (req, res) => {
  const file = await documentService.openDocument(req.validated.params.id, req.user, req.validated.query.version);
  return sendFile(res, file.stream, file);
});
router.get('/:id/versions', read, validate({ params: idParam }), async (req, res) => {
  const versions = await documentService.listVersions(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.DOCUMENT_VERSIONS, data: { versions } });
});
// multipart/form-data: the new file in "file", optionally a note and a name.
router.post('/:id/versions', update, receiveVersion, validate({ params: idParam, body: addVersionSchema }), async (req, res) => {
  const document = await documentService.addVersion(req.validated.params.id, req.file, req.validated.body, req.user);
  return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: MESSAGES.DOCUMENT_VERSION_ADDED, data: { document } });
});
router.post('/:id/versions/:version/restore', requirePermission('documents.manageVersions'), validate({ params: versionParams }), async (req, res) => {
  const document = await documentService.restoreVersion(req.validated.params.id, req.validated.params.version, req.user);
  return sendSuccess(res, { message: MESSAGES.DOCUMENT_VERSION_RESTORED, data: { document } });
});
// Your own uploads with documents.create; anyone's with documents.delete (checked in the service).
router.delete('/:id', authorize('documents.delete', 'documents.create'), validate({ params: idParam }), async (req, res) => {
  await documentService.deleteDocument(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.DOCUMENT_DELETED });
});

export default router;
