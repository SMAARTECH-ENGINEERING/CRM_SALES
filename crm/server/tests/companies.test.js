import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_companies');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Company } = await import('../src/models/Company.js');
const { default: Industry } = await import('../src/models/Industry.js');
const { default: User } = await import('../src/models/User.js');
const { verifyDeclaredPermissions } = await import('../src/services/seed.service.js');
const { allKeys, createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } =
  await import('./helpers/fixtures.js');

const API = '/api/v1/companies';
const GST = '27ABCDE1234F1Z5';
const PAN = 'ABCDE1234F';

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const create = (body, token = ctx.adminToken) => request(app).post(API).set(as(token)).send(body);

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Company.init(), Industry.init()]);
  await seedRbac();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.plain = await createUser(await defaultRole());
  ctx.reader = await createUser(await createRole(['companies.read'], 'Company Reader'));
  // Everything on companies except adding to the lookup lists.
  const editorKeys = (await allKeys('companies')).filter((key) => key !== 'companies.manageLookups');
  ctx.editor = await createUser(await createRole(editorKeys, 'Company Editor'), {
    firstName: 'Eddie',
    lastName: 'Editor',
  });

  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.readerToken = await loginAs(app, ctx.reader);
  ctx.editorToken = await loginAs(app, ctx.editor);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the new routes exists in the database', async () => {
  assert.deepEqual(await verifyDeclaredPermissions(), []);
});

// --- access --------------------------------------------------------------------

test('companies and lookup endpoints need a token (401) and a permission (403)', async () => {
  const id = new mongoose.Types.ObjectId();
  const calls = (headers) => [
    request(app).get(API).set(headers),
    request(app).post(API).set(headers).send({ name: 'Nope Ltd' }),
    request(app).get(`${API}/${id}`).set(headers),
    request(app).put(`${API}/${id}`).set(headers).send({ name: 'Nope Ltd' }),
    request(app).delete(`${API}/${id}`).set(headers),
    request(app).get(`${API}/${id}/sections`).set(headers),
    request(app).get(`${API}/${id}/timeline`).set(headers),
    request(app).get('/api/v1/industries').set(headers),
    request(app).post('/api/v1/industries').set(headers).send({ name: 'Nope' }),
    request(app).get('/api/v1/users/options').set(headers),
  ];

  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) assert.equal(res.status, 403);
  assert.equal(await Company.countDocuments(), 0);
});

test('read-only permission can read but not write', async () => {
  const h = as(ctx.readerToken);
  assert.equal((await request(app).get(API).set(h)).status, 200);
  assert.equal((await request(app).get('/api/v1/industries').set(h)).status, 200);
  assert.equal((await request(app).post(API).set(h).send({ name: 'Nope Ltd' })).status, 403);
  assert.equal((await request(app).get('/api/v1/users/options').set(h)).status, 403);
});

// --- lookups ---------------------------------------------------------------------

test('lookups: created by permitted users, unique by name, listed for dropdowns', async () => {
  const admin = as(ctx.adminToken);

  for (const [path, key, name] of [
    ['industries', 'industry', 'Manufacturing'],
    ['company-types', 'companyType', 'Customer'],
    ['organizations', 'organization', 'Head Office'],
  ]) {
    const res = await request(app).post(`/api/v1/${path}`).set(admin).send({ name });
    assert.equal(res.status, 201, path);
    assert.equal(res.body.data.item.name, name);
    ctx[key] = res.body.data.item;

    const duplicate = await request(app).post(`/api/v1/${path}`).set(admin).send({ name: name.toUpperCase() });
    assert.equal(duplicate.status, 409, `${path} duplicate`);

    const list = await request(app).get(`/api/v1/${path}`).set(as(ctx.editorToken));
    assert.deepEqual(list.body.data.items.map((item) => item.name), [name]);
  }

  const denied = await request(app).post('/api/v1/industries').set(as(ctx.editorToken)).send({ name: 'Retail' });
  const invalid = await request(app).post('/api/v1/industries').set(admin).send({ name: 'X' });
  assert.equal(denied.status, 403, 'needs companies.manageLookups');
  assert.equal(invalid.status, 422);

  await Industry.create({ name: 'Retired Industry', isActive: false });
  const active = await request(app).get('/api/v1/industries').set(admin);
  assert.deepEqual(active.body.data.items.map((item) => item.name), ['Manufacturing']);
});

