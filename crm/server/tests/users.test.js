import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_users');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: User } = await import('../src/models/User.js');
const { default: Department } = await import('../src/models/Department.js');
const { allKeys, createRole, createUser, defaultRole, loginAs, PASSWORD, seedRbac, superAdminRole } =
  await import('./helpers/fixtures.js');

const API = '/api/v1/users';
const SECRET_FIELDS = ['password', 'passwordHash', 'refreshTokenHash', 'tokenVersion', 'deletedAt'];

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });

function assertNoSecrets(user) {
  for (const field of SECRET_FIELDS) assert.equal(field in user, false, `${field} leaked`);
}

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await User.init();

  await seedRbac();

  ctx.adminRole = await superAdminRole();
  ctx.userRole = await defaultRole();
  // A "user manager": every users.* permission, but not full access.
  ctx.managerRole = await createRole(await allKeys('users'), 'User Manager');
  ctx.readerRole = await createRole(['users.read'], 'Reader');
  ctx.department = await Department.create({ name: 'Sales' });

  ctx.admin = await createUser(ctx.adminRole, { firstName: 'Ada', lastName: 'Admin' });
  ctx.manager = await createUser(ctx.managerRole, { firstName: 'Mona', lastName: 'Manager' });
  ctx.reader = await createUser(ctx.readerRole, { firstName: 'Rita', lastName: 'Reader' });
  ctx.plain = await createUser(ctx.userRole, { firstName: 'Paul', lastName: 'Plain' });

  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.managerToken = await loginAs(app, ctx.manager);
  ctx.readerToken = await loginAs(app, ctx.reader);
  ctx.plainToken = await loginAs(app, ctx.plain);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every users endpoint requires authentication', async () => {
  const id = ctx.plain.id;
  const calls = [
    request(app).get(API),
    request(app).post(API).send({}),
    request(app).get(`${API}/${id}`),
    request(app).put(`${API}/${id}`).send({}),
    request(app).patch(`${API}/${id}/status`).send({}),
    request(app).patch(`${API}/${id}/reset-password`).send({}),
    request(app).delete(`${API}/${id}`),
  ];
  for (const res of await Promise.all(calls)) assert.equal(res.status, 401);
});

test('a user without permissions is refused on every endpoint', async () => {
  const id = ctx.reader.id;
  const h = as(ctx.plainToken);
  const calls = [
    request(app).get(API).set(h),
    request(app).post(API).set(h).send({}),
    request(app).get(`${API}/${id}`).set(h),
    request(app).put(`${API}/${id}`).set(h).send({ firstName: 'X' }),
    request(app).patch(`${API}/${id}/status`).set(h).send({ status: 'inactive' }),
    request(app).patch(`${API}/${id}/reset-password`).set(h).send({ newPassword: PASSWORD }),
    request(app).delete(`${API}/${id}`).set(h),
  ];
  for (const res of await Promise.all(calls)) assert.equal(res.status, 403);
});

test('read-only permission allows reading but not writing', async () => {
  const h = as(ctx.readerToken);
  const list = await request(app).get(API).set(h);
  const create = await request(app).post(API).set(h).send({});
  const update = await request(app).put(`${API}/${ctx.plain.id}`).set(h).send({ firstName: 'X' });

  assert.equal(list.status, 200);
  assert.equal(create.status, 403);
  assert.equal(update.status, 403);
});

test('create: validates input and never accepts permissions directly', async () => {
  const h = as(ctx.adminToken);
  const valid = { firstName: 'Nina', lastName: 'New', email: 'nina@example.com', password: PASSWORD };

  const weak = await request(app).post(API).set(h).send({ ...valid, password: 'weak' });
  const badPhone = await request(app).post(API).set(h).send({ ...valid, phone: 'abc' });
  const withPerms = await request(app).post(API).set(h).send({ ...valid, permissions: ['*'] });
  const badRole = await request(app)
    .post(API)
    .set(h)
    .send({ ...valid, roleId: new mongoose.Types.ObjectId().toString() });
  const duplicate = await request(app).post(API).set(h).send({ ...valid, email: ctx.plain.email });

  assert.equal(weak.status, 422);
  assert.equal(badPhone.status, 422);
  assert.equal(withPerms.status, 422);
  assert.equal(badRole.status, 400);
  assert.equal(duplicate.status, 409);
  assert.equal(await User.countDocuments({ email: valid.email }), 0);
});

