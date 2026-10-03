import { Router } from 'express';
import { getPermissions } from '../controllers/permission.controller.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import validate from '../middleware/validate.js';
import { listPermissionsQuery } from '../validators/role.validator.js';

const router = Router();

// The catalogue is also needed to edit a role's permissions.
router.get(
  '/',
  authenticate,
  authorize('permissions.read', 'roles.read'),
  validate({ query: listPermissionsQuery }),
  getPermissions
);

export default router;
