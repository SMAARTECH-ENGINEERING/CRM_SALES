import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import * as companyService from '../services/company.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function listCompanies(req, res) {
  const data = await companyService.listCompanies(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.COMPANIES_LISTED, data });
}

export async function listCompanyOptions(req, res) {
  const companies = await companyService.listCompanyOptions(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.COMPANY_OPTIONS, data: { companies } });
}

export async function getCompany(req, res) {
  const company = await companyService.getCompany(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.COMPANY_RETRIEVED, data: { company } });
}

export async function createCompany(req, res) {
  const company = await companyService.createCompany(req.body, req.user);
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: MESSAGES.COMPANY_CREATED,
    data: { company },
  });
}

export async function updateCompany(req, res) {
  const company = await companyService.updateCompany(req.validated.params.id, req.body, req.user);
  return sendSuccess(res, { message: MESSAGES.COMPANY_UPDATED, data: { company } });
}

export async function deleteCompany(req, res) {
  await companyService.deleteCompany(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.COMPANY_DELETED });
}

export async function getSections(req, res) {
  const sections = await companyService.getSections(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.COMPANY_SECTIONS, data: { sections } });
}

export async function getTimeline(req, res) {
  const data = await companyService.getTimeline(req.validated.params.id, req.validated.query);
  return sendSuccess(res, { message: MESSAGES.COMPANY_TIMELINE, data });
}
