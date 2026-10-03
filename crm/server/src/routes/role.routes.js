import { Router } from 'express';
import * as roleController from '../controllers/role.controller.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import { idParam } from '../validators/common.validator.js';
import {
  createRoleSchema,
  listRolesQuery,
  rolePermissionsSchema,
  updateRoleSchema,
} from '../validators/role.validator.js';

const router = Router();

router.use(authenticate);

// The role list also feeds the role dropdown on the Users screen.
router.get(
  '/',
  authorize('roles.read', 'users.read'),
  validate({ query: listRolesQuery }),
  roleController.listRoles
);
router.post(
  '/',
  requirePermission('roles.create'),
  validate({ body: createRoleSchema }),
  roleController.createRole
);
router.get(
  '/:id',
  requirePermission('roles.read'),
  validate({ params: idParam }),
  roleController.getRole
);
router.put(
  '/:id',
  requirePermission('roles.update'),
  validate({ params: idParam, body: updateRoleSchema }),
  roleController.updateRole
);
router.put(
  '/:id/permissions',
  requirePermission('roles.assignPermissions'),
  validate({ params: idParam, body: rolePermissionsSchema }),
  roleController.setPermissions
);
router.delete(
  '/:id',
  requirePermission('roles.delete'),
  validate({ params: idParam }),
  roleController.deleteRole
);

export default router;
