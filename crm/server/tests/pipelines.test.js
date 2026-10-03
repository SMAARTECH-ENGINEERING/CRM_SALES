import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_pipelines');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Pipeline } = await import('../src/models/Pipeline.js');
const { default: PipelineStage } = await import('../src/models/PipelineStage.js');
const { default: User } = await import('../src/models/User.js');
const { seedPipelines, verifyDeclaredPermissions } = await import('../src/services/seed.service.js');
const { PIPELINE_SEED } = await import('../src/seeds/pipeline.seed.js');
const { createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const PIPELINES = '/api/v1/pipelines';
const STAGES = '/api/v1/pipeline-stages';
const OPPORTUNITIES = '/api/v1/opportunities';

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const missing = () => new mongoose.Types.ObjectId().toString();
const stagesOf = async (pipelineId, query = '') =>
  (await request(app).get(`${STAGES}?pipelineId=${pipelineId}${query}`).set(admin())).body.data.stages;
const stageNames = async (pipelineId) => (await stagesOf(pipelineId)).map((stage) => `${stage.order}:${stage.name}`);
const addStage = (body) => request(app).post(STAGES).set(admin()).send({ probability: 10, ...body });

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Pipeline.init(), PipelineStage.init()]);
  await seedRbac();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.plain = await createUser(await defaultRole());
  // Works opportunities, so may read pipelines - but not change them.
  ctx.rep = await createUser(await createRole(['opportunities.read', 'opportunities.update'], 'Sales Rep'));

  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.repToken = await loginAs(app, ctx.rep);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await verifyDeclaredPermissions(), []);
});

test('nothing is built in: no pipelines or stages until they are created or seeded', async () => {
  assert.deepEqual((await request(app).get(PIPELINES).set(admin())).body.data.pipelines, []);
  assert.deepEqual((await request(app).get(STAGES).set(admin())).body.data.stages, []);

  const board = await request(app).get(`${OPPORTUNITIES}/board`).set(admin());
  assert.equal(board.status, 200);
  assert.deepEqual(board.body.data, { pipeline: null, columns: [] });
});

test('seed: loads the initial pipeline once and never again', async () => {
  assert.equal(await seedPipelines(), true);

  const [pipeline] = (await request(app).get(PIPELINES).set(admin())).body.data.pipelines;
  assert.equal(pipeline.name, PIPELINE_SEED.name);
  assert.equal(pipeline.isDefault, true);
  assert.equal(pipeline.stageCount, PIPELINE_SEED.stages.length);
  assert.equal(pipeline.opportunityCount, 0);
  assert.deepEqual(
    (await stagesOf(pipeline.id)).map((s) => [s.order, s.name, s.probability, s.type]),
    PIPELINE_SEED.stages.map((s, index) => [index + 1, s.name, s.probability, s.type ?? 'open'])
  );
  ctx.seeded = pipeline;

  // An administrator removes a stage; the seed must not bring it back.
  const [first] = await stagesOf(pipeline.id);
  assert.equal((await request(app).delete(`${STAGES}/${first.id}`).set(admin())).status, 200);
  assert.equal(await seedPipelines(), false);
  assert.equal((await stagesOf(pipeline.id)).length, PIPELINE_SEED.stages.length - 1);
});

test('access: reading needs an opportunities or pipelines permission, changing needs pipelines.manage', async () => {
  const id = ctx.seeded.id;
  const stage = (await stagesOf(id))[0].id;
  const reads = (headers) => [
    request(app).get(PIPELINES).set(headers),
    request(app).get(`${PIPELINES}/${id}`).set(headers),
    request(app).get(STAGES).set(headers),
  ];
  const writes = (headers) => [
    request(app).post(PIPELINES).set(headers).send({ name: 'Nope' }),
    request(app).put(`${PIPELINES}/${id}`).set(headers).send({ name: 'Nope' }),
    request(app).delete(`${PIPELINES}/${id}`).set(headers),
    request(app).post(STAGES).set(headers).send({ pipelineId: id, name: 'Nope', probability: 1 }),
    request(app).put(`${STAGES}/${stage}`).set(headers).send({ name: 'Nope' }),
    request(app).delete(`${STAGES}/${stage}`).set(headers),
    request(app).patch(`${STAGES}/reorder`).set(headers).send({ pipelineId: id, stageIds: [stage] }),
  ];

  for (const res of await Promise.all([...reads({}), ...writes({})])) assert.equal(res.status, 401);
  for (const res of await Promise.all([...reads(as(ctx.plainToken)), ...writes(as(ctx.plainToken))])) {
    assert.equal(res.status, 403);
  }
  for (const res of await Promise.all(reads(as(ctx.repToken)))) assert.equal(res.status, 200);
  for (const res of await Promise.all(writes(as(ctx.repToken)))) assert.equal(res.status, 403);
  assert.equal(await Pipeline.countDocuments({ name: 'Nope' }), 0);
});