test('user options: names of active users only, for the assign-to picker', async () => {
  await User.updateOne({ _id: ctx.plain._id }, { status: 'inactive' });
  const res = await request(app).get('/api/v1/users/options?search=eddie').set(as(ctx.editorToken));
  const all = await request(app).get('/api/v1/users/options').set(as(ctx.editorToken));
  await User.updateOne({ _id: ctx.plain._id }, { status: 'active' });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.users, [
    { id: ctx.editor.id, fullName: 'Eddie Editor', email: ctx.editor.email },
  ]);
  assert.equal(all.body.data.users.some((u) => u.id === ctx.plain.id), false);
});

// --- create ----------------------------------------------------------------------

test('create: the server generates the code and stores every field', async () => {
  const res = await create(
    {
      name: '  Acme Industries  ',
      legalName: 'Acme Industries Private Limited',
      industryId: ctx.industry.id,
      companyTypeId: ctx.companyType.id,
      email: 'Info@Acme.example',
      phone: '+91 20 5550 1000',
      website: 'https://acme.example',
      address: '12 Industrial Estate',
      city: 'Pune',
      state: 'Maharashtra',
      country: 'India',
      postalCode: '411001',
      gstNumber: GST.toLowerCase(),
      panNumber: PAN.toLowerCase(),
      assignedTo: ctx.editor.id,
      organizationId: ctx.organization.id,
      notes: 'Key account',
    },
    ctx.editorToken
  );

  assert.equal(res.status, 201);
  const { company } = res.body.data;
  assert.equal(company.companyCode, 'COMP-000001');
  assert.equal(company.name, 'Acme Industries');
  assert.equal(company.email, 'info@acme.example');
  assert.equal(company.gstNumber, GST);
  assert.equal(company.panNumber, PAN);
  assert.equal(company.status, 'active');
  assert.equal(company.industryId, ctx.industry.id);
  assert.deepEqual(company.industry, { name: 'Manufacturing', id: ctx.industry.id });
  assert.equal(company.companyType.name, 'Customer');
  assert.equal(company.organization.name, 'Head Office');
  assert.equal(company.assignedTo, ctx.editor.id);
  assert.equal(company.assignedToUser.fullName, 'Eddie Editor');
  assert.equal(company.createdBy, ctx.editor.id);
  assert.equal(company.createdByUser.email, ctx.editor.email);
  for (const field of ['_id', '__v', 'deletedAt']) assert.equal(field in company, false);
  for (const field of ['passwordHash', 'tokenVersion']) assert.equal(field in company.assignedToUser, false);
  ctx.acme = company;
});

test('create: only the name is required, and codes increase by one', async () => {
  const res = await create({ name: 'Bolt Traders' });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.company.companyCode, 'COMP-000002');
  ctx.bolt = res.body.data.company;
});

test('create: a client cannot choose the code or the creator', async () => {
  const code = await create({ name: 'Custom Code Ltd', companyCode: 'COMP-999999' });
  const creator = await create({ name: 'Custom Creator Ltd', createdBy: ctx.editor.id });
  assert.equal(code.status, 422);
  assert.equal(creator.status, 422);
});

