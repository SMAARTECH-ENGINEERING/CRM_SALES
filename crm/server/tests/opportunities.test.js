import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_opportunities');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Company } = await import('../src/models/Company.js');
const { default: Contact } = await import('../src/models/Contact.js');
const { default: Opportunity } = await import('../src/models/Opportunity.js');
const { default: User } = await import('../src/models/User.js');
const { seedLeadConfig, seedPipelines, verifyDeclaredPermissions } = await import('../src/services/seed.service.js');
const { allKeys, createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } =
  await import('./helpers/fixtures.js');

const API = '/api/v1/opportunities';
const STAGES = '/api/v1/pipeline-stages';
const PIPELINES = '/api/v1/pipelines';

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const missing = () => new mongoose.Types.ObjectId().toString();
const create = (body, token = ctx.adminToken) =>
  request(app).post(API).set(as(token)).send({ name: 'Deal', companyId: ctx.acme.id, ...body });
const move = (id, stageId, token = ctx.adminToken) =>
  request(app).patch(`${API}/${id}/stage`).set(as(token)).send({ stageId });
const names = async (query) =>
  (await request(app).get(`${API}?limit=100&sortBy=name&sortOrder=asc&${query}`).set(admin())).body.data.opportunities.map(
    (o) => o.name
  );
const post = async (path, body) => (await request(app).post(`/api/v1/${path}`).set(admin()).send(body)).body.data;

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Company.init(), Contact.init(), Opportunity.init()]);
  await seedRbac();
  await seedLeadConfig();
  await seedPipelines();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.plain = await createUser(await defaultRole());
  ctx.reader = await createUser(await createRole(['opportunities.read'], 'Opportunity Reader'));
  // Works opportunities day to day, but may not assign to others or delete.
  ctx.rep = await createUser(
    await createRole(['opportunities.read', 'opportunities.create', 'opportunities.update'], 'Sales Rep'),
    { firstName: 'Riya', lastName: 'Rep' }
  );
  ctx.manager = await createUser(await createRole(await allKeys('opportunities'), 'Sales Manager'), {
    firstName: 'Mo',
    lastName: 'Manager',
  });
  ctx.inactive = await createUser(await defaultRole(), { status: 'inactive' });

  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.readerToken = await loginAs(app, ctx.reader);
  ctx.repToken = await loginAs(app, ctx.rep);
  ctx.managerToken = await loginAs(app, ctx.manager);

  ctx.acme = (await post('companies', { name: 'Acme Industries' })).company;
  ctx.bolt = (await post('companies', { name: 'Bolt Traders' })).company;
  ctx.priya = (await post('contacts', { firstName: 'Priya', lastName: 'Nair', companyId: ctx.acme.id })).contact;
  ctx.omar = (await post('contacts', { firstName: 'Omar', lastName: 'Khan', companyId: ctx.bolt.id })).contact;
  ctx.priorities = (await request(app).get('/api/v1/lead-priorities').set(admin())).body.data.items;

  // The seeded pipeline, by position - the tests never rely on stage names.
  [ctx.sales] = (await request(app).get(PIPELINES).set(admin())).body.data.pipelines;
  ctx.stages = (await request(app).get(`${STAGES}?pipelineId=${ctx.sales.id}`).set(admin())).body.data.stages;
  ctx.won = ctx.stages.find((stage) => stage.type === 'won');
  ctx.lost = ctx.stages.find((stage) => stage.type === 'lost');

  // A second pipeline with stages of its own.
  ctx.renewals = (await post('pipelines', { name: 'Renewals' })).pipeline;
  ctx.reminder = (await post('pipeline-stages', { pipelineId: ctx.renewals.id, name: 'Reminder', probability: 30 })).stage;
  ctx.quoted = (await post('pipeline-stages', { pipelineId: ctx.renewals.id, name: 'Quoted', probability: 60 })).stage;
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await verifyDeclaredPermissions(), []);
});

// --- access --------------------------------------------------------------------