test('pipelines: create, get with stages, update', async () => {
  const res = await request(app).post(PIPELINES).set(admin()).send({ name: '  Renewals ', description: 'Yearly' });
  assert.equal(res.status, 201);
  const { pipeline } = res.body.data;
  assert.equal(pipeline.name, 'Renewals');
  assert.equal(pipeline.isDefault, false, 'a default already exists');
  assert.equal(pipeline.status, 'active');
  assert.equal(pipeline.createdBy, ctx.admin.id);
  for (const field of ['_id', '__v']) assert.equal(field in pipeline, false, field);
  ctx.renewals = pipeline;

  const got = await request(app).get(`${PIPELINES}/${pipeline.id}`).set(admin());
  assert.equal(got.body.data.pipeline.id, pipeline.id);
  assert.deepEqual(got.body.data.stages, []);

  const updated = await request(app).put(`${PIPELINES}/${pipeline.id}`).set(admin()).send({ description: '' });
  assert.equal(updated.status, 200);
  assert.equal('description' in updated.body.data.pipeline, false);
  assert.equal(updated.body.data.pipeline.name, 'Renewals');

  // The default comes first in the list.
  const names = (await request(app).get(PIPELINES).set(admin())).body.data.pipelines.map((p) => p.name);
  assert.deepEqual(names, [PIPELINE_SEED.name, 'Renewals']);
});

test('pipelines: validation and unique names', async () => {
  const cases = {
    'missing name': [request(app).post(PIPELINES).send({}), 422],
    'short name': [request(app).post(PIPELINES).send({ name: 'A' }), 422],
    'unknown status': [request(app).post(PIPELINES).send({ name: 'Other', status: 'archived' }), 422],
    'duplicate name, other case': [request(app).post(PIPELINES).send({ name: 'RENEWALS' }), 409],
    'rename onto another': [request(app).put(`${PIPELINES}/${ctx.renewals.id}`).send({ name: PIPELINE_SEED.name }), 409],
    'empty update': [request(app).put(`${PIPELINES}/${ctx.renewals.id}`).send({}), 422],
    'unknown pipeline': [request(app).put(`${PIPELINES}/${missing()}`).send({ name: 'Ghost' }), 404],
    'malformed id': [request(app).get(`${PIPELINES}/not-an-id`), 422],
  };
  for (const [label, [req, status]] of Object.entries(cases)) {
    assert.equal((await req.set(admin())).status, status, label);
  }
});

test('pipelines: exactly one default, which cannot be switched off, deactivated or deleted', async () => {
  const seeded = `${PIPELINES}/${ctx.seeded.id}`;
  assert.equal((await request(app).put(seeded).set(admin()).send({ isDefault: false })).status, 409);
  assert.equal((await request(app).put(seeded).set(admin()).send({ status: 'inactive' })).status, 409);
  assert.equal((await request(app).delete(seeded).set(admin())).status, 409);

  // Moving the default takes it away from the previous one.
  const moved = await request(app).put(`${PIPELINES}/${ctx.renewals.id}`).set(admin()).send({ isDefault: true });
  assert.equal(moved.body.data.pipeline.isDefault, true);
  assert.equal(await Pipeline.countDocuments({ isDefault: true }), 1);
  assert.equal((await Pipeline.findById(ctx.seeded.id)).isDefault, false);

  // An inactive pipeline cannot be made the default.
  const inactive = (await request(app).post(PIPELINES).set(admin()).send({ name: 'Old', status: 'inactive' })).body.data
    .pipeline;
  assert.equal((await request(app).put(`${PIPELINES}/${inactive.id}`).set(admin()).send({ isDefault: true })).status, 409);
  assert.equal((await request(app).post(PIPELINES).set(admin()).send({ name: 'X1', isDefault: true, status: 'inactive' })).status, 409);

  const active = (await request(app).get(`${PIPELINES}?status=active`).set(admin())).body.data.pipelines;
  assert.deepEqual(active.map((p) => p.name), ['Renewals', PIPELINE_SEED.name]);

  await request(app).put(seeded).set(admin()).send({ isDefault: true });
  assert.equal((await request(app).delete(`${PIPELINES}/${inactive.id}`).set(admin())).status, 200);
});