test('create: validation', async () => {
  const cases = {
    'missing name': {},
    'short name': { name: 'A' },
    'bad email': { name: 'Bad Co', email: 'nope' },
    'bad phone': { name: 'Bad Co', phone: 'call me' },
    'website without scheme': { name: 'Bad Co', website: 'acme.example' },
    'bad GST': { name: 'Bad Co', gstNumber: '123' },
    'bad PAN': { name: 'Bad Co', panNumber: 'ABC' },
    'GST not containing the PAN': { name: 'Bad Co', gstNumber: '29AAAAA0000A1Z5', panNumber: 'BBBBB1111B' },
    'bad status': { name: 'Bad Co', status: 'archived' },
    'malformed reference': { name: 'Bad Co', industryId: 'nope' },
  };
  for (const [label, body] of Object.entries(cases)) {
    const res = await create(body);
    assert.equal(res.status, 422, label);
    assert.ok(res.body.errors.length > 0, label);
  }

  const missing = new mongoose.Types.ObjectId().toString();
  const retired = await Industry.findOne({ name: 'Retired Industry' });
  const badRefs = {
    'unknown industry': { industryId: missing },
    'inactive industry': { industryId: retired.id },
    'unknown company type': { companyTypeId: missing },
    'unknown organization': { organizationId: missing },
    'unknown assignee': { assignedTo: missing },
  };
  for (const [label, extra] of Object.entries(badRefs)) {
    const res = await create({ name: 'Bad Ref Co', ...extra });
    assert.equal(res.status, 400, label);
    assert.equal(res.body.errors[0].field, Object.keys(extra)[0], label);
  }

  const duplicateGst = await create({ name: 'Acme Copy', gstNumber: GST });
  assert.equal(duplicateGst.status, 409);
  assert.match(duplicateGst.body.errors[0].message, /COMP-000001/);
});

test('create: rejected requests do not consume code numbers', async () => {
  const res = await create({ name: 'Cedar Systems', city: 'pune', state: 'Maharashtra', status: 'inactive' });
  assert.equal(res.body.data.company.companyCode, 'COMP-000003');
  ctx.cedar = res.body.data.company;
});

test('create: concurrent requests always get distinct, gap-free codes', async () => {
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, i) => create({ name: `Parallel ${String(i).padStart(2, '0')}`, city: 'Mumbai' }))
  );
  const codes = results.map((res) => res.body.data.company.companyCode).sort();

  assert.ok(results.every((res) => res.status === 201));
  assert.equal(new Set(codes).size, 12);
  assert.equal(codes[0], 'COMP-000004');
  assert.equal(codes[11], 'COMP-000015');
});

// --- list ------------------------------------------------------------------------

test('list: pagination and sorting', async () => {
  const h = as(ctx.readerToken);

  const page = await request(app).get(`${API}?page=2&limit=5&sortBy=companyCode&sortOrder=asc`).set(h);
  assert.equal(page.status, 200);
  assert.deepEqual(page.body.data.pagination, { page: 2, limit: 5, total: 15, totalPages: 3 });
  assert.deepEqual(
    page.body.data.companies.map((c) => c.companyCode),
    ['COMP-000006', 'COMP-000007', 'COMP-000008', 'COMP-000009', 'COMP-000010']
  );

  const byName = await request(app).get(`${API}?limit=3&sortBy=name&sortOrder=asc`).set(h);
  assert.deepEqual(byName.body.data.companies.map((c) => c.name), ['Acme Industries', 'Bolt Traders', 'Cedar Systems']);

  const newest = await request(app).get(`${API}?limit=1`).set(h);
  assert.equal(newest.body.data.companies[0].companyCode.startsWith('COMP-0000'), true);

  for (const bad of ['sortBy=deletedAt', 'limit=500', 'page=0', 'sortOrder=up', 'status=archived', 'industryId=nope']) {
    assert.equal((await request(app).get(`${API}?${bad}`).set(h)).status, 422, bad);
  }
});

