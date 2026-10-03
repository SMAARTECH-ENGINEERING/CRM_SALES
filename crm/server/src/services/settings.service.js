import env from '../config/env.js';
import { HTTP_STATUS, MESSAGES, NOTIFICATION_TYPE } from '../constants/index.js';
import AppSettings, { APP_SETTINGS_KEY } from '../models/AppSettings.js';
import CompanyProfile, { COMPANY_PROFILE_KEY } from '../models/CompanyProfile.js';
import Tax from '../models/Tax.js';
import ApiError from '../utils/ApiError.js';
import { formatCode } from './sequence.service.js';

const KEY = { key: COMPANY_PROFILE_KEY };
// Have defaults in the schema, so "clearing" them means going back to the default.
const DEFAULTED_FIELDS = ['quotationValidityDays'];

// --- the company's own details ----------------------------------------------------------

// The profile as stored, or an empty one (schema defaults only) if it has never
// been saved. Nothing is written by reading.
export async function getCompanyProfile() {
  return (await CompanyProfile.findOne(KEY)) ?? new CompanyProfile(KEY);
}

// Applies the fields that are sent; '' or null clears one.
export async function updateCompanyProfile(input, actor) {
  const profile = await getCompanyProfile();
  for (const [field, value] of Object.entries(input)) {
    const cleared = value === '' || value === null;
    if (cleared && DEFAULTED_FIELDS.includes(field)) profile[field] = CompanyProfile.schema.path(field).defaultValue;
    else profile[field] = cleared ? undefined : value;
  }
  profile.updatedBy = actor.id;
  await profile.save();
  invalidate();
  return profile;
}

// For documents sent to customers: they must say who they are from.
export async function requireCompanyProfile() {
  const profile = await getCompanyProfile();
  if (!profile.name) throw ApiError.conflict(MESSAGES.COMPANY_PROFILE_MISSING);
  return profile;
}

// --- application settings ------------------------------------------------------------------
//
// Every setting has a default: what the server's environment (.env) says, so
// an installation behaves exactly as before until an administrator changes
// something. What is stored in the database wins over the default.
//
// Settings are read on almost every request, so the resolved values are kept
// in memory for a short while. Saving refreshes them at once on this server;
// another server picks the change up when its copy expires.

const CACHE_MS = 15 * 1000;
export const DATE_FORMATS = Object.freeze(['locale', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD MMM YYYY']);

// The groups stored in AppSettings, with the default of each value.
const defaults = () => ({
  crm: {
    // '' = each person's own browser time zone.
    timezone: '',
    // 'locale' = each person's own browser convention.
    dateFormat: 'locale',
    companyPrefix: env.companyCode.prefix,
    leadPrefix: env.leadNumber.prefix,
    opportunityPrefix: env.opportunityNumber.prefix,
    customerPrefix: env.customerNumber.prefix,
    projectPrefix: env.projectNumber.prefix,
    ticketPrefix: env.ticketNumber.prefix,
    contractPrefix: env.contractNumber.prefix,
  },
  sales: {
    orderPrefix: env.orderNumber.prefix,
    invoicePrefix: env.invoiceNumber.prefix,
    defaultTaxId: null,
    allowOverpayment: env.paymentAllowOverpayment,
  },
  quotation: {
    quotationPrefix: env.quotationNumber.prefix,
    // {{greeting}} ("Dear <contact>," or "Hello,"), {{contactName}},
    // {{quotationNumber}} and {{companyName}} are filled in.
    emailSubject: 'Quotation {{quotationNumber}} from {{companyName}}',
    emailMessage: '{{greeting}}\n\nPlease find attached our quotation {{quotationNumber}}.\n\nRegards,\n{{companyName}}',
  },
  notifications: {
    disabledTypes: [],
    contractReminderEmails: true,
  },
  email: {
    fromName: '',
    fromAddress: env.mail.from ?? '',
    replyTo: '',
  },
  documents: {
    maxFileMb: env.uploads.maxFileBytes / (1024 * 1024),
    maxFiles: env.uploads.maxFiles,
    allowedTypes: [...env.uploads.allowedTypes],
  },
  branding: {
    // The id of a colour theme of the web app; '' = the web app's default.
    theme: '',
    // '' = the company logo.
    loginLogo: '',
    favicon: '',
  },
  security: {
    allowPublicRegistration: env.allowPublicRegistration,
    passwordMinLength: 8,
  },
});
// Which collection's numbers each prefix is for, and how many digits they have.
const NUMBERING = {
  company: ['crm', 'companyPrefix', () => env.companyCode.digits],
  lead: ['crm', 'leadPrefix', () => env.leadNumber.digits],
  opportunity: ['crm', 'opportunityPrefix', () => env.opportunityNumber.digits],
  customer: ['crm', 'customerPrefix', () => env.customerNumber.digits],
  project: ['crm', 'projectPrefix', () => env.projectNumber.digits],
  ticket: ['crm', 'ticketPrefix', () => env.ticketNumber.digits],
  contract: ['crm', 'contractPrefix', () => env.contractNumber.digits],
  order: ['sales', 'orderPrefix', () => env.orderNumber.digits],
  invoice: ['sales', 'invoicePrefix', () => env.invoiceNumber.digits],
  quotation: ['quotation', 'quotationPrefix', () => env.quotationNumber.digits],
};

let cache = null;
function invalidate() {
  cache = null;
}

const isSet = (value) => value !== undefined && value !== null;

// Defaults overlaid with what is stored, plus the company profile's own fields.
async function resolve() {
  const [stored, profile] = await Promise.all([AppSettings.findOne({ key: APP_SETTINGS_KEY }).lean(), getCompanyProfile()]);
  const settings = defaults();
  for (const [group, values] of Object.entries(settings)) {
    for (const field of Object.keys(values)) {
      const value = stored?.[group]?.[field];
      if (isSet(value)) settings[group][field] = field === 'defaultTaxId' ? String(value) : value;
    }
  }
  const company = profile.toJSON();
  // These two live on the profile (the quotation builder reads them there).
  settings.quotation.validityDays = profile.quotationValidityDays;
  settings.quotation.terms = profile.quotationTerms ?? '';
  for (const field of ['id', 'createdAt', 'updatedAt', 'updatedBy', 'quotationValidityDays', 'quotationTerms']) delete company[field];
  return { company, ...settings, updatedAt: stored?.updatedAt ?? profile.updatedAt ?? null };
}

// The settings in force. Cached briefly; never mutate what is returned.
export async function getSettings() {
  if (!cache || cache.expires < Date.now()) cache = { value: await resolve(), expires: Date.now() + CACHE_MS };
  return cache.value;
}

// --- GET /settings --------------------------------------------------------------------------

// What every signed-in user needs to show things correctly: the company's
// name and logo, the currency, how dates read, what may be uploaded.
function publicPart(settings) {
  return {
    company: { name: settings.company.name ?? '', logo: settings.company.logo ?? '', currency: settings.company.currency ?? '' },
    crm: { timezone: settings.crm.timezone, dateFormat: settings.crm.dateFormat },
    documents: settings.documents,
    branding: settings.branding,
  };
}

// What the sign-in page shows before anyone has signed in: the company's name
// and logo, and the branding. Nothing else is public.
export async function readPublicSettings() {
  const settings = await getSettings();
  return { company: { name: settings.company.name ?? '', logo: settings.company.logo ?? '' }, branding: settings.branding };
}

// Everything for those who manage settings; the public part for everyone else.
export async function readSettings({ full }) {
  const settings = await getSettings();
  if (!full) return { settings: publicPart(settings), editable: false };
  return {
    settings,
    editable: true,
    // What the screens need to offer choices - none of it is a setting.
    meta: {
      dateFormats: DATE_FORMATS,
      notificationTypes: Object.values(NOTIFICATION_TYPE),
      // Whether a mail server is configured in the environment. Its address
      // and password are never part of the settings.
      emailConfigured: Boolean(env.mail.host || env.mail.smtpUrl),
      storageDriver: env.storage.driver,
    },
  };
}

// --- PUT /settings --------------------------------------------------------------------------

const unprocessable = (field, message) => new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, MESSAGES.VALIDATION_FAILED, [{ field, message }]);

function assertTimezone(timezone) {
  if (!timezone) return;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    throw unprocessable('crm.timezone', `"${timezone}" is not a time zone this server knows (use an IANA name such as Asia/Kolkata)`);
  }
}

