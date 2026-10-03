import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

// Requires a reachable MongoDB (see MONGODB_TEST_URI_BASE in tests/helpers/env.js).
setTestEnv('crm_test_auth', { ALLOW_PUBLIC_REGISTRATION: 'true' });

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: User } = await import('../src/models/User.js');
const { seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const API = '/api/v1/auth';
const person = { firstName: 'Flow', lastName: 'User' };
const credentials = { email: 'flow.user@example.com', password: 'Str0ng!Passw0rd' };
const newPassword = 'N3w!Passw0rd#2';
const SECRET_FIELDS = ['password', 'passwordHash', 'refreshTokenHash', 'tokenVersion'];

const session = {};
const bearer = (token) => ({ Authorization: `Bearer ${token}` });

function assertNoSecrets(user) {
  for (const field of SECRET_FIELDS) assert.equal(field in user, false, `${field} leaked`);
}

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await User.init();
  await seedRbac();
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('register rejects weak passwords with field errors', async () => {
  const res = await request(app)
    .post(`${API}/register`)
    .send({ ...person, email: credentials.email, password: 'weak' });

  assert.equal(res.status, 422);
  assert.equal(res.body.success, false);
  assert.ok(res.body.errors.some((e) => e.field === 'password'));
});

test('register creates a user without exposing secrets', async () => {
  const res = await request(app)
    .post(`${API}/register`)
    .send({ ...person, email: 'Flow.User@Example.com', password: credentials.password });

  assert.equal(res.status, 201);
  assert.equal(res.body.data.user.email, credentials.email);
  assert.equal(res.body.data.user.fullName, 'Flow User');
  assert.equal(res.body.data.user.role.isDefault, true);
  assert.deepEqual(res.body.data.user.role.permissions, []);
  assert.deepEqual(res.body.data.user.permissions, []);
  assert.equal(res.body.data.user.status, 'active');
  assertNoSecrets(res.body.data.user);

  const stored = await User.findOne({ email: credentials.email }).select('+passwordHash');
  assert.notEqual(stored.passwordHash, credentials.password);
  assert.match(stored.passwordHash, /^\$2[aby]\$/);
});

test('register rejects a duplicate email', async () => {
  const res = await request(app)
    .post(`${API}/register`)
    .send({ ...person, email: credentials.email, password: credentials.password });

  assert.equal(res.status, 409);
});

test('sign-up cannot choose a role or permissions', async () => {
  const adminRole = await superAdminRole();
  const base = { ...person, email: 'sneaky@example.com', password: credentials.password };

  for (const extra of [{ roleId: adminRole.id }, { role: 'admin' }, { permissions: ['*'] }]) {
    const res = await request(app).post(`${API}/register`).send({ ...base, ...extra });
    assert.equal(res.status, 422, JSON.stringify(extra));
  }
  assert.equal(await User.countDocuments({ email: base.email }), 0);
});

test('login gives the same error for a wrong password and an unknown email', async () => {
  const wrong = await request(app)
    .post(`${API}/login`)
    .send({ email: credentials.email, password: 'Wrong!Passw0rd' });
  const unknown = await request(app)
    .post(`${API}/login`)
    .send({ email: 'nobody@example.com', password: credentials.password });

  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.message, unknown.body.message);
});

test('login returns the user and both tokens', async () => {
  const res = await request(app).post(`${API}/login`).send(credentials);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.user.email, credentials.email);
  assert.equal(typeof res.body.data.accessToken, 'string');
  assert.equal(typeof res.body.data.refreshToken, 'string');
  assertNoSecrets(res.body.data.user);

  Object.assign(session, res.body.data);
});

test('me requires a valid access token', async () => {
  const anonymous = await request(app).get(`${API}/me`);
  const garbage = await request(app).get(`${API}/me`).set(bearer('not-a-token'));
  const withRefresh = await request(app).get(`${API}/me`).set(bearer(session.refreshToken));
  const ok = await request(app).get(`${API}/me`).set(bearer(session.accessToken));

  assert.equal(anonymous.status, 401);
  assert.equal(garbage.status, 401);
  assert.equal(withRefresh.status, 401, 'a refresh token must not work as an access token');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.user.email, credentials.email);
  assertNoSecrets(ok.body.data.user);
});

test('refresh-token rotates the pair and the old refresh token stops working', async () => {
  const old = session.refreshToken;
  const res = await request(app).post(`${API}/refresh-token`).send({ refreshToken: old });

  assert.equal(res.status, 200);
  assert.notEqual(res.body.data.refreshToken, old);
  Object.assign(session, res.body.data);

  const replay = await request(app).post(`${API}/refresh-token`).send({ refreshToken: old });
  assert.equal(replay.status, 401);

  const me = await request(app).get(`${API}/me`).set(bearer(session.accessToken));
  assert.equal(me.status, 200);
});

test('change-password validates, then revokes the old tokens', async () => {
  const wrongCurrent = await request(app)
    .post(`${API}/change-password`)
    .set(bearer(session.accessToken))
    .send({ currentPassword: 'Wrong!Passw0rd', newPassword });
  assert.equal(wrongCurrent.status, 400);

  const same = await request(app)
    .post(`${API}/change-password`)
    .set(bearer(session.accessToken))
    .send({ currentPassword: credentials.password, newPassword: credentials.password });
  assert.equal(same.status, 422);

  const before = { ...session };
  const res = await request(app)
    .post(`${API}/change-password`)
    .set(bearer(session.accessToken))
    .send({ currentPassword: credentials.password, newPassword });
  assert.equal(res.status, 200);
  Object.assign(session, res.body.data);

  const oldAccess = await request(app).get(`${API}/me`).set(bearer(before.accessToken));
  const oldRefresh = await request(app)
    .post(`${API}/refresh-token`)
    .send({ refreshToken: before.refreshToken });
  const newAccess = await request(app).get(`${API}/me`).set(bearer(session.accessToken));
  assert.equal(oldAccess.status, 401);
  assert.equal(oldRefresh.status, 401);
  assert.equal(newAccess.status, 200);

  const oldLogin = await request(app).post(`${API}/login`).send(credentials);
  const newLogin = await request(app)
    .post(`${API}/login`)
    .send({ email: credentials.email, password: newPassword });
  assert.equal(oldLogin.status, 401);
  assert.equal(newLogin.status, 200);
  Object.assign(session, newLogin.body.data);
});

test('logout revokes the access and refresh tokens', async () => {
  const res = await request(app).post(`${API}/logout`).set(bearer(session.accessToken));
  assert.equal(res.status, 200);

  const me = await request(app).get(`${API}/me`).set(bearer(session.accessToken));
  const refresh = await request(app)
    .post(`${API}/refresh-token`)
    .send({ refreshToken: session.refreshToken });
  assert.equal(me.status, 401);
  assert.equal(refresh.status, 401);
});

test('an inactive account cannot log in or keep using its token', async () => {
  const login = await request(app)
    .post(`${API}/login`)
    .send({ email: credentials.email, password: newPassword });
  assert.equal(login.status, 200);

  await User.updateOne({ email: credentials.email }, { status: 'inactive' });

  const me = await request(app).get(`${API}/me`).set(bearer(login.body.data.accessToken));
  const again = await request(app)
    .post(`${API}/login`)
    .send({ email: credentials.email, password: newPassword });
  const refresh = await request(app)
    .post(`${API}/refresh-token`)
    .send({ refreshToken: login.body.data.refreshToken });

  assert.equal(me.status, 403);
  assert.equal(again.status, 403);
  assert.equal(refresh.status, 403);
});
