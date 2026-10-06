import { SCRAPE_MATCH } from '../../constants/index.js';
import Company from '../../models/Company.js';
import Contact from '../../models/Contact.js';
import { escapeRegex } from '../../utils/query.js';
import { canonicalName, domainOf, emailDomain, nameSimilarity, phoneKey } from './normalize.js';

// Is a scraped company or person already in the CRM?
//
//   existing  - the same website, the same email, or the same name together
//               with the same phone or city: it is the CRM's record
//   possible  - only the name, a similar name or only the phone agrees: the
//               user decides (skip, update the existing one, or create new)
//   new       - nothing alike
//
// Results of the same job that look like each other are marked too. Nothing
// is merged automatically.

// A phone stored as "+91 98610-12345" is found from its last ten digits.
const phonePattern = (key) => new RegExp(`${key.split('').map(escapeRegex).join('[\\s\\-().]*')}$`);
const domainPattern = (domain) => new RegExp(`^https?://(www\\.)?${escapeRegex(domain)}(/|$|:)`, 'i');

function companyReasons(scraped, candidate) {
  const reasons = [];
  const domain = scraped.keys.domain;
  if (domain && candidate.website && domainOf(candidate.website) === domain) reasons.push('website');
  if (candidate.email && scraped.keys.emails.includes(candidate.email.toLowerCase())) reasons.push('email');
  else if (domain && candidate.email && emailDomain(candidate.email) === domain) reasons.push('emailDomain');
  if (candidate.phone && scraped.keys.phones.includes(phoneKey(candidate.phone))) reasons.push('phone');
  const name = canonicalName(candidate.name);
  if (name && name === scraped.keys.name) reasons.push('name');
  else if (name && scraped.keys.name && nameSimilarity(name, scraped.keys.name) >= 0.75) reasons.push('similarName');
  if (candidate.city && scraped.company.city && candidate.city.toLowerCase() === scraped.company.city.toLowerCase()) reasons.push('city');
  return reasons;
}

const STRONG = ['website', 'email', 'emailDomain'];
function statusOf(reasons) {
  if (reasons.some((r) => STRONG.includes(r))) return SCRAPE_MATCH.EXISTING;
  if (reasons.includes('name') && (reasons.includes('phone') || reasons.includes('city'))) return SCRAPE_MATCH.EXISTING;
  if (reasons.some((r) => ['name', 'similarName', 'phone'].includes(r))) return SCRAPE_MATCH.POSSIBLE;
  return SCRAPE_MATCH.NEW;
}
const weight = (reasons) => reasons.reduce((n, r) => n + (STRONG.includes(r) ? 10 : r === 'name' ? 5 : r === 'phone' ? 4 : r === 'similarName' ? 2 : 1), 0);

// The CRM company a scraped company (or a person's company) most likely is.
// -> { status, companyId, reasons }
export async function matchCompany(scraped) {
  const or = [];
  if (scraped.keys.domain) or.push({ website: domainPattern(scraped.keys.domain) }, { email: new RegExp(`@${escapeRegex(scraped.keys.domain)}$`, 'i') });
  if (scraped.keys.emails.length) or.push({ email: { $in: scraped.keys.emails } });
  for (const key of scraped.keys.phones.slice(0, 5)) if (key.length >= 8) or.push({ phone: phonePattern(key) });
  const firstWord = scraped.keys.name?.split(' ').find((w) => w.length >= 3);
  if (firstWord) or.push({ name: new RegExp(`\\b${escapeRegex(firstWord)}`, 'i') });
  if (!or.length) return { status: SCRAPE_MATCH.NEW, reasons: [] };

  const candidates = await Company.find({ $or: or }).select('name website email phone city companyCode').limit(50).lean();
  let best = null;
  for (const candidate of candidates) {
    const reasons = companyReasons(scraped, candidate);
    if (!reasons.length || (reasons.length === 1 && reasons[0] === 'city')) continue;
    if (!best || weight(reasons) > weight(best.reasons)) best = { candidate, reasons };
  }
  if (!best) return { status: SCRAPE_MATCH.NEW, reasons: [] };
  const status = statusOf(best.reasons);
  return status === SCRAPE_MATCH.NEW ? { status, reasons: [] } : { status, companyId: best.candidate._id, reasons: best.reasons.filter((r) => r !== 'city' || status === SCRAPE_MATCH.EXISTING) };
}

// The CRM contact a scraped person is: the same email anywhere, or at their
// company the same phone or name.
export async function matchContact(scraped, companyMatch) {
  const email = scraped.contact.email;
  if (email) {
    const found = await Contact.findOne({ email }).select('companyId').lean();
    if (found) return { status: SCRAPE_MATCH.EXISTING, contactId: found._id, companyId: found.companyId, reasons: ['email'] };
  }
  const companyId = companyMatch.status === SCRAPE_MATCH.EXISTING ? companyMatch.companyId : null;
  const phone = phoneKey(scraped.contact.phone);
  if (phone.length >= 8) {
    const found = await Contact.findOne({ phone: phonePattern(phone), ...(companyId ? { companyId } : {}) }).select('companyId').lean();
    if (found) return { status: companyId ? SCRAPE_MATCH.EXISTING : SCRAPE_MATCH.POSSIBLE, contactId: found._id, companyId: found.companyId, reasons: ['phone'] };
  }
  if (companyId && scraped.contact.firstName && scraped.contact.lastName) {
    const found = await Contact.findOne({ companyId, firstName: new RegExp(`^${escapeRegex(scraped.contact.firstName)}$`, 'i'), lastName: new RegExp(`^${escapeRegex(scraped.contact.lastName)}$`, 'i') }).select('_id').lean();
    if (found) return { status: SCRAPE_MATCH.EXISTING, contactId: found._id, companyId, reasons: ['name', 'company'] };
  }
  return { status: SCRAPE_MATCH.NEW, companyId: companyId ?? undefined, reasons: companyId ? ['companyExists'] : [] };
}

// Matches every result of a job, with the CRM and with each other. Mutates
// each record's `match`.
export async function matchRecords(records) {
  const seenCompanies = new Map();
  const seenPeople = new Map();
  for (const record of records) {
    const companyMatch = await matchCompany(record);
    if (record.type === 'company') {
      record.match = { ...companyMatch };
      // The same company twice in this job: later ones point at the first.
      const keys = [record.keys.domain && `d:${record.keys.domain}`, record.keys.name && `n:${record.keys.name}`].filter(Boolean);
      const first = keys.map((k) => seenCompanies.get(k)).find(Boolean);
      if (first) {
        record.match.duplicateOf = first._id;
        record.match.reasons = [...record.match.reasons, 'sameAsAnotherResult'];
        if (record.match.status === SCRAPE_MATCH.NEW) record.match.status = SCRAPE_MATCH.POSSIBLE;
      } else for (const k of keys) seenCompanies.set(k, record);
    } else {
      const contactMatch = await matchContact(record, companyMatch);
      record.match = { ...contactMatch, companyId: contactMatch.companyId ?? (companyMatch.status === SCRAPE_MATCH.EXISTING ? companyMatch.companyId : undefined) };
      const first = seenPeople.get(record.keys.person);
      if (first) {
        record.match.duplicateOf = first._id;
        record.match.reasons = [...record.match.reasons, 'sameAsAnotherResult'];
        if (record.match.status === SCRAPE_MATCH.NEW) record.match.status = SCRAPE_MATCH.POSSIBLE;
      } else seenPeople.set(record.keys.person, record);
    }
  }
  return records;
}
