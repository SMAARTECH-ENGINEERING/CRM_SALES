import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import * as leadService from '../services/lead.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function listLeads(req, res) {
  const data = await leadService.listLeads(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.LEADS_LISTED, data });
}

export async function getLead(req, res) {
  const lead = await leadService.getLead(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.LEAD_RETRIEVED, data: { lead } });
}

export async function createLead(req, res) {
  const lead = await leadService.createLead(req.body, req.user);
  return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: MESSAGES.LEAD_CREATED, data: { lead } });
}

export async function updateLead(req, res) {
  const lead = await leadService.updateLead(req.validated.params.id, req.body, req.user);
  return sendSuccess(res, { message: MESSAGES.LEAD_UPDATED, data: { lead } });
}

export async function deleteLead(req, res) {
  await leadService.deleteLead(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.LEAD_DELETED });
}

export async function assignLead(req, res) {
  const lead = await leadService.assignLead(req.validated.params.id, req.body.assignedTo, req.user);
  return sendSuccess(res, { message: MESSAGES.LEAD_ASSIGNED, data: { lead } });
}

export async function changeStatus(req, res) {
  const lead = await leadService.changeLeadStatus(req.validated.params.id, req.body.statusId, req.user);
  return sendSuccess(res, { message: MESSAGES.LEAD_STATUS_UPDATED, data: { lead } });
}

export async function convertLead(req, res) {
  const data = await leadService.convertLead(req.validated.params.id, req.body, req.user);
  if (data.dryRun) return sendSuccess(res, { message: MESSAGES.LEAD_CONVERSION_PREVIEW, data });
  return sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message: MESSAGES.LEAD_CONVERTED, data });
}

export async function getTimeline(req, res) {
  const data = await leadService.getLeadTimeline(req.validated.params.id, req.validated.query);
  return sendSuccess(res, { message: MESSAGES.LEAD_TIMELINE, data });
}
