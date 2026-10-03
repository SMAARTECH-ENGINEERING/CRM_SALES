import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_activities');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Activity } = await import('../src/models/Activity.js');
const { default: ActivityType } = await import('../src/models/ActivityType.js');
const { default: User } = await import('../src/models/User.js');
const { seedActivityTypes, seedLeadConfig, seedPipelines, verifyDeclaredPermissions } = await import(
  '../src/services/seed.service.js'
);
const { ACTIVITY_TYPE_SEED } = await import('../src/seeds/activity.seed.js');
const { allKeys, createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } =
  await import('./helpers/fixtures.js');

const API = '/api/v1/activities';
const TYPES = '/api/v1/activity-types';

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const post = async (path, body) => (await request(app).post(`/api/v1/${path}`).set(admin()).send(body)).body.data;
const create = (body, token = ctx.adminToken) =>
  request(app).post(API).set(as(token)).send({ typeId: ctx.type.Call.id, subject: 'Activity', ...body });
const subjects = async (query) =>
  (await request(app).get(`${API}?limit=100&sortBy=subject&sortOrder=asc&${query}`).set(admin())).body.data.activities.map(
    (a) => a.subject
  );
const missing = () => new mongoose.Types.ObjectId().toString();

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), ActivityType.init()]);
  await seedRbac();
  await seedLeadConfig();
  await seedPipelines();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.plain = await createUser(await defaultRole());
  ctx.reader = await createUser(await createRole(['activities.read'], 'Activity Reader'));
  // Works with activities, but may not manage the list of types.
  const workerKeys = (await allKeys('activities')).filter((key) => key !== 'activities.manageTypes');
  ctx.worker = await createUser(await createRole(workerKeys, 'Activity Worker'), { firstName: 'Wes', lastName: 'Worker' });

  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.readerToken = await loginAs(app, ctx.reader);
  ctx.workerToken = await loginAs(app, ctx.worker);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await verifyDeclaredPermissions(), []);
});

// --- activity types: data, not code ---------------------------------------------------

