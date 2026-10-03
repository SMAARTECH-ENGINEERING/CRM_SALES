import { MESSAGES } from '../constants/index.js';
import { listPermissions } from '../services/permission.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function getPermissions(req, res) {
  const permissions = await listPermissions(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.PERMISSIONS_LISTED, data: { permissions } });
}
