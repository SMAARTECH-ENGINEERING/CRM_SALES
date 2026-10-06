import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

// The whole scraper path against two small local websites: one well-behaved
// business site with a robots.txt, a private section, a login page, a team
// page and a directory; one that shows a CAPTCHA. The fixture sites run on
// localhost, so private addresses are allowed for this test only.
setTestEnv('crm_test_scraper', { SCRAPER_ALLOW_PRIVATE_HOSTS: 'true', SCRAPER_MIN_DELAY_MS: '250' });

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: User } = await import('../src/models/User.js');
const { default: Company } = await import('../src/models/Company.js');
const { default: Contact } = await import('../src/models/Contact.js');
const { default: Lead } = await import('../src/models/Lead.js');
const { default: ScrapePage } = await import('../src/models/ScrapePage.js');
const { default: ScrapedRecord } = await import('../src/models/ScrapedRecord.js');
const { idle } = await import('../src/services/scraper.service.js');
const { seedLeadConfig } = await import('../src/services/seed.service.js');
const { createRole, createUser, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const ctx = { hits: [] };
const as = (token) => ({ Authorization: `Bearer ${token}` });

const PAGES = {
  '/robots.txt': 'User-agent: *\nDisallow: /private\n',
  '/': `<html><head><title>Home | MAA TARINI FPO</title><meta name="description" content="Farmer producer company in Cuttack">
    <script type="application/ld+json">{"@type":"Organization","name":"Maa Tarini FPO","email":"info@maatarini.example.com","telephone":"+91 674 255 0101",
      "address":{"streetAddress":"Plot 12, Mandi Road","addressLocality":"Cuttack","addressRegion":"Odisha","postalCode":"753001"}}</script></head>
    <body><a href="/contact">Contact us</a> <a href="/team">Our team</a> <a href="/directory">Member FPOs</a> <a href="/private/members">Members area</a> <a href="/login">Sign in</a></body></html>`,
  '/contact': '<html><head><title>Contact | Maa Tarini FPO</title></head><body><address>Plot 12, Mandi Road, Cuttack, Odisha 753001</address><p>Call <a href="tel:+916742550101">0674 255 0101</a></p></body></html>',
  '/team': `<html><body>
    <div class="team-member"><h3>Ramesh Behera</h3><p>Chief Executive Officer</p><a href="mailto:ramesh@maatarini.example.com">Email</a></div>
    <div class="team-member"><h3>Sujata Nayak</h3><p>Secretary</p></div></body></html>`,
  '/directory': `<html><body><table>
    <tr><th>FPO Name</th><th>District</th><th>Contact Person</th><th>Email</th><th>Mobile</th></tr>
    <tr><td>Hirakud Growers Cooperative</td><td>Sambalpur</td><td>Bikash Sahu</td><td>office@hirakud.example.com</td><td>9437012345</td></tr>
    <tr><td>KALINGA AGRO PVT. LTD.</td><td>Khordha</td><td></td><td></td><td>9861099999</td></tr>
    <tr><td>Bhoomi Farmers Producer Company</td><td>Balasore</td><td>Anil Das</td><td>anil@bhoomi.example.com</td><td>9937011111</td></tr>
  </table></body></html>`,
  '/private/members': '<html><body>Members only: secret@maatarini.example.com</body></html>',
  '/login': '<html><body><form><input type="password"></form></body></html>',
};

function startSite(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await User.init();
  await seedRbac();
  await seedLeadConfig();
  ctx.admin = await createUser(await superAdminRole());
  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.researcher = await createUser(await createRole(['scraper.read', 'scraper.create'], 'Researcher'));
  ctx.researcherToken = await loginAs(app, ctx.researcher);
  ctx.reader = await createUser(await createRole(['scraper.read'], 'Scraper reader'));
  ctx.readerToken = await loginAs(app, ctx.reader);

  ctx.site = await startSite((req, res) => {
    ctx.hits.push(req.url);
    const body = PAGES[req.url];
    if (!body) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': req.url === '/robots.txt' ? 'text/plain' : 'text/html; charset=utf-8' }).end(body);
  });
  ctx.blocked = await startSite((req, res) => {
    ctx.hits.push(`blocked:${req.url}`);
    if (req.url === '/robots.txt') return res.writeHead(404).end();
    return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html><head><title>Just a moment...</title></head><body><div class="g-recaptcha"></div><a href="/next">next</a></body></html>');
  });
  ctx.base = `http://127.0.0.1:${ctx.site.address().port}`;
  ctx.blockedBase = `http://127.0.0.1:${ctx.blocked.address().port}`;

  // Already in the CRM: Hirakud (same email), and a company named like Kalinga.
  await Company.create({ companyCode: 'COMP-900001', name: 'Hirakud Growers Cooperative', email: 'office@hirakud.example.com' });
  ctx.kalinga = await Company.create({ companyCode: 'COMP-900002', name: 'Kalinga Agro Private Limited', city: 'Cuttack' });
});

