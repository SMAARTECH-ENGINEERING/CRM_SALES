import dotenv from 'dotenv';
import Joi from 'joi';

dotenv.config({ quiet: true });

const codePrefix = Joi.string().pattern(/^[A-Z0-9]{1,10}$/);

// What a company / contact may be matched on. "name" for a contact means first
// and last name together.
const COMPANY_MATCHABLE = ['gstNumber', 'panNumber', 'email', 'phone', 'website', 'name'];
const CONTACT_MATCHABLE = ['email', 'phone', 'alternatePhone', 'name'];

const splitList = (text) =>
  text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

// A comma-separated list in which every entry must be one of `allowed`.
const fieldList = (allowed) =>
  Joi.string().custom((text, helpers) => {
    const unknown = splitList(text).filter((field) => !allowed.includes(field));
    if (!unknown.length) return text;
    return helpers.message(
      `{{#label}} contains unsupported field(s): ${unknown.join(', ')}. Allowed: ${allowed.join(', ')}`
    );
  });

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(5000),
  API_PREFIX: Joi.string().pattern(/^\/\S+$/).default('/api/v1'),
  MONGODB_URI: Joi.string()
    .pattern(/^mongodb(\+srv)?:\/\//)
    .required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  BCRYPT_SALT_ROUNDS: Joi.number().integer().min(10).max(15).default(12),
  // Unset means "open outside production, closed in production".
  ALLOW_PUBLIC_REGISTRATION: Joi.boolean().empty(''),
  LOGIN_RATE_LIMIT_WINDOW_MS: Joi.number().integer().positive().default(15 * 60 * 1000),
  LOGIN_RATE_LIMIT_MAX: Joi.number().integer().positive().default(10),
  COMPANY_CODE_PREFIX: Joi.string()
    .pattern(/^[A-Z0-9]{1,10}$/)
    .default('COMP'),
  COMPANY_CODE_DIGITS: Joi.number().integer().min(3).max(12).default(6),
  LEAD_NUMBER_PREFIX: codePrefix.default('LEAD'),
  LEAD_NUMBER_DIGITS: Joi.number().integer().min(3).max(12).default(6),
  OPPORTUNITY_NUMBER_PREFIX: codePrefix.default('OPP'),
  OPPORTUNITY_NUMBER_DIGITS: Joi.number().integer().min(3).max(12).default(6),
  QUOTATION_NUMBER_PREFIX: codePrefix.default('QUO'),
  QUOTATION_NUMBER_DIGITS: Joi.number().integer().min(3).max(12).default(6),
  ORDER_NUMBER_PREFIX: codePrefix.default('ORD'),
  CUSTOMER_NUMBER_PREFIX: codePrefix.default('CUST'),
  PROJECT_NUMBER_PREFIX: codePrefix.default('PRJ'),
  TICKET_NUMBER_PREFIX: codePrefix.default('TKT'),
  TICKET_NUMBER_DIGITS: Joi.number().integer().min(3).max(12).default(6),
  // The audit trail (see middleware/audit.js). Leave on; false is for test runs.
  AUDIT_ENABLED: Joi.boolean().empty('').default(true),
  // The most rows one report export (CSV, Excel, PDF) may hold.
  REPORT_EXPORT_MAX_ROWS: Joi.number().integer().min(100).max(200000).default(10000),
  // How often the server looks for follow-ups that have come due and payments
  // that have become overdue, to notify the people concerned. 0 = off.
  NOTIFICATION_CHECK_INTERVAL_MINUTES: Joi.number().integer().min(0).max(1440).default(15),
  INVOICE_NUMBER_PREFIX: codePrefix.default('INV'),
  INVOICE_NUMBER_DIGITS: Joi.number().integer().min(3).max(12).default(6),
  // false (the default): the amount paid may not exceed the invoice amount,
  // and an order's invoices may not add up to more than the order total.
  // true: both are allowed (advance payments, extra charges).
  PAYMENT_ALLOW_OVERPAYMENT: Joi.boolean().empty('').default(false),
  CONTRACT_NUMBER_PREFIX: codePrefix.default('CON'),
  CONTRACT_NUMBER_DIGITS: Joi.number().integer().min(3).max(12).default(6),
  // How often the server checks for contracts to remind about (and to mark
  // expired). 0 turns the automatic check off; it can still be run on demand.
  // The reminder periods themselves are data, managed in Settings.
  CONTRACT_REMINDER_INTERVAL_MINUTES: Joi.number().integer().min(0).max(1440).default(60),
  // Uploaded files (ticket attachments). Relative paths are from the server folder.
  UPLOAD_DIR: Joi.string().default('uploads'),
  UPLOAD_MAX_FILE_MB: Joi.number().positive().max(100).default(10),
  UPLOAD_MAX_FILES: Joi.number().integer().min(1).max(20).default(5),
  // MIME types that may be uploaded; a trailing /* allows a whole family.
  UPLOAD_ALLOWED_TYPES: Joi.string().default(
    'image/*,application/pdf,text/plain,text/csv,application/zip,application/x-zip-compressed,' +
      'application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
      'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ),
  // Where uploaded files are kept: "s3" (any S3-compatible object store) or
  // "local" (the UPLOAD_DIR folder - development only).
  STORAGE_DRIVER: Joi.string().valid('local', 's3').empty('').default('local'),
  S3_BUCKET: Joi.string().min(3).max(63).empty('').when('STORAGE_DRIVER', { is: 's3', then: Joi.required() }),
  S3_REGION: Joi.string().empty('').default('us-east-1'),
  // Only for stores other than AWS (MinIO, R2, Spaces, ...).
  S3_ENDPOINT: Joi.string().uri({ scheme: ['http', 'https'] }).empty(''),
  // Omit both to use the SDK default chain (an instance role, for example).
  S3_ACCESS_KEY_ID: Joi.string().empty(''),
  S3_SECRET_ACCESS_KEY: Joi.string().empty(''),
  S3_FORCE_PATH_STYLE: Joi.boolean().empty('').default(false),
  // Optional folder inside the bucket.
  S3_KEY_PREFIX: Joi.string().pattern(/^[A-Za-z0-9/_-]+$/).empty(''),
  PROJECT_NUMBER_DIGITS: Joi.number().integer().min(3).max(12).default(6),
  CUSTOMER_NUMBER_DIGITS: Joi.number().integer().min(3).max(12).default(6),
  ORDER_NUMBER_DIGITS: Joi.number().integer().min(3).max(12).default(6),
  // Outgoing email (quotations). Either SMTP_HOST (+ port, user, password) or
  // a single SMTP_URL. With neither, nothing is emailed.
  SMTP_HOST: Joi.string().hostname().empty(''),
  // 465 means an encrypted (TLS) connection from the start; 587 upgrades with STARTTLS.
  SMTP_PORT: Joi.number().port().empty(''),
  SMTP_USER: Joi.string().max(320).empty(''),
  SMTP_PASS: Joi.string().max(500).empty(''),
  // Not checked as a URI: nodemailer parses it. A user name containing "@"
  // must be written %40 - or use SMTP_USER instead.
  SMTP_URL: Joi.string()
    .pattern(/^smtps?:\/\/\S+$/)
    .empty('')
    .messages({ 'string.pattern.base': '{{#label}} must start with smtp:// or smtps:// (or use SMTP_HOST, SMTP_USER, SMTP_PASS instead)' }),
  // Sender address; defaults to the email in the company profile.
  MAIL_FROM: Joi.string().max(320).empty(''),
  // Prefix for generated product SKUs when the product's category has none.
  PRODUCT_SKU_PREFIX: codePrefix.default('PRD'),
  PRODUCT_SKU_DIGITS: Joi.number().integer().min(3).max(12).default(6),
  // Fields used to recognise an existing company / contact before creating one
  // (lead conversion). Checked in the order given; the first match wins.
  COMPANY_MATCH_FIELDS: fieldList(COMPANY_MATCHABLE).default('gstNumber,email,name'),
  CONTACT_MATCH_FIELDS: fieldList(CONTACT_MATCHABLE).default('email,phone'),
  CORS_ORIGIN: Joi.string().allow('').default(''),
  // false switches both limiters (all requests, and failed sign-ins) off.
  RATE_LIMIT_ENABLED: Joi.boolean().default(true),
  RATE_LIMIT_WINDOW_MS: Joi.number().integer().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: Joi.number().integer().positive().default(300),
  TRUST_PROXY: Joi.number().integer().min(0).default(0),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
})
  .and('S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY')
  .unknown(true);

