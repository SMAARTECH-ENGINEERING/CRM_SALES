import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_contacts');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Company } = await import('../src/models/Company.js');
const { default: Contact } = await import('../src/models/Contact.js');
const { default: User } = await import('../src/models/User.js');
const { verifyDeclaredPermissions } = await import('../src/services/seed.service.js');
const { allKeys, createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } =
  await import('./helpers/fixtures.js');

const API = '/api/v1/contacts';
const COMPANIES = '/api/v1/companies';

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const create = (body, token = ctx.editorToken) => request(app).post(API).set(as(token)).send(body);
const person = (overrides = {}) => ({ firstName: 'Priya', lastName: 'Nair', companyId: ctx.acme.id, ...overrides });

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Company.init(), Contact.init()]);
  await seedRbac();

  ctx.admin = await createUser(await superAdminRole());
  ctx.plain = await createUser(await defaultRole());
  ctx.reader = await createUser(await createRole(['contacts.read'], 'Contact Reader'));
  // Works with contacts only - no companies.* permission at all.
  ctx.editor = await createUser(await createRole(await allKeys('contacts'), 'Contact Editor'), {
    firstName: 'Eddie',
    lastName: 'Editor',
  });

  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.readerToken = await loginAs(app, ctx.reader);
  ctx.editorToken = await loginAs(app, ctx.editor);

  const company = async (body) =>
    (await request(app).post(COMPANIES).set(as(ctx.adminToken)).send(body)).body.data.company;
  ctx.acme = await company({ name: 'Acme Industries' });
  ctx.bolt = await company({ name: 'Bolt Traders', status: 'inactive' });
  ctx.gone = await company({ name: 'Gone Corp' });
  await request(app).delete(`${COMPANIES}/${ctx.gone.id}`).set(as(ctx.adminToken));
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await verifyDeclaredPermissions(), []);
});

// --- access --------------------------------------------------------------------

test('contact endpoints need a token (401) and a permission (403)', async () => {
  const id = new mongoose.Types.ObjectId();
  const calls = (headers) => [
    request(app).get(API).set(headers),
    request(app).post(API).set(headers).send(person()),
    request(app).get(`${API}/${id}`).set(headers),
    request(app).put(`${API}/${id}`).set(headers).send({ firstName: 'X' }),
    request(app).delete(`${API}/${id}`).set(headers),
    request(app).get(`${COMPANIES}/options`).set(headers),
  ];

  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) assert.equal(res.status, 403);
  assert.equal(await Contact.countDocuments(), 0);
});

test('read-only permission can read but not write', async () => {
  const h = as(ctx.readerToken);
  assert.equal((await request(app).get(API).set(h)).status, 200);
  assert.equal((await request(app).post(API).set(h).send(person())).status, 403);
});

// --- company selector ------------------------------------------------------------

test('company options: searchable code + name list, usable without companies.read', async () => {
  const h = as(ctx.editorToken);
  assert.equal((await request(app).get(COMPANIES).set(h)).status, 403, 'no access to full company records');

  const all = await request(app).get(`${COMPANIES}/options`).set(h);
  assert.equal(all.status, 200);
  assert.deepEqual(all.body.data.companies, [
    { id: ctx.acme.id, companyCode: 'COMP-000001', name: 'Acme Industries', status: 'active' },
    { id: ctx.bolt.id, companyCode: 'COMP-000002', name: 'Bolt Traders', status: 'inactive' },
  ]);

  const byName = await request(app).get(`${COMPANIES}/options?search=bolt`).set(h);
  const byCode = await request(app).get(`${COMPANIES}/options?search=COMP-000001`).set(h);
  const limited = await request(app).get(`${COMPANIES}/options?limit=1`).set(h);
  assert.deepEqual(byName.body.data.companies.map((c) => c.name), ['Bolt Traders']);
  assert.deepEqual(byCode.body.data.companies.map((c) => c.name), ['Acme Industries']);
  assert.equal(limited.body.data.companies.length, 1);

  const byId = await request(app).get(`${COMPANIES}/options?id=${ctx.bolt.id}`).set(h);
  const deleted = await request(app).get(`${COMPANIES}/options?id=${ctx.gone.id}`).set(h);
  assert.deepEqual(byId.body.data.companies.map((c) => c.name), ['Bolt Traders']);
  assert.deepEqual(deleted.body.data.companies, [], 'deleted companies are never offered');
  assert.equal((await request(app).get(`${COMPANIES}/options?limit=1000`).set(h)).status, 422);
});

