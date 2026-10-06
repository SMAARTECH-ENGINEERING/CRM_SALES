import * as cheerio from 'cheerio';
import { cleanText, domainOf, looksLikePersonName, normalizeEmail, normalizePhone, normalizeUrl, siteOf, splitName, tidyName } from './normalize.js';

// What a web page says about businesses and the people at them.
//
// Read in this order, most reliable first:
//  1. structured data the site publishes for machines - schema.org JSON-LD and
//     microdata (Organization, LocalBusiness, Person), and vCard / hCard markup;
//  2. directory tables - a table with columns such as Name, Email, Phone, District;
//  3. "team" cards - a block with a person's name and a job title;
//  4. the site itself - its name, the emails and phone numbers it shows, its address.
//
// Only what the page displays publicly is read. Nothing is guessed: a field is
// filled only when the page states it.

const DESIGNATION = /\b(director|ceo|cfo|cto|coo|chief|chair(?:man|person|woman)?|president|vice[- ]president|secretary|treasurer|manager|head|officer|founder|co-?founder|partner|proprietor|owner|engineer|executive|co-?ordinator|managing|md|gm|agm|dgm|consultant|supervisor|in-?charge|accountant|administrator|board member|member)\b/i;
const SKIP_LINK = /\/(log-?in|log-?out|sign-?in|sign-?up|register|account|my-?account|cart|checkout|basket|wp-admin|wp-login|admin|password|auth|oauth|sso)(\/|$|\?|\.)/i;
const SKIP_FILE = /\.(pdf|jpe?g|png|gif|svg|webp|ico|zip|rar|7z|gz|tar|exe|msi|dmg|apk|mp3|mp4|avi|mov|wmv|docx?|xlsx?|pptx?|css|js|json|xml|rss|woff2?|ttf)(\?|$)/i;
// Pages more likely to hold contact details are visited first.
const PRIORITY = /contact|about|team|people|staff|management|leadership|director|board|office|branch|location|member|directory|list|enquir|reach/i;
const ANTI_BOT = /captcha|verify you are (a )?human|are you a robot|attention required!? \| cloudflare|just a moment\.\.\.|cf-challenge|ddos protection|access denied|unusual traffic/i;

const EMAIL_TEXT = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_TEXT = [/\+\d{1,3}[\s.-]?\(?\d{1,5}\)?(?:[\s.-]?\d{2,5}){2,4}/g, /\b0\d{2,4}[\s-]?\d{6,8}\b/g, /\b[6-9]\d{4}[\s-]?\d{5}\b/g];
const PIN = /\b[1-9]\d{5}\b/;

const asArray = (value) => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);
const typesOf = (node) => asArray(node?.['@type']).map((t) => String(t).toLowerCase());
const isOrganization = (node) => typesOf(node).some((t) => /organization|organisation|business|corporation|company|store|ngo|cooperative|agency|office|factory|association/.test(t));
const isPerson = (node) => typesOf(node).includes('person');
const textOf = (value) => (typeof value === 'string' ? value : typeof value === 'object' && value ? value.name ?? value['@value'] ?? '' : '');

function addressFrom(value) {
  if (!value) return {};
  if (typeof value === 'string') return parseAddressText(value);
  const node = asArray(value)[0] ?? {};
  return {
    address: cleanText(textOf(node.streetAddress), 500),
    city: cleanText(textOf(node.addressLocality), 100),
    state: cleanText(textOf(node.addressRegion), 100),
    country: cleanText(textOf(node.addressCountry), 100),
    postalCode: cleanText(node.postalCode, 12),
  };
}