test('types: none exist until seeded; the seed loads them once', async () => {
  assert.deepEqual((await request(app).get(TYPES).set(admin())).body.data.items, []);

  assert.equal(await seedActivityTypes(), true);
  const items = (await request(app).get(TYPES).set(admin())).body.data.items;
  assert.deepEqual(items.map((t) => t.name), ACTIVITY_TYPE_SEED.map((t) => t.name));
  assert.deepEqual(items.map((t) => t.name), ['Call', 'Meeting', 'Email', 'Task', 'Note', 'Demo', 'Site Visit']);
  assert.ok(items.every((t) => t.isActive && /^#[0-9a-f]{6}$/.test(t.color)));
  ctx.type = Object.fromEntries(items.map((t) => [t.name, t]));

  // An administrator's changes survive a re-run.
  await ActivityType.deleteOne({ name: 'Demo' });
  assert.equal(await seedActivityTypes(), false);
  assert.equal(await ActivityType.exists({ name: 'Demo' }), null);
});

test('types: managed with activities.manageTypes; readable by anyone who works with activities', async () => {
  const created = await request(app).post(TYPES).set(admin()).send({ name: 'Webinar', color: '#00897B' });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.item.color, '#00897b');
  const { id } = created.body.data.item;

  const renamed = await request(app).put(`${TYPES}/${id}`).set(admin()).send({ name: 'Online Webinar', isActive: false });
  assert.equal(renamed.body.data.item.name, 'Online Webinar');
  assert.equal((await request(app).get(`${TYPES}?isActive=true`).set(admin())).body.data.items.some((t) => t.id === id), false);

  assert.equal((await request(app).post(TYPES).set(admin()).send({ name: 'call' })).status, 409, 'unique regardless of case');
  assert.equal((await request(app).post(TYPES).set(admin()).send({ name: 'X' })).status, 422);

  const worker = as(ctx.workerToken);
  assert.equal((await request(app).get(TYPES).set(worker)).status, 200);
  assert.equal((await request(app).post(TYPES).set(worker).send({ name: 'Nope' })).status, 403);
  assert.equal((await request(app).put(`${TYPES}/${id}`).set(worker).send({ name: 'Nope' })).status, 403);
  assert.equal((await request(app).delete(`${TYPES}/${id}`).set(worker)).status, 403);
  assert.equal((await request(app).get(TYPES).set(as(ctx.plainToken))).status, 403);
  assert.equal((await request(app).get(TYPES)).status, 401);

  assert.equal((await request(app).delete(`${TYPES}/${id}`).set(admin())).status, 200);
  ctx.retired = (await request(app).post(TYPES).set(admin()).send({ name: 'Retired Type', isActive: false })).body.data.item;
});

// --- fixtures that need the API ---------------------------------------------------------

test('setup: companies, contacts, leads and an opportunity to relate activities to', async () => {
  ctx.acme = (await post('companies', { name: 'Acme Industries' })).company;
  ctx.bolt = (await post('companies', { name: 'Bolt Traders' })).company;
  ctx.priya = (await post('contacts', { firstName: 'Priya', lastName: 'Nair', companyId: ctx.acme.id })).contact;
  ctx.omar = (await post('contacts', { firstName: 'Omar', lastName: 'Khan', companyId: ctx.bolt.id })).contact;
  ctx.acmeLead = (await post('leads', { title: 'Acme ERP', companyId: ctx.acme.id })).lead;
  ctx.looseLead = (await post('leads', { title: 'No company yet' })).lead;
  // Converting a Bolt lead yields an opportunity that belongs to Bolt.
  const boltLead = (await post('leads', { title: 'Bolt deal', companyId: ctx.bolt.id })).lead;
  ctx.boltOpportunity = (await post(`leads/${boltLead.id}/convert`, {})).opportunity;
  assert.ok(ctx.boltOpportunity.id);
});

// --- access --------------------------------------------------------------------

test('activity endpoints need a token (401) and a permission (403)', async () => {
  const id = missing();
  const calls = (headers) => [
    request(app).get(API).set(headers),
    request(app).post(API).set(headers).send({ typeId: ctx.type.Call.id, subject: 'Nope', companyId: ctx.acme.id }),
    request(app).put(`${API}/${id}`).set(headers).send({ subject: 'Nope' }),
    request(app).delete(`${API}/${id}`).set(headers),
  ];
  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) assert.equal(res.status, 403);

  const reader = as(ctx.readerToken);
  assert.equal((await request(app).get(API).set(reader)).status, 200);
  assert.equal((await request(app).post(API).set(reader).send({ typeId: ctx.type.Call.id, subject: 'Nope', companyId: ctx.acme.id })).status, 403);
  assert.equal(await Activity.countDocuments(), 0);
});

// --- create ----------------------------------------------------------------------

test('create: stores the activity, defaults the assignee, and expands every reference', async () => {
  const res = await create(
    {
      typeId: ctx.type.Meeting.id,
      subject: '  Kick-off meeting ',
      description: 'Agenda attached',
      contactId: ctx.priya.id,
      leadId: ctx.acmeLead.id,
      dueDate: '2027-02-01T10:00:00.000Z',
      priority: 'high',
    },
    ctx.workerToken
  );

  assert.equal(res.status, 201);
  const { activity } = res.body.data;
  assert.equal(activity.subject, 'Kick-off meeting');
  assert.deepEqual(activity.type, { name: 'Meeting', color: ctx.type.Meeting.color, isActive: true, id: ctx.type.Meeting.id });
  assert.equal(activity.status, 'pending');
  assert.equal(activity.priority, 'high');
  assert.equal('completedAt' in activity, false);
  assert.equal(activity.contact.fullName, 'Priya Nair');
  assert.equal(activity.lead.leadNumber, ctx.acmeLead.leadNumber);
  assert.equal(activity.assignedToUser.fullName, 'Wes Worker', 'defaults to whoever recorded it');
  assert.equal(activity.createdBy, ctx.worker.id);
  for (const field of ['_id', '__v', 'deletedAt']) assert.equal(field in activity, false, field);
  ctx.kickoff = activity;
});