// --- create ----------------------------------------------------------------------

test('create: stores every field and returns the company it belongs to', async () => {
  const res = await create({
    firstName: '  Priya ',
    lastName: 'Nair',
    companyId: ctx.acme.id,
    designation: 'Purchase Manager',
    department: 'Procurement',
    email: 'Priya.Nair@Acme.example',
    phone: '+91 98765 43210',
    alternatePhone: '020 5550 1000',
    preferredContactMethod: 'whatsapp',
    notes: 'Prefers mornings',
  });

  assert.equal(res.status, 201);
  const { contact } = res.body.data;
  assert.equal(contact.firstName, 'Priya');
  assert.equal(contact.fullName, 'Priya Nair');
  assert.equal(contact.email, 'priya.nair@acme.example');
  assert.equal(contact.preferredContactMethod, 'whatsapp');
  assert.equal(contact.status, 'active');
  assert.equal(contact.companyId, ctx.acme.id);
  assert.deepEqual(contact.company, {
    companyCode: 'COMP-000001',
    name: 'Acme Industries',
    status: 'active',
    id: ctx.acme.id,
  });
  assert.equal(contact.createdBy, ctx.editor.id);
  assert.equal(contact.createdByUser.fullName, 'Eddie Editor');
  for (const field of ['_id', '__v', 'deletedAt']) assert.equal(field in contact, false);
  ctx.priya = contact;
});

test('create: invalid company ids are never accepted', async () => {
  const cases = {
    'missing companyId': [{ firstName: 'No', lastName: 'Company' }, 422],
    'empty companyId': [person({ companyId: '' }), 422],
    'null companyId': [person({ companyId: null }), 422],
    'malformed companyId': [person({ companyId: 'not-an-id' }), 422],
    'companyId as an object': [person({ companyId: { $ne: null } }), 422],
    'well-formed id of no company': [person({ companyId: new mongoose.Types.ObjectId().toString() }), 400],
    'deleted company': [person({ companyId: ctx.gone.id }), 400],
    "a user's id": [person({ companyId: ctx.admin.id }), 400],
  };
  const before = await Contact.countDocuments();

  for (const [label, [body, status]] of Object.entries(cases)) {
    const res = await create({ ...body, email: 'unique@example.com' });
    assert.equal(res.status, status, label);
    assert.ok(res.body.errors.some((e) => e.field === 'companyId'), label);
  }
  assert.equal(await Contact.countDocuments(), before, 'nothing was stored');
});

test('create: validation', async () => {
  const cases = {
    'missing first name': person({ firstName: undefined }),
    'missing last name': person({ lastName: '' }),
    'bad email': person({ email: 'nope' }),
    'bad phone': person({ phone: 'call me' }),
    'bad alternate phone': person({ alternatePhone: '12' }),
    'unknown contact method': person({ preferredContactMethod: 'fax' }),
    'bad status': person({ status: 'archived' }),
    'prefers email but has none': person({ preferredContactMethod: 'email', phone: '+91 98765 00000' }),
    'prefers phone but has none': person({ preferredContactMethod: 'phone', email: 'x@example.com' }),
    'chooses the creator': person({ createdBy: ctx.admin.id }),
  };
  for (const [label, body] of Object.entries(cases)) {
    const res = await create(body);
    assert.equal(res.status, 422, label);
    assert.ok(res.body.errors.length > 0, label);
  }
});

test('create: the same email twice in one company is a duplicate; in another company it is fine', async () => {
  const email = 'PRIYA.NAIR@acme.example';
  const same = await create(person({ firstName: 'Priya2', email }));
  const other = await create(person({ companyId: ctx.bolt.id, email }));
  const noEmail = await create(person({ firstName: 'Arun', lastName: 'Rao', designation: 'Engineer' }));
  const noEmailAgain = await create(person({ firstName: 'Meera', lastName: 'Shah', status: 'inactive' }));

  assert.equal(same.status, 409);
  assert.equal(same.body.errors[0].field, 'email');
  assert.equal(other.status, 201);
  assert.equal(noEmail.status, 201);
  assert.equal(noEmailAgain.status, 201, 'contacts without an email never clash');
  ctx.priyaAtBolt = other.body.data.contact;
  ctx.arun = noEmail.body.data.contact;
});