test('create: stores the user with references and returns no secrets', async () => {
  const res = await request(app).post(API).set(as(ctx.adminToken)).send({
    firstName: 'Nina',
    lastName: 'New',
    email: 'Nina@Example.com',
    password: PASSWORD,
    phone: '+1 (555) 010-9999',
    roleId: ctx.readerRole.id,
    departmentId: ctx.department.id,
    designation: 'Account Executive',
    profileImage: 'https://example.com/nina.png',
  });

  assert.equal(res.status, 201);
  const { user } = res.body.data;
  assert.equal(user.email, 'nina@example.com');
  assert.equal(user.fullName, 'Nina New');
  assert.equal(user.status, 'active');
  assert.equal(user.roleId, ctx.readerRole.id);
  assert.equal(user.role.id, ctx.readerRole.id);
  assert.equal(user.role.name, 'Reader');
  assert.equal('_id' in user.role, false);
  assert.equal(user.departmentId, ctx.department.id);
  assert.equal(user.department.name, 'Sales');
  assert.equal(user.createdBy, ctx.admin.id);
  assert.equal(user.createdByUser.email, ctx.admin.email);
  assertNoSecrets(user);
  assertNoSecrets(user.createdByUser);
  ctx.nina = user;

  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nina@example.com', password: PASSWORD });
  assert.equal(login.status, 200);
});

test('create: omitting roleId assigns the default role', async () => {
  const res = await request(app).post(API).set(as(ctx.adminToken)).send({
    firstName: 'Dan',
    lastName: 'Default',
    email: 'dan@example.com',
    password: PASSWORD,
  });

  assert.equal(res.status, 201);
  assert.equal(res.body.data.user.roleId, ctx.userRole.id);
  assert.equal(res.body.data.user.role.isDefault, true);
});

test('list: pagination, search, filters and sorting', async () => {
  const h = as(ctx.adminToken);

  const page1 = await request(app).get(`${API}?page=1&limit=2&sortBy=firstName&sortOrder=asc`).set(h);
  assert.equal(page1.status, 200);
  assert.equal(page1.body.data.users.length, 2);
  assert.deepEqual(page1.body.data.pagination, { page: 1, limit: 2, total: 6, totalPages: 3 });
  assert.deepEqual(page1.body.data.users.map((u) => u.firstName), ['Ada', 'Dan']);
  page1.body.data.users.forEach(assertNoSecrets);

  const desc = await request(app).get(`${API}?limit=1&sortBy=firstName&sortOrder=desc`).set(h);
  assert.equal(desc.body.data.users[0].firstName, 'Rita');

  const search = await request(app).get(`${API}?search=nina%20new`).set(h);
  assert.deepEqual(search.body.data.users.map((u) => u.email), ['nina@example.com']);

  const byDesignation = await request(app).get(`${API}?search=executive`).set(h);
  assert.equal(byDesignation.body.data.pagination.total, 1);

  // Regex metacharacters are treated literally, not as a pattern.
  const regex = await request(app).get(`${API}?search=.*`).set(h);
  assert.equal(regex.body.data.pagination.total, 0);

  const byRole = await request(app).get(`${API}?roleId=${ctx.readerRole.id}`).set(h);
  assert.equal(byRole.body.data.pagination.total, 2);

  await User.updateOne({ _id: ctx.plain.id }, { status: 'inactive' });
  const inactive = await request(app).get(`${API}?status=inactive`).set(h);
  assert.deepEqual(inactive.body.data.users.map((u) => u.id), [ctx.plain.id]);
  await User.updateOne({ _id: ctx.plain.id }, { status: 'active' });

  const badSort = await request(app).get(`${API}?sortBy=passwordHash`).set(h);
  const badLimit = await request(app).get(`${API}?limit=1000`).set(h);
  const badRole = await request(app).get(`${API}?roleId=nope`).set(h);
  assert.equal(badSort.status, 422);
  assert.equal(badLimit.status, 422);
  assert.equal(badRole.status, 422);
});

test('get: returns one user, 404 for unknown, 422 for a malformed id', async () => {
  const h = as(ctx.adminToken);
  const ok = await request(app).get(`${API}/${ctx.nina.id}`).set(h);
  const missing = await request(app).get(`${API}/${new mongoose.Types.ObjectId()}`).set(h);
  const malformed = await request(app).get(`${API}/not-an-id`).set(h);

  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.user.email, 'nina@example.com');
  assertNoSecrets(ok.body.data.user);
  assert.equal(missing.status, 404);
  assert.equal(malformed.status, 422);
});