test('every opportunity endpoint needs a token (401) and a permission (403)', async () => {
  const id = missing();
  const calls = (headers) => [
    request(app).get(API).set(headers),
    request(app).get(`${API}/board`).set(headers),
    request(app).post(API).set(headers).send({ name: 'Nope', companyId: ctx.acme.id }),
    request(app).get(`${API}/${id}`).set(headers),
    request(app).put(`${API}/${id}`).set(headers).send({ name: 'Nope' }),
    request(app).delete(`${API}/${id}`).set(headers),
    request(app).patch(`${API}/${id}/stage`).set(headers).send({ stageId: ctx.stages[1].id }),
    request(app).patch(`${API}/${id}/assign`).set(headers).send({ assignedTo: null }),
    request(app).get(`${API}/${id}/timeline`).set(headers),
  ];

  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) assert.equal(res.status, 403);
  assert.equal(await Opportunity.countDocuments(), 0);
});

// --- create ----------------------------------------------------------------------

test('create: generates the number and starts in the first stage of the default pipeline', async () => {
  const res = await create({ name: '  Website redesign  ' }, ctx.repToken);

  assert.equal(res.status, 201);
  const { opportunity } = res.body.data;
  assert.equal(opportunity.opportunityNumber, 'OPP-000001');
  assert.equal(opportunity.name, 'Website redesign');
  assert.equal(opportunity.pipelineId, ctx.sales.id);
  assert.equal(opportunity.pipeline.name, ctx.sales.name);
  assert.equal(opportunity.stageId, ctx.stages[0].id);
  assert.equal(opportunity.stage.order, 1);
  assert.equal(opportunity.probability, ctx.stages[0].probability, 'taken from the stage');
  assert.equal(opportunity.status, 'open');
  assert.equal(opportunity.company.name, 'Acme Industries');
  assert.equal(opportunity.createdBy, ctx.rep.id);
  for (const field of ['_id', '__v', 'deletedAt', 'contactId', 'assignedTo', 'closedAt']) {
    assert.equal(field in opportunity, false, field);
  }
  ctx.bare = opportunity;
});

test('create: stores every field and expands the references', async () => {
  const high = ctx.priorities.find((p) => p.level === Math.max(...ctx.priorities.map((x) => x.level)));
  const res = await create({
    name: 'ERP rollout',
    contactId: ctx.priya.id,
    pipelineId: ctx.renewals.id,
    stageId: ctx.quoted.id,
    estimatedValue: 250000.5,
    probability: 45,
    expectedCloseDate: '2027-03-31',
    assignedTo: ctx.admin.id,
    priorityId: high.id,
    notes: 'Met at the expo',
  });

  assert.equal(res.status, 201);
  const { opportunity } = res.body.data;
  assert.equal(opportunity.opportunityNumber, 'OPP-000002');
  assert.equal(opportunity.contact.fullName, 'Priya Nair');
  assert.equal(opportunity.pipeline.name, 'Renewals');
  assert.equal(opportunity.stage.name, 'Quoted');
  assert.equal(opportunity.estimatedValue, 250000.5);
  assert.equal(opportunity.probability, 45, 'an explicit probability wins over the stage');
  assert.equal(opportunity.expectedCloseDate.slice(0, 10), '2027-03-31');
  assert.equal(opportunity.assignedToUser.fullName, 'Ada Admin');
  assert.equal(opportunity.priority.name, high.name);
  assert.equal(opportunity.notes, 'Met at the expo');
  ctx.full = opportunity;

  // A pipeline without a stage: its first active stage.
  const inRenewals = (await create({ name: 'Renewal 2027', pipelineId: ctx.renewals.id })).body.data.opportunity;
  assert.equal(inRenewals.stageId, ctx.reminder.id);
  // A stage without a pipeline: the stage's own pipeline.
  const byStage = (await create({ name: 'By stage', stageId: ctx.stages[2].id })).body.data.opportunity;
  assert.equal(byStage.pipelineId, ctx.sales.id);
  assert.equal(byStage.probability, ctx.stages[2].probability);
  ctx.inRenewals = inRenewals;
  ctx.byStage = byStage;
});

