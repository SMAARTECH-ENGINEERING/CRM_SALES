import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTestEnv } from './helpers/env.js';

// The scraper's building blocks, without a database or network. Private
// addresses are refused here, as in production.
setTestEnv('crm_test_scraper_units', { SCRAPER_ALLOW_PRIVATE_HOSTS: 'false' });

const { checkUrl, isBlockedAddress } = await import('../src/services/scraper/safeFetch.js');
const { parseRobots } = await import('../src/services/scraper/robots.js');
const { canonicalName, normalizeEmail, normalizePhone, phoneKey, qualityOf, splitName, tidyName, looksLikePersonName } = await import('../src/services/scraper/normalize.js');
const { extractPage, parseAddressText } = await import('../src/services/scraper/extract.js');

test('refuses addresses inside private networks, other ports and other schemes', () => {
  for (const url of ['http://localhost/', 'http://127.0.0.1/admin', 'http://10.1.2.3/', 'http://192.168.1.10/', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]/', 'http://intranet.local/', 'https://example.com:8080/', 'ftp://example.com/', 'file:///etc/passwd', 'https://user:pass@example.com/', 'not a url']) {
    assert.throws(() => checkUrl(url), (err) => ['blocked_address', 'invalid_url'].includes(err.reason), url);
  }
  assert.equal(checkUrl('https://www.example.com/contact#team').href, 'https://www.example.com/contact');
  assert.equal(isBlockedAddress('::ffff:10.0.0.1'), true);
  assert.equal(isBlockedAddress('100.64.1.1'), true);
  assert.equal(isBlockedAddress('93.184.216.34'), false);
});

test('obeys robots.txt: our own group first, longest rule wins, Allow wins a tie, crawl delay', () => {
  const robots = parseRobots(
    ['User-agent: *', 'Disallow: /', '', 'User-agent: CRMResearchBot', 'Disallow: /private', 'Allow: /private/press', 'Disallow: /*.pdf$', 'Crawl-delay: 5'].join('\n'),
    'CRMResearchBot/1.0 (business contact research)'
  );
  assert.equal(robots.allowed('/contact'), true);
  assert.equal(robots.allowed('/private/data'), false);
  assert.equal(robots.allowed('/private/press/2026'), true);
  assert.equal(robots.allowed('/brochure.pdf'), false);
  assert.equal(robots.allowed('/brochure.pdf?x=1'), true);
  assert.equal(robots.crawlDelayMs, 5000);
  const others = parseRobots('User-agent: *\nDisallow: /', 'CRMResearchBot/1.0');
  assert.equal(others.allowed('/'), false);
  assert.equal(parseRobots('User-agent: *\nDisallow:', 'CRMResearchBot/1.0').allowed('/anything'), true);
});

test('normalises names, emails and phones the same way whatever the spelling', () => {
  assert.equal(canonicalName('ABC PVT LTD'), 'abc');
  assert.equal(canonicalName('ABC Pvt. Ltd.'), 'abc');
  assert.equal(canonicalName('ABC Private Limited'), 'abc');
  assert.equal(canonicalName('M/s. Sri Ram Engineering & Co.'), 'sri ram engineering and');
  assert.equal(tidyName('MAA TARINI FPO'), 'Maa Tarini FPO');
  assert.equal(normalizeEmail('MAILTO:Info@Example.COM?subject=Hi'), 'info@example.com');
  assert.equal(normalizeEmail('logo@2x.png'), '');
  assert.equal(normalizePhone('tel:+91-98610-12345'), '+91-98610-12345');
  assert.equal(phoneKey('+91 98610 12345'), phoneKey('09861012345'));
  assert.equal(normalizePhone('12345'), '');
  assert.deepEqual(splitName('Dr. Ramesh Kumar Behera'), { firstName: 'Ramesh', lastName: 'Kumar Behera', fullName: 'Ramesh Kumar Behera' });
  assert.equal(looksLikePersonName('Contact Us'), false);
  assert.equal(looksLikePersonName('Sujata Nayak'), true);
});

test('scores how complete a result is, and says what is missing', () => {
  const { quality, missing } = qualityOf({ type: 'company', company: { name: 'ABC FPO', website: 'https://abc.example.com', email: 'info@abc.example.com', phone: '+91 674 255 0101', city: 'Cuttack' }, contact: {} });
  assert.equal(quality, 90);
  assert.deepEqual(missing, ['Contact person']);
});

test('reads companies and people from structured data, directory tables, team cards and the page', () => {
  const html = `<html><head><title>Contact | KALINGA AGRO PRODUCER CO. LTD.</title>
    <script type="application/ld+json">{"@type":"LocalBusiness","name":"Kalinga Agro","url":"https://kalinga.example.com","telephone":"+91 674 200 1234","address":{"streetAddress":"Plot 4","addressLocality":"Bhubaneswar","addressRegion":"Odisha","postalCode":"751001"}}</script></head>
    <body><div class="team-member"><h3>Prakash Rout</h3><span>Managing Director</span><a href="mailto:prakash@kalinga.example.com">Write</a></div>
    <table><tr><th>FPO Name</th><th>District</th><th>Email</th></tr><tr><td>Hirakud Growers</td><td>Sambalpur</td><td>info@hirakud.example.com</td></tr></table>
    <p>Phone: 0674-2001234. Founded 2015-2016.</p><a href="/team">Team</a><a href="/my-account/">Account</a><a href="/files/price.pdf">Prices</a></body></html>`;
  const page = extractPage(html, 'https://kalinga.example.com/contact');
  const kalinga = page.companies.find((c) => c.name === 'Kalinga Agro');
  assert.equal(kalinga.city, 'Bhubaneswar');
  assert.equal(kalinga.postalCode, '751001');
  assert.ok(page.companies.some((c) => c.name === 'Hirakud Growers' && c.emails[0] === 'info@hirakud.example.com' && c.city === 'Sambalpur'));
  assert.ok(page.contacts.some((p) => p.fullName === 'Prakash Rout' && p.designation === 'Managing Director' && p.email === 'prakash@kalinga.example.com'));
  assert.deepEqual(page.site.phones, ['0674-2001234']);
  assert.deepEqual(page.links.map((l) => l.url), ['https://kalinga.example.com/team']);
  assert.equal(page.antiBot, false);
  assert.equal(extractPage('<title>Just a moment...</title><div class="g-recaptcha"></div>', 'https://x.example.com/').antiBot, true);
  assert.deepEqual(parseAddressText('Plot 12, Mandi Road, Cuttack, Odisha 753001, India'), { address: 'Plot 12, Mandi Road, Cuttack, Odisha 753001, India', postalCode: '753001', state: 'Odisha', city: 'Cuttack', country: 'India' });
});