// "Plot 12, Mandi Road, Cuttack, Odisha 753001, India" -> parts, where the
// shape allows; otherwise just the address.
export function parseAddressText(text) {
  const address = cleanText(text, 500).replace(/^address\s*[:-]\s*/i, '');
  const out = { address };
  const pin = address.match(PIN);
  if (pin) out.postalCode = pin[0];
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  const pinIndex = parts.findIndex((p) => PIN.test(p));
  if (pinIndex > 0) {
    const withPin = parts[pinIndex].replace(PIN, '').replace(/[-–]/g, ' ').trim();
    if (withPin && !/\d/.test(withPin)) {
      out.state = withPin;
      if (!/\d/.test(parts[pinIndex - 1])) out.city = parts[pinIndex - 1];
    } else if (pinIndex >= 2 && !/\d/.test(parts[pinIndex - 1])) {
      out.state = parts[pinIndex - 1];
      if (!/\d/.test(parts[pinIndex - 2])) out.city = parts[pinIndex - 2];
    }
    const after = parts[pinIndex + 1];
    if (after && !/\d/.test(after) && after.length < 40) out.country = after;
  }
  return out;
}

function phonesInText(text) {
  const found = [];
  for (const pattern of PHONE_TEXT) {
    for (const match of String(text).matchAll(pattern)) {
      const digits = match[0].replace(/\D/g, '');
      // Ten to thirteen digits: not years ("2024-2025"), not short codes.
      if (digits.length < 10 || digits.length > 13 || /^(19|20)\d{2}(19|20)\d{2}/.test(digits)) continue;
      const phone = normalizePhone(match[0]);
      if (phone) found.push(phone);
    }
  }
  return found;
}

const unique = (list) => [...new Set(list.filter(Boolean))];

// One company as found: whatever the source gave, cleaned.
function company(fields, pageUrl) {
  const out = {
    name: tidyName(fields.name),
    website: fields.website ? siteOf(normalizeUrl(fields.website, pageUrl)) || '' : '',
    emails: unique(asArray(fields.emails ?? fields.email).map(normalizeEmail)),
    phones: unique(asArray(fields.phones ?? fields.phone).map(normalizePhone)),
    address: cleanText(fields.address, 500),
    city: cleanText(fields.city, 100),
    state: cleanText(fields.state, 100),
    country: cleanText(fields.country, 100),
    postalCode: cleanText(fields.postalCode, 12),
    category: cleanText(fields.category, 200),
    description: cleanText(fields.description, 1000),
  };
  return out;
}

function person(fields, pageUrl) {
  const name = splitName(fields.name);
  return {
    ...name,
    designation: cleanText(fields.designation, 100),
    email: normalizeEmail(asArray(fields.email)[0] ?? ''),
    phone: normalizePhone(asArray(fields.phone)[0] ?? ''),
    profileUrl: fields.profileUrl ? normalizeUrl(fields.profileUrl, pageUrl) : '',
    companyName: tidyName(fields.companyName),
  };
}

// --- 1. structured data -----------------------------------------------------------------

function fromJsonLd($, pageUrl, out) {
  const nodes = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    nodes.push(node);
    for (const key of ['@graph', 'itemListElement', 'item', 'member', 'employee', 'employees', 'founder', 'subOrganization', 'department', 'contactPoint']) walk(node[key]);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walk(JSON.parse($(el).contents().text()));
    } catch {
      // Broken JSON-LD on the page: skipped.
    }
  });
  for (const node of nodes) {
    if (isOrganization(node) && textOf(node.name)) {
      const address = addressFrom(node.address);
      out.companies.push(
        company(
          {
            name: textOf(node.name) || textOf(node.legalName),
            website: node.url,
            email: [node.email, ...asArray(node.contactPoint).map((c) => c?.email)],
            phone: [node.telephone, ...asArray(node.contactPoint).map((c) => c?.telephone)],
            ...address,
            category: asArray(node['@type']).filter((t) => !/^(organization|thing)$/i.test(t)).join(', ') || textOf(node.industry),
            description: node.description,
          },
          pageUrl
        )
      );
      for (const member of [...asArray(node.employee), ...asArray(node.member), ...asArray(node.founder)]) {
        if (isPerson(member) && textOf(member.name)) out.contacts.push(person({ name: textOf(member.name), designation: textOf(member.jobTitle), email: member.email, phone: member.telephone, profileUrl: asArray(member.sameAs).find((u) => /linkedin\.com/.test(u)) ?? member.url, companyName: textOf(node.name) }, pageUrl));
      }
    } else if (isPerson(node) && textOf(node.name)) {
      out.contacts.push(person({ name: textOf(node.name), designation: textOf(node.jobTitle), email: node.email, phone: node.telephone, profileUrl: asArray(node.sameAs).find((u) => /linkedin\.com/.test(u)) ?? node.url, companyName: textOf(node.worksFor) }, pageUrl));
    }
  }
}