test('create: validation, and references that must exist', async () => {
  const before = await Opportunity.countDocuments();
  const cases = {
    'missing name': [{ name: undefined }, 422, 'name'],
    'missing company': [{ companyId: undefined }, 422, 'companyId'],
    'negative value': [{ estimatedValue: -1 }, 422, 'estimatedValue'],
    'probability over 100': [{ probability: 150 }, 422, 'probability'],
    'bad date': [{ expectedCloseDate: 'soon' }, 422, 'expectedCloseDate'],
    'status sent by the client': [{ status: 'won' }, 422, 'status'],
    'number sent by the client': [{ opportunityNumber: 'OPP-9' }, 422, 'opportunityNumber'],
    'lead sent by the client': [{ leadId: missing() }, 422, 'leadId'],
    'unknown company': [{ companyId: missing() }, 400, 'companyId'],
    'unknown contact': [{ contactId: missing() }, 400, 'contactId'],
    'contact of another company': [{ contactId: ctx.omar.id }, 400, 'contactId'],
    'unknown priority': [{ priorityId: missing() }, 400, 'priorityId'],
    'unknown assignee': [{ assignedTo: missing() }, 400, 'assignedTo'],
    'inactive assignee': [{ assignedTo: ctx.inactive.id }, 400, 'assignedTo'],
    'unknown pipeline': [{ pipelineId: missing() }, 400, 'pipelineId'],
    'unknown stage': [{ stageId: missing() }, 400, 'stageId'],
    'stage of another pipeline': [{ pipelineId: ctx.renewals.id, stageId: ctx.stages[0].id }, 400, 'stageId'],
  };
  for (const [label, [body, status, field]] of Object.entries(cases)) {
    const res = await create(body);
    assert.equal(res.status, status, label);
    assert.ok(res.body.errors.some((e) => e.field === field), `${label}: names ${field}`);
  }
  assert.equal(await Opportunity.countDocuments(), before, 'nothing was created');

  // Rejected requests did not use up numbers.
  const next = (await create({ name: 'Next in line' })).body.data.opportunity;
  assert.equal(next.opportunityNumber, `OPP-${String(before + 1).padStart(6, '0')}`);
  ctx.next = next;
});

test('create: inactive pipelines and stages take no new opportunities', async () => {
  const stageUrl = `${STAGES}/${ctx.reminder.id}`;
  await request(app).put(stageUrl).set(admin()).send({ status: 'inactive' });
  const intoInactive = await create({ stageId: ctx.reminder.id });
  assert.equal(intoInactive.status, 400);
  assert.equal(intoInactive.body.errors[0].field, 'stageId');
  // The pipeline's first *active* stage is used instead.
  const skipped = (await create({ name: 'Skips inactive', pipelineId: ctx.renewals.id })).body.data.opportunity;
  assert.equal(skipped.stageId, ctx.quoted.id);
  await request(app).put(stageUrl).set(admin()).send({ status: 'active' });

  await request(app).put(`${PIPELINES}/${ctx.renewals.id}`).set(admin()).send({ status: 'inactive' });
  for (const body of [{ pipelineId: ctx.renewals.id }, { stageId: ctx.quoted.id }]) {
    const res = await create(body);
    assert.equal(res.status, 400);
    assert.equal(res.body.errors[0].field, 'pipelineId');
  }
  await request(app).put(`${PIPELINES}/${ctx.renewals.id}`).set(admin()).send({ status: 'active' });
});

test('assignment on create: yourself freely, others only with opportunities.assign', async () => {
  const self = await create({ name: 'Mine', assignedTo: ctx.rep.id }, ctx.repToken);
  assert.equal(self.status, 201);
  assert.equal(self.body.data.opportunity.assignedTo, ctx.rep.id);
  ctx.mine = self.body.data.opportunity;

  assert.equal((await create({ assignedTo: ctx.admin.id }, ctx.repToken)).status, 403);
  assert.equal((await create({ name: 'Delegated', assignedTo: ctx.rep.id }, ctx.managerToken)).status, 201);
});

