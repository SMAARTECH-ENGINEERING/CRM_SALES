import { HTTP_STATUS } from '../constants/index.js';

// Single place that shapes every response body, so the format cannot drift.
//   success: { success: true,  message, data }
//   error:   { success: false, message, errors }

export function sendSuccess(
  res,
  { statusCode = HTTP_STATUS.OK, message = '', data = null, omitData = false } = {}
) {
  const body = { success: true, message };
  if (!omitData) body.data = data;
  return res.status(statusCode).json(body);
}

export function sendError(
  res,
  { statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, message = '', errors = [] } = {}
) {
  return res.status(statusCode).json({ success: false, message, errors });
}
