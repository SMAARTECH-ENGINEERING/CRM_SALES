import logger from '../config/logger.js';
import { HTTP_STATUS, MESSAGES, NOTIFICATION_TYPE, QUOTATION_STATUS_CATEGORY } from '../constants/index.js';
import Company from '../models/Company.js';
import Contact from '../models/Contact.js';
import Opportunity from '../models/Opportunity.js';
import '../models/Order.js';
import Quotation from '../models/Quotation.js';
import QuotationStatus from '../models/QuotationStatus.js';
import ApiError from '../utils/ApiError.js';
import { paginationMeta, searchFilter } from '../utils/query.js';
import { registerCompanySection } from './companySection.service.js';
import { registerContactDeleteGuard } from './contact.service.js';
import { getDefaultEntry, registerLeadConfigUsage } from './leadConfig.service.js';
import { isMailConfigured, sendMail } from './mail.service.js';
import { buildQuotationPdf } from './quotationPdf.service.js';
import { applyTotals, priceLines, productIdsOf, startOfDay } from './lineItems.service.js';
import { calculateTotals } from './quotationTotals.js';
import { nextSequence } from './sequence.service.js';
import { fillTemplate, getCompanyProfile, getSettings, numberFor, requireCompanyProfile } from './settings.service.js';
import { notifyUsers } from './notification.service.js';
import { diffSnapshots, listEvents, recordEvent } from './timeline.service.js';

export const QUOTATION_ENTITY = 'quotation';

const { DRAFT, SENT, ACCEPTED, REJECTED } = QUOTATION_STATUS_CATEGORY;
const DAY_MS = 24 * 60 * 60 * 1000;

// People may have been deleted since; their names should still show.
const PERSON = { select: 'firstName lastName email', options: { withDeleted: true } };
const POPULATE = [
  {
    path: 'companyId',
    select: 'companyCode name legalName email phone address city state country postalCode gstNumber status',
  },
  { path: 'contactId', select: 'firstName lastName email phone designation' },
  { path: 'opportunityId', select: 'opportunityNumber name status' },
  { path: 'statusId', select: 'name color category isActive' },
  { path: 'orderId', select: 'orderNumber' },
  { path: 'sentBy', ...PERSON },
  { path: 'createdBy', ...PERSON },
];

const SEARCH_FIELDS = ['quotationNumber', 'notes', 'items.name', 'items.sku'];
const FILTER_FIELDS = ['statusId', 'companyId', 'contactId', 'opportunityId', 'createdBy'];

// Fields tracked in the timeline for ordinary edits, with the label shown for each.
const TIMELINE_LABELS = {
  company: 'Company',
  contact: 'Contact',
  opportunity: 'Opportunity',
  quotationDate: 'Quotation date',
  validUntil: 'Valid until',
  items: 'Items',
  discount: 'Discount',
  grandTotal: 'Grand total',
  notes: 'Notes',
  termsAndConditions: 'Terms and conditions',
};

const day = (date) => (date ? new Date(date).toISOString().slice(0, 10) : '');
const idOf = (reference) => (reference ? String(reference._id ?? reference) : '');
const empty = (value) => value === undefined || value === null || value === '';

// Readable values of a populated quotation, for comparing before and after an update.
function snapshot(quotation) {
  return {
    company: quotation.companyId?.name ?? '',
    contact: quotation.contactId?.fullName ?? '',
    opportunity: quotation.opportunityId?.opportunityNumber ?? '',
    quotationDate: day(quotation.quotationDate),
    validUntil: day(quotation.validUntil),
    items: quotation.items.map((item) => `${item.quantity} x ${item.name} @ ${item.unitPrice}`).join('; '),
    discount: `${quotation.discountPercent}%`,
    grandTotal: String(quotation.grandTotal),
    notes: quotation.notes ?? '',
    termsAndConditions: quotation.termsAndConditions ?? '',
  };
}

// --- relationships with other modules ----------------------------------------------

// Quotations appear on the company page, and a company, contact or status that
// they point to cannot be deleted.
registerCompanySection('quotations', {
  count: (companyId) => Quotation.countDocuments({ companyId }),
  blocksDelete: true,
});
registerContactDeleteGuard('Quotations', (contactId) => Quotation.countDocuments({ contactId }));
registerLeadConfigUsage('quotationStatuses', (statusId) => Quotation.countDocuments({ statusId }));

