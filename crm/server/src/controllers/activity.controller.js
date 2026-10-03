import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import * as activityService from '../services/activity.service.js';
import * as followUpService from '../services/followUp.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

// --- activities ----------------------------------------------------------------

export async function listActivities(req, res) {
  const data = await activityService.listActivities(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.ACTIVITIES_LISTED, data });
}

export async function createActivity(req, res) {
  const activity = await activityService.createActivity(req.body, req.user);
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: MESSAGES.ACTIVITY_CREATED,
    data: { activity },
  });
}

export async function updateActivity(req, res) {
  const activity = await activityService.updateActivity(req.validated.params.id, req.body);
  return sendSuccess(res, { message: MESSAGES.ACTIVITY_UPDATED, data: { activity } });
}

export async function deleteActivity(req, res) {
  await activityService.deleteActivity(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.ACTIVITY_DELETED });
}

// --- follow-ups ----------------------------------------------------------------

export async function listFollowUps(req, res) {
  const data = await followUpService.listFollowUps(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.FOLLOW_UPS_LISTED, data });
}

export async function createFollowUp(req, res) {
  const followUp = await followUpService.createFollowUp(req.body, req.user);
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: MESSAGES.FOLLOW_UP_CREATED,
    data: { followUp },
  });
}

export async function updateFollowUp(req, res) {
  const followUp = await followUpService.updateFollowUp(req.validated.params.id, req.body, req.user);
  return sendSuccess(res, { message: MESSAGES.FOLLOW_UP_UPDATED, data: { followUp } });
}

export async function completeFollowUp(req, res) {
  const followUp = await followUpService.completeFollowUp(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.FOLLOW_UP_COMPLETED, data: { followUp } });
}

export async function rescheduleFollowUp(req, res) {
  const followUp = await followUpService.rescheduleFollowUp(req.validated.params.id, req.body);
  return sendSuccess(res, { message: MESSAGES.FOLLOW_UP_RESCHEDULED, data: { followUp } });
}