test('stages: created at the end of their pipeline with every field', async () => {
  const res = await addStage({
    pipelineId: ctx.renewals.id,
    name: ' Reminder sent ',
    description: 'Notice emailed',
    probability: 40,
    color: '#1976D2',
  });
  assert.equal(res.status, 201);
  const { stage } = res.body.data;
  assert.equal(stage.name, 'Reminder sent');
  assert.equal(stage.pipelineId, ctx.renewals.id);
  assert.equal(stage.order, 1);
  assert.equal(stage.probability, 40);
  assert.equal(stage.color, '#1976d2');
  assert.equal(stage.type, 'open');
  assert.equal(stage.status, 'active');
  ctx.reminder = stage;

  ctx.quoted = (await addStage({ pipelineId: ctx.renewals.id, name: 'Quoted', probability: 70 })).body.data.stage;
  ctx.renewed = (await addStage({ pipelineId: ctx.renewals.id, name: 'Renewed', probability: 100, type: 'won' })).body
    .data.stage;
  ctx.lapsed = (await addStage({ pipelineId: ctx.renewals.id, name: 'Lapsed', probability: 0, type: 'lost' })).body.data
    .stage;
  assert.deepEqual(await stageNames(ctx.renewals.id), ['1:Reminder sent', '2:Quoted', '3:Renewed', '4:Lapsed']);

  // The same name may be used in another pipeline.
  const same = await addStage({ pipelineId: ctx.seeded.id, name: 'Quoted' });
  assert.equal(same.status, 201);
  assert.equal((await request(app).delete(`${STAGES}/${same.body.data.stage.id}`).set(admin())).status, 200);
});

test('stages: validation', async () => {
  const pipelineId = ctx.renewals.id;
  const cases = {
    'missing pipeline': [addStage({ name: 'Stage' }), 422],
    'unknown pipeline': [addStage({ pipelineId: missing(), name: 'Stage' }), 400],
    'missing name': [addStage({ pipelineId }), 422],
    'missing probability': [request(app).post(STAGES).set(admin()).send({ pipelineId, name: 'Stage' }), 422],
    'probability over 100': [addStage({ pipelineId, name: 'Stage', probability: 101 }), 422],
    'negative probability': [addStage({ pipelineId, name: 'Stage', probability: -1 }), 422],
    'bad colour': [addStage({ pipelineId, name: 'Stage', color: 'blue' }), 422],
    'unknown type': [addStage({ pipelineId, name: 'Stage', type: 'paused' }), 422],
    'order sent by the client': [addStage({ pipelineId, name: 'Stage', order: 1 }), 422],
    'duplicate name in the pipeline': [addStage({ pipelineId, name: 'QUOTED' }), 409],
    'rename onto a sibling': [request(app).put(`${STAGES}/${ctx.quoted.id}`).set(admin()).send({ name: 'Lapsed' }), 409],
    'moving to another pipeline': [
      request(app).put(`${STAGES}/${ctx.quoted.id}`).set(admin()).send({ pipelineId: ctx.seeded.id }),
      422,
    ],
    'unknown stage': [request(app).put(`${STAGES}/${missing()}`).set(admin()).send({ name: 'Ghost' }), 404],
  };
  for (const [label, [req, status]] of Object.entries(cases)) assert.equal((await req).status, status, label);
  assert.equal((await stagesOf(pipelineId)).length, 4);
});

test('stages: update changes what is sent; colour and description can be cleared', async () => {
  const url = `${STAGES}/${ctx.reminder.id}`;
  const res = await request(app).put(url).set(admin()).send({ name: 'Reminder', probability: 0, color: '', description: null });
  assert.equal(res.status, 200);
  const { stage } = res.body.data;
  assert.equal(stage.name, 'Reminder');
  assert.equal(stage.probability, 0, 'zero is a real probability');
  assert.equal('color' in stage, false);
  assert.equal('description' in stage, false);
  assert.equal(stage.order, 1);

  const off = await request(app).put(url).set(admin()).send({ status: 'inactive' });
  assert.equal(off.body.data.stage.status, 'inactive');
  assert.deepEqual((await stagesOf(ctx.renewals.id, '&status=active')).map((s) => s.name), ['Quoted', 'Renewed', 'Lapsed']);
  await request(app).put(url).set(admin()).send({ status: 'active' });
});

