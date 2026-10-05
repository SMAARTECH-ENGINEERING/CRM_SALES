import logger from '../config/logger.js';
import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import Lead from '../models/Lead.js';
import ApiError from '../utils/ApiError.js';
import { LEAD_ENTITY } from './lead.service.js';
import { isMailConfigured, sendMail } from './mail.service.js';
import { fillTemplate, getSettings } from './settings.service.js';
import { recordEvent } from './timeline.service.js';

// One email, written once, sent to the people behind several leads.
//
// Each recipient gets a message of their own - nobody sees anyone else's
// address - with {{placeholders}} filled in for them. The address is the
// lead's contact's, else its company's; a lead with neither is skipped and
// reported. Two leads with the same address get one email. Every lead that
// was emailed gets an entry in its history.

export const BULK_EMAIL_MAX_LEADS = 100;

const fullName = (contact) => [contact?.firstName, contact?.lastName].filter(Boolean).join(' ');

// The placeholders a message may use, and what each is for one lead.
function valuesFor(lead, companyName) {
  const name = fullName(lead.contactId);
  return {
    greeting: name ? `Dear ${name},` : 'Hello,',
    contactName: name,
    companyName: lead.companyId?.name ?? '',
    leadTitle: lead.title,
    leadNumber: lead.leadNumber,
    senderCompany: companyName,
  };
}

export async function emailLeads({ leadIds, subject, message }, actor) {
  if (!isMailConfigured()) throw new ApiError(HTTP_STATUS.CONFLICT, MESSAGES.LEAD_EMAIL_NOT_CONFIGURED);

  const leads = await Lead.find({ _id: { $in: leadIds } })
    .populate('contactId', 'firstName lastName email')
    .populate('companyId', 'name email');
  const found = new Set(leads.map((lead) => lead.id));
  const settings = await getSettings();
  const companyName = settings.company.name ?? '';

  const sent = [];
  const skipped = leadIds.filter((id) => !found.has(id)).map((id) => ({ leadId: id, reason: MESSAGES.LEAD_NOT_FOUND }));
  const failed = [];
  const addressed = new Map();

  for (const lead of leads) {
    const to = (lead.contactId?.email || lead.companyId?.email || '').trim().toLowerCase();
    const who = { leadId: lead.id, leadNumber: lead.leadNumber, title: lead.title };
    if (!to) {
      skipped.push({ ...who, reason: MESSAGES.LEAD_EMAIL_NO_ADDRESS });
      continue;
    }
    if (addressed.has(to)) {
      skipped.push({ ...who, to, reason: `${MESSAGES.LEAD_EMAIL_SAME_ADDRESS} ${addressed.get(to)}` });
      continue;
    }
    addressed.set(to, lead.leadNumber);

    const values = valuesFor(lead, companyName);
    const text = fillTemplate(message, values);
    try {
      // One at a time: mail servers limit how fast one account may send.
      await sendMail({ to, subject: fillTemplate(subject, values), text });
    } catch (err) {
      logger.error({ err, leadId: lead.id }, 'Failed to email a lead');
      failed.push({ ...who, to, reason: MESSAGES.LEAD_EMAIL_FAILED });
      continue;
    }
    sent.push({ ...who, to });
    await recordEvent({ entityType: LEAD_ENTITY, entityId: lead._id, action: 'emailed', summary: `Emailed to ${to}: ${fillTemplate(subject, values)}`, actor });
  }

  return { sent, skipped, failed, summary: { requested: leadIds.length, sent: sent.length, skipped: skipped.length, failed: failed.length } };
}