function fromMicrodata($, pageUrl, out) {
  const prop = (scope, name) => {
    const el = scope.find(`[itemprop="${name}"]`).first();
    if (!el.length) return '';
    return el.attr('content') ?? el.attr('href') ?? el.text();
  };
  $('[itemscope][itemtype]').each((_, el) => {
    const scope = $(el);
    const type = String(scope.attr('itemtype')).toLowerCase();
    if (/schema\.org\/(organization|localbusiness|corporation|ngo|store)/.test(type)) {
      const name = prop(scope, 'name');
      if (name) out.companies.push(company({ name, website: prop(scope, 'url'), email: prop(scope, 'email'), phone: prop(scope, 'telephone'), ...parseAddressText(prop(scope, 'address')), description: prop(scope, 'description') }, pageUrl));
    } else if (/schema\.org\/person/.test(type)) {
      const name = prop(scope, 'name');
      if (name) out.contacts.push(person({ name, designation: prop(scope, 'jobTitle'), email: prop(scope, 'email'), phone: prop(scope, 'telephone'), companyName: prop(scope, 'worksFor') }, pageUrl));
    }
  });
}

function fromHCard($, pageUrl, out) {
  $('.vcard, .h-card').each((_, el) => {
    const card = $(el);
    const get = (selector) => cleanText(card.find(selector).first().text(), 200);
    const name = get('.fn, .p-name');
    const org = get('.org, .p-org');
    const email = card.find('a[href^="mailto:"]').first().attr('href') ?? get('.email, .u-email');
    const phone = card.find('a[href^="tel:"]').first().attr('href') ?? get('.tel, .p-tel');
    const address = get('.adr, .p-adr');
    if (name && looksLikePersonName(name)) out.contacts.push(person({ name, designation: get('.title, .p-job-title, .role'), email, phone, companyName: org }, pageUrl));
    else if (org || name) out.companies.push(company({ name: org || name, email, phone, ...parseAddressText(address) }, pageUrl));
  });
}

// --- 2. directory tables ------------------------------------------------------------------

const COLUMN_PATTERNS = [
  ['contactName', /contact person|contact name|ceo|chief executive|secretary|director|president|chairman|representative|person/i],
  ['designation', /designation|position|role|title/i],
  ['name', /name|company|organi[sz]ation|fpo|fpc|firm|society|enterprise|business|institution|vendor|supplier/i],
  ['email', /e-?mail/i],
  ['phone', /phone|mobile|tel|contact no|cell|whatsapp/i],
  ['website', /website|web|url|site/i],
  ['address', /address|location|village|block/i],
  ['city', /city|district|town/i],
  ['state', /state|province|region/i],
  ['postalCode', /pin|postal|zip/i],
  ['category', /category|type|industry|sector|activity|commodit/i],
];