// --- read ----------------------------------------------------------------------

test('get: returns one opportunity; unknown is 404, malformed id is 422', async () => {
  const res = await request(app).get(`${API}/${ctx.full.id}`).set(as(ctx.readerToken));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.opportunity.name, 'ERP rollout');
  assert.equal((await request(app).get(`${API}/${missing()}`).set(admin())).status, 404);
  assert.equal((await request(app).get(`${API}/nope`).set(admin())).status, 422);
});

test('list: filters, search, sorting and pagination', async () => {
  assert.deepEqual(await names(`pipelineId=${ctx.renewals.id}`), ['ERP rollout', 'Renewal 2027', 'Skips inactive']);
  assert.deepEqual(await names(`stageId=${ctx.reminder.id}`), ['Renewal 2027']);
  assert.deepEqual(await names(`contactId=${ctx.priya.id}`), ['ERP rollout']);
  assert.deepEqual(await names(`assignedTo=${ctx.rep.id}`), ['Delegated', 'Mine']);
  assert.deepEqual(await names(`priorityId=${ctx.full.priorityId}`), ['ERP rollout']);
  assert.deepEqual(await names('search=erp'), ['ERP rollout']);
  assert.deepEqual(await names('search=OPP-000001'), ['Website redesign']);
  assert.deepEqual(await names('search=expo'), ['ERP rollout'], 'notes are searched');
  assert.deepEqual(await names(`companyId=${ctx.bolt.id}`), []);
  assert.equal((await names('status=open')).length, await Opportunity.countDocuments());

  const page = await request(app).get(`${API}?limit=2&page=2&sortBy=opportunityNumber&sortOrder=asc`).set(admin());
  assert.deepEqual(page.body.data.opportunities.map((o) => o.opportunityNumber), ['OPP-000003', 'OPP-000004']);
  const total = await Opportunity.countDocuments();
  assert.deepEqual(page.body.data.pagination, { page: 2, limit: 2, total, totalPages: Math.ceil(total / 2) });

  for (const query of ['limit=500', 'sortBy=password', 'status=maybe', 'pipelineId=nope']) {
    assert.equal((await request(app).get(`${API}?${query}`).set(admin())).status, 422, query);
  }
});

// --- update ----------------------------------------------------------------------

test('update: changes what is sent, clears optional fields, records the changes', async () => {
  const url = `${API}/${ctx.full.id}`;
  const res = await request(app).put(url).set(as(ctx.repToken)).send({ name: 'ERP rollout phase 1', estimatedValue: 300000, probability: 55 });
  assert.equal(res.status, 200);
  const { opportunity } = res.body.data;
  assert.equal(opportunity.name, 'ERP rollout phase 1');
  assert.equal(opportunity.estimatedValue, 300000);
  assert.equal(opportunity.probability, 55);
  assert.equal(opportunity.stageId, ctx.quoted.id, 'stage untouched');
  assert.equal(opportunity.notes, 'Met at the expo', 'not sent, so kept');

  const cleared = await request(app).put(url).set(admin()).send({ notes: '', expectedCloseDate: null, priorityId: '', contactId: null });
  for (const field of ['notes', 'expectedCloseDate', 'priorityId', 'contactId']) {
    assert.equal(field in cleared.body.data.opportunity, false, field);
  }

  const timeline = (await request(app).get(`${url}/timeline`).set(admin())).body.data.events;
  assert.deepEqual(timeline.map((e) => e.action), ['updated', 'updated', 'created']);
  assert.deepEqual(
    timeline[1].changes.map((c) => [c.label, c.from, c.to]),
    [
      ['Name', 'ERP rollout', 'ERP rollout phase 1'],
      ['Estimated value', '250000.5', '300000'],
      ['Probability', '45%', '55%'],
    ]
  );
  assert.equal(timeline[1].actor.fullName, 'Riya Rep');
  await request(app).put(url).set(admin()).send({ name: 'ERP rollout' });
});

