import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_followups');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: FollowUp } = await import('../src/models/FollowUp.js');
const { default: User } = await import('../src/models/User.js');
const { seedLeadConfig, seedPipelines, verifyDeclaredPermissions } = await import('../src/services/seed.service.js');
const { allKeys, createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } =
  await import('./helpers/fixtures.js');

const API = '/api/v1/followups';
const DUE = '2027-02-01T10:00:00.000Z';

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const post = async (path, body) => (await request(app).post(`/api/v1/${path}`).set(admin()).send(body)).body.data;
const create = (body, token = ctx.adminToken) =>
  request(app)
    .post(API)
    .set(as(token))
    .send({ title: 'Follow up', relatedType: 'lead', relatedId: ctx.lead.id, dueDate: DUE, ...body });
const titles = async (query) =>
  (await request(app).get(`${API}?limit=100&${query}`).set(admin())).body.data.followUps.map((f) => f.title);
const missing = () => new mongoose.Types.ObjectId().toString();

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await User.init();
  await seedRbac();
  await seedLeadConfig();
  await seedPipelines();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.plain = await createUser(await defaultRole());
  ctx.reader = await createUser(await createRole(['followups.read'], 'Follow-up Reader'));
  ctx.worker = await createUser(await createRole(await allKeys('followups'), 'Follow-up Worker'), {
    firstName: 'Wes',
    lastName: 'Worker',
  });

  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.readerToken = await loginAs(app, ctx.reader);
  ctx.workerToken = await loginAs(app, ctx.worker);

  ctx.company = (await post('companies', { name: 'Acme Industries' })).company;
  ctx.contact = (await post('contacts', { firstName: 'Priya', lastName: 'Nair', companyId: ctx.company.id })).contact;
  ctx.lead = (await post('leads', { title: 'Acme ERP', companyId: ctx.company.id })).lead;
  const other = (await post('leads', { title: 'To convert', companyId: ctx.company.id })).lead;
  ctx.opportunity = (await post(`leads/${other.id}/convert`, {})).opportunity;
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await verifyDeclaredPermissions(), []);
});

// --- access --------------------------------------------------------------------

test('follow-up endpoints need a token (401) and a permission (403)', async () => {
  const id = missing();
  const body = { title: 'Nope', relatedType: 'lead', relatedId: ctx.lead.id, dueDate: DUE };
  const calls = (headers) => [
    request(app).get(API).set(headers),
    request(app).post(API).set(headers).send(body),
    request(app).put(`${API}/${id}`).set(headers).send({ title: 'Nope' }),
    request(app).patch(`${API}/${id}/complete`).set(headers),
    request(app).patch(`${API}/${id}/reschedule`).set(headers).send({ dueDate: DUE }),
  ];
  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) assert.equal(res.status, 403);

  const reader = as(ctx.readerToken);
  assert.equal((await request(app).get(API).set(reader)).status, 200);
  assert.equal((await request(app).post(API).set(reader).send(body)).status, 403);
  assert.equal(await FollowUp.countDocuments(), 0);
});

// --- create and relationships --------------------------------------------------------

test('create: stores the follow-up, defaults the assignee, and says what it is about', async () => {
  const res = await create(
    {
      title: '  Send proposal ',
      description: 'Include pricing',
      priority: 'high',
      reminderDate: '2027-01-31T09:00:00.000Z',
    },
    ctx.workerToken
  );

  assert.equal(res.status, 201);
  const { followUp } = res.body.data;
  assert.equal(followUp.title, 'Send proposal');
  assert.equal(followUp.status, 'pending');
  assert.equal(followUp.priority, 'high');
  assert.equal(followUp.dueDate, DUE);
  assert.equal(followUp.reminderDate, '2027-01-31T09:00:00.000Z');
  assert.equal(followUp.relatedType, 'lead');
  assert.equal(followUp.relatedId, ctx.lead.id);
  assert.deepEqual(followUp.related, { type: 'lead', id: ctx.lead.id, label: `${ctx.lead.leadNumber} - Acme ERP` });
  assert.equal(followUp.assignedToUser.fullName, 'Wes Worker', 'defaults to whoever created it');
  assert.equal(followUp.createdBy, ctx.worker.id);
  assert.equal('completedAt' in followUp, false);
  for (const field of ['_id', '__v']) assert.equal(field in followUp, false);
  ctx.proposal = followUp;
});