function fromTables($, pageUrl, out) {
  $('table').each((_, table) => {
    const rows = $(table).find('tr');
    if (rows.length < 2) return;
    const header = $(rows[0]).find('th, td').map((__, cell) => cleanText($(cell).text(), 80)).get();
    const columns = header.map((text) => {
      if (!text) return null;
      for (const [key, pattern] of COLUMN_PATTERNS) if (pattern.test(text)) return key;
      return null;
    });
    // A directory: a name column and at least one way to reach them.
    if (!columns.includes('name') || !columns.some((c) => ['email', 'phone', 'website', 'contactName'].includes(c))) return;
    rows.slice(1).each((__, row) => {
      const cells = $(row).find('td, th');
      const value = {};
      cells.each((i, cell) => {
        const key = columns[i];
        if (!key || value[key]) return;
        const el = $(cell);
        value[key] = key === 'email' ? (el.find('a[href^="mailto:"]').attr('href') ?? el.text()) : key === 'website' ? (el.find('a[href]').attr('href') ?? el.text()) : el.text();
      });
      if (!cleanText(value.name)) return;
      const emails = String(value.email ?? '').match(EMAIL_TEXT) ?? [value.email];
      const found = company({ name: value.name, website: value.website, emails, phones: phonesInText(value.phone ?? '').length ? phonesInText(value.phone) : [value.phone], address: value.address, city: value.city, state: value.state, postalCode: value.postalCode, category: value.category }, pageUrl);
      out.companies.push(found);
      if (value.contactName && looksLikePersonName(cleanText(value.contactName))) {
        out.contacts.push(person({ name: value.contactName, designation: value.designation, companyName: found.name, email: found.emails[0], phone: found.phones[0] }, pageUrl));
      }
    });
  });
}

// --- 3. team cards ---------------------------------------------------------------------------

function fromCards($, pageUrl, out) {
  const seen = new Set();
  $('[class*="team"], [class*="member"], [class*="person"], [class*="staff"], [class*="profile"], [class*="people"], [class*="director"], [class*="leader"]').each((_, el) => {
    const card = $(el);
    const text = cleanText(card.text(), 600);
    if (!text || text.length > 400 || card.find('[class*="team"], [class*="member"]').length > 1) return;
    const nameEl = card.find('h2, h3, h4, h5, strong, b, .name, [class*="name"]').filter((__, n) => looksLikePersonName($(n).text())).first();
    if (!nameEl.length) return;
    const name = cleanText(nameEl.text(), 120);
    if (seen.has(name)) return;
    const designation = card
      .find('p, span, small, em, div, .designation, .position, .role, [class*="title"], [class*="designation"], [class*="position"]')
      .map((__, n) => cleanText($(n).text(), 100))
      .get()
      .find((t) => t !== name && t.length < 80 && DESIGNATION.test(t));
    const email = card.find('a[href^="mailto:"]').first().attr('href');
    const phone = card.find('a[href^="tel:"]').first().attr('href');
    if (!designation && !email && !phone) return;
    seen.add(name);
    const profile = card.find('a[href*="linkedin.com"]').first().attr('href');
    out.contacts.push(person({ name, designation, email, phone, profileUrl: profile }, pageUrl));
  });
  // A person's name as the text of their email link.
  $('a[href^="mailto:"]').each((_, el) => {
    const link = $(el);
    const name = cleanText(link.text(), 120);
    if (!looksLikePersonName(name) || seen.has(name)) return;
    seen.add(name);
    const around = cleanText(link.parent().text(), 300);
    const designation = around.replace(name, '').split(/[,|\n–-]/).map((t) => t.trim()).find((t) => t && t.length < 80 && DESIGNATION.test(t));
    out.contacts.push(person({ name, designation, email: link.attr('href') }, pageUrl));
  });
}

// --- 4. the site itself ----------------------------------------------------------------------

