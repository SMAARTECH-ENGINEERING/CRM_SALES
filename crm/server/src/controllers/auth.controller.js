import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import * as authService from '../services/auth.service.js';
import { presentCurrentUser } from '../services/permission.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

// Auth responses carry the user plus `user.permissions`: the keys that user
// effectively holds, resolved from the database.

export async function register(req, res) {
  const user = await authService.register(req.body, req.user);
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: MESSAGES.REGISTERED,
    data: { user: await presentCurrentUser(user) },
  });
}

export async function login(req, res) {
  const { user, ...tokens } = await authService.login(req.body);
  return sendSuccess(res, {
    message: MESSAGES.LOGIN_OK,
    data: { user: await presentCurrentUser(user), ...tokens },
  });
}

export async function refreshToken(req, res) {
  const data = await authService.refresh(req.body.refreshToken);
  return sendSuccess(res, { message: MESSAGES.TOKEN_REFRESHED, data });
}

export async function logout(req, res) {
  await authService.logout(req.user.id);
  return sendSuccess(res, { message: MESSAGES.LOGOUT_OK });
}

export async function me(req, res) {
  return sendSuccess(res, {
    message: MESSAGES.CURRENT_USER,
    data: { user: await presentCurrentUser(req.user) },
  });
}

export async function changePassword(req, res) {
  const data = await authService.changePassword(req.user.id, req.body);
  return sendSuccess(res, { message: MESSAGES.PASSWORD_CHANGED, data });
}