after(async () => {
  ctx.site?.close();
  ctx.blocked?.close();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

const records = async (query = '') => (await request(app).get(`/api/v1/scraper/records?limit=100&jobId=${ctx.job.id}${query}`).set(as(ctx.adminToken))).body.data.records;
const byName = (list, name) => list.find((r) => (r.type === 'company' ? r.company.name : r.contact.fullName) === name);

test('a job needs scraper.create; its addresses are checked first', async () => {
  const refused = await request(app).post('/api/v1/scraper/jobs').set(as(ctx.readerToken)).send({ name: 'Nope', targets: [ctx.base] });
  assert.equal(refused.status, 403);
  const invalid = await request(app).post('/api/v1/scraper/jobs').set(as(ctx.adminToken)).send({ name: 'Bad', targets: ['ftp://example.com/'] });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.errors[0].field, 'targets.0');
  const tooFast = await request(app).post('/api/v1/scraper/jobs').set(as(ctx.adminToken)).send({ name: 'Fast', targets: [ctx.base], settings: { delayMs: 10 } });
  assert.equal(tooFast.status, 422);
});

test('scrapes politely: robots.txt obeyed, sign-in pages left alone, anti-bot sites not retried', async () => {
  const response = await request(app)
    .post('/api/v1/scraper/jobs')
    .set(as(ctx.researcherToken))
    .send({ name: 'Odisha FPO Cold Storage Leads', targets: [ctx.base, ctx.blockedBase], settings: { maxPages: 10, maxDepth: 1, delayMs: 1000, sameDomain: true } });
  assert.equal(response.status, 201);
  ctx.job = response.body.data.job;
  assert.equal(ctx.job.status, 'queued');
  await idle();

  const job = (await request(app).get(`/api/v1/scraper/jobs/${ctx.job.id}`).set(as(ctx.researcherToken))).body.data.job;
  assert.equal(job.status, 'completed');
  assert.ok(job.stats.records >= 6, `records: ${job.stats.records}`);
  // The private section (robots.txt) and the sign-in page were never fetched.
  assert.ok(!ctx.hits.includes('/private/members'));
  assert.ok(!ctx.hits.includes('/login'));
  // The CAPTCHA site: its page once, and nothing after it.
  assert.deepEqual(ctx.hits.filter((h) => h.startsWith('blocked:/') && h !== 'blocked:/robots.txt'), ['blocked:/']);

  const pages = (await request(app).get(`/api/v1/scraper/pages?jobId=${ctx.job.id}&limit=50`).set(as(ctx.researcherToken))).body.data.pages;
  assert.ok(pages.some((p) => p.url.endsWith('/private/members') && p.status === 'skipped' && p.reason === 'robots'));
  assert.ok(pages.some((p) => p.status === 'failed' && p.reason === 'anti_bot'));
  assert.equal(await ScrapePage.countDocuments({ jobId: ctx.job.id, url: /\/login$/ }), 0);
  // Nothing in the CRM yet.
  assert.equal(await Company.countDocuments(), 2);
});

test('results are cleaned and compared with the CRM: new, possible duplicate, existing', async () => {
  const list = await records();
  const maa = byName(list, 'Maa Tarini FPO');
  assert.equal(maa.match.status, 'new');
  assert.equal(maa.company.email, 'info@maatarini.example.com');
  assert.equal(maa.company.city, 'Cuttack');
  assert.ok(maa.quality >= 80);
  assert.ok(!JSON.stringify(list).includes('secret@maatarini'));

  const hirakud = byName(list, 'Hirakud Growers Cooperative');
  assert.equal(hirakud.match.status, 'existing');
  assert.ok(hirakud.match.reasons.includes('email'));

  const kalinga = byName(list, 'Kalinga Agro PVT. LTD.') ?? list.find((r) => r.type === 'company' && /kalinga/i.test(r.company.name));
  assert.equal(kalinga.match.status, 'possible');
  assert.ok(kalinga.match.reasons.includes('name'));
  assert.equal(kalinga.match.companyId, String(ctx.kalinga._id));

  const ramesh = byName(list, 'Ramesh Behera');
  assert.equal(ramesh.type, 'contact');
  assert.equal(ramesh.contact.designation, 'Chief Executive Officer');
  assert.equal(ramesh.company.name, 'Maa Tarini FPO');

  // Filters.
  const duplicates = await records('&duplicates=true');
  assert.ok(duplicates.every((r) => ['possible', 'existing'].includes(r.match.status) || r.match.duplicateOf));
  const withEmail = await records('&hasEmail=true&type=company');
  assert.ok(withEmail.every((r) => r.company.email));
  const sambalpur = await records('&location=Sambalpur');
  assert.ok(sambalpur.length >= 1 && sambalpur.every((r) => r.company.city === 'Sambalpur'));
  ctx.list = list;
});

test('import preview says what would happen and changes nothing; possible duplicates need a choice', async () => {
  const ids = ctx.list.map((r) => r.id);
  const preview = await request(app).post('/api/v1/scraper/import/preview').set(as(ctx.adminToken)).send({ recordIds: ids, options: { createLead: true } });
  assert.equal(preview.status, 200);
  const { summary, results } = preview.body.data;
  assert.ok(summary.needChoice >= 1);
  assert.equal(results.find((r) => /kalinga/i.test(r.name)).outcome, 'choose');
  assert.ok(summary.companies.create >= 2);
  assert.ok(summary.leads >= 1);
  assert.equal(await Company.countDocuments(), 2);
  assert.equal(await Lead.countDocuments(), 0);

  // Importing needs scraper.import and the right to create companies and contacts.
  const refused = await request(app).post('/api/v1/scraper/import').set(as(ctx.researcherToken)).send({ recordIds: ids.slice(0, 1) });
  assert.equal(refused.status, 403);
});

test('imports into the existing companies, contacts and leads, with the source kept', async () => {
  const kalinga = ctx.list.find((r) => r.type === 'company' && /kalinga/i.test(r.company.name));
  // The user decides: it is the CRM's Kalinga - fill in what it lacks.
  const decided = await request(app).patch(`/api/v1/scraper/records/${kalinga.id}`).set(as(ctx.researcherToken)).send({ decision: 'update' });
  assert.equal(decided.status, 200);

  const maa = byName(ctx.list, 'Maa Tarini FPO');
  const ramesh = byName(ctx.list, 'Ramesh Behera');
  const response = await request(app)
    .post('/api/v1/scraper/import')
    .set(as(ctx.adminToken))
    .send({ recordIds: [ramesh.id, maa.id, kalinga.id], options: { createLead: true, lead: { title: '{company} - cold storage', requirement: 'Potential cold storage (to confirm on a call)' } } });
  assert.equal(response.status, 200);
  const { summary } = response.body.data;
  assert.equal(summary.imported, 3);

  const company = await Company.findOne({ name: 'Maa Tarini FPO' });
  assert.equal(company.email, 'info@maatarini.example.com');
  assert.match(company.notes, /Source: Web data scraper/);
  assert.match(company.notes, /Scraping job: Odisha FPO Cold Storage Leads/);
  // The person joined the company imported with them.
  const contact = await Contact.findOne({ email: 'ramesh@maatarini.example.com' });
  assert.equal(String(contact.companyId), String(company._id));
  assert.equal(contact.designation, 'Chief Executive Officer');
  // One lead per company, with the requirement as entered - nothing invented.
  const leads = await Lead.find({ companyId: company._id });
  assert.equal(leads.length, 1);
  assert.equal(leads[0].title, 'Maa Tarini FPO - cold storage');
  assert.equal(leads[0].description, 'Potential cold storage (to confirm on a call)');
  // Kalinga: only empty fields filled; its city stays.
  const updated = await Company.findById(ctx.kalinga._id);
  assert.equal(updated.city, 'Cuttack');
  assert.equal(updated.phone, '9861099999');
  assert.equal(await Company.countDocuments({ name: /kalinga/i }), 1);

  // Imported once only.
  const again = await request(app).post('/api/v1/scraper/import').set(as(ctx.adminToken)).send({ recordIds: [maa.id] });
  assert.equal(again.body.data.summary.already, 1);
  const job = (await request(app).get(`/api/v1/scraper/jobs/${ctx.job.id}`).set(as(ctx.adminToken))).body.data.job;
  assert.equal(job.stats.imported, 3);
});

test('a lead is created only when asked for', async () => {
  const bhoomi = byName(ctx.list, 'Bhoomi Farmers Producer Company');
  const before = await Lead.countDocuments();
  const response = await request(app).post('/api/v1/scraper/import').set(as(ctx.adminToken)).send({ recordIds: [bhoomi.id] });
  assert.equal(response.body.data.summary.imported, 1);
  assert.equal(await Lead.countDocuments(), before);
});

test('exports results to CSV and Excel', async () => {
  const csv = await request(app).get(`/api/v1/scraper/records/export?format=csv&jobId=${ctx.job.id}`).set(as(ctx.adminToken));
  assert.equal(csv.status, 200);
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.text, /Type,Company,Website/);
  assert.match(csv.text, /Maa Tarini FPO/);
  const xlsx = await request(app).get(`/api/v1/scraper/records/export?jobId=${ctx.job.id}`).set(as(ctx.adminToken)).buffer(true).parse((res, done) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });
  assert.equal(xlsx.status, 200);
  assert.equal(xlsx.body.subarray(0, 2).toString(), 'PK');
  const refused = await request(app).get(`/api/v1/scraper/records/export?jobId=${ctx.job.id}`).set(as(ctx.researcherToken));
  assert.equal(refused.status, 403);
});