// --- relationships -----------------------------------------------------------------

test('relationships: the company is filled in from the contact, lead or opportunity', async () => {
  assert.equal(ctx.kickoff.companyId, ctx.acme.id, 'from the contact and lead');
  assert.equal(ctx.kickoff.company.name, 'Acme Industries');

  const cases = [
    ['a contact', { contactId: ctx.omar.id }, ctx.bolt.id],
    ['a lead', { leadId: ctx.acmeLead.id }, ctx.acme.id],
    ['an opportunity', { opportunityId: ctx.boltOpportunity.id }, ctx.bolt.id],
    ['a company alone', { companyId: ctx.acme.id }, ctx.acme.id],
  ];
  for (const [label, relation, companyId] of cases) {
    const res = await create({ subject: `Derived from ${label}`, ...relation });
    assert.equal(res.status, 201, label);
    assert.equal(res.body.data.activity.companyId, companyId, label);
  }

  // A lead with no company: the activity is about the lead only.
  const loose = await create({ subject: 'About a loose lead', leadId: ctx.looseLead.id });
  assert.equal(loose.status, 201);
  assert.equal('companyId' in loose.body.data.activity, false);
  ctx.loose = loose.body.data.activity;
});

test('relationships: every id must point at a real record', async () => {
  const before = await Activity.countDocuments();
  const cases = {
    'unknown company': [{ companyId: missing() }, 400, 'companyId'],
    'unknown contact': [{ contactId: missing() }, 400, 'contactId'],
    'unknown lead': [{ leadId: missing() }, 400, 'leadId'],
    'unknown opportunity': [{ opportunityId: missing() }, 400, 'opportunityId'],
    "a contact's id used as a lead": [{ leadId: ctx.priya.id }, 400, 'leadId'],
    'one valid, one unknown': [{ companyId: ctx.acme.id, contactId: missing() }, 400, 'contactId'],
    'malformed id': [{ companyId: 'nope' }, 422, 'companyId'],
    'id as an object': [{ leadId: { $ne: null } }, 422, 'leadId'],
  };
  for (const [label, [relation, status, field]] of Object.entries(cases)) {
    const res = await create(relation);
    assert.equal(res.status, status, label);
    assert.ok(res.body.errors.some((e) => e.field === field), `${label}: error names ${field}`);
  }
  assert.equal(await Activity.countDocuments(), before, 'nothing was stored');
});

test('relationships: a deleted record cannot be related to', async () => {
  const gone = (await post('contacts', { firstName: 'Gone', lastName: 'Person', companyId: ctx.acme.id })).contact;
  await request(app).delete(`/api/v1/contacts/${gone.id}`).set(admin());

  const res = await create({ contactId: gone.id });
  assert.equal(res.status, 400);
  assert.equal(res.body.errors[0].field, 'contactId');
});

test('relationships: at least one is required', async () => {
  const none = await create({});
  const blank = await create({ companyId: '', leadId: null });
  for (const res of [none, blank]) {
    assert.equal(res.status, 422);
    assert.match(res.body.errors[0].message, /at least one record/);
  }
});