test('update: company and contact stay consistent', async () => {
  const url = `${API}/${ctx.bare.id}`;
  const withContact = await request(app).put(url).set(admin()).send({ contactId: ctx.priya.id });
  assert.equal(withContact.body.data.opportunity.contact.fullName, 'Priya Nair');

  const mismatch = await request(app).put(url).set(admin()).send({ contactId: ctx.omar.id });
  assert.equal(mismatch.status, 400);
  assert.equal(mismatch.body.errors[0].field, 'contactId');

  // Moving to another company drops a contact who does not work there.
  const moved = await request(app).put(url).set(admin()).send({ companyId: ctx.bolt.id });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.data.opportunity.companyId, ctx.bolt.id);
  assert.equal('contactId' in moved.body.data.opportunity, false);

  const both = await request(app).put(url).set(admin()).send({ companyId: ctx.acme.id, contactId: ctx.priya.id });
  assert.equal(both.body.data.opportunity.contactId, ctx.priya.id);
  assert.equal((await request(app).put(url).set(admin()).send({ companyId: missing() })).status, 400);
});

test('update: stage, pipeline, assignment and server-owned fields are refused', async () => {
  const url = `${API}/${ctx.bare.id}`;
  const bodies = [
    { stageId: ctx.stages[1].id },
    { pipelineId: ctx.renewals.id },
    { assignedTo: ctx.admin.id },
    { status: 'won' },
    { opportunityNumber: 'OPP-1' },
    { companyId: '' },
    {},
  ];
  for (const body of bodies) {
    assert.equal((await request(app).put(url).set(admin()).send(body)).status, 422, JSON.stringify(body));
  }
  assert.equal((await request(app).put(url).set(as(ctx.readerToken)).send({ name: 'Nope' })).status, 403);
  assert.equal((await request(app).put(`${API}/${missing()}`).set(admin()).send({ name: 'Ghost' })).status, 404);
});

// --- moving between stages -----------------------------------------------------------

test('stage: moving follows the stage - probability, status and history', async () => {
  const target = ctx.stages[2];
  const res = await move(ctx.bare.id, target.id, ctx.repToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.opportunity.stageId, target.id);
  assert.equal(res.body.data.opportunity.stage.name, target.name);
  assert.equal(res.body.data.opportunity.probability, target.probability);
  assert.equal(res.body.data.opportunity.status, 'open');

  const won = (await move(ctx.bare.id, ctx.won.id)).body.data.opportunity;
  assert.equal(won.status, 'won');
  assert.equal(won.probability, ctx.won.probability);
  assert.ok(won.closedAt);

  const lost = (await move(ctx.bare.id, ctx.lost.id)).body.data.opportunity;
  assert.equal(lost.status, 'lost');

  // Back to an open stage reopens it.
  const reopened = (await move(ctx.bare.id, ctx.stages[0].id)).body.data.opportunity;
  assert.equal(reopened.status, 'open');
  assert.equal('closedAt' in reopened, false);

  // Moving to the stage it is already in changes nothing and records nothing.
  assert.equal((await move(ctx.bare.id, ctx.stages[0].id)).status, 200);

  const events = (await request(app).get(`${API}/${ctx.bare.id}/timeline?limit=4`).set(admin())).body.data.events;
  assert.deepEqual(events.map((e) => e.action), ['stage_changed', 'stage_changed', 'stage_changed', 'stage_changed']);
  assert.deepEqual(
    [events[0].changes[0].from, events[0].changes[0].to],
    [ctx.lost.name, ctx.stages[0].name]
  );
  assert.deepEqual(await names('status=won'), []);
});

