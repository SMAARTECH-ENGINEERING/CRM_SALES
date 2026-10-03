import crypto from 'node:crypto';
import { MESSAGES, USER_STATUS } from '../constants/index.js';
import User from '../models/User.js';
import ApiError from '../utils/ApiError.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import { assertPasswordPolicy, getSettings } from './settings.service.js';
import { declarePermission, hasPermission, ROLE_WITH_PERMISSIONS } from '../utils/permissions.js';
import { getDefaultRole } from './role.service.js';
import { assertEmailAvailable } from './user.service.js';

const CREATE_USERS = declarePermission('users.create');

// Refresh tokens are high-entropy JWTs, so a fast hash is sufficient (and bcrypt
// would truncate them at 72 bytes).
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Tokens carry identity only. Role and permissions are read from the database on
// every request, so a role change takes effect immediately.
function buildTokens(user) {
  return {
    accessToken: signAccessToken({ sub: user.id, tv: user.tokenVersion }),
    refreshToken: signRefreshToken({ sub: user.id, tv: user.tokenVersion }),
  };
}

// Compared against when the email is unknown, so response time does not reveal
// whether an account exists.
let dummyHash;
const getDummyHash = () => (dummyHash ??= hashPassword(crypto.randomBytes(16).toString('hex')));

// Self-service sign-up. Always gets the default role; choosing a role is only
// possible through user management (POST /users).
export async function register({ firstName, lastName, email, password }, actor) {
  // Whether anyone may sign themselves up is a setting (Settings -> Security).
  if (!(await getSettings()).security.allowPublicRegistration && !hasPermission(actor, CREATE_USERS)) {
    throw ApiError.forbidden(MESSAGES.REGISTRATION_DISABLED);
  }
  await assertPasswordPolicy(password);
  await assertEmailAvailable(email);

  const role = await getDefaultRole();
  const user = await User.create({
    firstName,
    lastName,
    email,
    passwordHash: await hashPassword(password),
    roleId: role._id,
    createdBy: actor?.id,
  });
  return user.populate(ROLE_WITH_PERMISSIONS);
}

export async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash').populate(ROLE_WITH_PERMISSIONS);
  const passwordMatches = await comparePassword(password, user?.passwordHash ?? (await getDummyHash()));

  // One message for both cases: never reveal which part was wrong.
  if (!user || !passwordMatches) throw ApiError.unauthorized(MESSAGES.INVALID_CREDENTIALS);
  // Checked only after the password, so it cannot be used to probe for accounts.
  if (user.status !== USER_STATUS.ACTIVE) throw ApiError.forbidden(MESSAGES.ACCOUNT_INACTIVE);

  const tokens = buildTokens(user);
  user.refreshTokenHash = hashToken(tokens.refreshToken);
  user.lastLogin = new Date();
  await user.save();

  return { user, ...tokens };
}

export async function refresh(refreshToken) {
  const claims = verifyRefreshToken(refreshToken);
  const user = await User.findById(claims.sub);

  if (!user || user.tokenVersion !== claims.tv) throw ApiError.unauthorized(MESSAGES.TOKEN_INVALID);
  if (user.status !== USER_STATUS.ACTIVE) throw ApiError.forbidden(MESSAGES.ACCOUNT_INACTIVE);

  const tokens = buildTokens(user);

  // Rotation is atomic: the presented token must still be the stored one, so a
  // refresh token works exactly once even under concurrent requests.
  const rotated = await User.findOneAndUpdate(
    { _id: user._id, tokenVersion: claims.tv, refreshTokenHash: hashToken(refreshToken) },
    { $set: { refreshTokenHash: hashToken(tokens.refreshToken) } }
  );
  if (!rotated) throw ApiError.unauthorized(MESSAGES.TOKEN_INVALID);

  return tokens;
}

export async function logout(userId) {
  await User.updateOne(
    { _id: userId },
    { $inc: { tokenVersion: 1 }, $unset: { refreshTokenHash: 1 } }
  );
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.unauthorized(MESSAGES.TOKEN_INVALID);

  // 400 rather than 401: the session is fine, the submitted value is wrong.
  if (!(await comparePassword(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest(MESSAGES.CURRENT_PASSWORD_INCORRECT, [
      { field: 'currentPassword', message: MESSAGES.CURRENT_PASSWORD_INCORRECT },
    ]);
  }

  await assertPasswordPolicy(newPassword, 'newPassword');
  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  // Revokes every existing token; the caller continues on the new pair below.
  user.tokenVersion += 1;

  const tokens = buildTokens(user);
  user.refreshTokenHash = hashToken(tokens.refreshToken);
  await user.save();

  return tokens;
}