test('jobs are private to their creator; figures, re-run and delete', async () => {
  const others = await request(app).get('/api/v1/scraper/jobs').set(as(ctx.readerToken));
  assert.equal(others.body.data.jobs.length, 0);
  const hidden = await request(app).get(`/api/v1/scraper/jobs/${ctx.job.id}`).set(as(ctx.readerToken));
  assert.equal(hidden.status, 404);

  const stats = (await request(app).get('/api/v1/scraper/stats').set(as(ctx.adminToken))).body.data;
  assert.equal(stats.jobs, 1);
  assert.ok(stats.imported >= 4);
  assert.ok(stats.failedPages >= 1);

  const rerun = await request(app).post(`/api/v1/scraper/jobs/${ctx.job.id}/rerun`).set(as(ctx.researcherToken));
  assert.equal(rerun.status, 201);
  const cancelled = await request(app).post(`/api/v1/scraper/jobs/${rerun.body.data.job.id}/cancel`).set(as(ctx.researcherToken));
  assert.equal(cancelled.status, 200);
  await idle();

  const companies = await Company.countDocuments();
  const deleted = await request(app).delete(`/api/v1/scraper/jobs/${ctx.job.id}`).set(as(ctx.adminToken));
  assert.equal(deleted.status, 200);
  assert.equal(await ScrapedRecord.countDocuments({ jobId: ctx.job.id }), 0);
  // What was imported stays in the CRM.
  assert.equal(await Company.countDocuments(), companies);
});