function siteName($, pageUrl) {
  const og = $('meta[property="og:site_name"]').attr('content') || $('meta[name="application-name"]').attr('content');
  if (og) return cleanText(og, 200);
  const title = cleanText($('title').first().text(), 200);
  if (!title) return '';
  // "Contact Us | ABC Engineering Pvt Ltd" -> the part that is not a page name.
  const parts = title.split(/\s[|–—:-]\s/).map((p) => p.trim()).filter(Boolean);
  const generic = /^(home|contact( us)?|about( us)?|welcome|team|our team|services|products|index)$/i;
  return parts.filter((p) => !generic.test(p)).sort((a, b) => b.length - a.length)[0] ?? domainOf(pageUrl);
}

// -> { companies, contacts, site: { name, description, emails, phones, address... }, links, antiBot, loginForm }
export function extractPage(html, pageUrl, extract = {}) {
  const want = { emails: true, phones: true, companyNames: true, addresses: true, websites: true, contactNames: true, jobTitles: true, ...extract };
  const $ = cheerio.load(html);
  const out = { companies: [], contacts: [], links: [] };
  const bodyText = cleanText($('body').text(), 200000);
  out.antiBot = ANTI_BOT.test(cleanText($('title').text(), 200)) || (bodyText.length < 2000 && ANTI_BOT.test(bodyText)) || $('[class*="captcha"], #captcha, iframe[src*="captcha"], .g-recaptcha, .h-captcha, #challenge-form').length > 0;
  out.loginForm = $('input[type="password"]').length > 0;

  fromJsonLd($, pageUrl, out);
  fromMicrodata($, pageUrl, out);
  fromHCard($, pageUrl, out);
  fromTables($, pageUrl, out);
  if (want.contactNames) fromCards($, pageUrl, out);

  // The site's own details: name, description, the emails and numbers it shows, an address.
  $('script, style, noscript, template').remove();
  const text = cleanText($('body').text(), 200000);
  const emails = unique([...$('a[href^="mailto:"]').map((_, el) => $(el).attr('href')).get(), ...(text.match(EMAIL_TEXT) ?? [])].map(normalizeEmail));
  const phones = unique([...$('a[href^="tel:"]').map((_, el) => normalizePhone($(el).attr('href'))).get(), ...phonesInText(text)]);
  const addressText = cleanText($('address').first().text() || $('[itemprop="address"]').first().text() || '', 500);
  out.site = {
    name: tidyName(siteName($, pageUrl)),
    description: cleanText($('meta[name="description"]').attr('content') ?? $('meta[property="og:description"]').attr('content') ?? '', 1000),
    emails,
    phones,
    ...(addressText ? parseAddressText(addressText) : {}),
  };

  // Links to follow: pages of the web, not files, not sign-in or account pages.
  const links = new Map();
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || /^(mailto|tel|javascript|data|sms|whatsapp):/i.test(href) || $(el).attr('rel')?.includes('nofollow')) return;
    const url = normalizeUrl(href, pageUrl);
    if (!url || SKIP_FILE.test(url) || SKIP_LINK.test(url)) return;
    const label = cleanText($(el).text(), 80);
    if (!links.has(url)) links.set(url, PRIORITY.test(url) || PRIORITY.test(label));
  });
  out.links = [...links].map(([url, priority]) => ({ url, priority }));

  // Drop what was not asked for.
  for (const c of out.companies) {
    if (!want.emails) c.emails = [];
    if (!want.phones) c.phones = [];
    if (!want.addresses) Object.assign(c, { address: '', city: '', state: '', country: '', postalCode: '' });
    if (!want.websites) c.website = '';
  }
  for (const p of out.contacts) {
    if (!want.emails) p.email = '';
    if (!want.phones) p.phone = '';
    if (!want.jobTitles) p.designation = '';
  }
  if (!want.emails) out.site.emails = [];
  if (!want.phones) out.site.phones = [];
  if (!want.addresses) Object.assign(out.site, { address: '', city: '', state: '', country: '', postalCode: '' });
  if (!want.companyNames) {
    out.site.name = '';
    // Without names there are no companies to record; people keep their own details.
    out.companies = [];
    for (const p of out.contacts) p.companyName = '';
  }
  return out;
}
