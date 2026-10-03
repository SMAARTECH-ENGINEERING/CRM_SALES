import { Router } from 'express';
import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import * as documentService from '../services/document.service.js';
import { sendFile, uploadFiles } from '../services/upload.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { idParam } from '../validators/common.validator.js';
import { listDocumentsQuery, uploadDocumentsSchema } from '../validators/document.validator.js';

// Every route also checks, in the service, that the user may see the record a
// document belongs to (quotations.read for a quotation's documents, and so on).
const router = Router();
router.use(authenticate);

const read = requirePermission('documents.read');

router.get('/', read, validate({ query: listDocumentsQuery }), async (req, res) => {
  const data = await documentService.listDocuments(req.validated.query, req.user);
  return sendSuccess(res, { message: MESSAGES.DOCUMENTS_LISTED, data });
});
// Size, count and type limits, for upload forms. Declared before /:id.
router.get('/config', authorize('documents.read', 'documents.create'), async (req, res) =>
  sendSuccess(res, { message: MESSAGES.DOCUMENT_CONFIG, data: await documentService.getUploadConfig(req.user) })
);
// multipart/form-data: entityType, entityId and one or more files in "files".
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
// The file itself (what `fileUrl` points to). The only route whose body is not JSON.
router.get('/:id/download', read, validate({ params: idParam }), async (req, res) => {
  const file = await documentService.openDocument(req.validated.params.id, req.user);
  return sendFile(res, file.stream, file);
});
// Your own uploads with documents.create; anyone's with documents.delete (checked in the service).
router.delete('/:id', authorize('documents.delete', 'documents.create'), validate({ params: idParam }), async (req, res) => {
  await documentService.deleteDocument(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.DOCUMENT_DELETED });
});

export default router;