test('relationships: records from different companies cannot be combined', async () => {
  const cases = {
    'company + contact of another company': { companyId: ctx.acme.id, contactId: ctx.omar.id },
    'contact + lead of different companies': { contactId: ctx.omar.id, leadId: ctx.acmeLead.id },
    'lead + opportunity of different companies': { leadId: ctx.acmeLead.id, opportunityId: ctx.boltOpportunity.id },
    'company + opportunity of another company': { companyId: ctx.acme.id, opportunityId: ctx.boltOpportunity.id },
  };
  for (const [label, relation] of Object.entries(cases)) {
    const res = await create(relation);
    assert.equal(res.status, 400, label);
    assert.match(res.body.message, /different companies/, label);
  }

  // The same company throughout is fine, as is a lead with no company alongside one.
  assert.equal((await create({ companyId: ctx.acme.id, contactId: ctx.priya.id, leadId: ctx.acmeLead.id })).status, 201);
  assert.equal((await create({ companyId: ctx.bolt.id, leadId: ctx.looseLead.id })).status, 201);
});

test('relationships: customers, projects, tickets and contracts are checked like other records', async () => {
  for (const field of ['customerId', 'projectId', 'ticketId', 'contractId']) {
    const res = await create({ companyId: ctx.acme.id, [field]: missing() });
    assert.equal(res.status, 400, field);
    assert.equal(res.body.errors[0].field, field);
    assert.match(res.body.message, /Related record not found/);
  }
});

// --- validation ------------------------------------------------------------------

test('create: validation, type and assignee checks', async () => {
  const base = { companyId: ctx.acme.id };
  const cases = {
    'missing type': [{ ...base, typeId: undefined }, 422],
    'missing subject': [{ ...base, subject: '' }, 422],
    'unknown status': [{ ...base, status: 'done' }, 422],
    'unknown priority': [{ ...base, priority: 'urgent' }, 422],
    'bad due date': [{ ...base, dueDate: 'tomorrow' }, 422],
    'completed in the future': [{ ...base, completedAt: '2999-01-01T00:00:00.000Z' }, 422],
    'client-chosen creator': [{ ...base, createdBy: ctx.admin.id }, 422],
    'unknown type': [{ ...base, typeId: missing() }, 400],
    'inactive type': [{ ...base, typeId: ctx.retired.id }, 400],
    'a type name instead of an id': [{ ...base, typeId: 'Call' }, 422],
    'unknown assignee': [{ ...base, assignedTo: missing() }, 400],
  };
  for (const [label, [body, status]] of Object.entries(cases)) {
    assert.equal((await create(body)).status, status, label);
  }
});

test('status and completedAt always agree', async () => {
  const logged = await create({ subject: 'Logged call', companyId: ctx.acme.id, status: 'completed' });
  assert.equal(logged.body.data.activity.status, 'completed');
  assert.ok(logged.body.data.activity.completedAt, 'completion time defaults to now');

  const dated = await create({ subject: 'Earlier call', companyId: ctx.acme.id, completedAt: '2026-01-10T09:00:00.000Z' });
  assert.equal(dated.body.data.activity.status, 'completed', 'a completion time means it is done');
  assert.equal(dated.body.data.activity.completedAt, '2026-01-10T09:00:00.000Z');

  const url = `${API}/${ctx.kickoff.id}`;
  const done = await request(app).put(url).set(admin()).send({ status: 'completed' });
  assert.equal(done.body.data.activity.status, 'completed');
  assert.ok(done.body.data.activity.completedAt);

  const reopened = await request(app).put(url).set(admin()).send({ status: 'pending' });
  assert.equal(reopened.body.data.activity.status, 'pending');
  assert.equal('completedAt' in reopened.body.data.activity, false);

  const cancelled = await request(app).put(url).set(admin()).send({ status: 'cancelled' });
  assert.equal('completedAt' in cancelled.body.data.activity, false);
  await request(app).put(url).set(admin()).send({ status: 'pending' });
});

// --- update ----------------------------------------------------------------------

