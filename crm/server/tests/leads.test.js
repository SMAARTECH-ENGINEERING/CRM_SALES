import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_leads');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Company } = await import('../src/models/Company.js');
const { default: Contact } = await import('../src/models/Contact.js');
const { default: Lead } = await import('../src/models/Lead.js');
const { default: LeadStatus } = await import('../src/models/LeadStatus.js');
const { default: User } = await import('../src/models/User.js');
const { seedLeadConfig, verifyDeclaredPermissions } = await import('../src/services/seed.service.js');
const { allKeys, createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } =
  await import('./helpers/fixtures.js');

const API = '/api/v1/leads';

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const create = (body, token = ctx.adminToken) => request(app).post(API).set(as(token)).send(body);
const config = async (path) => (await request(app).get(`/api/v1/${path}`).set(admin())).body.data.items;
const byName = (items, name) => items.find((item) => item.name === name);

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Company.init(), Contact.init(), Lead.init()]);
  await seedRbac();
  await seedLeadConfig();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.plain = await createUser(await defaultRole());
  ctx.reader = await createUser(await createRole(['leads.read'], 'Lead Reader'));
  // Works leads day to day, but may not assign to others, convert or delete.
  ctx.rep = await createUser(await createRole(['leads.read', 'leads.create', 'leads.update'], 'Sales Rep'), {
    firstName: 'Riya',
    lastName: 'Rep',
  });
  ctx.manager = await createUser(await createRole(await allKeys('leads'), 'Sales Manager'), {
    firstName: 'Mo',
    lastName: 'Manager',
  });

  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.readerToken = await loginAs(app, ctx.reader);
  ctx.repToken = await loginAs(app, ctx.rep);
  ctx.managerToken = await loginAs(app, ctx.manager);

  ctx.statuses = await config('lead-statuses');
  ctx.sources = await config('lead-sources');
  ctx.priorities = await config('lead-priorities');

  const post = async (path, body) => (await request(app).post(`/api/v1/${path}`).set(admin()).send(body)).body.data;
  ctx.acme = (await post('companies', { name: 'Acme Industries' })).company;
  ctx.bolt = (await post('companies', { name: 'Bolt Traders' })).company;
  ctx.priya = (await post('contacts', { firstName: 'Priya', lastName: 'Nair', companyId: ctx.acme.id })).contact;
  ctx.omar = (await post('contacts', { firstName: 'Omar', lastName: 'Khan', companyId: ctx.bolt.id })).contact;
  ctx.org = (await post('organizations', { name: 'Head Office' })).item;
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await verifyDeclaredPermissions(), []);
});

// --- access --------------------------------------------------------------------

test('every lead endpoint needs a token (401) and a permission (403)', async () => {
  const id = new mongoose.Types.ObjectId();
  const sub = new mongoose.Types.ObjectId();
  const calls = (headers) => [
    request(app).get(API).set(headers),
    request(app).post(API).set(headers).send({ title: 'Nope' }),
    request(app).get(`${API}/${id}`).set(headers),
    request(app).put(`${API}/${id}`).set(headers).send({ title: 'Nope' }),
    request(app).delete(`${API}/${id}`).set(headers),
    request(app).patch(`${API}/${id}/assign`).set(headers).send({ assignedTo: null }),
    request(app).patch(`${API}/${id}/status`).set(headers).send({ statusId: String(sub) }),
    request(app).post(`${API}/${id}/convert`).set(headers).send({}),
    request(app).get(`${API}/${id}/timeline`).set(headers),
  ];

  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) assert.equal(res.status, 403);
  assert.equal(await Lead.countDocuments(), 0);
});

// --- create ----------------------------------------------------------------------

test('create: generates the number and applies the configured default status and priority', async () => {
  const res = await create({ title: '  Website redesign  ' }, ctx.repToken);

  assert.equal(res.status, 201);
  const { lead } = res.body.data;
  assert.equal(lead.leadNumber, 'LEAD-000001');
  assert.equal(lead.title, 'Website redesign');
  assert.equal(lead.status.name, 'New');
  assert.equal(lead.status.category, 'open');
  assert.equal(lead.priority.name, 'Medium');
  assert.equal(lead.isConverted, false);
  assert.equal(lead.createdBy, ctx.rep.id);
  assert.deepEqual(lead.tags, []);
  for (const field of ['_id', '__v', 'deletedAt', 'companyId', 'assignedTo']) assert.equal(field in lead, false, field);
  ctx.bare = lead;
});