// --- helpers -----------------------------------------------------------------

const badReference = (field, message) => ApiError.badRequest(message, [{ field, message }]);
const unprocessable = (field, message) =>
  new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, MESSAGES.VALIDATION_FAILED, [{ field, message }]);

async function findQuotation(id) {
  const quotation = await Quotation.findById(id).populate(POPULATE);
  if (!quotation) throw ApiError.notFound(MESSAGES.QUOTATION_NOT_FOUND);
  return quotation;
}

// A quotation is always for a company. Its contact must work there, and its
// opportunity must be one of that company's.
async function assertRelations({ companyId, contactId, opportunityId }) {
  if (!(await Company.exists({ _id: companyId }))) {
    throw badReference('companyId', MESSAGES.CONTACT_COMPANY_NOT_FOUND);
  }
  if (contactId) {
    const contact = await Contact.findById(contactId).select('companyId');
    if (!contact) throw badReference('contactId', MESSAGES.LEAD_CONTACT_NOT_FOUND);
    if (String(contact.companyId) !== companyId) {
      throw badReference('contactId', MESSAGES.LEAD_CONTACT_COMPANY_MISMATCH);
    }
  }
  if (opportunityId) {
    const opportunity = await Opportunity.findById(opportunityId).select('companyId');
    if (!opportunity) throw badReference('opportunityId', MESSAGES.QUOTATION_OPPORTUNITY_NOT_FOUND);
    if (String(opportunity.companyId) !== companyId) {
      throw badReference('opportunityId', MESSAGES.QUOTATION_OPPORTUNITY_COMPANY_MISMATCH);
    }
  }
}

async function assertActiveStatus(statusId) {
  const status = await QuotationStatus.findOne({ _id: statusId, isActive: true });
  if (!status) throw badReference('statusId', MESSAGES.QUOTATION_STATUS_NOT_FOUND);
  return status;
}

function assertDates(quotationDate, validUntil) {
  if (validUntil && startOfDay(validUntil) < startOfDay(quotationDate)) {
    throw unprocessable('validUntil', MESSAGES.QUOTATION_VALID_UNTIL_BEFORE_DATE);
  }
}

// The first active status with the given meaning, in list order.
function firstStatusOf(category) {
  return QuotationStatus.findOne({ category, isActive: true }).sort({ sortOrder: 1, name: 1 });
}

// --- operations --------------------------------------------------------------

export async function listQuotations(query) {
  const { page, limit, sortBy, sortOrder, statusCategory, dateFrom, dateTo } = query;

  const filter = { ...searchFilter(query.search, SEARCH_FIELDS) };
  for (const field of FILTER_FIELDS) {
    if (query[field]) filter[field] = query[field];
  }
  // "All sent quotations" etc. - by what the status means, whatever it is called.
  if (statusCategory && !filter.statusId) {
    filter.statusId = { $in: await QuotationStatus.distinct('_id', { category: statusCategory }) };
  }
  if (dateFrom || dateTo) {
    filter.quotationDate = {
      ...(dateFrom ? { $gte: startOfDay(dateFrom) } : {}),
      ...(dateTo ? { $lt: new Date(startOfDay(dateTo).getTime() + DAY_MS) } : {}),
    };
  }

  const [quotations, total] = await Promise.all([
    Quotation.find(filter)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1, _id: 1 })
      .collation({ locale: 'en', strength: 2 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate(POPULATE),
    Quotation.countDocuments(filter),
  ]);

  return { quotations, pagination: paginationMeta({ page, limit }, total) };
}

export function getQuotation(id) {
  return findQuotation(id);
}

// Prices lines and totals without saving anything: what the quotation builder
// shows while it is being filled in. The same code path as create and update.
export async function calculateQuotation({ items, discountPercent = 0, quotationId }) {
  const kept = quotationId
    ? productIdsOf(await findQuotation(quotationId))
    : new Set();
  return calculateTotals(await priceLines(items, kept), discountPercent);
}

