import { Router } from 'express';
import * as controller from '../controllers/activity.controller.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import {
  createActivitySchema,
  createFollowUpSchema,
  listActivitiesQuery,
  listFollowUpsQuery,
  rescheduleFollowUpSchema,
  updateActivitySchema,
  updateFollowUpSchema,
} from '../validators/activity.validator.js';
import { idParam } from '../validators/common.validator.js';

// /activities
export const activityRoutes = Router();
activityRoutes.use(authenticate);

activityRoutes.get(
  '/',
  requirePermission('activities.read'),
  validate({ query: listActivitiesQuery }),
  controller.listActivities
);
activityRoutes.post(
  '/',
  requirePermission('activities.create'),
  validate({ body: createActivitySchema }),
  controller.createActivity
);
activityRoutes.put(
  '/:id',
  requirePermission('activities.update'),
  validate({ params: idParam, body: updateActivitySchema }),
  controller.updateActivity
);
activityRoutes.delete(
  '/:id',
  requirePermission('activities.delete'),
  validate({ params: idParam }),
  controller.deleteActivity
);

// /followups
export const followUpRoutes = Router();
followUpRoutes.use(authenticate);

const updateFollowUps = requirePermission('followups.update');

followUpRoutes.get(
  '/',
  requirePermission('followups.read'),
  validate({ query: listFollowUpsQuery }),
  controller.listFollowUps
);
followUpRoutes.post(
  '/',
  requirePermission('followups.create'),
  validate({ body: createFollowUpSchema }),
  controller.createFollowUp
);
followUpRoutes.put(
  '/:id',
  updateFollowUps,
  validate({ params: idParam, body: updateFollowUpSchema }),
  controller.updateFollowUp
);
followUpRoutes.patch('/:id/complete', updateFollowUps, validate({ params: idParam }), controller.completeFollowUp);
followUpRoutes.patch(
  '/:id/reschedule',
  updateFollowUps,
  validate({ params: idParam, body: rescheduleFollowUpSchema }),
  controller.rescheduleFollowUp
);
