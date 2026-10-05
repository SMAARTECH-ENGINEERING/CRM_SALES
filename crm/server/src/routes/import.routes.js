import { Router } from 'express';
import Joi from 'joi';
import multer from 'multer';
import { MESSAGES } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import { buildTemplate, importContacts, TEMPLATE_FILE } from '../services/contactImport.service.js';
import ApiError from '../utils/ApiError.js';
import { sendSuccess } from '../utils/apiResponse.js';

// Importing companies and their contacts from an Excel sheet.
//   GET  /imports/contacts/template      the sheet to fill in
//   POST /imports/contacts?dryRun=true   preview: what would happen to each row
//   POST /imports/contacts               import
// Needs the right to create both companies and contacts.
const router = Router();
router.use(authenticate);

const allowed = requirePermission('companies.create', 'contacts.create');
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1 } }).single('file');
// An .xlsx file is a zip archive: it starts with "PK".
const isXlsx = (file) => file && /\.xlsx$/i.test(file.originalname) && file.buffer.subarray(0, 2).toString('latin1') === 'PK';

function receiveFile(req, res, next) {
  upload(req, res, (err) => {
    if (err) return next(ApiError.badRequest(err.code === 'LIMIT_FILE_SIZE' ? MESSAGES.IMPORT_TOO_LARGE : MESSAGES.IMPORT_UNREADABLE, [{ field: 'file', message: err.message }]));
    if (!isXlsx(req.file)) return next(ApiError.badRequest(MESSAGES.IMPORT_NOT_XLSX, [{ field: 'file', message: MESSAGES.IMPORT_NOT_XLSX }]));
    return next();
  });
}

router.get('/contacts/template', allowed, async (req, res) => {
  res.setHeader('Content-Type', TEMPLATE_FILE.type);
  res.setHeader('Content-Disposition', `attachment; filename="${TEMPLATE_FILE.name}"`);
  res.send(await buildTemplate());
});

router.post('/contacts', allowed, receiveFile, validate({ query: Joi.object({ dryRun: Joi.boolean().default(false) }) }), async (req, res) => {
  const data = await importContacts(req.file.buffer, { dryRun: req.validated.query.dryRun }, req.user);
  return sendSuccess(res, { message: data.dryRun ? MESSAGES.IMPORT_PREVIEW : MESSAGES.IMPORT_DONE, data });
});

export default router;
