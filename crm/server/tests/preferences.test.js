import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_preferences');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: User } = await import('../src/models/User.js');
const { createUser, defaultRole, loginAs, seedRbac } = await import('./helpers/fixtures.js');

const API = '/api/v1/auth/preferences';
const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const get = (token) => request(app).get(API).set(as(token));
const put = (token, body) => request(app).put(API).set(as(token)).send(body);

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await User.init();
  await seedRbac();
  // No permission is needed: the default role holds none.
  ctx.ann = await createUser(await defaultRole());
  ctx.bob = await createUser(await defaultRole());
  ctx.annToken = await loginAs(app, ctx.ann);
  ctx.bobToken = await loginAs(app, ctx.bob);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('starts empty; needs a signed-in user', async () => {
  const res = await get(ctx.annToken);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.preferences, {});
  assert.equal((await request(app).get(API)).status, 401);
  assert.equal((await request(app).put(API).send({ theme: 'emerald' })).status, 401);
});

test('saves what is sent and merges later changes', async () => {
  let res = await put(ctx.annToken, { theme: 'emerald', themeMode: 'dark', language: 'hi', fontSize: 'large', sidebarWidth: 320, sidebarCollapsed: true, tableDensity: 'compact' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.preferences.theme, 'emerald');

  res = await put(ctx.annToken, {
    language: 'od',
    dashboardLayout: [{ id: 'kpis', size: 12 }, { id: 'leadsBySource', size: 6, hidden: true }],
    tableColumns: { leads: { visibility: { createdAt: false }, widths: { title: 320 }, order: ['title', 'leadNumber'] } },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const saved = (await get(ctx.annToken)).body.data.preferences;
  assert.deepEqual(saved, {
    theme: 'emerald',
    themeMode: 'dark',
    language: 'od',
    fontSize: 'large',
    sidebarWidth: 320,
    sidebarCollapsed: true,
    tableDensity: 'compact',
    dashboardLayout: [{ id: 'kpis', size: 12 }, { id: 'leadsBySource', size: 6, hidden: true }],
    tableColumns: { leads: { visibility: { createdAt: false }, widths: { title: 320 }, order: ['title', 'leadNumber'] } },
  });
});

test('null puts a preference back to its default; each user has their own', async () => {
  const res = await put(ctx.annToken, { theme: null, dashboardLayout: null });
  assert.equal(res.status, 200);
  assert.ok(!('theme' in res.body.data.preferences));
  assert.ok(!('dashboardLayout' in res.body.data.preferences));
  assert.equal(res.body.data.preferences.themeMode, 'dark');
  assert.deepEqual((await get(ctx.bobToken)).body.data.preferences, {});
});

test('checks the shape, ignores unknown keys, and never appears on the user', async () => {
  for (const body of [{}, { themeMode: 'sepia' }, { sidebarWidth: 5000 }, { theme: '<script>' }, { dashboardLayout: [{ size: 6 }] }, { tableColumns: { leads: { widths: { title: 'wide' } } } }, { isSuperAdmin: true }]) {
    assert.equal((await put(ctx.annToken, body)).status, 422, JSON.stringify(body));
  }
  const res = await put(ctx.annToken, { fontSize: 'small', roleId: 'x', isSuperAdmin: true });
  assert.equal(res.status, 200);
  assert.ok(!('roleId' in res.body.data.preferences) && !('isSuperAdmin' in res.body.data.preferences));

  const me = await request(app).get('/api/v1/auth/me').set(as(ctx.annToken));
  assert.ok(!JSON.stringify(me.body).includes('preferences'));
  // Saving preferences is not an edit of the user.
  const before = (await User.findById(ctx.ann._id)).updatedAt.getTime();
  await put(ctx.annToken, { fontSize: 'medium' });
  assert.equal((await User.findById(ctx.ann._id)).updatedAt.getTime(), before);
});