test('update: changes profile fields, clears optional ones, rejects status/password', async () => {
  const h = as(ctx.adminToken);
  const url = `${API}/${ctx.nina.id}`;

  const res = await request(app)
    .put(url)
    .set(h)
    .send({ firstName: 'Nina-Marie', designation: 'Senior AE', phone: '', departmentId: null });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.firstName, 'Nina-Marie');
  assert.equal(res.body.data.user.designation, 'Senior AE');
  assert.equal('phone' in res.body.data.user, false);
  assert.equal('departmentId' in res.body.data.user, false);
  assert.equal(res.body.data.user.lastName, 'New', 'omitted fields are left unchanged');

  const status = await request(app).put(url).set(h).send({ status: 'inactive' });
  const password = await request(app).put(url).set(h).send({ password: PASSWORD });
  const perms = await request(app).put(url).set(h).send({ permissions: ['*'] });
  const empty = await request(app).put(url).set(h).send({});
  const takenEmail = await request(app).put(url).set(h).send({ email: ctx.plain.email });
  for (const r of [status, password, perms, empty]) assert.equal(r.status, 422);
  assert.equal(takenEmail.status, 409);
});

test('privilege escalation is blocked for a non-administrator manager', async () => {
  const h = as(ctx.managerToken);

  // Cannot hand out the administrator role - to others or on create.
  const promote = await request(app)
    .put(`${API}/${ctx.plain.id}`)
    .set(h)
    .send({ roleId: ctx.adminRole.id });
  const createAdmin = await request(app).post(API).set(h).send({
    firstName: 'Evil',
    lastName: 'Admin',
    email: 'evil@example.com',
    password: PASSWORD,
    roleId: ctx.adminRole.id,
  });
  assert.equal(promote.status, 403);
  assert.equal(createAdmin.status, 403);

  // Cannot change their own role.
  const selfRole = await request(app)
    .put(`${API}/${ctx.manager.id}`)
    .set(h)
    .send({ roleId: ctx.readerRole.id });
  assert.equal(selfRole.status, 403);

  // Cannot touch an administrator at all - including taking over the account
  // by resetting its password.
  const admin = `${API}/${ctx.admin.id}`;
  const edit = await request(app).put(admin).set(h).send({ email: 'hijack@example.com' });
  const reset = await request(app).patch(`${admin}/reset-password`).set(h).send({ newPassword: 'H1jack!Passw0rd' });
  const deactivate = await request(app).patch(`${admin}/status`).set(h).send({ status: 'inactive' });
  const remove = await request(app).delete(admin).set(h);
  for (const r of [edit, reset, deactivate, remove]) assert.equal(r.status, 403);

  const stillAdmin = await request(app).get('/api/v1/auth/me').set(as(ctx.adminToken));
  assert.equal(stillAdmin.status, 200);
  assert.equal(stillAdmin.body.data.user.email, ctx.admin.email);

  // But can assign a role that carries no more access than their own.
  const allowed = await request(app)
    .put(`${API}/${ctx.plain.id}`)
    .set(h)
    .send({ roleId: ctx.readerRole.id });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.data.user.role.name, 'Reader');
});

test('assigning roles needs users.assignRole even with users.update', async () => {
  const editorRole = await createRole(['users.read', 'users.update', 'users.create'], 'Editor');
  const editor = await createUser(editorRole);
  const h = as(await loginAs(app, editor));

  const rename = await request(app).put(`${API}/${ctx.plain.id}`).set(h).send({ designation: 'Rep' });
  const assign = await request(app).put(`${API}/${ctx.plain.id}`).set(h).send({ roleId: ctx.userRole.id });
  const createWithRole = await request(app).post(API).set(h).send({
    firstName: 'Role',
    lastName: 'Picker',
    email: 'picker@example.com',
    password: PASSWORD,
    roleId: ctx.readerRole.id,
  });

  assert.equal(rename.status, 200);
  assert.equal(assign.status, 403);
  assert.equal(createWithRole.status, 403);
});

test('a role change takes effect immediately and revokes old tokens', async () => {
  // ctx.plain was moved to Reader above; their pre-change token must be dead.
  const old = await request(app).get(API).set(as(ctx.plainToken));
  assert.equal(old.status, 401);

  ctx.plainToken = await loginAs(app, ctx.plain);
  const fresh = await request(app).get(API).set(as(ctx.plainToken));
  assert.equal(fresh.status, 200);
});

