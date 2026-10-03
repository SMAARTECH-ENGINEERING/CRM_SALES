import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import * as roleService from '../services/role.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function listRoles(req, res) {
  const data = await roleService.listRoles(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.ROLES_LISTED, data });
}

export async function getRole(req, res) {
  const role = await roleService.getRole(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.ROLE_RETRIEVED, data: { role } });
}

export async function createRole(req, res) {
  const role = await roleService.createRole(req.body, req.user);
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: MESSAGES.ROLE_CREATED,
    data: { role },
  });
}

export async function updateRole(req, res) {
  const role = await roleService.updateRole(req.validated.params.id, req.body, req.user);
  return sendSuccess(res, { message: MESSAGES.ROLE_UPDATED, data: { role } });
}

export async function setPermissions(req, res) {
  const role = await roleService.setRolePermissions(
    req.validated.params.id,
    req.body.permissions,
    req.user
  );
  return sendSuccess(res, { message: MESSAGES.ROLE_PERMISSIONS_UPDATED, data: { role } });
}

export async function deleteRole(req, res) {
  await roleService.deleteRole(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.ROLE_DELETED });
}
