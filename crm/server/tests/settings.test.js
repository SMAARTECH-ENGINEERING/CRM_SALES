import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

const UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-settings-uploads-'));
setTestEnv('crm_test_settings', { UPLOAD_DIR: UPLOADS, LEAD_NUMBER_PREFIX: 'LEAD', MAIL_FROM: '' });

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: AppSettings } = await import('../src/models/AppSettings.js');
const { default: User } = await import('../src/models/User.js');
const s = await import('../src/services/seed.service.js');
const { setMailTransport } = await import('../src/services/mail.service.js');
const { runReminderCheck } = await import('../src/services/contractReminder.service.js');
const { resetSettingsCache } = await import('../src/services/settings.service.js');
const { PASSWORD, createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const API = '/api/v1/settings';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');

const ctx = { sent: [] };
const as = (token) => ({ Authorization: `Bearer ${token}` });
const call = (method, p, token, body) => request(app)[method](`/api/v1/${p}`).set(as(token)).send(body);
const post = async (p, body, token = ctx.adminToken) => {
  const res = await call('post', p, token, body);
  assert.ok(res.status < 300, `${p}: ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const put = (body, token = ctx.adminToken) => request(app).put(API).set(as(token)).send(body);
const save = async (body) => {
  const res = await put(body);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data.settings;
};
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  resetSettingsCache();
  await User.init();
  await seedRbac();
  for (const seed of ['seedLeadConfig', 'seedQuotationStatuses', 'seedOrderStatuses', 'seedTicketSettings', 'seedContractSettings', 'seedPaymentSettings']) await s[seed]();
  setMailTransport({ sendMail: async (message) => ctx.sent.push(message) });

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin', email: 'ada@example.com' });
  ctx.staff = await createUser(await createRole(['leads.create', 'leads.read', 'leads.assign', 'documents.create', 'documents.read', 'companies.read'], 'Staff'), { firstName: 'Sam', lastName: 'Staff' });
  ctx.plain = await createUser(await defaultRole());
  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.staffToken = await loginAs(app, ctx.staff);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.acme = (await post('companies', { name: 'Acme Industries', email: 'buyer@acme.example' })).company;
});

after(async () => {
  setMailTransport(null);
  await mongoose.connection.dropDatabase();
  await disconnectDB();
  fs.rmSync(UPLOADS, { recursive: true, force: true });
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await s.verifyDeclaredPermissions(), []);
});

test('reading: everyone signed in gets what the screens need; managers get everything', async () => {
  assert.equal((await request(app).get(API)).status, 401);

  const full = (await request(app).get(API).set(as(ctx.adminToken))).body.data;
  assert.equal(full.editable, true);
  assert.deepEqual(Object.keys(full.settings).sort(), ['branding', 'company', 'crm', 'documents', 'email', 'notifications', 'quotation', 'sales', 'security', 'updatedAt']);
  // Until something is changed, every value is the installation's default.
  assert.deepEqual(full.settings.crm, { timezone: '', dateFormat: 'locale', companyPrefix: 'COMP', leadPrefix: 'LEAD', opportunityPrefix: 'OPP', customerPrefix: 'CUST', projectPrefix: 'PRJ', ticketPrefix: 'TKT', contractPrefix: 'CON' });
  assert.deepEqual(full.settings.sales, { orderPrefix: 'ORD', invoicePrefix: 'INV', defaultTaxId: null, allowOverpayment: false });
  assert.deepEqual([full.settings.quotation.quotationPrefix, full.settings.quotation.validityDays], ['QUO', 30]);
  assert.deepEqual(full.settings.notifications, { disabledTypes: [], contractReminderEmails: true });
  assert.deepEqual([full.settings.documents.maxFileMb, full.settings.documents.maxFiles], [10, 5]);
  assert.deepEqual(full.settings.security, { allowPublicRegistration: true, passwordMinLength: 8 });
  assert.ok(full.meta.dateFormats.includes('DD/MM/YYYY') && full.meta.notificationTypes.includes('lead_assigned'));
  assert.equal(typeof full.meta.emailConfigured, 'boolean');
  assert.equal(await AppSettings.countDocuments(), 0, 'reading stores nothing');

  // Someone who does not manage settings: the public part only.
  const some = (await request(app).get(API).set(as(ctx.plainToken))).body.data;
  assert.equal(some.editable, false);
  assert.deepEqual(Object.keys(some.settings).sort(), ['branding', 'company', 'crm', 'documents']);
  assert.deepEqual(Object.keys(some.settings.company).sort(), ['currency', 'logo', 'name']);
  assert.deepEqual(Object.keys(some.settings.crm).sort(), ['dateFormat', 'timezone']);
  assert.equal(some.meta, undefined);
});

test('writing: only with settings.manage, validated, group by group', async () => {
  assert.equal((await request(app).put(API).send({ crm: { leadPrefix: 'X' } })).status, 401);
  assert.equal((await put({ crm: { leadPrefix: 'X' } }, ctx.staffToken)).status, 403);

  const bad = [
    [{}, undefined],
    [{ crm: { leadPrefix: 'has space' } }, 'crm.leadPrefix'],
    [{ crm: { dateFormat: 'YY-M-D' } }, 'crm.dateFormat'],
    [{ crm: { timezone: 'Mars/Olympus' } }, 'crm.timezone'],
    [{ company: { currency: 'RUPEES' } }, 'company.currency'],
    [{ company: { logo: 'javascript:alert(1)' } }, 'company.logo'],
    [{ documents: { maxFileMb: 500 } }, 'documents.maxFileMb'],
    [{ documents: { allowedTypes: [] } }, 'documents.allowedTypes'],
    [{ documents: { allowedTypes: ['not a type'] } }, 'documents.allowedTypes.0'],
    [{ notifications: { disabledTypes: ['birthday'] } }, 'notifications.disabledTypes.0'],
    [{ security: { passwordMinLength: 4 } }, 'security.passwordMinLength'],
    [{ email: { fromAddress: 'not-an-email' } }, 'email.fromAddress'],
    [{ email: { fromName: 'Evil <x@y.z>' } }, 'email.fromName'],
    // An unknown group is dropped, which leaves nothing to save.
    [{ payroll: { salary: 1 } }, undefined],
  ];
  for (const [body, field] of bad) {
    const res = await put(body);
    assert.equal(res.status, 422, `${JSON.stringify(body)}: ${JSON.stringify(res.body)}`);
    if (field) assert.equal(res.body.errors[0].field, field);
  }
  assert.equal((await put({ sales: { defaultTaxId: new mongoose.Types.ObjectId().toString() } })).status, 400);
  assert.equal(await AppSettings.countDocuments(), 0, 'nothing was stored');

  // Only what is sent changes; the rest keeps its value.
  const settings = await save({ company: { name: 'Example Trading Co.', currency: 'inr', logo: 'https://cdn.example.com/logo.png' }, crm: { timezone: 'Asia/Kolkata', dateFormat: 'DD/MM/YYYY' } });
  assert.deepEqual([settings.company.name, settings.company.currency, settings.company.logo], ['Example Trading Co.', 'INR', 'https://cdn.example.com/logo.png']);
  assert.deepEqual([settings.crm.timezone, settings.crm.dateFormat, settings.crm.leadPrefix], ['Asia/Kolkata', 'DD/MM/YYYY', 'LEAD']);
  assert.ok(settings.updatedAt);
  // Everyone now sees the public part of it.
  const seen = (await request(app).get(API).set(as(ctx.plainToken))).body.data.settings;
  assert.deepEqual([seen.company.name, seen.company.currency, seen.crm.timezone, seen.crm.dateFormat], ['Example Trading Co.', 'INR', 'Asia/Kolkata', 'DD/MM/YYYY']);
  // A field that is not a setting is dropped, never stored.
  assert.equal((await put({ crm: { smtpPassword: 'hunter2', timezone: 'Asia/Kolkata' } })).status, 200);
  assert.ok(!JSON.stringify(await AppSettings.find().lean()).includes('hunter2'));
  // The older company endpoint reads the same record.
  assert.equal((await request(app).get(`${API}/company`).set(as(ctx.adminToken))).body.data.profile.name, 'Example Trading Co.');
});

test('number prefixes: the next record uses the new prefix; existing ones keep theirs', async () => {
  const before = (await post('leads', { title: 'Before' })).lead;
  assert.equal(before.leadNumber, 'LEAD-000001');
  await save({ crm: { leadPrefix: 'enq', ticketPrefix: 'SUP', contractPrefix: 'AMC' }, sales: { orderPrefix: 'SO', invoicePrefix: 'BILL' }, quotation: { quotationPrefix: 'QT' } });

  assert.equal((await post('leads', { title: 'After' })).lead.leadNumber, 'ENQ-000002', 'same sequence, new prefix');
  assert.equal((await request(app).get(`/api/v1/leads/${before.id}`).set(as(ctx.adminToken))).body.data.lead.leadNumber, 'LEAD-000001');
  assert.equal((await post('tickets', { companyId: ctx.acme.id, subject: 'Printer offline' })).ticket.ticketNumber, 'SUP-000001');
  assert.equal((await post('payments', { companyId: ctx.acme.id, amount: 100 })).payment.invoiceNumber, 'BILL-000001');
  ctx.contract = (await post('contracts', { companyId: ctx.acme.id, startDate: day(-300), endDate: day(5), amount: 1000, assignedTo: ctx.admin.id })).contract;
  assert.equal(ctx.contract.contractNumber, 'AMC-000001');

  const tax = (await post('taxes', { name: 'GST 18', rate: 18 })).item;
  ctx.tax = tax;
  ctx.desk = (await post('products', { name: 'Desk', basePrice: 1000, taxId: tax.id })).product;
  ctx.quotation = (await post('quotations', { companyId: ctx.acme.id, items: [{ productId: ctx.desk.id, quantity: 1 }] })).quotation;
  assert.equal(ctx.quotation.quotationNumber, 'QT-000001');
  assert.equal((await post('orders', { companyId: ctx.acme.id, items: [{ productId: ctx.desk.id, quantity: 1 }] })).order.orderNumber, 'SO-000001');

  // '' puts a setting back to its default.
  const settings = await save({ crm: { leadPrefix: '' } });
  assert.equal(settings.crm.leadPrefix, 'LEAD');
  assert.equal((await post('leads', { title: 'Back' })).lead.leadNumber, 'LEAD-000003');
});

test('sales: the default tax and overpayment', async () => {
  await save({ sales: { defaultTaxId: ctx.tax.id } });
  assert.equal((await post('products', { name: 'Chair', basePrice: 200 })).product.taxId, ctx.tax.id, 'no tax mentioned: the default');
  assert.equal((await post('products', { name: 'Gift card', basePrice: 50, taxId: null })).product.taxId, undefined, 'an explicit "no tax" is respected');

  const refused = await call('post', 'payments', ctx.adminToken, { companyId: ctx.acme.id, amount: 100, paidAmount: 150 });
  assert.equal(refused.status, 422);
  await save({ sales: { allowOverpayment: true } });
  const allowed = (await post('payments', { companyId: ctx.acme.id, amount: 100, paidAmount: 150 })).payment;
  assert.deepEqual([allowed.remainingAmount, allowed.overpaidAmount], [0, 50]);
  await save({ sales: { allowOverpayment: null } });
  assert.equal((await call('post', 'payments', ctx.adminToken, { companyId: ctx.acme.id, amount: 100, paidAmount: 150 })).status, 422, 'back to the default');
});

test('quotation: validity, terms and the wording of the email', async () => {
  const settings = await save({
    quotation: { validityDays: 14, terms: 'Payment within 14 days.', emailSubject: 'Offer {{quotationNumber}}', emailMessage: '{{greeting}} Here is {{quotationNumber}} from {{companyName}}. {{unknown}}' },
    email: { fromName: 'Example Sales', fromAddress: 'Sales@Example.com', replyTo: 'orders@example.com' },
  });
  assert.deepEqual([settings.quotation.validityDays, settings.quotation.terms, settings.email.fromAddress], [14, 'Payment within 14 days.', 'sales@example.com']);
  // The quotation builder reads its defaults from the profile, as before.
  const profile = (await request(app).get(`${API}/company`).set(as(ctx.adminToken))).body.data.profile;
  assert.deepEqual([profile.quotationValidityDays, profile.quotationTerms], [14, 'Payment within 14 days.']);

  ctx.sent.length = 0;
  const res = await call('post', `quotations/${ctx.quotation.id}/send`, ctx.adminToken, {});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const [mail] = ctx.sent;
  assert.equal(mail.subject, 'Offer QT-000001');
  assert.equal(mail.text, 'Hello, Here is QT-000001 from Example Trading Co.. {{unknown}}');
  assert.deepEqual([mail.from, mail.replyTo, mail.to], [{ name: 'Example Sales', address: 'sales@example.com' }, 'orders@example.com', 'buyer@acme.example']);
});

test('notifications: a type can be switched off, and reminder emails too', async () => {
  const inbox = async () => (await request(app).get('/api/v1/notifications?limit=100').set(as(ctx.staffToken))).body.data.notifications.map((n) => n.type);
  const lead = (await post('leads', { title: 'Assign me' })).lead;
  await save({ notifications: { disabledTypes: ['lead_assigned'], contractReminderEmails: false } });
  await call('patch', `leads/${lead.id}/assign`, ctx.adminToken, { assignedTo: ctx.staff.id });
  assert.deepEqual(await inbox(), [], 'lead_assigned is off');

  // The contract reminder still creates its follow-up and notification - but sends no email.
  ctx.sent.length = 0;
  await runReminderCheck();
  assert.equal(ctx.sent.length, 0);
  const [reminder] = (await request(app).get(`/api/v1/contracts/${ctx.contract.id}/reminders`).set(as(ctx.adminToken))).body.data.reminders;
  assert.match(reminder.emailError, /switched off in Settings/);

  await save({ notifications: { disabledTypes: [] } });
  await call('patch', `leads/${lead.id}/assign`, ctx.adminToken, { assignedTo: null });
  await call('patch', `leads/${lead.id}/assign`, ctx.adminToken, { assignedTo: ctx.staff.id });
  assert.deepEqual(await inbox(), ['lead_assigned']);
});

test('documents: the upload limits apply to the next upload', async () => {
  const upload = (files) => {
    let req = request(app).post('/api/v1/documents').set(as(ctx.staffToken)).field('entityType', 'company').field('entityId', ctx.acme.id);
    for (const [name, type] of files) req = req.attach('files', PDF, { filename: name, contentType: type });
    return req;
  };
  assert.equal((await upload([['a.pdf', 'application/pdf'], ['b.pdf', 'application/pdf']])).status, 201);

  await save({ documents: { maxFiles: 1, allowedTypes: ['image/*'] } });
  const config = (await request(app).get('/api/v1/documents/config').set(as(ctx.staffToken))).body.data;
  assert.deepEqual([config.maxFiles, config.allowedTypes, config.maxFileBytes], [1, ['image/*'], 10 * 1024 * 1024]);
  assert.equal((await upload([['c.pdf', 'application/pdf']])).status, 415, 'PDFs are no longer allowed');

  await save({ documents: { allowedTypes: null, maxFileMb: 0.01 } });
  assert.equal((await upload([['d.pdf', 'application/pdf'], ['e.pdf', 'application/pdf']])).status, 400, 'one file at a time now');
  const big = request(app).post('/api/v1/documents').set(as(ctx.staffToken)).field('entityType', 'company').field('entityId', ctx.acme.id).attach('files', Buffer.concat([PDF, Buffer.alloc(20 * 1024, 65)]), { filename: 'big.pdf', contentType: 'application/pdf' });
  assert.equal((await big).status, 413);
  // What everyone is told matches.
  assert.deepEqual((await request(app).get(API).set(as(ctx.plainToken))).body.data.settings.documents.maxFiles, 1);
});

test('security: sign-up and the minimum password length', async () => {
  const register = (email, password = PASSWORD) => request(app).post('/api/v1/auth/register').send({ firstName: 'New', lastName: 'Person', email, password });
  assert.equal((await register('one@example.com')).status, 201);

  await save({ security: { allowPublicRegistration: false, passwordMinLength: 16 } });
  assert.equal((await register('two@example.com')).status, 403, 'sign-up is closed');

  // PASSWORD has 15 characters: too short now, wherever a password is set.
  let res = await call('post', 'users', ctx.adminToken, { firstName: 'Too', lastName: 'Short', email: 'short@example.com', password: PASSWORD });
  assert.equal(res.status, 422);
  assert.deepEqual(res.body.errors[0], { field: 'password', message: 'password must be at least 16 characters long' });
  res = await call('patch', `users/${ctx.plain.id}/reset-password`, ctx.adminToken, { newPassword: PASSWORD });
  assert.equal(res.status, 422);
  res = await call('post', 'auth/change-password', ctx.staffToken, { currentPassword: PASSWORD, newPassword: PASSWORD.replace('S', 'Z') });
  assert.equal(res.status, 422);
  assert.equal((await call('post', 'users', ctx.adminToken, { firstName: 'Long', lastName: 'Enough', email: 'long@example.com', password: `${PASSWORD}-and-more` })).status, 201);
  // People who already have a shorter password can still sign in.
  assert.equal((await request(app).post('/api/v1/auth/login').send({ email: ctx.plain.email, password: PASSWORD })).status, 200);
});

test('no secret is a setting: nothing about the mail server or storage is stored or served', async () => {
  const text = JSON.stringify((await request(app).get(API).set(as(ctx.adminToken))).body);
  assert.ok(!/smtp|secret|token|accessKey|pass(?!wordMinLength)/i.test(text), text.match(/.{0,30}(smtp|secret|token|accessKey|pass(?!wordMinLength)).{0,30}/i)?.[0]);
  const stored = JSON.stringify(await AppSettings.find().lean());
  assert.ok(!/smtp|secret|token/i.test(stored));
  assert.equal(await AppSettings.countDocuments(), 1, 'one document');
});

test('branding: set by a manager, and served to the sign-in page without a token', async () => {
  let open = await request(app).get(`${API}/public`);
  assert.equal(open.status, 200);
  assert.deepEqual(Object.keys(open.body.data.settings).sort(), ['branding', 'company']);
  assert.deepEqual(Object.keys(open.body.data.settings.company).sort(), ['logo', 'name']);
  assert.deepEqual(open.body.data.settings.branding, { theme: '', loginLogo: '', favicon: '' });

  const saved = await request(app).put(API).set(as(ctx.adminToken)).send({ branding: { theme: 'emerald', loginLogo: 'https://cdn.example.com/login.png' } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  open = await request(app).get(`${API}/public`);
  assert.deepEqual(open.body.data.settings.branding, { theme: 'emerald', loginLogo: 'https://cdn.example.com/login.png', favicon: '' });
  // Nothing but the name, logo and branding is public.
  assert.ok(!/prefix|smtp|secret|passwordMinLength/i.test(JSON.stringify(open.body)));

  for (const branding of [{ theme: 'not a theme!' }, { favicon: 'javascript:alert(1)' }]) {
    assert.equal((await request(app).put(API).set(as(ctx.adminToken)).send({ branding })).status, 422, JSON.stringify(branding));
  }
  assert.equal((await request(app).put(API).set(as(ctx.plainToken)).send({ branding: { theme: 'ocean' } })).status, 403);
  await request(app).put(API).set(as(ctx.adminToken)).send({ branding: { theme: '', loginLogo: '' } });
  assert.deepEqual((await request(app).get(`${API}/public`)).body.data.settings.branding, { theme: '', loginLogo: '', favicon: '' });
});
