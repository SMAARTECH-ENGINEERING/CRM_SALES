import mongoose from 'mongoose';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import ApiError from '../utils/ApiError.js';
import { sendError } from '../utils/apiResponse.js';

// Translates known library errors into ApiError; anything else is unexpected.
function normalize(err) {
  if (err instanceof ApiError) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, MESSAGES.VALIDATION_FAILED, errors);
  }

  if (err instanceof mongoose.Error.CastError) {
    return ApiError.badRequest(MESSAGES.INVALID_ID, [
      { field: err.path, message: `Invalid value for ${err.path}` },
    ]);
  }

  if (err?.code === 11000) {
    const errors = Object.keys(err.keyPattern ?? {}).map((field) => ({
      field,
      message: `${field} already exists`,
    }));
    return ApiError.conflict(MESSAGES.DUPLICATE, errors);
  }

  if (err instanceof jwt.JsonWebTokenError) {
    return ApiError.unauthorized(MESSAGES.TOKEN_INVALID);
  }

  // File uploads
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new ApiError(HTTP_STATUS.PAYLOAD_TOO_LARGE, MESSAGES.ATTACHMENT_TOO_LARGE, [
        { field: 'attachments', message: MESSAGES.ATTACHMENT_TOO_LARGE },
      ]);
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return ApiError.badRequest(MESSAGES.ATTACHMENT_TOO_MANY, [{ field: 'attachments', message: MESSAGES.ATTACHMENT_TOO_MANY }]);
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return ApiError.badRequest(MESSAGES.ATTACHMENT_FIELD, [{ field: err.field ?? 'attachments', message: MESSAGES.ATTACHMENT_FIELD }]);
    }
    return ApiError.badRequest(err.message);
  }

  // body-parser errors
  if (err?.type === 'entity.parse.failed') return ApiError.badRequest(MESSAGES.INVALID_JSON);
  if (err?.type === 'entity.too.large') {
    return new ApiError(HTTP_STATUS.PAYLOAD_TOO_LARGE, MESSAGES.PAYLOAD_TOO_LARGE);
  }

  return null;
}

// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, req, res, next) {
  const known = normalize(err);

  if (known) {
    if (known.statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
      (req.log ?? logger).error({ err }, known.message);
    }
    return sendError(res, {
      statusCode: known.statusCode,
      message: known.message,
      errors: known.errors,
    });
  }

  (req.log ?? logger).error({ err }, 'Unhandled error');

  // Never leak internals to clients in production.
  return sendError(res, {
    statusCode: HTTP_STATUS.INTERNAL_SERVER_ERROR,
    message: env.isProduction ? MESSAGES.INTERNAL_ERROR : err?.message || MESSAGES.INTERNAL_ERROR,
  });
}
