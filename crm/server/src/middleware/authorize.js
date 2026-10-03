import ApiError from '../utils/ApiError.js';
import { declarePermission, hasPermission } from '../utils/permissions.js';

// The user must hold AT LEAST ONE of the listed permissions - for resources that
// several features legitimately need (e.g. the role list feeds both the Roles
// screen and the role dropdown on the Users screen). With no arguments it only
// requires a signed-in user. Must run after `authenticate`.
//
//   router.get('/', authenticate, authorize('roles.read', 'users.read'), controller.list)
//
// For "must hold all of these", use requirePermission().
export default function authorize(...keys) {
  keys.forEach(declarePermission);

  return (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (keys.length && !keys.some((key) => hasPermission(req.user, key))) {
      return next(ApiError.forbidden());
    }
    return next();
  };
}
