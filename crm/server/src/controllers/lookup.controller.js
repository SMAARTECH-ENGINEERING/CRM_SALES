import { MESSAGES } from '../constants/index.js';
import { listDepartments } from '../services/department.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function getDepartments(req, res) {
  const departments = await listDepartments();
  return sendSuccess(res, { message: MESSAGES.DEPARTMENTS_LISTED, data: { departments } });
}
