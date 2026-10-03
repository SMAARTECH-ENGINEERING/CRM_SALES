import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import ApiError from '../utils/ApiError.js';

const SEGMENTS = ['params', 'query', 'body'];

// Usage: router.post('/', validate({ body: createSchema }), controller)
// Sanitized values are exposed on req.validated.{params,query,body}; req.body is
// also replaced. (req.query is read-only in Express 5, so it is not reassigned.)
export default function validate(schemas) {
  return (req, res, next) => {
    const errors = [];
    const validated = {};

    for (const segment of SEGMENTS) {
      const schema = schemas[segment];
      if (!schema) continue;

      const { value, error } = schema.validate(req[segment] ?? {}, {
        abortEarly: false,
        stripUnknown: true,
        convert: true,
      });

      if (error) {
        errors.push(
          ...error.details.map((d) => ({
            field: d.path.join('.') || segment,
            message: d.message.replace(/"/g, ''),
          }))
        );
      } else {
        validated[segment] = value;
      }
    }

    if (errors.length) {
      return next(
        new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, MESSAGES.VALIDATION_FAILED, errors)
      );
    }

    req.validated = validated;
    if (validated.body) req.body = validated.body;
    return next();
  };
}
