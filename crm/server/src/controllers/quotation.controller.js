import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import * as quotationService from '../services/quotation.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function listQuotations(req, res) {
  const data = await quotationService.listQuotations(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.QUOTATIONS_LISTED, data });
}

export async function getQuotation(req, res) {
  const quotation = await quotationService.getQuotation(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.QUOTATION_RETRIEVED, data: { quotation } });
}

export async function calculateQuotation(req, res) {
  const data = await quotationService.calculateQuotation(req.body);
  return sendSuccess(res, { message: MESSAGES.QUOTATION_CALCULATED, data });
}

export async function createQuotation(req, res) {
  const quotation = await quotationService.createQuotation(req.body, req.user);
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: MESSAGES.QUOTATION_CREATED,
    data: { quotation },
  });
}

export async function updateQuotation(req, res) {
  const quotation = await quotationService.updateQuotation(req.validated.params.id, req.body, req.user);
  return sendSuccess(res, { message: MESSAGES.QUOTATION_UPDATED, data: { quotation } });
}

export async function deleteQuotation(req, res) {
  await quotationService.deleteQuotation(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.QUOTATION_DELETED });
}

export async function changeStatus(req, res) {
  const quotation = await quotationService.changeQuotationStatus(req.validated.params.id, req.body.statusId, req.user);
  return sendSuccess(res, { message: MESSAGES.QUOTATION_STATUS_UPDATED, data: { quotation } });
}

export async function sendQuotation(req, res) {
  const data = await quotationService.sendQuotation(req.validated.params.id, req.body, req.user);
  const message = data.email.delivered ? MESSAGES.QUOTATION_SENT : MESSAGES.QUOTATION_MARKED_SENT;
  return sendSuccess(res, { message, data });
}

// The one endpoint that does not answer with the JSON envelope: the body is the file.
export async function downloadPdf(req, res) {
  const { filename, buffer } = await quotationService.getQuotationPdf(req.validated.params.id);
  res.set({
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': buffer.length,
    'Cache-Control': 'no-store',
  });
  return res.status(HTTP_STATUS.OK).end(buffer);
}

export async function getTimeline(req, res) {
  const data = await quotationService.getQuotationTimeline(req.validated.params.id, req.validated.query);
  return sendSuccess(res, { message: MESSAGES.QUOTATION_TIMELINE, data });
}