// --- list ------------------------------------------------------------------------

test('list: companyId, status and search filters', async () => {
  const h = as(ctx.readerToken);
  const names = async (query) =>
    (await request(app).get(`${API}?sortBy=firstName&sortOrder=asc&${query}`).set(h)).body.data.contacts.map(
      (c) => `${c.fullName} @ ${c.company.name}`
    );

  assert.deepEqual(await names(''), [
    'Arun Rao @ Acme Industries',
    'Meera Shah @ Acme Industries',
    'Priya Nair @ Acme Industries',
    'Priya Nair @ Bolt Traders',
  ]);
  assert.deepEqual(await names(`companyId=${ctx.bolt.id}`), ['Priya Nair @ Bolt Traders']);
  assert.equal((await names(`companyId=${ctx.acme.id}`)).length, 3);
  assert.deepEqual(await names(`companyId=${new mongoose.Types.ObjectId()}`), []);
  assert.deepEqual(await names('status=inactive'), ['Meera Shah @ Acme Industries']);
  assert.deepEqual(await names(`status=active&companyId=${ctx.acme.id}`), [
    'Arun Rao @ Acme Industries',
    'Priya Nair @ Acme Industries',
  ]);

  assert.equal((await names('search=priya')).length, 2);
  assert.deepEqual(await names('search=priya%20nair&companyId=' + ctx.acme.id), ['Priya Nair @ Acme Industries']);
  assert.deepEqual(await names('search=procurement'), ['Priya Nair @ Acme Industries']);
  assert.deepEqual(await names('search=engineer'), ['Arun Rao @ Acme Industries']);
  assert.deepEqual(await names('search=98765'), ['Priya Nair @ Acme Industries']);
  assert.deepEqual(await names('search=priya%20rao'), [], 'every word must match');
  assert.deepEqual(await names('search=.*'), [], 'not treated as a pattern');
});

test('list: pagination, sorting and rejected parameters', async () => {
  const h = as(ctx.readerToken);
  const page = await request(app).get(`${API}?page=2&limit=3&sortBy=firstName&sortOrder=asc`).set(h);
  assert.equal(page.status, 200);
  assert.deepEqual(page.body.data.pagination, { page: 2, limit: 3, total: 4, totalPages: 2 });
  assert.equal(page.body.data.contacts.length, 1);

  const desc = await request(app).get(`${API}?limit=1&sortBy=lastName&sortOrder=desc`).set(h);
  assert.equal(desc.body.data.contacts[0].lastName, 'Shah');

  for (const bad of ['companyId=nope', 'status=archived', 'sortBy=deletedAt', 'limit=500', 'sortOrder=up']) {
    assert.equal((await request(app).get(`${API}?${bad}`).set(h)).status, 422, bad);
  }
});

// --- get / update ----------------------------------------------------------------

test('get: one contact, 404 for unknown, 422 for a malformed id', async () => {
  const h = as(ctx.readerToken);
  const ok = await request(app).get(`${API}/${ctx.priya.id}`).set(h);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.contact.company.name, 'Acme Industries');
  assert.equal((await request(app).get(`${API}/${new mongoose.Types.ObjectId()}`).set(h)).status, 404);
  assert.equal((await request(app).get(`${API}/nope`).set(h)).status, 422);
});

test('update: changes what is sent and clears optional fields', async () => {
  const h = as(ctx.editorToken);
  const res = await request(app)
    .put(`${API}/${ctx.priya.id}`)
    .set(h)
    .send({ designation: 'Head of Procurement', alternatePhone: '', notes: null, status: 'inactive' });

  assert.equal(res.status, 200);
  const { contact } = res.body.data;
  assert.equal(contact.designation, 'Head of Procurement');
  assert.equal(contact.status, 'inactive');
  assert.equal('alternatePhone' in contact, false);
  assert.equal('notes' in contact, false);
  assert.equal(contact.phone, '+91 98765 43210', 'omitted fields are untouched');
  assert.equal(contact.companyId, ctx.acme.id);
});