test('list: search and filters', async () => {
  const h = as(ctx.readerToken);
  const names = async (query) =>
    (await request(app).get(`${API}?sortBy=companyCode&sortOrder=asc&limit=100&${query}`).set(h)).body.data.companies.map(
      (c) => c.name
    );

  assert.deepEqual(await names('search=acme'), ['Acme Industries']);
  assert.deepEqual(await names('search=COMP-000002'), ['Bolt Traders']);
  assert.deepEqual(await names(`search=${GST.toLowerCase()}`), ['Acme Industries']);
  assert.deepEqual(await names('search=acme%20pune'), ['Acme Industries'], 'every word must match');
  assert.deepEqual(await names('search=acme%20mumbai'), []);
  assert.deepEqual(await names('search=.*'), [], 'not treated as a pattern');

  assert.deepEqual(await names('status=inactive'), ['Cedar Systems']);
  assert.deepEqual(await names('city=PUNE'), ['Acme Industries', 'Cedar Systems'], 'case-insensitive');
  assert.deepEqual(await names('city=Pune&status=active'), ['Acme Industries']);
  assert.equal((await names('city=Mumbai')).length, 12);
  assert.deepEqual(await names(`industryId=${ctx.industry.id}`), ['Acme Industries']);
  assert.deepEqual(await names(`companyTypeId=${ctx.companyType.id}`), ['Acme Industries']);
  assert.deepEqual(await names(`organizationId=${ctx.organization.id}`), ['Acme Industries']);
  assert.deepEqual(await names(`assignedTo=${ctx.editor.id}`), ['Acme Industries']);
  assert.deepEqual(await names(`assignedTo=${ctx.admin.id}`), []);
});

// --- get / update ----------------------------------------------------------------

test('get: one company, 404 for unknown, 422 for a malformed id', async () => {
  const h = as(ctx.readerToken);
  const ok = await request(app).get(`${API}/${ctx.acme.id}`).set(h);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.company.companyCode, 'COMP-000001');
  assert.equal(ok.body.data.company.industry.name, 'Manufacturing');
  assert.equal((await request(app).get(`${API}/${new mongoose.Types.ObjectId()}`).set(h)).status, 404);
  assert.equal((await request(app).get(`${API}/nope`).set(h)).status, 422);
});

test('update: changes what is sent, clears with empty values, keeps the code', async () => {
  const h = as(ctx.editorToken);
  const url = `${API}/${ctx.acme.id}`;

  const res = await request(app)
    .put(url)
    .set(h)
    .send({ name: 'Acme Industries Ltd', phone: '', industryId: null, status: 'inactive', city: 'Nashik' });
  assert.equal(res.status, 200);
  const { company } = res.body.data;
  assert.equal(company.name, 'Acme Industries Ltd');
  assert.equal(company.status, 'inactive');
  assert.equal(company.city, 'Nashik');
  assert.equal('phone' in company, false);
  assert.equal('industryId' in company, false);
  assert.equal(company.companyCode, 'COMP-000001');
  assert.equal(company.legalName, 'Acme Industries Private Limited', 'omitted fields are untouched');
  assert.equal(company.companyType.name, 'Customer');

  const cases = {
    'change the code': [{ companyCode: 'COMP-000099' }, 422],
    'empty body': [{}, 422],
    'PAN that no longer matches the stored GST': [{ panNumber: 'ZZZZZ9999Z' }, 422],
    'unknown industry': [{ industryId: new mongoose.Types.ObjectId().toString() }, 400],
  };
  for (const [label, [body, status]] of Object.entries(cases)) {
    assert.equal((await request(app).put(url).set(h).send(body)).status, status, label);
  }

  const takenGst = await request(app).put(`${API}/${ctx.bolt.id}`).set(h).send({ gstNumber: GST });
  const sameGst = await request(app).put(url).set(h).send({ gstNumber: GST });
  assert.equal(takenGst.status, 409);
  assert.equal(sameGst.status, 200, 'keeping your own GST number is not a conflict');
  assert.equal((await request(app).put(`${API}/${new mongoose.Types.ObjectId()}`).set(h).send({ name: 'Ghost Co' })).status, 404);
});

// --- detail sections ---------------------------------------------------------------