test('create: stores every field and expands the references', async () => {
  const res = await create({
    title: 'ERP rollout',
    description: 'Phase one',
    companyId: ctx.acme.id,
    contactId: ctx.priya.id,
    sourceId: byName(ctx.sources, 'Referral').id,
    statusId: byName(ctx.statuses, 'Qualified').id,
    priorityId: byName(ctx.priorities, 'High').id,
    estimatedValue: 250000.5,
    assignedTo: ctx.rep.id,
    expectedCloseDate: '2027-03-31',
    notes: 'Budget approved',
    tags: ['erp', 'Q1'],
    organizationId: ctx.org.id,
  });

  assert.equal(res.status, 201);
  const { lead } = res.body.data;
  assert.equal(lead.leadNumber, 'LEAD-000002');
  assert.equal(lead.company.name, 'Acme Industries');
  assert.equal(lead.contact.fullName, 'Priya Nair');
  assert.equal(lead.source.name, 'Referral');
  assert.equal(lead.status.name, 'Qualified');
  assert.equal(lead.priority.name, 'High');
  assert.equal(lead.assignedToUser.fullName, 'Riya Rep');
  assert.equal(lead.organization.name, 'Head Office');
  assert.equal(lead.estimatedValue, 250000.5);
  assert.equal(lead.expectedCloseDate.slice(0, 10), '2027-03-31');
  assert.deepEqual(lead.tags, ['erp', 'Q1']);
  ctx.erp = lead;
});

test('create: a contact brings its company; a contact from another company is refused', async () => {
  const implied = await create({ title: 'Implied company', contactId: ctx.omar.id });
  assert.equal(implied.status, 201);
  assert.equal(implied.body.data.lead.company.name, 'Bolt Traders');
  ctx.implied = implied.body.data.lead;

  const mismatch = await create({ title: 'Mismatch', companyId: ctx.acme.id, contactId: ctx.omar.id });
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.errors[0].field, 'contactId');
});

test('create: validation and references', async () => {
  const missing = new mongoose.Types.ObjectId().toString();
  const inactive = await LeadStatus.create({ name: 'Retired', isActive: false, sortOrder: 999 });

  const cases = {
    'missing title': [{}, 422],
    'short title': [{ title: 'A' }, 422],
    'negative value': [{ title: 'Bad', estimatedValue: -1 }, 422],
    'non-numeric value': [{ title: 'Bad', estimatedValue: 'lots' }, 422],
    'bad date': [{ title: 'Bad', expectedCloseDate: 'soon' }, 422],
    'duplicate tags': [{ title: 'Bad', tags: ['vip', 'VIP'] }, 422],
    'tags not a list': [{ title: 'Bad', tags: 'vip' }, 422],
    'client-chosen number': [{ title: 'Bad', leadNumber: 'LEAD-999999' }, 422],
    'client-chosen creator': [{ title: 'Bad', createdBy: ctx.admin.id }, 422],
    'pretending to be converted': [{ title: 'Bad', convertedAt: new Date().toISOString() }, 422],
    'malformed reference': [{ title: 'Bad', statusId: 'nope' }, 422],
    'unknown company': [{ title: 'Bad', companyId: missing }, 400],
    'unknown contact': [{ title: 'Bad', contactId: missing }, 400],
    'unknown source': [{ title: 'Bad', sourceId: missing }, 400],
    'unknown status': [{ title: 'Bad', statusId: missing }, 400],
    'inactive status': [{ title: 'Bad', statusId: inactive.id }, 400],
    'unknown priority': [{ title: 'Bad', priorityId: missing }, 400],
    'unknown organization': [{ title: 'Bad', organizationId: missing }, 400],
    'unknown assignee': [{ title: 'Bad', assignedTo: missing }, 400],
  };
  const before = await Lead.countDocuments();
  for (const [label, [body, status]] of Object.entries(cases)) {
    const res = await create(body);
    assert.equal(res.status, status, label);
    assert.ok(res.body.errors.length > 0, label);
  }
  assert.equal(await Lead.countDocuments(), before, 'nothing was stored');
  await inactive.deleteOne();

  const next = await create({ title: 'After the failures' });
  assert.equal(next.body.data.lead.leadNumber, 'LEAD-000004', 'rejected requests consume no numbers');
  ctx.spare = next.body.data.lead;
});

