import { Router } from 'express';
import Joi from 'joi';
import { MESSAGES, NOTIFICATION_TYPE } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import * as settingsService from '../services/settings.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { declarePermission, hasPermission } from '../utils/permissions.js';
import { objectId } from '../validators/common.validator.js';

const MANAGE = declarePermission('settings.manage');

// Optional fields accept '' or null: for the company that clears the value, for
// every other group it puts the setting back to its default.
const text = (max) => Joi.string().trim().max(max).allow('', null);
const address = Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(254).allow('', null);
const prefix = Joi.string()
  .trim()
  .uppercase()
  .pattern(/^[A-Z0-9]{1,10}$/)
  .allow('', null)
  .messages({ 'string.pattern.base': '{{#label}} must be 1-10 letters or digits' });
const flag = Joi.boolean().allow(null);
const image = Joi.string().trim().uri({ scheme: ['https', 'http'] }).max(2048).allow('', null);

const company = {
  name: Joi.string().trim().min(2).max(200),
  legalName: text(200),
  address: text(500),
  city: text(100),
  state: text(100),
  country: text(100),
  postalCode: text(12),
  phone: text(20),
  email: address,
  website: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(2048).allow('', null),
  // Shown in the app header.
  logo: Joi.string().trim().uri({ scheme: ['https', 'http'] }).max(2048).allow('', null),
  gstNumber: text(15),
  panNumber: text(10),
  // Printed next to totals, e.g. INR.
  currency: Joi.string().trim().uppercase().pattern(/^[A-Z]{3}$/).allow('', null).messages({
    'string.pattern.base': '{{#label}} must be a 3-letter code such as INR',
  }),
  bankDetails: text(1000),
};

// PUT applies the fields that are sent; anything omitted is left unchanged.
const companyProfileSchema = Joi.object({
  ...company,
  quotationValidityDays: Joi.number().integer().min(1).max(365).allow('', null),
  quotationTerms: text(5000),
}).min(1);

// PUT /settings: any of the groups, each with any of its fields.
const settingsSchema = Joi.object({
  company: Joi.object(company),
  crm: Joi.object({
    // An IANA name such as Asia/Kolkata (checked against what the server knows).
    timezone: text(60),
    dateFormat: Joi.string().valid(...settingsService.DATE_FORMATS).allow('', null),
    companyPrefix: prefix,
    leadPrefix: prefix,
    opportunityPrefix: prefix,
    customerPrefix: prefix,
    projectPrefix: prefix,
    ticketPrefix: prefix,
    contractPrefix: prefix,
  }),
  sales: Joi.object({
    orderPrefix: prefix,
    invoicePrefix: prefix,
    defaultTaxId: objectId.allow('', null),
    allowOverpayment: flag,
  }),
  quotation: Joi.object({
    quotationPrefix: prefix,
    validityDays: Joi.number().integer().min(1).max(365).allow('', null),
    terms: text(5000),
    emailSubject: text(200),
    emailMessage: text(5000),
  }),
  notifications: Joi.object({
    disabledTypes: Joi.array().items(Joi.string().valid(...Object.values(NOTIFICATION_TYPE))).unique().allow(null),
    contractReminderEmails: flag,
  }),
  email: Joi.object({
    fromName: Joi.string().trim().max(100).pattern(/^[^<>"\r\n]*$/).allow('', null),
    fromAddress: address,
    replyTo: address,
  }),
  documents: Joi.object({
    maxFileMb: Joi.number().min(0.01).max(100).allow('', null),
    maxFiles: Joi.number().integer().min(1).max(20).allow('', null),
    // MIME types; a trailing /* allows a whole family.
    allowedTypes: Joi.array().items(Joi.string().trim().lowercase().pattern(/^[a-z0-9.+-]+\/(\*|[a-z0-9.+-]+)$/)).min(1).max(60).unique().allow(null),
  }),
  branding: Joi.object({
    // The id of one of the web app's colour themes.
    theme: Joi.string().trim().max(60).pattern(/^[\w-]+$/).allow('', null),
    loginLogo: image,
    favicon: image,
  }),
  security: Joi.object({
    allowPublicRegistration: flag,
    passwordMinLength: Joi.number().integer().min(8).max(64).allow('', null),
  }),
}).min(1);

const router = Router();

// For the sign-in page, before there is a user: the company's name and logo
// and the branding. No other setting is served without signing in.
router.get('/public', async (req, res) =>
  sendSuccess(res, { message: MESSAGES.SETTINGS_RETRIEVED, data: { settings: await settingsService.readPublicSettings() } })
);

router.use(authenticate);

// Every signed-in user gets what the screens need to show things correctly
// (company name and logo, currency, date format, upload limits). The rest is
// only for those who manage settings.
router.get('/', async (req, res) => {
  const data = await settingsService.readSettings({ full: hasPermission(req.user, MANAGE) });
  return sendSuccess(res, { message: MESSAGES.SETTINGS_RETRIEVED, data });
});

router.put('/', requirePermission(MANAGE), validate({ body: settingsSchema }), async (req, res) => {
  const data = await settingsService.updateSettings(req.body, req.user);
  return sendSuccess(res, { message: MESSAGES.SETTINGS_UPDATED, data });
});

// Our own details, printed on documents. Read by whoever prepares quotations
// (the builder takes its default terms and validity from here).
router.get(
  '/company',
  authorize('settings.manage', 'quotations.read', 'quotations.create', 'quotations.update'),
  async (req, res) => {
    const profile = await settingsService.getCompanyProfile();
    return sendSuccess(res, { message: MESSAGES.COMPANY_PROFILE_RETRIEVED, data: { profile } });
  }
);

router.put(
  '/company',
  requirePermission('settings.manage'),
  validate({ body: companyProfileSchema }),
  async (req, res) => {
    const profile = await settingsService.updateCompanyProfile(req.body, req.user);
    return sendSuccess(res, { message: MESSAGES.COMPANY_PROFILE_UPDATED, data: { profile } });
  }
);

export default router;