test('sections: real counts where data exists, no number where the module is not built', async () => {
  const res = await request(app).get(`${API}/${ctx.acme.id}/sections`).set(as(ctx.readerToken));
  assert.equal(res.status, 200);
  const { sections } = res.body.data;

  assert.deepEqual(
    sections.map((s) => s.key),
    ['contacts', 'leads', 'opportunities', 'quotations', 'orders', 'projects', 'tickets', 'payments', 'contracts', 'documents', 'activities', 'timeline']
  );
  // Contacts became a real module; this company has none.
  assert.deepEqual(sections[0], { key: 'contacts', label: 'Contacts', available: true, count: 0 });

  // Leads, opportunities and quotations are real now too; this company has none.
  for (const key of ['leads', 'opportunities', 'quotations', 'orders', 'projects', 'tickets', 'contracts', 'payments', 'documents']) {
    const section = sections.find((s) => s.key === key);
    assert.deepEqual({ available: section.available, count: section.count }, { available: true, count: 0 }, key);
  }

  assert.deepEqual(
    sections.find((s) => s.key === 'activities'),
    { key: 'activities', label: 'Activities', available: true, count: 0 }
  );

  // Every section's module exists now: none is reported as unavailable.
  assert.ok(sections.every((s) => s.available && typeof s.count === 'number' && typeof s.label === 'string'));
  // Created once, then two updates that changed something (the no-op GST save recorded nothing).
  assert.deepEqual(sections.at(-1), { key: 'timeline', label: 'Timeline', available: true, count: 2 });

  const fresh = await request(app).get(`${API}/${ctx.bolt.id}/sections`).set(as(ctx.readerToken));
  assert.equal(fresh.body.data.sections.at(-1).count, 1);
});

test('timeline: newest first, with who did it and readable before/after values', async () => {
  const res = await request(app).get(`${API}/${ctx.acme.id}/timeline`).set(as(ctx.readerToken));
  assert.equal(res.status, 200);
  const { events, pagination } = res.body.data;

  assert.deepEqual(pagination, { page: 1, limit: 20, total: 2, totalPages: 1 });
  assert.deepEqual(events.map((e) => e.action), ['updated', 'created']);
  assert.equal(events[0].actor.fullName, 'Eddie Editor');
  assert.equal('passwordHash' in events[0].actor, false);

  const changes = Object.fromEntries(events[0].changes.map((c) => [c.label, [c.from, c.to]]));
  assert.deepEqual(changes, {
    Name: ['Acme Industries', 'Acme Industries Ltd'],
    Industry: ['Manufacturing', undefined],
    Phone: ['+91 20 5550 1000', undefined],
    City: ['Pune', 'Nashik'],
    Status: ['active', 'inactive'],
  });
  assert.deepEqual(events[1].changes, []);

  const paged = await request(app).get(`${API}/${ctx.acme.id}/timeline?page=2&limit=1`).set(as(ctx.readerToken));
  assert.deepEqual(paged.body.data.events.map((e) => e.action), ['created']);
});

// --- delete ----------------------------------------------------------------------

test('delete: soft-deletes, hides the company, frees its GST number, never reuses its code', async () => {
  const h = as(ctx.editorToken);

  const res = await request(app).delete(`${API}/${ctx.acme.id}`).set(h);
  assert.equal(res.status, 200);

  assert.equal((await request(app).get(`${API}/${ctx.acme.id}`).set(h)).status, 404);
  assert.equal((await request(app).delete(`${API}/${ctx.acme.id}`).set(h)).status, 404);
  assert.equal((await request(app).get(`${API}/${ctx.acme.id}/timeline`).set(h)).status, 404);
  assert.equal((await request(app).get(`${API}?search=acme`).set(h)).body.data.pagination.total, 0);

  const stored = await Company.findById(ctx.acme.id).setOptions({ withDeleted: true });
  assert.ok(stored.deletedAt instanceof Date, 'record is kept');

  const next = await create({ name: 'Acme Reborn', gstNumber: GST });
  assert.equal(next.status, 201);
  assert.equal(next.body.data.company.companyCode, 'COMP-000016');
});