test('update: changes what is sent; relations are re-checked as a whole', async () => {
  const url = `${API}/${ctx.kickoff.id}`;
  const h = as(ctx.workerToken);

  const res = await request(app)
    .put(url)
    .set(h)
    .send({ subject: 'Kick-off (moved)', description: '', typeId: ctx.type.Call.id, assignedTo: ctx.admin.id, priority: 'low' });
  assert.equal(res.status, 200);
  const { activity } = res.body.data;
  assert.equal(activity.subject, 'Kick-off (moved)');
  assert.equal('description' in activity, false);
  assert.equal(activity.type.name, 'Call');
  assert.equal(activity.assignedToUser.fullName, 'Ada Admin');
  assert.equal(activity.leadId, ctx.acmeLead.id, 'omitted fields are untouched');
  assert.equal(activity.dueDate, '2027-02-01T10:00:00.000Z');

  const cases = {
    'empty body': [{}, 422],
    'unknown lead': [{ leadId: missing() }, 400],
    'a contact from another company than the lead': [{ contactId: ctx.omar.id }, 400],
    'inactive type': [{ typeId: ctx.retired.id }, 400],
    'reserved relation': [{ projectId: missing() }, 400],
  };
  for (const [label, [body, status]] of Object.entries(cases)) {
    assert.equal((await request(app).put(url).set(h).send(body)).status, status, label);
  }

  // Moving it to Bolt's records moves the company with it.
  const moved = await request(app).put(url).set(h).send({ contactId: ctx.omar.id, leadId: null });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.data.activity.companyId, ctx.bolt.id);
  assert.equal('leadId' in moved.body.data.activity, false);

  // Removing the last relation is refused; removing one of several keeps the company.
  assert.equal((await request(app).put(`${API}/${ctx.loose.id}`).set(h).send({ leadId: null })).status, 422);
  const kept = await request(app).put(url).set(h).send({ contactId: null });
  assert.equal(kept.status, 200);
  assert.equal(kept.body.data.activity.companyId, ctx.bolt.id);

  await request(app).put(url).set(h).send({ contactId: ctx.priya.id, leadId: ctx.acmeLead.id, companyId: ctx.acme.id });
  assert.equal((await request(app).put(`${API}/${missing()}`).set(h).send({ subject: 'Ghost' })).status, 404);
  assert.equal((await request(app).put(`${API}/nope`).set(h).send({ subject: 'Ghost' })).status, 422);
});

// --- list: what each page shows -----------------------------------------------------

test('list: each record sees the activities related to it', async () => {
  // Company page: everything about Acme, including what was logged on its contact or lead.
  const acme = await subjects(`companyId=${ctx.acme.id}`);
  assert.ok(acme.includes('Kick-off (moved)'));
  assert.ok(acme.includes('Derived from a lead'));
  assert.ok(acme.includes('Derived from a company alone'));
  assert.equal(acme.includes('Derived from a contact'), false, 'that contact belongs to Bolt');

  assert.deepEqual(await subjects(`contactId=${ctx.omar.id}`), ['Derived from a contact']);
  assert.deepEqual(await subjects(`opportunityId=${ctx.boltOpportunity.id}`), ['Derived from an opportunity']);
  assert.deepEqual(await subjects(`leadId=${ctx.looseLead.id}`), ['About a loose lead', 'Activity']);
  assert.deepEqual(await subjects(`leadId=${missing()}`), []);

  const lead = await subjects(`leadId=${ctx.acmeLead.id}`);
  assert.ok(lead.includes('Kick-off (moved)') && lead.includes('Derived from a lead'));
});

