import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import * as userService from '../services/user.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function listUsers(req, res) {
  const data = await userService.listUsers(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.USERS_LISTED, data });
}

export async function listUserOptions(req, res) {
  const users = await userService.listUserOptions(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.USER_OPTIONS, data: { users } });
}

export async function getUser(req, res) {
  const user = await userService.getUser(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.USER_RETRIEVED, data: { user } });
}

export async function createUser(req, res) {
  const user = await userService.createUser(req.body, req.user);
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: MESSAGES.USER_CREATED,
    data: { user },
  });
}

export async function updateUser(req, res) {
  const user = await userService.updateUser(req.validated.params.id, req.body, req.user);
  return sendSuccess(res, { message: MESSAGES.USER_UPDATED, data: { user } });
}

export async function updateStatus(req, res) {
  const user = await userService.setUserStatus(req.validated.params.id, req.body.status, req.user);
  return sendSuccess(res, { message: MESSAGES.USER_STATUS_UPDATED, data: { user } });
}

export async function resetPassword(req, res) {
  await userService.resetUserPassword(req.validated.params.id, req.body.newPassword, req.user);
  return sendSuccess(res, { message: MESSAGES.USER_PASSWORD_RESET });
}

export async function deleteUser(req, res) {
  await userService.deleteUser(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.USER_DELETED });
}
