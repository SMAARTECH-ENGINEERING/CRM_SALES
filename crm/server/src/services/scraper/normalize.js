// Cleaning what was scraped, and the forms used to compare it with the CRM.

// Legal-form words that do not tell companies apart: "ABC Pvt Ltd",
// "ABC Pvt. Ltd." and "ABC Private Limited" are the same name.
const LEGAL_FORMS = [
  'private limited', 'pvt ltd', 'pvt limited', 'private ltd', 'pvt', 'private', 'limited', 'ltd', 'llp', 'llc', 'inc', 'incorporated',
  'corporation', 'corp', 'co', 'company', 'plc', 'gmbh', 'opc',
];
const LEGAL_FORM_PATTERN = new RegExp(`\\b(?:${LEGAL_FORMS.map((w) => w.replace(/ /g, '\\s+')).join('|')})\\b`, 'g');

export const cleanText = (value, max = 500) =>
  String(value ?? '')
    // eslint-disable-next-line no-control-regex -- control characters are what is being removed
    .replace(/[\u0000-\u001f\u007f\u00a0\u200b]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

// "ABC ENGINEERING PVT. LTD." -> "abc engineering"
export function canonicalName(name) {
  return cleanText(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.,'"()/\\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(LEGAL_FORM_PATTERN, ' ')
    .replace(/\bm\s*s\b/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A name tidied for showing: spaces, and ALL CAPS turned into Title Case.
export function tidyName(name, max = 200) {
  const text = cleanText(name, max);
  if (!text) return '';
  if (text === text.toUpperCase() && /[A-Z]{3}/.test(text)) {
    return text.toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase()).replace(/\b(Pvt|Ltd|Llp|Fpo|Fpc|Epc|Iot|Wtp)\b/g, (w) => (w.length <= 3 ? w.toUpperCase() : w));
  }
  return text;
}

export function normalizeEmail(value) {
  const email = cleanText(value, 254).toLowerCase().replace(/^mailto:/, '').split('?')[0];
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email) && !/\.(png|jpe?g|gif|svg|webp)$/.test(email) ? email : '';
}

// Free mail providers: their domain says nothing about the company.
const PERSONAL_MAIL = new Set(['gmail.com', 'yahoo.com', 'yahoo.co.in', 'hotmail.com', 'outlook.com', 'rediffmail.com', 'live.com', 'icloud.com', 'aol.com', 'protonmail.com', 'ymail.com']);
export const emailDomain = (email) => {
  const domain = String(email).split('@')[1] ?? '';
  return domain && !PERSONAL_MAIL.has(domain) ? domain : '';
};

// Phone numbers as written ("+91 98610 12345"), and their digits for comparing.
export function normalizePhone(value) {
  const text = cleanText(value, 40).replace(/^tel:/i, '').replace(/[^\d+()\s-]/g, '');
  const digits = text.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 20);
}
// The last ten digits: "+91 98610 12345", "098610 12345" and "9861012345" compare equal.
export const phoneKey = (phone) => String(phone ?? '').replace(/\D/g, '').slice(-10);

export function normalizeUrl(value, base) {
  try {
    const url = new URL(cleanText(value, 2048), base);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    return url.href;
  } catch {
    return '';
  }
}
// "https://www.ABC.com/contact" -> "abc.com"
export function domainOf(value) {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}
// The site's home page: "https://www.abc.com/contact" -> "https://www.abc.com"
export const siteOf = (value) => {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
};

// "Ramesh Kumar Behera" -> { firstName: "Ramesh", lastName: "Kumar Behera" }
const HONORIFICS = /^(mr|mrs|ms|miss|dr|prof|shri|sri|smt|er|capt|col)\.?\s+/i;
export function splitName(fullName) {
  const name = tidyName(fullName, 120).replace(HONORIFICS, '').trim();
  const parts = name.split(' ').filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '', fullName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '', fullName: name };
  return { firstName: parts[0].slice(0, 50), lastName: parts.slice(1).join(' ').slice(0, 50), fullName: name };
}

// Whether text looks like a person's name: two to four words, capitalised, no digits or @.
export function looksLikePersonName(text) {
  const name = cleanText(text, 120).replace(HONORIFICS, '');
  if (!name || /[\d@:/|]/.test(name) || name.length > 60) return false;
  const words = name.split(' ');
  if (words.length < 2 || words.length > 4) return false;
  if (/\b(contact|us|info|sales|support|office|team|enquiry|inquiry|email|phone|mail|call|click|read|more|home|about|our|the|and|limited|ltd|pvt|company|fpo|department)\b/i.test(name)) return false;
  return words.every((w) => /^\p{Lu}[\p{L}.'-]*$/u.test(w));
}

// How complete a result is - what the sales team needs to follow it up.
const WEIGHTS = {
  company: [
    ['Company name', (r) => r.company?.name, 25],
    ['Website', (r) => r.company?.website, 15],
    ['Email', (r) => r.company?.email, 20],
    ['Phone', (r) => r.company?.phone, 20],
    ['Address', (r) => r.company?.address || r.company?.city || r.company?.state, 10],
    ['Contact person', (r) => r.contact?.fullName, 10],
  ],
  contact: [
    ['Name', (r) => r.contact?.fullName, 25],
    ['Company', (r) => r.company?.name, 20],
    ['Designation', (r) => r.contact?.designation, 10],
    ['Email', (r) => r.contact?.email, 25],
    ['Phone', (r) => r.contact?.phone, 20],
  ],
};
// -> { quality: 0-100, missing: [labels] }
export function qualityOf(record) {
  let score = 0;
  const missing = [];
  for (const [label, has, weight] of WEIGHTS[record.type]) {
    if (has(record)) score += weight;
    else missing.push(label);
  }
  return { quality: score, missing };
}

// How alike two canonical names are (shared words), 0-1.
export function nameSimilarity(a, b) {
  const wa = new Set(String(a).split(' ').filter(Boolean));
  const wb = new Set(String(b).split(' ').filter(Boolean));
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  return shared / Math.max(wa.size, wb.size);
}
