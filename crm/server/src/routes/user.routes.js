import { Router } from 'express';
import * as userController from '../controllers/user.controller.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import { idParam } from '../validators/common.validator.js';
import { userOptionsQuery } from '../validators/company.validator.js';
import {
  createUserSchema,
  listUsersQuery,
  resetPasswordSchema,
  updateStatusSchema,
  updateUserSchema,
} from '../validators/user.validator.js';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  requirePermission('users.read'),
  validate({ query: listUsersQuery }),
  userController.listUsers
);
// Names for "assign to" pickers. Declared before /:id so "options" is not read as an id.
router.get(
  '/options',
  authorize(
    'users.read',
    'companies.create',
    'companies.update',
    'leads.create',
    'leads.update',
    'leads.assign',
    'opportunities.read',
    'opportunities.create',
    'opportunities.assign',
    'orders.create',
    'orders.update',
    'customers.read',
    'customers.create',
    'customers.update',
    'projects.create',
    'projects.update',
    'projects.manageTasks',
    'tickets.read',
    'tickets.create',
    'tickets.assign',
    'contracts.read',
    'contracts.create',
    'contracts.update',
    'reports.read',
    'audit.read',
    'activities.create',
    'activities.update',
    'followups.create',
    'followups.update'
  ),
  validate({ query: userOptionsQuery }),
  userController.listUserOptions
);
router.post(
  '/',
  requirePermission('users.create'),
  validate({ body: createUserSchema }),
  userController.createUser
);
router.get(
  '/:id',
  requirePermission('users.read'),
  validate({ params: idParam }),
  userController.getUser
);
router.put(
  '/:id',
  requirePermission('users.update'),
  validate({ params: idParam, body: updateUserSchema }),
  userController.updateUser
);
router.patch(
  '/:id/status',
  requirePermission('users.changeStatus'),
  validate({ params: idParam, body: updateStatusSchema }),
  userController.updateStatus
);
router.patch(
  '/:id/reset-password',
  requirePermission('users.resetPassword'),
  validate({ params: idParam, body: resetPasswordSchema }),
  userController.resetPassword
);
router.delete(
  '/:id',
  requirePermission('users.delete'),
  validate({ params: idParam }),
  userController.deleteUser
);

export default router;
