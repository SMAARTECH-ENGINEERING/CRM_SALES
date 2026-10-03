import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import * as opportunityService from '../services/opportunity.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function listOpportunities(req, res) {
  const data = await opportunityService.listOpportunities(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.OPPORTUNITIES_LISTED, data });
}

export async function listOpportunityOptions(req, res) {
  const opportunities = await opportunityService.listOpportunityOptions(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.OPPORTUNITY_OPTIONS, data: { opportunities } });
}

export async function getBoard(req, res) {
  const data = await opportunityService.getBoard(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.OPPORTUNITY_BOARD, data });
}

export async function getOpportunity(req, res) {
  const opportunity = await opportunityService.getOpportunity(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.OPPORTUNITY_RETRIEVED, data: { opportunity } });
}

export async function createOpportunity(req, res) {
  const opportunity = await opportunityService.createOpportunity(req.body, req.user);
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: MESSAGES.OPPORTUNITY_CREATED,
    data: { opportunity },
  });
}

export async function updateOpportunity(req, res) {
  const opportunity = await opportunityService.updateOpportunity(req.validated.params.id, req.body, req.user);
  return sendSuccess(res, { message: MESSAGES.OPPORTUNITY_UPDATED, data: { opportunity } });
}

export async function deleteOpportunity(req, res) {
  await opportunityService.deleteOpportunity(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.OPPORTUNITY_DELETED });
}

export async function moveOpportunity(req, res) {
  const opportunity = await opportunityService.moveOpportunity(req.validated.params.id, req.body.stageId, req.user);
  return sendSuccess(res, { message: MESSAGES.OPPORTUNITY_STAGE_UPDATED, data: { opportunity } });
}

export async function assignOpportunity(req, res) {
  const opportunity = await opportunityService.assignOpportunity(
    req.validated.params.id,
    req.body.assignedTo,
    req.user
  );
  return sendSuccess(res, { message: MESSAGES.OPPORTUNITY_ASSIGNED, data: { opportunity } });
}

export async function getTimeline(req, res) {
  const data = await opportunityService.getOpportunityTimeline(req.validated.params.id, req.validated.query);
  return sendSuccess(res, { message: MESSAGES.OPPORTUNITY_TIMELINE, data });
}