test('update: the company can be changed to a real one, never to an invalid one or to nothing', async () => {
  const h = as(ctx.editorToken);
  const url = `${API}/${ctx.arun.id}`;

  const cases = {
    'clear with null': [{ companyId: null }, 422],
    'clear with empty string': [{ companyId: '' }, 422],
    malformed: [{ companyId: 'nope' }, 422],
    'no such company': [{ companyId: new mongoose.Types.ObjectId().toString() }, 400],
    'deleted company': [{ companyId: ctx.gone.id }, 400],
  };
  for (const [label, [body, status]] of Object.entries(cases)) {
    assert.equal((await request(app).put(url).set(h).send(body)).status, status, label);
  }
  assert.equal(String((await Contact.findById(ctx.arun.id)).companyId), ctx.acme.id, 'still at the original company');

  const moved = await request(app).put(url).set(h).send({ companyId: ctx.bolt.id });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.data.contact.company.name, 'Bolt Traders');
});

test('update: validation against the resulting record', async () => {
  const h = as(ctx.editorToken);
  const url = `${API}/${ctx.priya.id}`;

  const cases = {
    'empty body': [{}, 422],
    'removing the phone a whatsapp preference relies on': [{ phone: '' }, 422],
    'preferring email is fine - it has one': [{ preferredContactMethod: 'email' }, 200],
    'now the phone can go': [{ phone: '' }, 200],
    'but not the email': [{ email: '' }, 422],
    'moving to a company that already has this email': [{ companyId: ctx.bolt.id }, 409],
    'taking an email used in the same company': [{ email: 'x' }, 422],
  };
  for (const [label, [body, status]] of Object.entries(cases)) {
    assert.equal((await request(app).put(url).set(h).send(body)).status, status, label);
  }

  const clash = await request(app)
    .put(`${API}/${ctx.priyaAtBolt.id}`)
    .set(h)
    .send({ companyId: ctx.acme.id });
  const keep = await request(app).put(url).set(h).send({ email: 'priya.nair@acme.example' });
  assert.equal(clash.status, 409);
  assert.equal(keep.status, 200, 'keeping your own email is not a conflict');
  assert.equal((await request(app).put(`${API}/${new mongoose.Types.ObjectId()}`).set(h).send({ firstName: 'X' })).status, 404);
});

// --- relationship with companies ---------------------------------------------------

test('company page: the Contacts section is live and counts real contacts', async () => {
  const sections = async (id) =>
    (await request(app).get(`${COMPANIES}/${id}/sections`).set(as(ctx.adminToken))).body.data.sections[0];

  assert.deepEqual(await sections(ctx.acme.id), { key: 'contacts', label: 'Contacts', available: true, count: 2 });
  assert.deepEqual(await sections(ctx.bolt.id), { key: 'contacts', label: 'Contacts', available: true, count: 2 });
});

test('a company with contacts cannot be deleted until they are gone', async () => {
  const admin = as(ctx.adminToken);
  const blocked = await request(app).delete(`${COMPANIES}/${ctx.bolt.id}`).set(admin);
  assert.equal(blocked.status, 409);
  assert.deepEqual(blocked.body.errors, [{ field: 'contacts', message: 'Contacts: 2' }]);
  assert.equal((await request(app).get(`${COMPANIES}/${ctx.bolt.id}`).set(admin)).status, 200);

  for (const id of [ctx.arun.id, ctx.priyaAtBolt.id]) {
    assert.equal((await request(app).delete(`${API}/${id}`).set(as(ctx.editorToken))).status, 200);
  }
  assert.equal((await request(app).delete(`${COMPANIES}/${ctx.bolt.id}`).set(admin)).status, 200);
});

// --- delete ----------------------------------------------------------------------

test('delete: soft-deletes, hides the contact and frees its email', async () => {
  const h = as(ctx.editorToken);
  assert.equal((await request(app).delete(`${API}/${ctx.priya.id}`).set(h)).status, 200);

  assert.equal((await request(app).get(`${API}/${ctx.priya.id}`).set(h)).status, 404);
  assert.equal((await request(app).delete(`${API}/${ctx.priya.id}`).set(h)).status, 404);
  assert.equal((await request(app).get(`${API}?search=priya`).set(h)).body.data.pagination.total, 0);

  const stored = await Contact.findById(ctx.priya.id).setOptions({ withDeleted: true });
  assert.ok(stored.deletedAt instanceof Date, 'record is kept');

  const again = await create(person({ email: 'priya.nair@acme.example' }));
  assert.equal(again.status, 201);
});