const { value, error } = schema.validate(process.env, { abortEarly: false });

if (error) {
  const details = error.details.map((d) => `  - ${d.message}`).join('\n');
  // Logger is not available yet (it depends on this module), so write directly.
  console.error(
    `Invalid environment configuration:\n${details}\n` +
      'Copy .env.example to .env and fill it in, or run `npm run setup:env`.'
  );
  process.exit(1);
}

const env = Object.freeze({
  nodeEnv: value.NODE_ENV,
  isProduction: value.NODE_ENV === 'production',
  isTest: value.NODE_ENV === 'test',
  port: value.PORT,
  apiPrefix: value.API_PREFIX.replace(/\/+$/, ''),
  mongodbUri: value.MONGODB_URI,
  jwt: Object.freeze({
    accessSecret: value.JWT_ACCESS_SECRET,
    refreshSecret: value.JWT_REFRESH_SECRET,
    accessExpiresIn: value.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: value.JWT_REFRESH_EXPIRES_IN,
  }),
  bcryptSaltRounds: value.BCRYPT_SALT_ROUNDS,
  allowPublicRegistration: value.ALLOW_PUBLIC_REGISTRATION ?? value.NODE_ENV !== 'production',
  loginRateLimit: Object.freeze({
    windowMs: value.LOGIN_RATE_LIMIT_WINDOW_MS,
    max: value.LOGIN_RATE_LIMIT_MAX,
  }),
  companyCode: Object.freeze({
    prefix: value.COMPANY_CODE_PREFIX,
    digits: value.COMPANY_CODE_DIGITS,
  }),
  leadNumber: Object.freeze({
    prefix: value.LEAD_NUMBER_PREFIX,
    digits: value.LEAD_NUMBER_DIGITS,
  }),
  opportunityNumber: Object.freeze({
    prefix: value.OPPORTUNITY_NUMBER_PREFIX,
    digits: value.OPPORTUNITY_NUMBER_DIGITS,
  }),
  quotationNumber: Object.freeze({
    prefix: value.QUOTATION_NUMBER_PREFIX,
    digits: value.QUOTATION_NUMBER_DIGITS,
  }),
  ticketNumber: Object.freeze({
    prefix: value.TICKET_NUMBER_PREFIX,
    digits: value.TICKET_NUMBER_DIGITS,
  }),
  auditEnabled: value.AUDIT_ENABLED,
  reportExportMaxRows: value.REPORT_EXPORT_MAX_ROWS,
  notificationCheckIntervalMinutes: value.NOTIFICATION_CHECK_INTERVAL_MINUTES,
  invoiceNumber: Object.freeze({
    prefix: value.INVOICE_NUMBER_PREFIX,
    digits: value.INVOICE_NUMBER_DIGITS,
  }),
  paymentAllowOverpayment: value.PAYMENT_ALLOW_OVERPAYMENT,
  contractNumber: Object.freeze({
    prefix: value.CONTRACT_NUMBER_PREFIX,
    digits: value.CONTRACT_NUMBER_DIGITS,
  }),
  contractReminderIntervalMinutes: value.CONTRACT_REMINDER_INTERVAL_MINUTES,
  uploads: Object.freeze({
    dir: value.UPLOAD_DIR,
    maxFileBytes: Math.round(value.UPLOAD_MAX_FILE_MB * 1024 * 1024),
    maxFiles: value.UPLOAD_MAX_FILES,
    allowedTypes: Object.freeze(splitList(value.UPLOAD_ALLOWED_TYPES)),
  }),
  storage: Object.freeze({
    driver: value.STORAGE_DRIVER,
    s3: Object.freeze({
      bucket: value.S3_BUCKET,
      region: value.S3_REGION,
      endpoint: value.S3_ENDPOINT,
      accessKeyId: value.S3_ACCESS_KEY_ID,
      secretAccessKey: value.S3_SECRET_ACCESS_KEY,
      forcePathStyle: value.S3_FORCE_PATH_STYLE,
      keyPrefix: value.S3_KEY_PREFIX,
    }),
  }),
  projectNumber: Object.freeze({
    prefix: value.PROJECT_NUMBER_PREFIX,
    digits: value.PROJECT_NUMBER_DIGITS,
  }),
  customerNumber: Object.freeze({
    prefix: value.CUSTOMER_NUMBER_PREFIX,
    digits: value.CUSTOMER_NUMBER_DIGITS,
  }),
  orderNumber: Object.freeze({
    prefix: value.ORDER_NUMBER_PREFIX,
    digits: value.ORDER_NUMBER_DIGITS,
  }),
  mail: Object.freeze({
    smtpUrl: value.SMTP_URL,
    host: value.SMTP_HOST,
    port: value.SMTP_PORT ?? 587,
    user: value.SMTP_USER,
    pass: value.SMTP_PASS,
    from: value.MAIL_FROM,
  }),
  productSku: Object.freeze({
    prefix: value.PRODUCT_SKU_PREFIX,
    digits: value.PRODUCT_SKU_DIGITS,
  }),
  matchFields: Object.freeze({
    company: Object.freeze(splitList(value.COMPANY_MATCH_FIELDS)),
    contact: Object.freeze(splitList(value.CONTACT_MATCH_FIELDS)),
  }),
  corsOrigins: Object.freeze(
    value.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  ),
  rateLimit: Object.freeze({
    enabled: value.RATE_LIMIT_ENABLED,
    windowMs: value.RATE_LIMIT_WINDOW_MS,
    max: value.RATE_LIMIT_MAX,
  }),
  trustProxy: value.TRUST_PROXY,
  logLevel: value.LOG_LEVEL,
});

export default env;