export async function createQuotation(input, actor) {
  const statusId = input.statusId || (await getDefaultEntry('quotationStatuses'))?.id;
  if (!statusId) throw ApiError.conflict(MESSAGES.QUOTATION_NO_DEFAULT_STATUS);
  await assertActiveStatus(statusId);
  await assertRelations(input);

  // Dates and terms default from the company profile.
  const profile = await getCompanyProfile();
  const quotationDate = startOfDay(input.quotationDate ?? new Date());
  const validUntil = empty(input.validUntil)
    ? new Date(quotationDate.getTime() + profile.quotationValidityDays * DAY_MS)
    : startOfDay(input.validUntil);
  assertDates(quotationDate, validUntil);

  const quotation = new Quotation({
    companyId: input.companyId,
    contactId: input.contactId || undefined,
    opportunityId: input.opportunityId || undefined,
    quotationDate,
    validUntil,
    notes: input.notes || undefined,
    termsAndConditions: 'termsAndConditions' in input ? input.termsAndConditions || undefined : profile.quotationTerms,
    statusId,
    createdBy: actor.id,
  });
  applyTotals(quotation, await priceLines(input.items), input.discountPercent ?? 0);

  // Taken last, after everything that can fail, so rejected requests do not
  // leave gaps in the numbering.
  const number = await nextSequence(QUOTATION_ENTITY);
  quotation.quotationNumber = await numberFor('quotation', number);
  await quotation.save();

  await recordEvent({ entityType: QUOTATION_ENTITY, entityId: quotation._id, action: 'created', actor });
  return findQuotation(quotation.id);
}

// Edits everything except the status, which has its own endpoint.
export async function updateQuotation(id, input, actor) {
  const quotation = await findQuotation(id);
  if ([ACCEPTED, REJECTED].includes(quotation.statusId?.category)) {
    throw ApiError.conflict(MESSAGES.QUOTATION_LOCKED);
  }
  const before = snapshot(quotation);

  // The related records as they will be once the sent fields are applied.
  const relations = {
    companyId: input.companyId || idOf(quotation.companyId),
    contactId: 'contactId' in input ? input.contactId || '' : idOf(quotation.contactId),
    opportunityId: 'opportunityId' in input ? input.opportunityId || '' : idOf(quotation.opportunityId),
  };
  const changed = ['companyId', 'contactId', 'opportunityId'].some(
    (field) => relations[field] !== idOf(quotation[field])
  );
  if (changed) {
    await assertRelations(relations);
    quotation.companyId = relations.companyId;
    quotation.contactId = relations.contactId || undefined;
    quotation.opportunityId = relations.opportunityId || undefined;
  }

  if (!empty(input.quotationDate)) quotation.quotationDate = startOfDay(input.quotationDate);
  if ('validUntil' in input) quotation.validUntil = empty(input.validUntil) ? undefined : startOfDay(input.validUntil);
  assertDates(quotation.quotationDate, quotation.validUntil);

  for (const field of ['notes', 'termsAndConditions']) {
    if (field in input) quotation[field] = input[field] || undefined;
  }

  // Totals are recalculated whenever lines or the discount change. Lines that
  // are not resent keep the prices and tax rates they were written with.
  if (input.items || !empty(input.discountPercent)) {
    const kept = productIdsOf(quotation);
    const lines = input.items
      ? await priceLines(input.items, kept)
      : quotation.items.map((item) => item.toObject());
    applyTotals(quotation, lines, empty(input.discountPercent) ? quotation.discountPercent : input.discountPercent);
  }

  await quotation.save();
  const updated = await findQuotation(id);

  const changes = diffSnapshots(before, snapshot(updated), TIMELINE_LABELS);
  if (changes.length) {
    await recordEvent({ entityType: QUOTATION_ENTITY, entityId: updated._id, action: 'updated', changes, actor });
  }
  return updated;
}

