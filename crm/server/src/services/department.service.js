import { MESSAGES } from '../constants/index.js';
import Department from '../models/Department.js';
import ApiError from '../utils/ApiError.js';

export async function assertDepartmentExists(id) {
  if (!(await Department.exists({ _id: id }))) {
    throw ApiError.badRequest(MESSAGES.DEPARTMENT_NOT_FOUND, [
      { field: 'departmentId', message: MESSAGES.DEPARTMENT_NOT_FOUND },
    ]);
  }
}

export function listDepartments() {
  return Department.find({ isActive: true }).sort({ name: 1 });
}
