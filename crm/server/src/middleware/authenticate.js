import { MESSAGES, USER_STATUS } from '../constants/index.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { ROLE_WITH_PERMISSIONS } from '../utils/permissions.js';

// Verifies the Bearer access token, loads the user with their role and exposes
// it on req.user (claims on req.auth). Rejections reach the central error handler.
export default async function authenticate(req, res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized();

  const claims = verifyAccessToken(token);
  // Role and permissions are read from the database on every request.
  const user = await User.findById(claims.sub).populate(ROLE_WITH_PERMISSIONS);

  // tokenVersion is bumped on logout, password change/reset, role change and
  // deactivation, revoking older tokens.
  if (!user || user.tokenVersion !== claims.tv) {
    throw ApiError.unauthorized(MESSAGES.TOKEN_INVALID);
  }
  if (user.status !== USER_STATUS.ACTIVE) throw ApiError.forbidden(MESSAGES.ACCOUNT_INACTIVE);

  req.auth = claims;
  req.user = user;
  return next();
}

// Authenticates only when a token is sent; anonymous requests pass through.
export function optionalAuthenticate(req, res, next) {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, next);
}
