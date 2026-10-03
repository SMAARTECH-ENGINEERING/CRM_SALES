import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_lead_config');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: LeadPriority } = await import('../src/models/LeadPriority.js');
const { default: LeadSource } = await import('../src/models/LeadSource.js');
const { default: LeadStatus } = await import('../src/models/LeadStatus.js');
const { default: User } = await import('../src/models/User.js');
const { seedLeadConfig, verifyDeclaredPermissions } = await import('../src/services/seed.service.js');
const { getDefaultEntry, registerLeadConfigUsage } = await import('../src/services/leadConfig.service.js');
const seed = await import('../src/seeds/leadConfig.seed.js');
const { createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } = await import(
  './helpers/fixtures.js'
);

const SOURCES = '/api/v1/lead-sources';
const STATUSES = '/api/v1/lead-statuses';
const PRIORITIES = '/api/v1/lead-priorities';
const ALL = [SOURCES, STATUSES, PRIORITIES];

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const list = async (url, query = '', token = ctx.adminToken) =>
  (await request(app).get(`${url}${query}`).set(as(token))).body.data.items;
const names = async (url, query) => (await list(url, query)).map((item) => item.name);

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), LeadSource.init(), LeadStatus.init(), LeadPriority.init()]);
  await seedRbac();

  ctx.admin = await createUser(await superAdminRole());
  ctx.plain = await createUser(await defaultRole());
  // Someone who works with leads but does not administer the configuration.
  ctx.sales = await createUser(await createRole(['leads.read', 'leads.create'], 'Sales'));
  ctx.manager = await createUser(await createRole(['leadConfig.manage'], 'Lead Config Manager'));

  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.salesToken = await loginAs(app, ctx.sales);
  ctx.managerToken = await loginAs(app, ctx.manager);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await verifyDeclaredPermissions(), []);
});

// --- seed ------------------------------------------------------------------------

test('before seeding, the lists are empty - nothing is built into the API', async () => {
  for (const url of ALL) assert.deepEqual(await list(url), []);
});

test('seed: loads the initial values in order, with one default status and priority', async () => {
  assert.equal(await seedLeadConfig(), true);

  assert.deepEqual(await names(SOURCES), seed.LEAD_SOURCE_SEED.map((s) => s.name));
  assert.deepEqual(await names(STATUSES), seed.LEAD_STATUS_SEED.map((s) => s.name));
  assert.deepEqual(await names(PRIORITIES), seed.LEAD_PRIORITY_SEED.map((s) => s.name));

  const statuses = await list(STATUSES);
  assert.deepEqual(statuses.filter((s) => s.isDefault).map((s) => s.name), ['New']);
  assert.deepEqual(statuses.map((s) => s.category), ['open', 'open', 'open', 'open', 'open', 'won', 'lost']);
  assert.ok(statuses.every((s) => s.isActive && /^#[0-9a-f]{6}$/.test(s.color)));
  assert.equal('_id' in statuses[0], false);

  const priorities = await list(PRIORITIES);
  assert.deepEqual(priorities.filter((p) => p.isDefault).map((p) => p.name), ['Medium']);
  assert.deepEqual(priorities.map((p) => p.level), [1, 2, 3, 4]);

  assert.equal((await getDefaultEntry('statuses')).name, 'New');
  assert.equal((await getDefaultEntry('priorities')).name, 'Medium');
});

test('seed: runs once - values an administrator changed or removed never come back', async () => {
  await LeadSource.deleteOne({ name: 'Walk-in' });
  await LeadSource.updateOne({ name: 'Website' }, { name: 'Web Enquiry' });
  await LeadStatus.updateOne({ name: 'Contacted' }, { isActive: false });
  const before = await LeadSource.countDocuments();

  assert.equal(await seedLeadConfig(), false);

  assert.equal(await LeadSource.countDocuments(), before);
  assert.equal(await LeadSource.exists({ name: 'Walk-in' }), null);
  assert.equal(await LeadSource.exists({ name: 'Website' }), null);
  assert.equal((await LeadStatus.findOne({ name: 'Contacted' })).isActive, false);

  await LeadSource.updateOne({ name: 'Web Enquiry' }, { name: 'Website' });
  await LeadStatus.updateOne({ name: 'Contacted' }, { isActive: true });
});

// --- access --------------------------------------------------------------------

test('all twelve endpoints need a token (401) and a permission (403)', async () => {
  const id = new mongoose.Types.ObjectId();
  const calls = (headers) =>
    ALL.flatMap((url) => [
      request(app).get(url).set(headers),
      request(app).post(url).set(headers).send({ name: 'Nope', level: 1 }),
      request(app).put(`${url}/${id}`).set(headers).send({ name: 'Nope' }),
      request(app).delete(`${url}/${id}`).set(headers),
    ]);

  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) assert.equal(res.status, 403);
});

test('people who work with leads can read the values but not change them', async () => {
  const h = as(ctx.salesToken);
  const id = (await list(SOURCES))[0].id;

  for (const url of ALL) assert.equal((await request(app).get(url).set(h)).status, 200);
  assert.equal((await request(app).post(SOURCES).set(h).send({ name: 'Nope' })).status, 403);
  assert.equal((await request(app).put(`${SOURCES}/${id}`).set(h).send({ name: 'Nope' })).status, 403);
  assert.equal((await request(app).delete(`${SOURCES}/${id}`).set(h)).status, 403);
  assert.equal(await LeadSource.exists({ name: 'Nope' }), null);
});

test('leadConfig.manage is enough to manage every list', async () => {
  const h = as(ctx.managerToken);
  const created = await request(app).post(SOURCES).set(h).send({ name: 'Managed Source' });
  assert.equal(created.status, 201);
  const { id } = created.body.data.item;
  assert.equal((await request(app).put(`${SOURCES}/${id}`).set(h).send({ description: 'x' })).status, 200);
  assert.equal((await request(app).delete(`${SOURCES}/${id}`).set(h)).status, 200);
});

// --- sources: CRUD ---------------------------------------------------------------

test('sources: create, update, list filters, delete', async () => {
  const created = await request(app).post(SOURCES).set(admin()).send({ name: '  Partner  ', description: 'Channel partner' });
  assert.equal(created.status, 201);
  const { item } = created.body.data;
  assert.equal(item.name, 'Partner');
  assert.equal(item.isActive, true);
  assert.equal(item.createdBy, ctx.admin.id);
  assert.equal('isDefault' in item, false, 'sources have no default');
  assert.equal((await names(SOURCES)).at(-1), 'Partner', 'new entries go to the end');

  const updated = await request(app)
    .put(`${SOURCES}/${item.id}`)
    .set(admin())
    .send({ name: 'Channel Partner', description: '', sortOrder: 1, isActive: false });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.item.name, 'Channel Partner');
  assert.equal('description' in updated.body.data.item, false);
  assert.equal((await names(SOURCES))[0], 'Channel Partner', 'sortOrder controls the position');

  // What a lead form asks for: active values only.
  assert.equal((await names(SOURCES, '?isActive=true')).includes('Channel Partner'), false);
  assert.deepEqual(await names(SOURCES, '?isActive=false'), ['Channel Partner']);
  assert.deepEqual(await names(SOURCES, '?search=channel'), ['Channel Partner']);
  assert.deepEqual(await names(SOURCES, '?search=.*'), []);

  const removed = await request(app).delete(`${SOURCES}/${item.id}`).set(admin());
  assert.equal(removed.status, 200);
  assert.equal((await names(SOURCES)).includes('Channel Partner'), false);
  assert.equal((await request(app).delete(`${SOURCES}/${item.id}`).set(admin())).status, 404);
});