test('stages: reorder takes the complete list and rewrites positions', async () => {
  const pipelineId = ctx.renewals.id;
  const ids = [ctx.quoted.id, ctx.reminder.id, ctx.lapsed.id, ctx.renewed.id];

  const res = await request(app).patch(`${STAGES}/reorder`).set(admin()).send({ pipelineId, stageIds: ids });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.stages.map((s) => `${s.order}:${s.name}`), ['1:Quoted', '2:Reminder', '3:Lapsed', '4:Renewed']);
  assert.deepEqual(await stageNames(pipelineId), ['1:Quoted', '2:Reminder', '3:Lapsed', '4:Renewed']);

  const foreign = (await stagesOf(ctx.seeded.id))[0].id;
  const cases = {
    'a stage missing': ids.slice(1),
    'a stage of another pipeline': [...ids.slice(1), foreign],
    'an unknown stage': [...ids.slice(1), missing()],
    'a stage repeated': [...ids, ids[0]],
    'nothing': [],
  };
  for (const [label, stageIds] of Object.entries(cases)) {
    const bad = await request(app).patch(`${STAGES}/reorder`).set(admin()).send({ pipelineId, stageIds });
    assert.equal(bad.status, 422, label);
  }
  const unknown = await request(app).patch(`${STAGES}/reorder`).set(admin()).send({ pipelineId: missing(), stageIds: ids });
  assert.equal(unknown.status, 404);
  assert.deepEqual(await stageNames(pipelineId), ['1:Quoted', '2:Reminder', '3:Lapsed', '4:Renewed'], 'unchanged');

  const back = [ctx.reminder.id, ctx.quoted.id, ctx.renewed.id, ctx.lapsed.id];
  await request(app).patch(`${STAGES}/reorder`).set(admin()).send({ pipelineId, stageIds: back });
});

test('stages: deleting one closes the gap in the order', async () => {
  const extra = (await addStage({ pipelineId: ctx.renewals.id, name: 'Extra' })).body.data.stage;
  assert.equal(extra.order, 5);
  const ids = [ctx.reminder.id, extra.id, ctx.quoted.id, ctx.renewed.id, ctx.lapsed.id];
  await request(app).patch(`${STAGES}/reorder`).set(admin()).send({ pipelineId: ctx.renewals.id, stageIds: ids });

  assert.equal((await request(app).delete(`${STAGES}/${extra.id}`).set(admin())).status, 200);
  assert.deepEqual(await stageNames(ctx.renewals.id), ['1:Reminder', '2:Quoted', '3:Renewed', '4:Lapsed']);
  assert.equal((await request(app).delete(`${STAGES}/${extra.id}`).set(admin())).status, 404);
});

test('deleting a pipeline removes its stages; the last pipeline may go even though it is the default', async () => {
  const spare = (await request(app).post(PIPELINES).set(admin()).send({ name: 'Spare' })).body.data.pipeline;
  await addStage({ pipelineId: spare.id, name: 'Only' });

  assert.equal((await request(app).delete(`${PIPELINES}/${spare.id}`).set(admin())).status, 200);
  assert.equal(await PipelineStage.countDocuments({ pipelineId: spare.id }), 0);
  assert.equal((await request(app).get(`${PIPELINES}/${spare.id}`).set(admin())).status, 404);

  assert.equal((await request(app).delete(`${PIPELINES}/${ctx.renewals.id}`).set(admin())).status, 200);
  assert.equal((await request(app).delete(`${PIPELINES}/${ctx.seeded.id}`).set(admin())).status, 200);
  assert.equal(await Pipeline.countDocuments(), 0);
  assert.equal(await PipelineStage.countDocuments(), 0);

  // The next pipeline created becomes the default without being asked.
  const fresh = await request(app).post(PIPELINES).set(admin()).send({ name: 'Fresh start' });
  assert.equal(fresh.body.data.pipeline.isDefault, true);
});
