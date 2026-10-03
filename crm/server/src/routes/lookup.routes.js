import { Router } from 'express';
import { getDepartments } from '../controllers/lookup.controller.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';

// Read-only list that the user screens need for a dropdown. Managing
// departments belongs to its own module.
export const departmentRoutes = Router();
departmentRoutes.get('/', authenticate, requirePermission('users.read'), getDepartments);
