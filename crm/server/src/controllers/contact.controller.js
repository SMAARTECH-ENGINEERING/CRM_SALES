import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import * as contactService from '../services/contact.service.js';
import { sendSuccess } from '../utils/apiResponse.js';

export async function listContacts(req, res) {
  const data = await contactService.listContacts(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.CONTACTS_LISTED, data });
}

export async function listContactOptions(req, res) {
  const contacts = await contactService.listContactOptions(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.CONTACT_OPTIONS, data: { contacts } });
}

export async function getContact(req, res) {
  const contact = await contactService.getContact(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.CONTACT_RETRIEVED, data: { contact } });
}

export async function createContact(req, res) {
  const contact = await contactService.createContact(req.body, req.user);
  return sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: MESSAGES.CONTACT_CREATED,
    data: { contact },
  });
}

export async function updateContact(req, res) {
  const contact = await contactService.updateContact(req.validated.params.id, req.body);
  return sendSuccess(res, { message: MESSAGES.CONTACT_UPDATED, data: { contact } });
}

export async function deleteContact(req, res) {
  await contactService.deleteContact(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.CONTACT_DELETED });
}
