import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import ApiError from '../utils/ApiError.js';

export default function notFound(req, res, next) {
  next(
    new ApiError(HTTP_STATUS.NOT_FOUND, MESSAGES.ROUTE_NOT_FOUND, [
      { field: 'path', message: `${req.method} ${req.originalUrl} does not exist` },
    ])
  );
}