async function setStatus(quotation, status, actor) {
  const from = quotation.statusId?.name;
  quotation.statusId = status._id;
  await quotation.save();
  await recordEvent({
    entityType: QUOTATION_ENTITY,
    entityId: quotation._id,
    action: 'status_changed',
    changes: [{ field: 'status', label: 'Status', from, to: status.name }],
    actor,
  });
  // Whoever prepared the quotation, and whoever owns the deal it belongs to.
  const opportunity = quotation.opportunityId ? await Opportunity.findById(idOf(quotation.opportunityId)).select('assignedTo') : null;
  await notifyUsers({
    recipients: [quotation.createdBy, opportunity?.assignedTo],
    exclude: actor,
    type: NOTIFICATION_TYPE.QUOTATION_STATUS_CHANGED,
    title: 'Quotation status changed',
    message: `${quotation.quotationNumber} is now ${status.name}${from ? ` (was ${from})` : ''}`,
    entityType: QUOTATION_ENTITY,
    entityId: quotation._id,
  });
}

export async function changeQuotationStatus(id, statusId, actor) {
  const quotation = await findQuotation(id);
  if (statusId === idOf(quotation.statusId)) return quotation;

  await setStatus(quotation, await assertActiveStatus(statusId), actor);
  return findQuotation(id);
}

// The PDF and the file name to offer it under.
export async function getQuotationPdf(id) {
  const quotation = await findQuotation(id);
  const profile = await requireCompanyProfile();
  return { filename: `${quotation.quotationNumber}.pdf`, buffer: await buildQuotationPdf(quotation, profile) };
}

// Emails the quotation (PDF attached) and marks it as sent.
//
// Without SMTP configured nothing is emailed: the quotation is still marked as
// sent - it was presumably delivered some other way - and the response says so.
export async function sendQuotation(id, input, actor) {
  const quotation = await findQuotation(id);
  const to = input.to || quotation.contactId?.email || quotation.companyId?.email;
  const email = { delivered: false, to: to ?? null };

  if (isMailConfigured()) {
    if (!to) throw badReference('to', MESSAGES.QUOTATION_NO_RECIPIENT);
    const profile = await requireCompanyProfile();
    const pdf = await buildQuotationPdf(quotation, profile);
    // The wording is a setting (Settings -> Quotation); these are filled in.
    const templates = (await getSettings()).quotation;
    const values = {
      greeting: quotation.contactId ? `Dear ${quotation.contactId.fullName},` : 'Hello,',
      contactName: quotation.contactId?.fullName ?? '',
      quotationNumber: quotation.quotationNumber,
      companyName: profile.name,
    };

    try {
      await sendMail({
        from: profile.email,
        to,
        subject: input.subject || fillTemplate(templates.emailSubject, values),
        text: input.message || fillTemplate(templates.emailMessage, values),
        attachments: [{ filename: `${quotation.quotationNumber}.pdf`, content: pdf, contentType: 'application/pdf' }],
      });
    } catch (err) {
      logger.error({ err, quotationId: quotation.id }, 'Failed to email quotation');
      throw new ApiError(HTTP_STATUS.BAD_GATEWAY, MESSAGES.QUOTATION_EMAIL_FAILED);
    }
    email.delivered = true;
  } else {
    email.reason = 'Email is not configured (SMTP_URL)';
  }

  quotation.sentAt = new Date();
  quotation.sentBy = actor.id;
  if (to) quotation.sentTo = to;
  await quotation.save();
  await recordEvent({
    entityType: QUOTATION_ENTITY,
    entityId: quotation._id,
    action: 'sent',
    summary: email.delivered ? `Emailed to ${to}` : 'Marked as sent (email is not configured)',
    actor,
  });

  // A draft becomes "sent". Anything further along keeps its status.
  if (quotation.statusId?.category === DRAFT) {
    const sentStatus = await firstStatusOf(SENT);
    if (sentStatus) await setStatus(quotation, sentStatus, actor);
  }

  return { quotation: await findQuotation(id), email };
}

export async function deleteQuotation(id, actor) {
  const quotation = await findQuotation(id);
  // The order it produced points back at it.
  if (quotation.orderId) throw ApiError.conflict(MESSAGES.QUOTATION_HAS_ORDER);
  quotation.deletedAt = new Date();
  await quotation.save();
  await recordEvent({ entityType: QUOTATION_ENTITY, entityId: quotation._id, action: 'deleted', actor });
}

export async function getQuotationTimeline(id, query) {
  const quotation = await findQuotation(id);
  return listEvents(QUOTATION_ENTITY, quotation._id, query);
}