test('create: concurrent requests get distinct numbers', async () => {
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => create({ title: `Parallel ${i}` })));
  const numbers = results.map((r) => r.body.data.lead.leadNumber).sort();
  assert.equal(new Set(numbers).size, 8);
  assert.deepEqual([numbers[0], numbers[7]], ['LEAD-000005', 'LEAD-000012']);
});

test('create: assigning to yourself is free; assigning to someone else needs leads.assign', async () => {
  const self = await create({ title: 'Mine', assignedTo: ctx.rep.id }, ctx.repToken);
  const other = await create({ title: 'Theirs', assignedTo: ctx.manager.id }, ctx.repToken);
  const byManager = await create({ title: 'Delegated', assignedTo: ctx.rep.id }, ctx.managerToken);

  assert.equal(self.status, 201);
  assert.equal(other.status, 403);
  assert.equal(byManager.status, 201);
});

// --- list ------------------------------------------------------------------------

test('list: search, filters, sorting and pagination', async () => {
  const h = as(ctx.readerToken);
  const titles = async (query) =>
    (await request(app).get(`${API}?limit=100&sortBy=leadNumber&sortOrder=asc&${query}`).set(h)).body.data.leads.map(
      (l) => l.title
    );

  assert.deepEqual(await titles('search=erp'), ['ERP rollout']);
  assert.deepEqual(await titles('search=LEAD-000001'), ['Website redesign']);
  assert.deepEqual(await titles('search=q1'), ['ERP rollout'], 'tags are searched');
  assert.deepEqual(await titles('search=.*'), []);

  assert.deepEqual(await titles(`companyId=${ctx.acme.id}`), ['ERP rollout']);
  assert.deepEqual(await titles(`contactId=${ctx.omar.id}`), ['Implied company']);
  assert.deepEqual(await titles(`statusId=${byName(ctx.statuses, 'Qualified').id}`), ['ERP rollout']);
  assert.deepEqual(await titles(`sourceId=${byName(ctx.sources, 'Referral').id}`), ['ERP rollout']);
  assert.deepEqual(await titles(`priorityId=${byName(ctx.priorities, 'High').id}`), ['ERP rollout']);
  assert.deepEqual(await titles(`organizationId=${ctx.org.id}`), ['ERP rollout']);
  assert.deepEqual(await titles(`assignedTo=${ctx.rep.id}`), ['ERP rollout', 'Mine', 'Delegated']);
  assert.deepEqual(await titles('statusCategory=won'), []);
  assert.equal((await titles('statusCategory=open')).length, 14);
  assert.deepEqual(await titles('converted=true'), []);

  const page = await request(app).get(`${API}?page=2&limit=5&sortBy=leadNumber&sortOrder=asc`).set(h);
  assert.deepEqual(page.body.data.pagination, { page: 2, limit: 5, total: 14, totalPages: 3 });
  assert.equal(page.body.data.leads[0].leadNumber, 'LEAD-000006');

  const byValue = await request(app).get(`${API}?limit=1&sortBy=estimatedValue&sortOrder=desc`).set(h);
  assert.equal(byValue.body.data.leads[0].title, 'ERP rollout');

  for (const bad of ['sortBy=deletedAt', 'limit=500', 'statusId=nope', 'statusCategory=paused', 'converted=maybe']) {
    assert.equal((await request(app).get(`${API}?${bad}`).set(h)).status, 422, bad);
  }
});

// --- get / update ----------------------------------------------------------------

