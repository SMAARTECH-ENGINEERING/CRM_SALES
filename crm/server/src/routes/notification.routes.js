import { Router } from 'express';
import { MESSAGES } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import validate from '../middleware/validate.js';
import * as notificationService from '../services/notification.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { idParam } from '../validators/common.validator.js';
import { listNotificationsQuery } from '../validators/notification.validator.js';

// A user's own notifications. No permission is involved: every signed-in user
// has them, and nobody can see or touch anyone else's - every route works on
// req.user's notifications only.
const router = Router();
router.use(authenticate);

router.get('/', validate({ query: listNotificationsQuery }), async (req, res) => {
  const data = await notificationService.listNotifications(req.user._id, req.validated.query);
  return sendSuccess(res, { message: MESSAGES.NOTIFICATIONS_LISTED, data });
});
// Declared before /:id/read so "read-all" is not read as an id.
router.patch('/read-all', async (req, res) => {
  const data = await notificationService.markAllRead(req.user._id);
  return sendSuccess(res, { message: MESSAGES.NOTIFICATIONS_ALL_READ, data });
});
router.patch('/:id/read', validate({ params: idParam }), async (req, res) => {
  const data = await notificationService.markRead(req.user._id, req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.NOTIFICATION_READ, data });
});
router.delete('/:id', validate({ params: idParam }), async (req, res) => {
  const data = await notificationService.deleteNotification(req.user._id, req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.NOTIFICATION_DELETED, data });
});

export default router;