test('status: deactivating blocks login and existing tokens; reactivating restores access', async () => {
  const h = as(ctx.adminToken);
  const url = `${API}/${ctx.plain.id}/status`;

  const self = await request(app).patch(`${API}/${ctx.admin.id}/status`).set(h).send({ status: 'inactive' });
  const invalid = await request(app).patch(url).set(h).send({ status: 'banned' });
  assert.equal(self.status, 403);
  assert.equal(invalid.status, 422);

  const off = await request(app).patch(url).set(h).send({ status: 'inactive' });
  assert.equal(off.status, 200);
  assert.equal(off.body.data.user.status, 'inactive');

  const tokenAfter = await request(app).get('/api/v1/auth/me').set(as(ctx.plainToken));
  const loginAfter = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: ctx.plain.email, password: PASSWORD });
  assert.equal(tokenAfter.status, 401);
  assert.equal(loginAfter.status, 403);

  const on = await request(app).patch(url).set(h).send({ status: 'active' });
  assert.equal(on.body.data.user.status, 'active');
  ctx.plainToken = await loginAs(app, ctx.plain);
  assert.ok(ctx.plainToken);
});

test('reset-password: sets a new password and signs the user out', async () => {
  const h = as(ctx.adminToken);
  const url = `${API}/${ctx.plain.id}/reset-password`;
  const newPassword = 'R3set!Passw0rd';

  const weak = await request(app).patch(url).set(h).send({ newPassword: 'weak' });
  const self = await request(app).patch(`${API}/${ctx.admin.id}/reset-password`).set(h).send({ newPassword });
  assert.equal(weak.status, 422);
  assert.equal(self.status, 403);

  const res = await request(app).patch(url).set(h).send({ newPassword });
  assert.equal(res.status, 200);
  assert.equal(res.body.data, null);

  const oldToken = await request(app).get('/api/v1/auth/me').set(as(ctx.plainToken));
  const oldLogin = await request(app).post('/api/v1/auth/login').send({ email: ctx.plain.email, password: PASSWORD });
  const newLogin = await request(app).post('/api/v1/auth/login').send({ email: ctx.plain.email, password: newPassword });
  assert.equal(oldToken.status, 401);
  assert.equal(oldLogin.status, 401);
  assert.equal(newLogin.status, 200);
  ctx.plainToken = newLogin.body.data.accessToken;
});

test('delete: soft-deletes, hides the user everywhere and keeps the email reserved', async () => {
  const h = as(ctx.adminToken);

  const self = await request(app).delete(`${API}/${ctx.admin.id}`).set(h);
  assert.equal(self.status, 403);

  const res = await request(app).delete(`${API}/${ctx.plain.id}`).set(h);
  assert.equal(res.status, 200);

  const get = await request(app).get(`${API}/${ctx.plain.id}`).set(h);
  const again = await request(app).delete(`${API}/${ctx.plain.id}`).set(h);
  const list = await request(app).get(`${API}?search=${ctx.plain.email}`).set(h);
  const token = await request(app).get('/api/v1/auth/me').set(as(ctx.plainToken));
  const login = await request(app).post('/api/v1/auth/login').send({ email: ctx.plain.email, password: 'R3set!Passw0rd' });
  assert.equal(get.status, 404);
  assert.equal(again.status, 404);
  assert.equal(list.body.data.pagination.total, 0);
  assert.equal(token.status, 401);
  assert.equal(login.status, 401);

  const stored = await User.findById(ctx.plain.id).setOptions({ withDeleted: true });
  assert.ok(stored.deletedAt instanceof Date, 'record is kept');

  const reuse = await request(app).post(API).set(h).send({
    firstName: 'Re',
    lastName: 'Use',
    email: ctx.plain.email,
    password: PASSWORD,
  });
  assert.equal(reuse.status, 409);
  assert.match(reuse.body.message, /deleted user/);
});

test('an inactive role cannot be assigned to a user', async () => {
  const retired = await createRole(['users.read'], 'Retired');
  retired.status = 'inactive';
  await retired.save();

  const res = await request(app)
    .put(`${API}/${ctx.nina.id}`)
    .set(as(ctx.adminToken))
    .send({ roleId: retired.id });
  assert.equal(res.status, 400);
});

test('lookups: roles and departments are listed for user screens', async () => {
  const roles = await request(app).get('/api/v1/roles').set(as(ctx.readerToken));
  const departments = await request(app).get('/api/v1/departments').set(as(ctx.readerToken));
  const denied = await request(app).get('/api/v1/roles').set(as(ctx.managerToken.slice(0, -2) + 'xx'));

  assert.equal(roles.status, 200, 'users.read is enough to list roles for the dropdown');
  assert.ok(roles.body.data.roles.some((r) => r.isSuperAdmin && r.isSystem));
  assert.equal(departments.status, 200);
  assert.deepEqual(departments.body.data.departments.map((d) => d.name), ['Sales']);
  assert.equal(denied.status, 401);
});