test('validation and duplicates', async () => {
  const id = (await list(SOURCES))[0].id;
  const statusId = (await list(STATUSES))[1].id;

  const cases = {
    'missing name': [request(app).post(SOURCES).send({ description: 'x' }), 422],
    'short name': [request(app).post(SOURCES).send({ name: 'A' }), 422],
    'duplicate name, different case': [request(app).post(SOURCES).send({ name: 'REFERRAL' }), 409],
    'rename to an existing name': [request(app).put(`${SOURCES}/${id}`).send({ name: 'referral' }), 409],
    'empty update': [request(app).put(`${SOURCES}/${id}`).send({}), 422],
    'bad sortOrder': [request(app).put(`${SOURCES}/${id}`).send({ sortOrder: -1 }), 422],
    'isActive not boolean': [request(app).put(`${SOURCES}/${id}`).send({ isActive: 'maybe' }), 422],
    'unknown id': [request(app).put(`${SOURCES}/${new mongoose.Types.ObjectId()}`).send({ name: 'Ghost' }), 404],
    'malformed id': [request(app).put(`${SOURCES}/nope`).send({ name: 'Ghost' }), 422],
    'bad list filter': [request(app).get(`${SOURCES}?isActive=sometimes`), 422],
    'status: unknown category': [request(app).post(STATUSES).send({ name: 'Parked', category: 'paused' }), 422],
    'status: bad colour': [request(app).post(STATUSES).send({ name: 'Parked', color: 'red' }), 422],
    'status: duplicate': [request(app).post(STATUSES).send({ name: 'won' }), 409],
    'status: bad colour on update': [request(app).put(`${STATUSES}/${statusId}`).send({ color: '#12' }), 422],
    'priority: level required': [request(app).post(PRIORITIES).send({ name: 'Critical' }), 422],
    'priority: level out of range': [request(app).post(PRIORITIES).send({ name: 'Critical', level: 0 }), 422],
    'source: status-only field is not stored': [request(app).post(SOURCES).send({ name: 'Odd', category: 'won' }), 201],
  };
  for (const [label, [req, status]] of Object.entries(cases)) {
    const res = await req.set(admin());
    assert.equal(res.status, status, label);
    if (status >= 400) assert.equal(res.body.success, false, label);
  }

  const odd = await LeadSource.findOne({ name: 'Odd' }).lean();
  assert.equal('category' in odd, false);
  await LeadSource.deleteOne({ name: 'Odd' });
});