test('get: one lead, 404 for unknown, 422 for a malformed id', async () => {
  const h = as(ctx.readerToken);
  assert.equal((await request(app).get(`${API}/${ctx.erp.id}`).set(h)).body.data.lead.leadNumber, 'LEAD-000002');
  assert.equal((await request(app).get(`${API}/${new mongoose.Types.ObjectId()}`).set(h)).status, 404);
  assert.equal((await request(app).get(`${API}/nope`).set(h)).status, 422);
});

test('update: changes what is sent, clears optional fields, keeps the number', async () => {
  const h = as(ctx.repToken);
  const url = `${API}/${ctx.erp.id}`;

  const res = await request(app)
    .put(url)
    .set(h)
    .send({ title: 'ERP rollout - phase 1', estimatedValue: 300000, notes: '', sourceId: null, tags: ['erp'] });
  assert.equal(res.status, 200);
  const { lead } = res.body.data;
  assert.equal(lead.title, 'ERP rollout - phase 1');
  assert.equal(lead.estimatedValue, 300000);
  assert.deepEqual(lead.tags, ['erp']);
  for (const field of ['notes', 'sourceId']) assert.equal(field in lead, false, field);
  assert.equal(lead.leadNumber, 'LEAD-000002');
  assert.equal(lead.description, 'Phase one', 'omitted fields are untouched');
  assert.equal(lead.status.name, 'Qualified');

  const cases = {
    'status via PUT': [{ statusId: byName(ctx.statuses, 'Won').id }, 422],
    'assignment via PUT': [{ assignedTo: ctx.manager.id }, 422],
    'change the number': [{ leadNumber: 'LEAD-000099' }, 422],
    'empty body': [{}, 422],
    'company that does not own the current contact': [{ companyId: ctx.bolt.id }, 400],
    'unknown priority': [{ priorityId: new mongoose.Types.ObjectId().toString() }, 400],
  };
  for (const [label, [body, status]] of Object.entries(cases)) {
    assert.equal((await request(app).put(url).set(h).send(body)).status, status, label);
  }

  // Company and contact can be changed together, or both cleared.
  const moved = await request(app).put(url).set(h).send({ companyId: ctx.bolt.id, contactId: ctx.omar.id });
  assert.equal(moved.body.data.lead.company.name, 'Bolt Traders');
  const cleared = await request(app).put(url).set(h).send({ companyId: null, contactId: null });
  assert.equal('companyId' in cleared.body.data.lead, false);
  assert.equal('contactId' in cleared.body.data.lead, false);
  await request(app).put(url).set(h).send({ contactId: ctx.priya.id });
});

// --- assign / status ---------------------------------------------------------------

test('assign: needs leads.assign; validates the user; null unassigns', async () => {
  const url = `${API}/${ctx.bare.id}/assign`;
  assert.equal((await request(app).patch(url).set(as(ctx.repToken)).send({ assignedTo: ctx.rep.id })).status, 403);

  const h = as(ctx.managerToken);
  const assigned = await request(app).patch(url).set(h).send({ assignedTo: ctx.rep.id });
  assert.equal(assigned.status, 200);
  assert.equal(assigned.body.data.lead.assignedToUser.fullName, 'Riya Rep');

  await User.updateOne({ _id: ctx.plain._id }, { status: 'inactive' });
  const cases = {
    'inactive user': [{ assignedTo: ctx.plain.id }, 400],
    'unknown user': [{ assignedTo: new mongoose.Types.ObjectId().toString() }, 400],
    'missing field': [{}, 422],
    malformed: [{ assignedTo: 'nope' }, 422],
  };
  for (const [label, [body, status]] of Object.entries(cases)) {
    assert.equal((await request(app).patch(url).set(h).send(body)).status, status, label);
  }
  await User.updateOne({ _id: ctx.plain._id }, { status: 'active' });

  const unassigned = await request(app).patch(url).set(h).send({ assignedTo: null });
  assert.equal(unassigned.status, 200);
  assert.equal('assignedTo' in unassigned.body.data.lead, false);
});

test('status: moves the lead to any active configured status', async () => {
  const url = `${API}/${ctx.bare.id}/status`;
  const h = as(ctx.repToken);
  const contacted = byName(ctx.statuses, 'Contacted');

  const res = await request(app).patch(url).set(h).send({ statusId: contacted.id });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.lead.status.name, 'Contacted');

  assert.equal((await request(app).patch(url).set(h).send({ statusId: new mongoose.Types.ObjectId().toString() })).status, 400);
  assert.equal((await request(app).patch(url).set(h).send({})).status, 422);
  assert.equal((await request(app).patch(url).set(as(ctx.readerToken)).send({ statusId: contacted.id })).status, 403);
});

