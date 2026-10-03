import { HTTP_STATUS, MESSAGES } from '../constants/index.js';

// Operational error: safe to show its message to the API consumer.
export default class ApiError extends Error {
  constructor(statusCode, message, errors = []) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static badRequest(message, errors) {
    return new ApiError(HTTP_STATUS.BAD_REQUEST, message, errors);
  }

  static unauthorized(message = MESSAGES.UNAUTHORIZED) {
    return new ApiError(HTTP_STATUS.UNAUTHORIZED, message);
  }

  static forbidden(message = MESSAGES.FORBIDDEN) {
    return new ApiError(HTTP_STATUS.FORBIDDEN, message);
  }

  static notFound(message = MESSAGES.NOT_FOUND) {
    return new ApiError(HTTP_STATUS.NOT_FOUND, message);
  }

  static conflict(message = MESSAGES.DUPLICATE, errors) {
    return new ApiError(HTTP_STATUS.CONFLICT, message, errors);
  }
}
