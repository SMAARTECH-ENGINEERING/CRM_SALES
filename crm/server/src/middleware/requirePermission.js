import ApiError from '../utils/ApiError.js';
import { declarePermission, hasPermission } from '../utils/permissions.js';

// The user must hold EVERY listed permission. Must run after `authenticate`,
// which loads the user's role and its permissions from the database for this
// request - so a change to a role applies to the very next call.
//
//   router.post('/', authenticate, requirePermission('leads.create'), controller.create)
export default function requirePermission(...keys) {
  keys.forEach(declarePermission);

  return (req, res, next) => {
    if (!keys.every((key) => hasPermission(req.user, key))) return next(ApiError.forbidden());
    return next();
  };
}
