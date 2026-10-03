import Joi from 'joi';
import { NOTIFICATION_TYPE, PAGINATION } from '../constants/index.js';

export const listNotificationsQuery = Joi.object({
  page: Joi.number().integer().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: Joi.number().integer().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
  // Omitted: both. false: only unread.
  isRead: Joi.boolean().empty(''),
  type: Joi.string()
    .valid(...Object.values(NOTIFICATION_TYPE))
    .empty(''),
});