test('stage: the target is validated by the server', async () => {
  const before = (await request(app).get(`${API}/${ctx.bare.id}`).set(admin())).body.data.opportunity;

  const cases = {
    'unknown stage': [missing(), 400],
    'stage of another pipeline': [ctx.quoted.id, 400],
    'malformed id': ['column-3', 422],
    'no stage': [undefined, 422],
  };
  for (const [label, [stageId, status]] of Object.entries(cases)) {
    const res = await move(ctx.bare.id, stageId);
    assert.equal(res.status, status, label);
    assert.equal(res.body.errors[0].field, 'stageId', label);
  }

  // An inactive stage cannot be moved into.
  await request(app).put(`${STAGES}/${ctx.stages[1].id}`).set(admin()).send({ status: 'inactive' });
  const inactive = await move(ctx.bare.id, ctx.stages[1].id);
  assert.equal(inactive.status, 400);
  assert.match(inactive.body.message, /inactive/);
  await request(app).put(`${STAGES}/${ctx.stages[1].id}`).set(admin()).send({ status: 'active' });

  assert.equal((await move(ctx.bare.id, ctx.stages[1].id, ctx.readerToken)).status, 403);
  assert.equal((await move(missing(), ctx.stages[1].id)).status, 404);

  const after = (await request(app).get(`${API}/${ctx.bare.id}`).set(admin())).body.data.opportunity;
  assert.equal(after.stageId, before.stageId, 'none of the refused moves changed anything');
  assert.equal(after.updatedAt, before.updatedAt);
});

// --- assign ----------------------------------------------------------------------

test('assign: needs opportunities.assign, checks the user, records who it went to', async () => {
  const url = `${API}/${ctx.bare.id}/assign`;
  assert.equal((await request(app).patch(url).set(as(ctx.repToken)).send({ assignedTo: ctx.rep.id })).status, 403);

  const res = await request(app).patch(url).set(as(ctx.managerToken)).send({ assignedTo: ctx.rep.id });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.opportunity.assignedToUser.fullName, 'Riya Rep');

  for (const assignedTo of [missing(), ctx.inactive.id]) {
    assert.equal((await request(app).patch(url).set(admin()).send({ assignedTo })).status, 400);
  }
  assert.equal((await request(app).patch(url).set(admin()).send({})).status, 422);

  const unassigned = await request(app).patch(url).set(admin()).send({ assignedTo: null });
  assert.equal('assignedTo' in unassigned.body.data.opportunity, false);

  const events = (await request(app).get(`${API}/${ctx.bare.id}/timeline?limit=2`).set(admin())).body.data.events;
  assert.deepEqual(events.map((e) => [e.action, e.changes[0].from, e.changes[0].to]), [
    ['assigned', 'Riya Rep', undefined],
    ['assigned', undefined, 'Riya Rep'],
  ]);
});

// --- board -----------------------------------------------------------------------

test('board: one column per stage in order, with real totals', async () => {
  await request(app).put(`${API}/${ctx.bare.id}`).set(admin()).send({ estimatedValue: 1000 });
  await request(app).put(`${API}/${ctx.next.id}`).set(admin()).send({ estimatedValue: 500 });

  const res = await request(app).get(`${API}/board`).set(as(ctx.readerToken));
  assert.equal(res.status, 200);
  const { pipeline, columns } = res.body.data;
  assert.equal(pipeline.id, ctx.sales.id, 'the default pipeline when none is named');
  assert.deepEqual(columns.map((c) => c.stage.id), ctx.stages.map((s) => s.id));

  for (const column of columns) {
    const filter = { stageId: column.stage.id };
    assert.equal(column.total, await Opportunity.countDocuments(filter), column.stage.name);
    const sum = (await Opportunity.find(filter)).reduce((value, o) => value + (o.estimatedValue ?? 0), 0);
    assert.equal(column.totalValue, sum, column.stage.name);
    assert.equal(column.opportunities.length, column.total);
    assert.ok(column.opportunities.every((o) => o.stageId === column.stage.id));
  }
  assert.equal(columns[0].totalValue, 1500);
  assert.ok(columns[0].opportunities[0].company.name, 'cards carry what they display');

  const renewals = (await request(app).get(`${API}/board?pipelineId=${ctx.renewals.id}`).set(admin())).body.data;
  assert.deepEqual(renewals.columns.map((c) => [c.stage.name, c.total]), [
    ['Reminder', 1],
    ['Quoted', 2],
  ]);

  // Filters narrow the cards and the totals alike; the limit caps cards only.
  const mine = (await request(app).get(`${API}/board?assignedTo=${ctx.rep.id}`).set(admin())).body.data;
  assert.deepEqual(mine.columns[0].opportunities.map((o) => o.name).sort(), ['Delegated', 'Mine']);
  assert.equal(mine.columns[0].total, 2);
  const searched = (await request(app).get(`${API}/board?search=website`).set(admin())).body.data;
  assert.equal(searched.columns.reduce((count, c) => count + c.total, 0), 1);
  const capped = (await request(app).get(`${API}/board?limit=1`).set(admin())).body.data;
  assert.equal(capped.columns[0].opportunities.length, 1);
  assert.equal(capped.columns[0].total, columns[0].total);

  assert.equal((await request(app).get(`${API}/board?pipelineId=${missing()}`).set(admin())).status, 404);
  assert.equal((await request(app).get(`${API}/board?limit=1000`).set(admin())).status, 422);
});

