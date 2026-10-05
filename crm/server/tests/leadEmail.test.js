import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_lead_email');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: User } = await import('../src/models/User.js');
const { setMailTransport } = await import('../src/services/mail.service.js');
const s = await import('../src/services/seed.service.js');
const { createRole, createUser, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const post = async (path, body) => {
  const res = await request(app).post(`/api/v1/${path}`).set(as(ctx.adminToken)).send(body);
  assert.ok(res.status < 300, `${path}: ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const send = (body, token = ctx.adminToken) => request(app).post('/api/v1/leads/bulk-email').set(as(token)).send(body);
let outbox = [];

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await User.init();
  await seedRbac();
  await s.seedLeadConfig();
  ctx.admin = await createUser(await superAdminRole());
  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.reader = await createUser(await createRole(['leads.read'], 'Lead reader'));
  ctx.readerToken = await loginAs(app, ctx.reader);
  await request(app).put('/api/v1/settings').set(as(ctx.adminToken)).send({ company: { name: 'Kalinga Cold Chain' } });

  const fpo = (await post('companies', { name: 'Maa Tarini FPO', email: 'office@maatarini.example.com' })).company;
  const coop = (await post('companies', { name: 'Hirakud Growers Cooperative' })).company;
  const contact = (await post('contacts', { firstName: 'Ramesh', lastName: 'Behera', email: 'Ramesh.Behera@maatarini.example.com', companyId: fpo.id })).contact;
  ctx.withContact = (await post('leads', { title: '5 MT cold storage', companyId: fpo.id, contactId: contact.id })).lead;
  // No contact: the company's address is used.
  ctx.companyOnly = (await post('leads', { title: 'Solar cold room', companyId: fpo.id })).lead;
  // Neither has an address.
  ctx.noAddress = (await post('leads', { title: 'Ripening chamber', companyId: coop.id })).lead;
});

after(async () => {
  setMailTransport(null);
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

const MESSAGE = { subject: 'Cold storage offer for {{companyName}}', message: '{{greeting}}\n\nAbout {{leadTitle}} ({{leadNumber}}): our solar cold rooms are now available.\n\nRegards,\n{{senderCompany}}' };

test('refuses when no mail server is configured, without sending anything', async () => {
  setMailTransport(null);
  const res = await send({ leadIds: [ctx.withContact.id], ...MESSAGE });
  assert.equal(res.status, 409);
  assert.match(res.body.message, /No mail server/);
});

test('each lead gets its own email, filled in for it; one address gets one email; missing addresses are reported', async () => {
  outbox = [];
  setMailTransport({ sendMail: async (message) => outbox.push(message) });
  const res = await send({ leadIds: [ctx.withContact.id, ctx.companyOnly.id, ctx.noAddress.id], ...MESSAGE });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const { sent, skipped, failed, summary } = res.body.data;
  assert.deepEqual(summary, { requested: 3, sent: 2, skipped: 1, failed: 0 });
  assert.deepEqual(failed, []);
  assert.deepEqual(sent.map((x) => x.to).sort(), ['office@maatarini.example.com', 'ramesh.behera@maatarini.example.com']);
  assert.equal(skipped[0].leadNumber, ctx.noAddress.leadNumber);
  assert.match(skipped[0].reason, /email address/);

  assert.equal(outbox.length, 2);
  // Separate messages: nobody sees another recipient.
  for (const message of outbox) assert.equal(typeof message.to, 'string');
  const toRamesh = outbox.find((m) => m.to.startsWith('ramesh'));
  assert.equal(toRamesh.subject, 'Cold storage offer for Maa Tarini FPO');
  assert.match(toRamesh.text, /^Dear Ramesh Behera,/);
  assert.ok(toRamesh.text.includes(`About 5 MT cold storage (${ctx.withContact.leadNumber})`), toRamesh.text);
  assert.match(toRamesh.text, /Kalinga Cold Chain$/);
  assert.match(outbox.find((m) => m.to.startsWith('office')).text, /^Hello,/);

  // Recorded in the history of each lead that was emailed.
  const timeline = await request(app).get(`/api/v1/leads/${ctx.withContact.id}/timeline`).set(as(ctx.adminToken));
  assert.ok(timeline.body.data.events.some((e) => e.action === 'emailed' && /ramesh\.behera@/.test(e.summary)), JSON.stringify(timeline.body.data.events));
});

test('two leads with the same address: one email', async () => {
  outbox = [];
  setMailTransport({ sendMail: async (message) => outbox.push(message) });
  const second = (await post('leads', { title: 'Second enquiry', companyId: ctx.withContact.companyId })).lead;
  const res = await send({ leadIds: [ctx.companyOnly.id, second.id], ...MESSAGE });
  assert.equal(outbox.length, 1);
  assert.equal(res.body.data.summary.skipped, 1);
  assert.match(res.body.data.skipped[0].reason, /Same address as/);
});

test('a refused message is reported, and the others still go', async () => {
  outbox = [];
  setMailTransport({ sendMail: async (message) => (message.to.startsWith('office') ? Promise.reject(new Error('550 mailbox unavailable')) : outbox.push(message)) });
  const res = await send({ leadIds: [ctx.withContact.id, ctx.companyOnly.id], ...MESSAGE });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.summary, { requested: 2, sent: 1, skipped: 0, failed: 1 });
  assert.ok(!JSON.stringify(res.body).includes('550'), 'the server error itself is not passed on');
});

test('needs leads.email, and checks what is sent', async () => {
  setMailTransport({ sendMail: async () => {} });
  assert.equal((await send({ leadIds: [ctx.withContact.id], ...MESSAGE }, ctx.readerToken)).status, 403);
  assert.equal((await request(app).post('/api/v1/leads/bulk-email').send({ leadIds: [ctx.withContact.id], ...MESSAGE })).status, 401);
  for (const body of [{ ...MESSAGE, leadIds: [] }, { leadIds: [ctx.withContact.id], subject: '', message: 'x' }, { leadIds: [ctx.withContact.id], subject: 'a\r\nBcc: x@y.z', message: 'x' }, { leadIds: ['nope'], ...MESSAGE }, { leadIds: Array.from({ length: 101 }, () => ctx.withContact.id), ...MESSAGE }]) {
    assert.equal((await send(body)).status, 422, JSON.stringify(body).slice(0, 80));
  }
});