test('timeline: records creation, edits, assignment and status changes with readable values', async () => {
  const res = await request(app).get(`${API}/${ctx.bare.id}/timeline`).set(as(ctx.readerToken));
  assert.equal(res.status, 200);
  const events = res.body.data.events;

  assert.deepEqual(events.map((e) => e.action), ['status_changed', 'assigned', 'assigned', 'created']);
  assert.deepEqual(events[0].changes, [{ field: 'status', label: 'Status', from: 'New', to: 'Contacted' }]);
  assert.deepEqual(events[1].changes, [{ field: 'assignedTo', label: 'Assigned to', from: 'Riya Rep' }]);
  assert.deepEqual(events[2].changes, [{ field: 'assignedTo', label: 'Assigned to', to: 'Riya Rep' }]);
  assert.equal(events[0].actor.fullName, 'Riya Rep');

  const edits = await request(app).get(`${API}/${ctx.erp.id}/timeline`).set(as(ctx.readerToken));
  const first = edits.body.data.events.at(-2);
  assert.equal(first.action, 'updated');
  assert.deepEqual(
    Object.fromEntries(first.changes.map((c) => [c.label, [c.from, c.to]])),
    {
      Title: ['ERP rollout', 'ERP rollout - phase 1'],
      Source: ['Referral', undefined],
      'Estimated value': ['250000.5', '300000'],
      Tags: ['erp, Q1', 'erp'],
      Notes: ['Budget approved', undefined],
    }
  );
});

// --- relationships -------------------------------------------------------------------

test('a company, contact or configuration value that leads use cannot be deleted', async () => {
  const sections = (await request(app).get(`/api/v1/companies/${ctx.acme.id}/sections`).set(admin())).body.data.sections;
  assert.deepEqual(sections.find((s) => s.key === 'leads'), { key: 'leads', label: 'Leads', available: true, count: 1 });

  const company = await request(app).delete(`/api/v1/companies/${ctx.acme.id}`).set(admin());
  assert.equal(company.status, 409);
  assert.ok(company.body.errors.some((e) => e.message === 'Leads: 1'));

  const contact = await request(app).delete(`/api/v1/contacts/${ctx.priya.id}`).set(admin());
  assert.equal(contact.status, 409);
  assert.deepEqual(contact.body.errors, [{ field: 'leads', message: 'Leads: 1' }]);

  const qualified = byName(ctx.statuses, 'Qualified');
  const status = await request(app).delete(`/api/v1/lead-statuses/${qualified.id}`).set(admin());
  assert.equal(status.status, 409);
  assert.match(status.body.message, /Deactivate/);

  const unused = byName(ctx.sources, 'Trade Show');
  assert.equal((await request(app).delete(`/api/v1/lead-sources/${unused.id}`).set(admin())).status, 200);
});

// --- delete ----------------------------------------------------------------------

test('delete: needs leads.delete; soft-deletes and never reuses the number', async () => {
  assert.equal((await request(app).delete(`${API}/${ctx.spare.id}`).set(as(ctx.repToken))).status, 403);

  const h = as(ctx.managerToken);
  assert.equal((await request(app).delete(`${API}/${ctx.spare.id}`).set(h)).status, 200);
  assert.equal((await request(app).get(`${API}/${ctx.spare.id}`).set(h)).status, 404);
  assert.equal((await request(app).delete(`${API}/${ctx.spare.id}`).set(h)).status, 404);
  assert.equal((await request(app).get(`${API}/${ctx.spare.id}/timeline`).set(h)).status, 404);

  const stored = await Lead.findById(ctx.spare.id).setOptions({ withDeleted: true });
  assert.ok(stored.deletedAt instanceof Date, 'record is kept');

  const next = await create({ title: 'After a delete' });
  assert.equal(next.body.data.lead.leadNumber, 'LEAD-000015');
});