// --- pipelines and stages in use -----------------------------------------------------

test('a stage or pipeline holding opportunities cannot be deleted; a stage that changes meaning takes its deals along', async () => {
  const stage = await request(app).delete(`${STAGES}/${ctx.quoted.id}`).set(admin());
  assert.equal(stage.status, 409);
  const pipeline = await request(app).delete(`${PIPELINES}/${ctx.renewals.id}`).set(admin());
  assert.equal(pipeline.status, 409);
  assert.match(pipeline.body.message, /Deactivate/);

  const counted = (await request(app).get(PIPELINES).set(admin())).body.data.pipelines.find((p) => p.id === ctx.renewals.id);
  assert.equal(counted.opportunityCount, 3);

  await request(app).put(`${STAGES}/${ctx.reminder.id}`).set(admin()).send({ type: 'won' });
  let renewal = (await request(app).get(`${API}/${ctx.inRenewals.id}`).set(admin())).body.data.opportunity;
  assert.equal(renewal.status, 'won');
  assert.ok(renewal.closedAt);
  await request(app).put(`${STAGES}/${ctx.reminder.id}`).set(admin()).send({ type: 'open' });
  renewal = (await request(app).get(`${API}/${ctx.inRenewals.id}`).set(admin())).body.data.opportunity;
  assert.equal(renewal.status, 'open');
  assert.equal('closedAt' in renewal, false);

  // A priority used by an opportunity cannot be deleted either.
  const priority = ctx.priorities.find((p) => !p.isDefault);
  await request(app).put(`${API}/${ctx.full.id}`).set(admin()).send({ priorityId: priority.id });
  assert.equal((await request(app).delete(`/api/v1/lead-priorities/${priority.id}`).set(admin())).status, 409);
});

// --- other modules ---------------------------------------------------------------

test('lead conversion puts the opportunity in a pipeline stage', async () => {
  const lead = (await post('leads', { title: 'Converted deal', companyId: ctx.acme.id, estimatedValue: 900 })).lead;

  const preview = await post(`leads/${lead.id}/convert`, { dryRun: true });
  assert.equal(preview.pipeline.id, ctx.sales.id);
  assert.equal(preview.stage.id, ctx.stages[0].id);

  const { opportunity } = await post(`leads/${lead.id}/convert`, {});
  assert.equal(opportunity.name, 'Converted deal');
  assert.equal(opportunity.pipelineId, ctx.sales.id);
  assert.equal(opportunity.stageId, ctx.stages[0].id);
  assert.equal(opportunity.probability, ctx.stages[0].probability);
  assert.equal(opportunity.leadId, lead.id);
  assert.equal(opportunity.priorityId, lead.priorityId, 'the priority carries over');
  assert.deepEqual(await names(`leadId=${lead.id}`), ['Converted deal']);

  const chosen = (await post('leads', { title: 'Chosen stage', companyId: ctx.acme.id })).lead;
  const explicit = await post(`leads/${chosen.id}/convert`, { opportunity: { name: 'Renewal deal', stageId: ctx.quoted.id } });
  assert.equal(explicit.opportunity.name, 'Renewal deal');
  assert.equal(explicit.opportunity.pipelineId, ctx.renewals.id);

  // A bad stage is refused before anything is written, so the lead can be retried.
  const refusedLead = (await post('leads', { title: 'Refused', companyId: ctx.acme.id })).lead;
  const refused = await request(app)
    .post(`/api/v1/leads/${refusedLead.id}/convert`)
    .set(admin())
    .send({ opportunity: { stageId: missing() } });
  assert.equal(refused.status, 400);
  const again = (await request(app).get(`/api/v1/leads/${refusedLead.id}`).set(admin())).body.data.lead;
  assert.equal(again.isConverted, false);
});