test('relationships: a follow-up can be about a company, contact, lead or opportunity', async () => {
  const cases = [
    ['company', ctx.company.id, 'Acme Industries'],
    ['contact', ctx.contact.id, 'Priya Nair'],
    ['opportunity', ctx.opportunity.id, `${ctx.opportunity.opportunityNumber} - To convert`],
  ];
  for (const [relatedType, relatedId, label] of cases) {
    const res = await create({ title: `About a ${relatedType}`, relatedType, relatedId, assignedTo: ctx.admin.id });
    assert.equal(res.status, 201, relatedType);
    assert.deepEqual(res.body.data.followUp.related, { type: relatedType, id: relatedId, label }, relatedType);
  }
});

test('relationships: the related record must exist and be of the stated type', async () => {
  const before = await FollowUp.countDocuments();
  const cases = {
    'unknown id': [{ relatedId: missing() }, 400, 'relatedId'],
    "a company's id stated as a lead": [{ relatedType: 'lead', relatedId: ctx.company.id }, 400, 'relatedId'],
    "a lead's id stated as a contact": [{ relatedType: 'contact', relatedId: ctx.lead.id }, 400, 'relatedId'],
    'unknown type': [{ relatedType: 'invoice' }, 422, 'relatedType'],
    'type that does not exist': [{ relatedType: 'invoice', relatedId: missing() }, 422, 'relatedType'],
    'missing type': [{ relatedType: undefined }, 422, 'relatedType'],
    'missing id': [{ relatedId: undefined }, 422, 'relatedId'],
    'malformed id': [{ relatedId: 'nope' }, 422, 'relatedId'],
  };
  for (const [label, [body, status, field]] of Object.entries(cases)) {
    const res = await create(body);
    assert.equal(res.status, status, label);
    assert.ok(res.body.errors.some((e) => e.field === field), `${label}: error names ${field}`);
  }
  assert.equal(await FollowUp.countDocuments(), before, 'nothing was stored');

  // A deleted record cannot be followed up.
  const gone = (await post('contacts', { firstName: 'Gone', lastName: 'Person', companyId: ctx.company.id })).contact;
  await request(app).delete(`/api/v1/contacts/${gone.id}`).set(admin());
  assert.equal((await create({ relatedType: 'contact', relatedId: gone.id })).status, 400);
});

test('create: validation', async () => {
  const cases = {
    'missing title': [{ title: '' }, 422],
    'missing due date': [{ dueDate: undefined }, 422],
    'bad due date': [{ dueDate: 'next week' }, 422],
    'unknown priority': [{ priority: 'urgent' }, 422],
    'reminder after the due date': [{ reminderDate: '2027-02-02T10:00:00.000Z' }, 422],
    'starting as completed': [{ status: 'completed' }, 422],
    'client-chosen completion': [{ completedAt: DUE }, 422],
    'client-chosen creator': [{ createdBy: ctx.admin.id }, 422],
    'unknown assignee': [{ assignedTo: missing() }, 400],
  };
  for (const [label, [body, status]] of Object.entries(cases)) {
    assert.equal((await create(body)).status, status, label);
  }
});

// --- list ------------------------------------------------------------------------

test('list: by related record, assignee, status, priority and due date; soonest due first', async () => {
  await create({ title: 'Later task', dueDate: '2027-03-01T10:00:00.000Z' });
  await create({ title: 'Sooner task', dueDate: '2027-01-10T10:00:00.000Z', priority: 'low' });

  // What a lead's page shows.
  assert.deepEqual(await titles(`relatedType=lead&relatedId=${ctx.lead.id}`), ['Sooner task', 'Send proposal', 'Later task']);
  assert.deepEqual(await titles(`relatedType=company&relatedId=${ctx.company.id}`), ['About a company']);
  assert.deepEqual(await titles(`relatedType=lead&relatedId=${ctx.company.id}`), [], 'type and id go together');

  assert.deepEqual(await titles(`assignedTo=${ctx.worker.id}`), ['Send proposal']);
  assert.deepEqual(await titles('priority=high'), ['Send proposal']);
  assert.deepEqual(await titles('priority=low'), ['Sooner task']);
  assert.deepEqual(await titles('search=proposal'), ['Send proposal']);
  assert.deepEqual(await titles('dueFrom=2027-02-15'), ['Later task']);
  assert.deepEqual(await titles('dueTo=2027-01-15'), ['Sooner task']);
  assert.deepEqual(await titles('status=completed'), []);
  assert.deepEqual(await titles('overdue=true'), []);
  assert.equal((await titles('sortBy=dueDate&sortOrder=desc'))[0], 'Later task');

  const page = await request(app).get(`${API}?page=2&limit=2`).set(admin());
  assert.deepEqual(page.body.data.pagination, { page: 2, limit: 2, total: 6, totalPages: 3 });
  assert.ok(page.body.data.followUps.every((f) => f.related && f.related.label));

  for (const bad of ['relatedType=invoice', 'relatedId=nope', 'status=done', 'sortBy=completedBy', 'limit=500', 'overdue=maybe']) {
    assert.equal((await request(app).get(`${API}?${bad}`).set(admin())).status, 422, bad);
  }
});