// Applies the groups and fields that are sent. '' or null puts a value back
// to its default. The company group is the company profile.
export async function updateSettings(input, actor) {
  const { company, quotation = {}, ...groups } = input;
  assertTimezone(groups.crm?.timezone);
  if (groups.sales?.defaultTaxId && !(await Tax.exists({ _id: groups.sales.defaultTaxId, isActive: true }))) {
    throw ApiError.badRequest(MESSAGES.PRODUCT_TAX_NOT_FOUND, [{ field: 'sales.defaultTaxId', message: MESSAGES.PRODUCT_TAX_NOT_FOUND }]);
  }

  // Quotation defaults that are kept on the profile.
  const { validityDays, terms, ...quotationRest } = quotation;
  const profileInput = { ...(company ?? {}) };
  if (validityDays !== undefined) profileInput.quotationValidityDays = validityDays;
  if (terms !== undefined) profileInput.quotationTerms = terms;
  if (Object.keys(profileInput).length) await updateCompanyProfile(profileInput, actor);

  const stored = (await AppSettings.findOne({ key: APP_SETTINGS_KEY })) ?? new AppSettings({ key: APP_SETTINGS_KEY });
  for (const [group, values] of Object.entries({ ...groups, quotation: quotationRest })) {
    for (const [field, value] of Object.entries(values ?? {})) {
      const cleared = value === '' || value === null;
      stored.set(`${group}.${field}`, cleared ? undefined : value);
    }
  }
  stored.updatedBy = actor.id;
  await stored.save();
  invalidate();
  return readSettings({ full: true });
}

// --- what the rest of the server asks --------------------------------------------------------

// "LEAD-000042": the next number of a kind, with the prefix in force.
export async function numberFor(kind, number) {
  const [group, field, digits] = NUMBERING[kind];
  return formatCode((await getSettings())[group][field], number, digits());
}

// Refuses a password shorter than the configured minimum (the other rules -
// letters, digit, symbol - are fixed and checked when the request is validated).
export async function assertPasswordPolicy(password, field = 'password') {
  const { passwordMinLength } = (await getSettings()).security;
  if (password.length < passwordMinLength) throw unprocessable(field, `${field} must be at least ${passwordMinLength} characters long`);
}

// Fills {{name}} placeholders; unknown ones are left as they are.
export const fillTemplate = (template, values) => template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => (name in values ? values[name] : match));

// For tests: forget what is cached.
export const resetSettingsCache = invalidate;