test('list: filters, search, sorting and pagination', async () => {
  assert.deepEqual(await subjects(`typeId=${ctx.type.Meeting.id}`), []);
  assert.ok((await subjects(`typeId=${ctx.type.Call.id}`)).length > 5);
  assert.deepEqual(await subjects('status=completed'), ['Earlier call', 'Logged call']);
  assert.deepEqual(await subjects('priority=low'), ['Kick-off (moved)']);
  assert.deepEqual(await subjects(`assignedTo=${ctx.worker.id}`), []);
  assert.deepEqual(await subjects('search=kick-off'), ['Kick-off (moved)']);
  assert.deepEqual(await subjects('search=.*'), []);
  assert.deepEqual(await subjects('dueFrom=2027-01-01&dueTo=2027-12-31'), ['Kick-off (moved)']);
  assert.deepEqual(await subjects('overdue=true'), []);

  const late = await create({ subject: 'Overdue task', companyId: ctx.acme.id, dueDate: '2020-01-01T00:00:00.000Z' });
  assert.deepEqual(await subjects('overdue=true'), ['Overdue task']);
  await request(app).put(`${API}/${late.body.data.activity.id}`).set(admin()).send({ status: 'completed' });
  assert.deepEqual(await subjects('overdue=true'), [], 'a completed activity is never overdue');

  const total = await Activity.countDocuments();
  const page = await request(app).get(`${API}?page=2&limit=4`).set(admin());
  assert.deepEqual(page.body.data.pagination, { page: 2, limit: 4, total, totalPages: Math.ceil(total / 4) });
  assert.equal(page.body.data.activities.length, 4);

  const newest = await request(app).get(`${API}?limit=1`).set(admin());
  assert.equal(newest.body.data.activities[0].subject, 'Overdue task', 'newest first by default');

  for (const bad of ['sortBy=deletedAt', 'limit=500', 'status=done', 'companyId=nope', 'overdue=maybe', 'dueFrom=soon']) {
    assert.equal((await request(app).get(`${API}?${bad}`).set(admin())).status, 422, bad);
  }
});

// --- relationships with the rest of the system ---------------------------------------

test('the company page counts its activities, and a type in use cannot be deleted', async () => {
  const sections = (await request(app).get(`/api/v1/companies/${ctx.acme.id}/sections`).set(admin())).body.data.sections;
  const section = sections.find((s) => s.key === 'activities');
  assert.equal(section.available, true);
  assert.equal(section.count, await Activity.countDocuments({ companyId: ctx.acme.id }));
  assert.ok(section.count > 0);

  const inUse = await request(app).delete(`${TYPES}/${ctx.type.Call.id}`).set(admin());
  assert.equal(inUse.status, 409);
  assert.match(inUse.body.message, /Deactivate/);

  // Deactivating keeps it on existing activities but stops new ones using it.
  await request(app).put(`${TYPES}/${ctx.type.Call.id}`).set(admin()).send({ isActive: false });
  assert.equal((await create({ companyId: ctx.acme.id })).status, 400);
  const existing = (await request(app).get(`${API}?search=kick-off`).set(admin())).body.data.activities[0];
  assert.equal(existing.type.name, 'Call');
  assert.equal(existing.type.isActive, false);
  // An activity keeps its (now inactive) type when other fields are edited.
  assert.equal((await request(app).put(`${API}/${existing.id}`).set(admin()).send({ priority: 'medium' })).status, 200);
  await request(app).put(`${TYPES}/${ctx.type.Call.id}`).set(admin()).send({ isActive: true });

  assert.equal((await request(app).delete(`${TYPES}/${ctx.type.Note.id}`).set(admin())).status, 200, 'unused types can go');
});

// --- delete ----------------------------------------------------------------------

test('delete: soft-deletes and hides the activity', async () => {
  const h = as(ctx.workerToken);
  assert.equal((await request(app).delete(`${API}/${ctx.kickoff.id}`).set(as(ctx.readerToken))).status, 403);
  assert.equal((await request(app).delete(`${API}/${ctx.kickoff.id}`).set(h)).status, 200);

  assert.deepEqual(await subjects('search=kick-off'), []);
  assert.equal((await request(app).delete(`${API}/${ctx.kickoff.id}`).set(h)).status, 404);
  assert.equal((await request(app).put(`${API}/${ctx.kickoff.id}`).set(h).send({ subject: 'Back' })).status, 404);

  const stored = await Activity.findById(ctx.kickoff.id).setOptions({ withDeleted: true });
  assert.ok(stored.deletedAt instanceof Date, 'record is kept');
});