// --- update ----------------------------------------------------------------------

test('update: changes what is sent; the related record can be moved to another real record', async () => {
  const url = `${API}/${ctx.proposal.id}`;
  const h = as(ctx.workerToken);

  const res = await request(app)
    .put(url)
    .set(h)
    .send({ title: 'Send revised proposal', description: '', priority: 'medium', assignedTo: ctx.admin.id, reminderDate: null });
  assert.equal(res.status, 200);
  const { followUp } = res.body.data;
  assert.equal(followUp.title, 'Send revised proposal');
  assert.equal(followUp.assignedToUser.fullName, 'Ada Admin');
  for (const field of ['description', 'reminderDate']) assert.equal(field in followUp, false, field);
  assert.equal(followUp.dueDate, DUE, 'omitted fields are untouched');
  assert.equal(followUp.related.type, 'lead');

  const moved = await request(app).put(url).set(h).send({ relatedType: 'contact', relatedId: ctx.contact.id });
  assert.equal(moved.status, 200);
  assert.deepEqual(moved.body.data.followUp.related, { type: 'contact', id: ctx.contact.id, label: 'Priya Nair' });

  const cases = {
    'empty body': [{}, 422],
    'type without id': [{ relatedType: 'company' }, 422],
    'id without type': [{ relatedId: ctx.company.id }, 422],
    'unknown related record': [{ relatedType: 'lead', relatedId: missing() }, 400],
    'reminder after the current due date': [{ reminderDate: '2027-02-05T00:00:00.000Z' }, 422],
    'unknown status': [{ status: 'done' }, 422],
    'client-chosen completion time': [{ completedAt: DUE }, 422],
    'unknown assignee': [{ assignedTo: missing() }, 400],
  };
  for (const [label, [body, status]] of Object.entries(cases)) {
    assert.equal((await request(app).put(url).set(h).send(body)).status, status, label);
  }
  assert.equal((await request(app).put(`${API}/${missing()}`).set(h).send({ title: 'Ghost' })).status, 404);

  await request(app).put(url).set(h).send({ relatedType: 'lead', relatedId: ctx.lead.id });
});

// --- complete --------------------------------------------------------------------

test('complete: records who and when; repeating it changes nothing', async () => {
  const url = `${API}/${ctx.proposal.id}/complete`;

  const res = await request(app).patch(url).set(as(ctx.workerToken));
  assert.equal(res.status, 200);
  const { followUp } = res.body.data;
  assert.equal(followUp.status, 'completed');
  assert.ok(followUp.completedAt);
  assert.equal(followUp.completedByUser.fullName, 'Wes Worker');

  const again = await request(app).patch(url).set(admin());
  assert.equal(again.status, 200);
  assert.equal(again.body.data.followUp.completedAt, followUp.completedAt, 'first completion time kept');
  assert.equal(again.body.data.followUp.completedByUser.fullName, 'Wes Worker', 'first completer kept');

  assert.deepEqual(await titles('status=completed'), ['Send revised proposal']);
  assert.equal((await request(app).patch(`${API}/${missing()}/complete`).set(admin())).status, 404);
  assert.equal((await request(app).patch(`${API}/nope/complete`).set(admin())).status, 422);
  assert.equal((await request(app).patch(url).set(as(ctx.readerToken))).status, 403);
});

