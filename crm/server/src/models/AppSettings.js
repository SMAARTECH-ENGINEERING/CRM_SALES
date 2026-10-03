import mongoose from 'mongoose';

export const APP_SETTINGS_KEY = 'default';

const { ObjectId, Mixed } = mongoose.Schema.Types;
const text = (maxlength) => ({ type: String, trim: true, maxlength });

// Application settings an administrator can change without touching the
// server: one document, grouped. A value that is not stored falls back to its
// default (see services/settings.service.js) - so only what was actually
// changed is here. The company's own details are in CompanyProfile.
//
// Secrets (mail server password, storage keys, token secrets) are NOT settings:
// they stay in the server's environment and are never stored or served.
const appSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: APP_SETTINGS_KEY, unique: true, immutable: true },
    crm: {
      timezone: text(60),
      dateFormat: text(20),
      companyPrefix: text(10),
      leadPrefix: text(10),
      opportunityPrefix: text(10),
      customerPrefix: text(10),
      projectPrefix: text(10),
      ticketPrefix: text(10),
      contractPrefix: text(10),
    },
    sales: {
      orderPrefix: text(10),
      invoicePrefix: text(10),
      defaultTaxId: { type: ObjectId, ref: 'Tax' },
      allowOverpayment: { type: Boolean },
    },
    quotation: {
      quotationPrefix: text(10),
      emailSubject: text(200),
      emailMessage: text(5000),
    },
    notifications: {
      // { <notification type>: false } switches a type off; absent means on.
      disabledTypes: { type: [String], default: undefined },
      contractReminderEmails: { type: Boolean },
    },
    email: {
      fromName: text(100),
      fromAddress: text(254),
      replyTo: text(254),
    },
    documents: {
      maxFileMb: { type: Number },
      maxFiles: { type: Number },
      allowedTypes: { type: [String], default: undefined },
    },
    // How the web app is dressed for everyone: the colour theme people get
    // until they choose their own, and the images on the sign-in page and tab.
    branding: {
      theme: text(60),
      loginLogo: text(2048),
      favicon: text(2048),
    },
    security: {
      allowPublicRegistration: { type: Boolean },
      passwordMinLength: { type: Number },
    },
    // Reserved for values added later without a schema change.
    extra: { type: Mixed },
    updatedBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true, minimize: true }
);

export default mongoose.model('AppSettings', appSettingsSchema);