test('activities and follow-ups can be about an opportunity', async () => {
  await request(app).post('/api/v1/activity-types').set(admin()).send({ name: 'Call' });
  const [type] = (await request(app).get('/api/v1/activity-types').set(admin())).body.data.items;
  const activity = await post('activities', { typeId: type.id, subject: 'Pricing call', opportunityId: ctx.full.id });
  assert.equal(activity.activity.opportunity.name, 'ERP rollout');
  assert.equal(activity.activity.companyId, ctx.acme.id, 'the company is filled in from the opportunity');

  const followUp = await post('followups', {
    title: 'Send revised quote',
    relatedType: 'opportunity',
    relatedId: ctx.full.id,
    dueDate: '2030-01-01T10:00:00.000Z',
  });
  assert.equal(followUp.followUp.related.label, `${ctx.full.opportunityNumber} - ERP rollout`);
});

// --- delete ----------------------------------------------------------------------

test('delete: soft-deletes, hides the opportunity and frees its stage', async () => {
  const doomed = (await create({ name: 'Doomed', stageId: ctx.stages[3].id })).body.data.opportunity;
  assert.equal((await request(app).delete(`${STAGES}/${ctx.stages[3].id}`).set(admin())).status, 409);

  assert.equal((await request(app).delete(`${API}/${doomed.id}`).set(as(ctx.repToken))).status, 403);
  assert.equal((await request(app).delete(`${API}/${doomed.id}`).set(as(ctx.managerToken))).status, 200);
  assert.equal((await request(app).get(`${API}/${doomed.id}`).set(admin())).status, 404);
  assert.deepEqual(await names('search=doomed'), []);
  assert.ok(await Opportunity.findById(doomed.id).setOptions({ withDeleted: true }), 'the record is kept');

  const board = (await request(app).get(`${API}/board`).set(admin())).body.data;
  assert.equal(board.columns[3].total, 0, 'deleted opportunities are not counted on the board');

  // Its number is not reused.
  const next = (await create({ name: 'After the deletion' })).body.data.opportunity;
  assert.ok(Number(next.opportunityNumber.split('-')[1]) > Number(doomed.opportunityNumber.split('-')[1]));
  assert.equal((await request(app).delete(`${STAGES}/${ctx.stages[3].id}`).set(admin())).status, 200);
});

test('the company page counts opportunities, and they block deleting the company and contact', async () => {
  const sections = (await request(app).get(`/api/v1/companies/${ctx.acme.id}/sections`).set(admin())).body.data.sections;
  const section = sections.find((s) => s.key === 'opportunities');
  assert.equal(section.available, true);
  assert.equal(section.count, await Opportunity.countDocuments({ companyId: ctx.acme.id }));

  const company = await request(app).delete(`/api/v1/companies/${ctx.acme.id}`).set(admin());
  assert.equal(company.status, 409);
  assert.ok(company.body.errors.some((e) => e.field === 'opportunities'));
  const contact = await request(app).delete(`/api/v1/contacts/${ctx.priya.id}`).set(admin());
  assert.equal(contact.status, 409);
});