// --- reschedule ------------------------------------------------------------------

test('reschedule: moves a pending follow-up; a completed one must be reopened first', async () => {
  const completedUrl = `${API}/${ctx.proposal.id}`;
  const refused = await request(app).patch(`${completedUrl}/reschedule`).set(admin()).send({ dueDate: '2027-04-01T10:00:00.000Z' });
  assert.equal(refused.status, 409);
  assert.match(refused.body.message, /Reopen/);

  // Reopening (via PUT) clears the completion details.
  const reopened = await request(app).put(completedUrl).set(admin()).send({ status: 'pending' });
  assert.equal(reopened.body.data.followUp.status, 'pending');
  for (const field of ['completedAt', 'completedBy']) assert.equal(field in reopened.body.data.followUp, false, field);

  const moved = await request(app)
    .patch(`${completedUrl}/reschedule`)
    .set(as(ctx.workerToken))
    .send({ dueDate: '2027-04-01T10:00:00.000Z', reminderDate: '2027-03-31T09:00:00.000Z' });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.data.followUp.dueDate, '2027-04-01T10:00:00.000Z');
  assert.equal(moved.body.data.followUp.reminderDate, '2027-03-31T09:00:00.000Z');
  assert.equal(moved.body.data.followUp.status, 'pending');

  // Bringing it forward past the reminder drops the now-pointless reminder...
  const earlier = await request(app).patch(`${completedUrl}/reschedule`).set(admin()).send({ dueDate: '2027-03-15T10:00:00.000Z' });
  assert.equal(earlier.status, 200);
  assert.equal('reminderDate' in earlier.body.data.followUp, false);

  // ...while pushing it back keeps a reminder that is still before the deadline.
  await request(app).put(completedUrl).set(admin()).send({ reminderDate: '2027-03-10T09:00:00.000Z' });
  const later = await request(app).patch(`${completedUrl}/reschedule`).set(admin()).send({ dueDate: '2027-05-01T10:00:00.000Z' });
  assert.equal(later.body.data.followUp.reminderDate, '2027-03-10T09:00:00.000Z');

  const cases = {
    'missing due date': [{}, 422],
    'bad due date': [{ dueDate: 'later' }, 422],
    'reminder after the new due date': [{ dueDate: '2027-06-01T00:00:00.000Z', reminderDate: '2027-06-02T00:00:00.000Z' }, 422],
  };
  for (const [label, [body, status]] of Object.entries(cases)) {
    assert.equal((await request(app).patch(`${completedUrl}/reschedule`).set(admin()).send(body)).status, status, label);
  }
  assert.equal((await request(app).patch(`${API}/${missing()}/reschedule`).set(admin()).send({ dueDate: DUE })).status, 404);

  // A cancelled follow-up cannot be rescheduled either.
  await request(app).put(completedUrl).set(admin()).send({ status: 'cancelled' });
  assert.equal((await request(app).patch(`${completedUrl}/reschedule`).set(admin()).send({ dueDate: DUE })).status, 409);
});

test('overdue: pending and past due - never completed or cancelled ones', async () => {
  const late = (await create({ title: 'Late one', dueDate: '2020-01-01T00:00:00.000Z' })).body.data.followUp;
  const lateDone = (await create({ title: 'Late but done', dueDate: '2020-01-01T00:00:00.000Z' })).body.data.followUp;
  await request(app).patch(`${API}/${lateDone.id}/complete`).set(admin());

  assert.deepEqual(await titles('overdue=true'), ['Late one']);
  await request(app).put(`${API}/${late.id}`).set(admin()).send({ status: 'cancelled' });
  assert.deepEqual(await titles('overdue=true'), []);
});

test('a follow-up whose record was later deleted still lists, with nothing to link to', async () => {
  const lead = (await post('leads', { title: 'Short-lived' })).lead;
  const followUp = (await create({ title: 'Orphaned soon', relatedId: lead.id })).body.data.followUp;
  await request(app).delete(`/api/v1/leads/${lead.id}`).set(admin());

  const listed = (await request(app).get(`${API}?search=orphaned`).set(admin())).body.data.followUps[0];
  assert.equal(listed.id, followUp.id);
  assert.equal(listed.related, null);
  assert.equal(listed.relatedId, lead.id);
});
