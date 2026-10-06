import env from '../../config/env.js';
import { SCRAPE_PAGE_STATUS } from '../../constants/index.js';
import { extractPage } from './extract.js';
import { canonicalName, cleanText, domainOf, nameSimilarity, siteOf } from './normalize.js';
import { ALLOW_ALL, DENY_ALL, parseRobots } from './robots.js';
import { checkUrl, FetchError, safeFetch } from './safeFetch.js';

// Visits pages carefully and gathers what they say about companies and people.
//
// Politeness rules, all enforced here whatever the job asks:
//  - robots.txt is read first on every site and obeyed (its Crawl-delay too);
//    a site whose robots.txt refuses access (401/403) or cannot be read (5xx)
//    is not visited;
//  - one page at a time, with at least SCRAPER_MIN_DELAY_MS between pages of a site;
//  - a site that answers "too many requests", "unavailable" or shows a CAPTCHA /
//    anti-bot page is left alone for the rest of the job - never retried;
//  - sign-in, account and checkout pages are never visited, forms never submitted.

export const LIMITS = Object.freeze({ maxPages: 200, maxRecords: 1000, maxDepth: 3, maxTargets: 50, maxDelayMs: 30000 });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// -> { companies: Map, contacts: Map } - each entry { ...fields, sources: Set, origin }
export async function crawl(job, { onPage, shouldStop, wait = sleep } = {}) {
  const settings = job.settings;
  const startDomains = new Set(job.targets.map((t) => domainOf(t)));
  const robotsCache = new Map();
  const lastVisit = new Map();
  const leftAlone = new Map();
  const visited = new Set();
  const queue = job.targets.map((url) => ({ url, depth: 0, priority: true }));
  const companies = new Map();
  const contacts = new Map();
  let pages = 0;

  const recordCount = () => (job.dataType === 'contacts' ? contacts.size : job.dataType === 'companies' ? companies.size : companies.size + contacts.size);

  async function robotsFor(origin) {
    if (robotsCache.has(origin)) return robotsCache.get(origin);
    let rules;
    try {
      const response = await safeFetch(`${origin}/robots.txt`, { accept: 'text/plain,*/*;q=0.5' });
      if (response.status >= 200 && response.status < 300) rules = parseRobots(response.body, env.scraper.userAgent);
      else if (response.status === 401 || response.status === 403) rules = { ...DENY_ALL, why: 'The site refuses robots.txt to automated visitors' };
      else if (response.status >= 500) rules = { ...DENY_ALL, why: `robots.txt could not be read (HTTP ${response.status}); the site is skipped to be safe` };
      else rules = ALLOW_ALL;
    } catch (err) {
      rules = err instanceof FetchError && err.reason === 'blocked_address' ? { ...DENY_ALL, why: err.message, reason: 'blocked_address' } : { ...DENY_ALL, why: `robots.txt could not be read (${err.message}); the site is skipped to be safe` };
    }
    robotsCache.set(origin, rules);
    return rules;
  }

  // Groups what is found by company: its web domain, or its name.
  const companyKey = (c) => (c.website ? `d:${domainOf(c.website)}` : `n:${canonicalName(c.name)}`);
  function addCompany(found, sourceUrl, origin, intoKey) {
    if (!found.name && !found.website) return null;
    const key = intoKey ?? companyKey(found);
    const existing = companies.get(key);
    if (!existing) {
      companies.set(key, { ...found, emails: [...found.emails], phones: [...found.phones], sources: new Set([sourceUrl]), origin });
      return key;
    }
    for (const field of ['name', 'website', 'address', 'city', 'state', 'country', 'postalCode', 'category', 'description']) if (!existing[field] && found[field]) existing[field] = found[field];
    existing.emails = [...new Set([...existing.emails, ...found.emails])];
    existing.phones = [...new Set([...existing.phones, ...found.phones])];
    existing.sources.add(sourceUrl);
    // Details stated in structured data or a listing beat the site's general ones.
    if (origin !== 'site' && existing.origin === 'site') existing.origin = origin;
    return key;
  }
  function addContact(found, companyKeyValue, sourceUrl) {
    if (!found.fullName) return;
    const key = found.email ? `e:${found.email}` : `n:${canonicalName(found.fullName)}|${companyKeyValue ?? ''}`;
    const existing = contacts.get(key);
    if (!existing) {
      contacts.set(key, { ...found, companyKey: companyKeyValue, sources: new Set([sourceUrl]) });
      return;
    }
    for (const field of ['designation', 'email', 'phone', 'profileUrl', 'lastName']) if (!existing[field] && found[field]) existing[field] = found[field];
    if (!existing.companyKey && companyKeyValue) existing.companyKey = companyKeyValue;
    existing.sources.add(sourceUrl);
  }

  while (queue.length && pages < settings.maxPages && recordCount() < settings.maxRecords) {
    if (await shouldStop?.()) break;
    // Likely contact pages first.
    const index = queue.findIndex((item) => item.priority);
    const item = queue.splice(index >= 0 ? index : 0, 1)[0];
    let url;
    try {
      url = checkUrl(item.url);
    } catch (err) {
      await onPage?.({ url: String(item.url).slice(0, 2048), depth: item.depth, status: SCRAPE_PAGE_STATUS.FAILED, reason: err.reason, detail: err.message });
      continue;
    }
    if (visited.has(url.href)) continue;
    visited.add(url.href);
    const origin = url.origin;
    if (leftAlone.has(origin)) continue;
    if (settings.sameDomain && !startDomains.has(domainOf(url.href))) continue;

    const robots = await robotsFor(origin);
    if (!robots.allowed(`${url.pathname}${url.search}`)) {
      await onPage?.({ url: url.href, depth: item.depth, status: SCRAPE_PAGE_STATUS.SKIPPED, reason: robots.reason ?? 'robots', detail: robots.why ?? 'robots.txt does not allow this page' });
      continue;
    }

    // At most one page per delay per site.
    const delay = Math.min(LIMITS.maxDelayMs * 2, Math.max(settings.delayMs, env.scraper.minDelayMs, robots.crawlDelayMs ?? 0));
    const since = Date.now() - (lastVisit.get(origin) ?? 0);
    if (since < delay) await wait(delay - since);
    lastVisit.set(origin, Date.now());
    pages += 1;

    let response;
    try {
      response = await safeFetch(url.href);
    } catch (err) {
      await onPage?.({ url: url.href, depth: item.depth, status: SCRAPE_PAGE_STATUS.FAILED, reason: err.reason ?? 'unreachable', detail: err.message, httpStatus: err.httpStatus });
      if (err.reason === 'blocked_address') leftAlone.set(origin, err.message);
      continue;
    }
    const { status } = response;
    if (status === 429 || status === 503) {
      leftAlone.set(origin, 'rate limited');
      await onPage?.({ url: url.href, depth: item.depth, status: SCRAPE_PAGE_STATUS.FAILED, reason: 'rate_limited', detail: `The site asked us to slow down (HTTP ${status}); it is not visited again in this job`, httpStatus: status });
      continue;
    }
    if (status === 401 || status === 403) {
      await onPage?.({ url: url.href, depth: item.depth, status: SCRAPE_PAGE_STATUS.FAILED, reason: 'access_denied', detail: `Access denied (HTTP ${status})`, httpStatus: status });
      continue;
    }
    if (status >= 400) {
      await onPage?.({ url: url.href, depth: item.depth, status: SCRAPE_PAGE_STATUS.FAILED, reason: 'http_error', detail: `The site answered HTTP ${status}`, httpStatus: status });
      continue;
    }
    if (!/html|xml/i.test(response.contentType)) {
      await onPage?.({ url: url.href, depth: item.depth, status: SCRAPE_PAGE_STATUS.SKIPPED, reason: 'not_html', detail: `Not a web page (${cleanText(response.contentType, 60) || 'unknown type'})`, httpStatus: status });
      continue;
    }

    let page;
    try {
      page = extractPage(response.body, response.url, settings.extract);
    } catch {
      await onPage?.({ url: url.href, depth: item.depth, status: SCRAPE_PAGE_STATUS.FAILED, reason: 'invalid_html', detail: 'The page could not be read', httpStatus: status });
      continue;
    }
    if (page.antiBot) {
      // Never worked around: the site is left alone.
      leftAlone.set(origin, 'anti-bot');
      await onPage?.({ url: url.href, depth: item.depth, status: SCRAPE_PAGE_STATUS.FAILED, reason: 'anti_bot', detail: 'The site shows a CAPTCHA or anti-bot check; it is not visited again in this job', httpStatus: status });
      continue;
    }

    const before = recordCount();
    // The site's own company: its name, emails and numbers it shows.
    const siteKey = addCompany(
      {
        name: page.site.name,
        website: siteOf(response.url),
        emails: page.site.emails,
        phones: page.site.phones,
        address: page.site.address ?? '',
        city: page.site.city ?? '',
        state: page.site.state ?? '',
        country: page.site.country ?? '',
        postalCode: page.site.postalCode ?? '',
        category: '',
        description: page.site.description,
      },
      response.url,
      'site'
    );
    const keysByName = new Map();
    const siteName = canonicalName(page.site.name);
    for (const found of page.companies) {
      // An organisation describing this very site is the site's company: same
      // web address, or no address and (nearly) the site's name.
      const sameSite = found.website ? domainOf(found.website) === domainOf(response.url) : Boolean(siteName) && nameSimilarity(canonicalName(found.name), siteName) >= 0.6;
      if (sameSite && siteKey) {
        const existing = companies.get(siteKey);
        // The name the site states about itself beats its page title.
        if (found.name && existing?.origin === 'site') existing.name = found.name;
        addCompany(found, response.url, 'structured', siteKey);
        if (found.name) keysByName.set(canonicalName(found.name), siteKey);
        continue;
      }
      const key = addCompany(found, response.url, 'listing');
      if (key && found.name) keysByName.set(canonicalName(found.name), key);
    }
    for (const found of page.contacts) {
      const companyKeyValue = (found.companyName && (keysByName.get(canonicalName(found.companyName)) ?? `n:${canonicalName(found.companyName)}`)) || siteKey;
      if (found.companyName && !companies.has(companyKeyValue)) addCompany({ name: found.companyName, website: '', emails: [], phones: [], address: '', city: '', state: '', country: '', postalCode: '', category: '', description: '' }, response.url, 'listing');
      addContact(found, companyKeyValue, response.url);
    }

    await onPage?.({ url: response.url, depth: item.depth, status: SCRAPE_PAGE_STATUS.DONE, httpStatus: status, recordsFound: Math.max(0, recordCount() - before), loginForm: page.loginForm });

    // Further pages: only from pages that are not sign-in forms, within the depth.
    if (settings.followLinks && !page.loginForm && item.depth < settings.maxDepth) {
      for (const link of page.links) {
        if (visited.has(link.url)) continue;
        if (settings.sameDomain && !startDomains.has(domainOf(link.url))) continue;
        queue.push({ url: link.url, depth: item.depth + 1, priority: link.priority });
      }
    }
  }

  return { companies, contacts, pages, leftAlone };
}
