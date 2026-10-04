import crypto from 'node:crypto';
import path from 'node:path';
import multer from 'multer';
import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import ApiError from '../utils/ApiError.js';
import { getSettings } from './settings.service.js';
import { getObject, putObject, removeObject } from './storage.service.js';

// Files uploaded through the API. They are kept in memory only while the
// request is checked, then put in storage (see storage.service.js) under a
// random name - the name a client sent is stored as data and never used as a key.
//
//   router.post('/x', uploadFiles('attachments'), validate(...), handler)
//   const saved = await storeFiles(req.files, 'tickets/<id>')

const allowed = (mimeType, allowedTypes) => allowedTypes.some((type) => (type.endsWith('/*') ? mimeType.startsWith(type.slice(0, -1)) : mimeType === type));

// What multer refuses, as API errors naming the field.
function limitError(err, field) {
  const one = (message) => [{ field, message }];
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new ApiError(HTTP_STATUS.PAYLOAD_TOO_LARGE, MESSAGES.ATTACHMENT_TOO_LARGE, one(MESSAGES.ATTACHMENT_TOO_LARGE));
  }
  if (err.code === 'LIMIT_FILE_COUNT') return ApiError.badRequest(MESSAGES.ATTACHMENT_TOO_MANY, one(MESSAGES.ATTACHMENT_TOO_MANY));
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    // The same field more often than allowed, or a different field.
    if (err.field === field) return ApiError.badRequest(MESSAGES.ATTACHMENT_TOO_MANY, one(MESSAGES.ATTACHMENT_TOO_MANY));
    const message = `Files must be sent in the "${field}" field`;
    return ApiError.badRequest(message, [{ field: err.field ?? field, message }]);
  }
  return err;
}

// Accepts multipart/form-data with files in `field`; a JSON body passes
// straight through. How large, how many and which types is read from the
// settings (Settings -> Documents) for every request, so a change applies at once.
export function uploadFiles(field) {
  const parserFor = ({ maxFileMb, maxFiles, allowedTypes }) => multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Math.round(maxFileMb * 1024 * 1024), files: maxFiles },
    fileFilter: (req, file, done) => {
      if (allowed(file.mimetype, allowedTypes)) return done(null, true);
      return done(
        new ApiError(HTTP_STATUS.UNSUPPORTED_MEDIA_TYPE, MESSAGES.ATTACHMENT_TYPE, [
          { field, message: `${MESSAGES.ATTACHMENT_TYPE}: ${file.mimetype}` },
        ])
      );
    },
  }).array(field, maxFiles);
  return async (req, res, next) => {
    if (!req.is('multipart/form-data')) return next();
    const parser = parserFor((await getSettings()).documents);
    return parser(req, res, (err) => next(err instanceof multer.MulterError ? limitError(err, field) : err));
  };
}

// A safe display name: no path, no control characters, at most 255 characters.
export function cleanName(name) {
  // Control characters are exactly what this removes.
  // eslint-disable-next-line no-control-regex
  const base = path.basename(String(name ?? '')).replace(/[\u0000-\u001f\u007f"\\/]/g, '_').trim();
  return (base || 'file').slice(-255);
}

// Puts the files of a request in storage under `folder` and returns their details.
export async function storeFiles(files = [], folder) {
  const saved = [];
  try {
    for (const file of files) {
      const fileName = cleanName(file.originalname);
      const storedName = path.posix.join(folder, `${crypto.randomUUID()}${path.extname(fileName).slice(0, 12)}`);
      await putObject(storedName, file.buffer, file.mimetype);
      saved.push({ fileName, mimeType: file.mimetype, size: file.size, storedName });
    }
  } catch (err) {
    // All or nothing: a request never leaves some of its files behind.
    await removeFiles(saved);
    throw err;
  }
  return saved;
}

// Removes files written by storeFiles (when the request then fails, or on delete).
export async function removeFiles(saved) {
  await Promise.all(saved.map((file) => removeObject(file.storedName)));
}

// A readable stream of a stored file; 404 when storage no longer has it.
export async function openFile(storedName) {
  const stream = await getObject(storedName);
  if (!stream) throw ApiError.notFound(MESSAGES.ATTACHMENT_NOT_FOUND);
  return stream;
}

// Sends a stored file as a download: its name, its type, never cached, never
// rendered by the browser as a page.
export function sendFile(res, stream, { fileName, mimeType, size }) {
  res.attachment(fileName);
  res.type(mimeType);
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  if (size != null) res.set('Content-Length', String(size));
  stream.on('error', () => res.destroy());
  return stream.pipe(res);
}