// --- statuses and priorities: the default -------------------------------------------

test('statuses: create with category and colour; colour can be cleared', async () => {
  const created = await request(app)
    .post(STATUSES)
    .set(admin())
    .send({ name: 'On Hold', category: 'open', color: '#ABCDEF', description: 'Waiting on the customer' });
  assert.equal(created.status, 201);
  const { item } = created.body.data;
  assert.equal(item.color, '#abcdef');
  assert.equal(item.category, 'open');
  assert.equal(item.isDefault, false, 'a list that already has a default keeps it');
  ctx.onHold = item;

  const updated = await request(app).put(`${STATUSES}/${item.id}`).set(admin()).send({ category: 'lost', color: '' });
  assert.equal(updated.body.data.item.category, 'lost');
  assert.equal('color' in updated.body.data.item, false);
});

test('default: there is always exactly one, and it can only be moved', async () => {
  const defaults = async () => (await list(STATUSES)).filter((s) => s.isDefault).map((s) => s.name);
  const byName = async (name) => (await list(STATUSES)).find((s) => s.name === name);
  const current = await byName('New');
  const put = (id, body) => request(app).put(`${STATUSES}/${id}`).set(admin()).send(body);

  // Cannot be switched off, deactivated or deleted.
  assert.equal((await put(current.id, { isDefault: false })).status, 409);
  assert.equal((await put(current.id, { isActive: false })).status, 409);
  assert.equal((await request(app).delete(`${STATUSES}/${current.id}`).set(admin())).status, 409);
  assert.deepEqual(await defaults(), ['New']);

  // Moving it takes it away from the previous one.
  const contacted = await byName('Contacted');
  const moved = await put(contacted.id, { isDefault: true });
  assert.equal(moved.status, 200);
  assert.deepEqual(await defaults(), ['Contacted']);
  assert.equal((await getDefaultEntry('statuses')).name, 'Contacted');

  // An inactive value cannot become the default.
  await put(ctx.onHold.id, { isActive: false });
  assert.equal((await put(ctx.onHold.id, { isDefault: true })).status, 409);
  assert.deepEqual(await defaults(), ['Contacted']);

  // Creating a new default moves it too; the old default can now be deleted.
  const fresh = await request(app).post(STATUSES).set(admin()).send({ name: 'Fresh', isDefault: true });
  assert.equal(fresh.status, 201);
  assert.deepEqual(await defaults(), ['Fresh']);
  assert.equal((await request(app).post(STATUSES).set(admin()).send({ name: 'Hidden', isDefault: true, isActive: false })).status, 409);

  assert.equal((await put(current.id, { isDefault: true })).status, 200);
  assert.equal((await request(app).delete(`${STATUSES}/${fresh.body.data.item.id}`).set(admin())).status, 200);
  assert.deepEqual(await defaults(), ['New']);
});

test('priorities: level and default work the same way', async () => {
  const created = await request(app).post(PRIORITIES).set(admin()).send({ name: 'Critical', level: 5, color: '#000000' });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.item.level, 5);
  const { id } = created.body.data.item;

  const medium = (await list(PRIORITIES)).find((p) => p.isDefault);
  assert.equal((await request(app).delete(`${PRIORITIES}/${medium.id}`).set(admin())).status, 409);

  await request(app).put(`${PRIORITIES}/${id}`).set(admin()).send({ isDefault: true, level: 9 });
  const after = await list(PRIORITIES);
  assert.deepEqual(after.filter((p) => p.isDefault).map((p) => `${p.name}:${p.level}`), ['Critical:9']);
});

test('the first value added to an empty list becomes its default', async () => {
  await LeadPriority.deleteMany({});
  const first = await request(app).post(PRIORITIES).set(admin()).send({ name: 'Only', level: 1 });
  const second = await request(app).post(PRIORITIES).set(admin()).send({ name: 'Second', level: 2 });

  assert.equal(first.body.data.item.isDefault, true);
  assert.equal(second.body.data.item.isDefault, false);
});

// --- delete protection ---------------------------------------------------------------

test('a value that leads use cannot be deleted - only deactivated', async () => {
  const lost = (await list(STATUSES)).find((s) => s.name === 'Lost');
  const won = (await list(STATUSES)).find((s) => s.name === 'Won');
  // Stand-in for the Leads module: "Lost" is used by three leads.
  registerLeadConfigUsage('statuses', async (id) => (String(id) === lost.id ? 3 : 0));

  const inUse = await request(app).delete(`${STATUSES}/${lost.id}`).set(admin());
  assert.equal(inUse.status, 409);
  assert.match(inUse.body.message, /Deactivate/);
  assert.ok(await LeadStatus.exists({ _id: lost.id }));

  assert.equal((await request(app).put(`${STATUSES}/${lost.id}`).set(admin()).send({ isActive: false })).status, 200);
  assert.equal((await names(STATUSES, '?isActive=true')).includes('Lost'), false);
  assert.equal((await request(app).delete(`${STATUSES}/${won.id}`).set(admin())).status, 200, 'unused values can go');

  registerLeadConfigUsage('statuses', async () => 0);
});
