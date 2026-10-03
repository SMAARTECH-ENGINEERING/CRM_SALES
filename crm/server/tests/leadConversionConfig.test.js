import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

// A different match configuration from the default, to show the fields used to
// detect duplicates really come from configuration:
//   companies only by PAN; contacts only by full name.
setTestEnv('crm_test_lead_conversion_config', {
  COMPANY_MATCH_FIELDS: 'panNumber',
  CONTACT_MATCH_FIELDS: 'name',
  LEAD_NUMBER_PREFIX: 'ENQ',
  LEAD_NUMBER_DIGITS: '4',
  OPPORTUNITY_NUMBER_PREFIX: 'DEAL',
  OPPORTUNITY_NUMBER_DIGITS: '3',
});

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Company } = await import('../src/models/Company.js');
const { default: Contact } = await import('../src/models/Contact.js');
const { default: User } = await import('../src/models/User.js');
const { seedLeadConfig, seedPipelines } = await import('../src/services/seed.service.js');
const { createUser, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const ctx = {};
const h = () => ({ Authorization: `Bearer ${ctx.token}` });
const post = async (path, body) => request(app).post(`/api/v1/${path}`).set(h()).send(body);

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Company.init(), Contact.init()]);
  await seedRbac();
  await seedLeadConfig();
  await seedPipelines();
  ctx.token = await loginAs(app, await createUser(await superAdminRole()));

  ctx.acme = (await post('companies', { name: 'Acme Industries', panNumber: 'ABCDE1234F', email: 'info@acme.example' })).body.data.company;
  ctx.priya = (
    await post('contacts', { firstName: 'Priya', lastName: 'Nair', companyId: ctx.acme.id, email: 'priya@acme.example' })
  ).body.data.contact;
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('lead and opportunity numbers follow the configured prefix and width', async () => {
  const lead = (await post('leads', { title: 'Configured', companyId: ctx.acme.id })).body.data.lead;
  assert.equal(lead.leadNumber, 'ENQ-0001');

  const res = await post(`leads/${lead.id}/convert`, {});
  assert.equal(res.body.data.opportunity.opportunityNumber, 'DEAL-001');
});

test('companies are matched only on the configured field', async () => {
  // Same name and email as Acme - but those are not configured, so no match.
  const byName = (await post('leads', { title: 'Same name' })).body.data.lead;
  const created = await post(`leads/${byName.id}/convert`, {
    company: { name: 'Acme Industries', email: 'info@acme.example' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.company.action, 'created');
  assert.equal(await Company.countDocuments({ name: 'Acme Industries' }), 2);

  // Same PAN under a different name: that is the configured field, so it matches.
  const byPan = (await post('leads', { title: 'Same PAN' })).body.data.lead;
  const matched = await post(`leads/${byPan.id}/convert`, {
    company: { name: 'Totally Different Name', panNumber: 'abcde1234f' },
  });
  assert.equal(matched.body.data.company.action, 'matched');
  assert.equal(matched.body.data.company.matchedBy, 'panNumber');
  assert.equal(matched.body.data.company.record.id, ctx.acme.id);
});

test('contacts are matched only on the configured field', async () => {
  // Same email, different name: email is not configured here, so a new contact.
  const byEmail = (await post('leads', { title: 'Same email', companyId: ctx.acme.id })).body.data.lead;
  const created = await post(`leads/${byEmail.id}/convert`, {
    contact: { firstName: 'Someone', lastName: 'Else', phone: '+91 90000 00002' },
  });
  assert.equal(created.body.data.contact.action, 'created');

  // Same full name, any case: matches.
  const byFullName = (await post('leads', { title: 'Same name', companyId: ctx.acme.id })).body.data.lead;
  const matched = await post(`leads/${byFullName.id}/convert`, {
    contact: { firstName: 'priya', lastName: 'NAIR' },
  });
  assert.equal(matched.body.data.contact.action, 'matched');
  assert.equal(matched.body.data.contact.matchedBy, 'name');
  assert.equal(matched.body.data.contact.record.id, ctx.priya.id);
  assert.equal(await Contact.countDocuments({ companyId: ctx.acme.id }), 2);
});
