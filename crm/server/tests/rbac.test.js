import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_rbac');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Permission } = await import('../src/models/Permission.js');
const { default: Role } = await import('../src/models/Role.js');
const { default: User } = await import('../src/models/User.js');
const { syncRbac, verifyDeclaredPermissions } = await import('../src/services/seed.service.js');
const { allKeys, createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } =
  await import('./helpers/fixtures.js');

const ROLES = '/api/v1/roles';
const PERMS = '/api/v1/permissions';
const ME = '/api/v1/auth/me';

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const keysOf = (role) => role.permissions.map((p) => p.key).sort();

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await User.init();
  await seedRbac();

  ctx.admin = await createUser(await superAdminRole());
  ctx.plain = await createUser(await defaultRole());
  // Can do everything with roles, but holds no users.* permission.
  ctx.roleManagerRole = await createRole(
    [...(await allKeys('roles')), 'permissions.read'],
    'Role Manager'
  );
  ctx.roleManager = await createUser(ctx.roleManagerRole);

  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.roleManagerToken = await loginAs(app, ctx.roleManager);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

// --- seed ---------------------------------------------------------------------

test('seed: catalogue and system roles exist, and every key used in code is in the database', async () => {
  assert.ok((await Permission.countDocuments()) > 0);
  assert.ok(await Permission.exists({ key: 'leads.create', module: 'leads', action: 'create' }));
  assert.equal(await Role.countDocuments({ isSuperAdmin: true }), 1);
  assert.equal(await Role.countDocuments({ isDefault: true }), 1);

  assert.deepEqual(await verifyDeclaredPermissions(), []);
});

test('seed: re-running never duplicates anything or undoes edits made in the app', async () => {
  const admin = await superAdminRole();
  const fallback = await defaultRole();
  await Role.updateOne({ _id: admin._id }, { name: 'Owner' });
  const read = await Permission.findOne({ key: 'leads.read' });
  await Role.updateOne({ _id: fallback._id }, { permissions: [read._id] });
  const before = { permissions: await Permission.countDocuments(), roles: await Role.countDocuments() };

  await syncRbac();

  assert.equal(await Permission.countDocuments(), before.permissions);
  assert.equal(await Role.countDocuments(), before.roles);
  assert.equal((await superAdminRole()).name, 'Owner', 'a renamed role stays renamed');
  assert.equal((await defaultRole()).permissions.length, 1, 'edited permissions are kept');

  await Role.updateOne({ _id: fallback._id }, { permissions: [] });
});

// --- 1. no permission -> 403, and the backend protects every endpoint -----------

test('every roles/permissions endpoint needs a token (401) and the right permission (403)', async () => {
  const id = ctx.roleManagerRole.id;
  const calls = (headers) => [
    request(app).get(ROLES).set(headers),
    request(app).post(ROLES).set(headers).send({ name: 'Nope' }),
    request(app).get(`${ROLES}/${id}`).set(headers),
    request(app).put(`${ROLES}/${id}`).set(headers).send({ name: 'Nope' }),
    request(app).put(`${ROLES}/${id}/permissions`).set(headers).send({ permissions: [] }),
    request(app).delete(`${ROLES}/${id}`).set(headers),
    request(app).get(PERMS).set(headers),
  ];

  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) {
    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
  }
  assert.equal(await Role.countDocuments({ name: 'Nope' }), 0);
});

test('permissions are checked one by one, not all-or-nothing', async () => {
  const reader = await createUser(await createRole(['roles.read'], 'Role Reader'));
  const h = as(await loginAs(app, reader));
  const id = ctx.roleManagerRole.id;

  assert.equal((await request(app).get(ROLES).set(h)).status, 200);
  assert.equal((await request(app).get(`${ROLES}/${id}`).set(h)).status, 200);
  assert.equal((await request(app).get(PERMS).set(h)).status, 200, 'roles.read may read the catalogue');
  assert.equal((await request(app).post(ROLES).set(h).send({ name: 'X1' })).status, 403);
  assert.equal((await request(app).put(`${ROLES}/${id}`).set(h).send({ name: 'X2' })).status, 403);
  assert.equal((await request(app).delete(`${ROLES}/${id}`).set(h)).status, 403);
});

// --- 2. with permission -> success ----------------------------------------------

test('permissions: lists the catalogue, filterable by module and search', async () => {
  const h = as(ctx.roleManagerToken);
  const all = await request(app).get(PERMS).set(h);
  const leads = await request(app).get(`${PERMS}?module=leads`).set(h);
  const search = await request(app).get(`${PERMS}?search=assign`).set(h);

  assert.equal(all.status, 200);
  assert.equal(all.body.data.permissions.length, await Permission.countDocuments());
  assert.deepEqual(Object.keys(all.body.data.permissions[0]).sort(), [
    'action',
    'createdAt',
    'description',
    'id',
    'key',
    'module',
    'updatedAt',
  ]);
  assert.deepEqual(
    leads.body.data.permissions.map((p) => p.key),
    ['leads.assign', 'leads.convert', 'leads.create', 'leads.delete', 'leads.email', 'leads.read', 'leads.update']
  );
  assert.deepEqual(search.body.data.permissions.map((p) => p.key).sort(), [
    'leads.assign',
    'opportunities.assign',
    'roles.assignPermissions',
    'tickets.assign',
    'users.assignRole',
  ]);
});

test('roles: create, read, update, list', async () => {
  const h = as(ctx.adminToken);

  const created = await request(app)
    .post(ROLES)
    .set(h)
    .send({ name: 'Sales Rep', description: 'Works leads', permissions: ['leads.read', 'leads.create'] });
  assert.equal(created.status, 201);
  const { role } = created.body.data;
  assert.equal(role.name, 'Sales Rep');
  assert.equal(role.status, 'active');
  assert.equal(role.isSystem, false);
  assert.equal(role.userCount, 0);
  assert.deepEqual(keysOf(role), ['leads.create', 'leads.read']);
  assert.equal('_id' in role, false);
  ctx.salesRole = role;

  const got = await request(app).get(`${ROLES}/${role.id}`).set(h);
  assert.equal(got.status, 200);
  assert.deepEqual(keysOf(got.body.data.role), ['leads.create', 'leads.read']);

  const updated = await request(app)
    .put(`${ROLES}/${role.id}`)
    .set(h)
    .send({ name: 'Sales Representative', description: '' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.role.name, 'Sales Representative');
  assert.equal('description' in updated.body.data.role, false);
  assert.deepEqual(keysOf(updated.body.data.role), ['leads.create', 'leads.read'], 'permissions untouched');

  const list = await request(app).get(`${ROLES}?search=sales&sortBy=name&sortOrder=asc`).set(h);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.data.roles.map((r) => r.name), ['Sales Representative']);
  assert.deepEqual(list.body.data.pagination, { page: 1, limit: 20, total: 1, totalPages: 1 });

  const withCount = await request(app).get(`${ROLES}?search=Role Manager`).set(h);
  assert.equal(withCount.body.data.roles[0].userCount, 1);
});

test('roles: input is validated', async () => {
  const h = as(ctx.adminToken);
  const id = ctx.salesRole.id;

  const noName = await request(app).post(ROLES).set(h).send({ description: 'x' });
  const duplicate = await request(app).post(ROLES).set(h).send({ name: 'sales representative' });
  const unknownKey = await request(app).post(ROLES).set(h).send({ name: 'Ghost', permissions: ['leads.fly'] });
  const flag = await request(app).post(ROLES).set(h).send({ name: 'Sneaky', isSuperAdmin: true });
  const flagOnUpdate = await request(app).put(`${ROLES}/${id}`).set(h).send({ isSuperAdmin: true });
  const permsOnUpdate = await request(app).put(`${ROLES}/${id}`).set(h).send({ permissions: ['users.delete'] });
  const badStatus = await request(app).put(`${ROLES}/${id}`).set(h).send({ status: 'retired' });
  const notArray = await request(app).put(`${ROLES}/${id}/permissions`).set(h).send({ permissions: 'leads.read' });
  const missing = await request(app).get(`${ROLES}/${new mongoose.Types.ObjectId()}`).set(h);
  const malformed = await request(app).get(`${ROLES}/nope`).set(h);

  assert.equal(noName.status, 422);
  assert.equal(duplicate.status, 409, 'names are unique regardless of case');
  assert.equal(unknownKey.status, 400);
  assert.match(unknownKey.body.errors[0].message, /leads\.fly/);
  for (const r of [flag, flagOnUpdate, permsOnUpdate, badStatus, notArray, malformed]) assert.equal(r.status, 422);
  assert.equal(missing.status, 404);
  assert.equal(await Role.countDocuments({ name: { $in: ['Ghost', 'Sneaky'] } }), 0);
  assert.equal(await Role.countDocuments({ isSuperAdmin: true }), 1);
});

// --- permissions are resolved against the database on every request ---------------

test('granting and revoking a permission takes effect immediately, on the same token', async () => {
  const role = await createRole([], 'Dynamic');
  const user = await createUser(role);
  const token = await loginAs(app, user);
  const call = () => request(app).get('/api/v1/users').set(as(token));
  const grant = (permissions) =>
    request(app).put(`${ROLES}/${role.id}/permissions`).set(as(ctx.adminToken)).send({ permissions });

  assert.equal((await call()).status, 403);

  const granted = await grant(['users.read']);
  assert.equal(granted.status, 200);
  assert.deepEqual(keysOf(granted.body.data.role), ['users.read']);
  assert.equal((await call()).status, 200, 'no new login needed');
  assert.deepEqual((await request(app).get(ME).set(as(token))).body.data.user.permissions, ['users.read']);

  assert.equal((await grant([])).status, 200);
  assert.equal((await call()).status, 403);
  assert.deepEqual((await request(app).get(ME).set(as(token))).body.data.user.permissions, []);
});

test('an inactive role grants nothing; reactivating restores it', async () => {
  const role = await createRole(['users.read'], 'Switchable');
  const token = await loginAs(app, await createUser(role));
  const call = () => request(app).get('/api/v1/users').set(as(token));
  const setStatus = (status) => request(app).put(`${ROLES}/${role.id}`).set(as(ctx.adminToken)).send({ status });

  assert.equal((await call()).status, 200);
  assert.equal((await setStatus('inactive')).status, 200);
  assert.equal((await call()).status, 403);
  assert.deepEqual((await request(app).get(ME).set(as(token))).body.data.user.permissions, []);
  assert.equal((await setStatus('active')).status, 200);
  assert.equal((await call()).status, 200);
});

test('the full-access role automatically holds permissions added later', async () => {
  const before = (await request(app).get(ME).set(as(ctx.adminToken))).body.data.user.permissions;
  assert.equal(before.length, await Permission.countDocuments());
  assert.equal(before.includes('invoices.read'), false);

  await Permission.create({ module: 'invoices', action: 'read', key: 'invoices.read' });
  const after = (await request(app).get(ME).set(as(ctx.adminToken))).body.data.user.permissions;
  assert.equal(after.includes('invoices.read'), true);

  await Permission.deleteOne({ key: 'invoices.read' });
});

// --- role management cannot be used to gain access --------------------------------

test('a role manager cannot grant permissions they do not hold', async () => {
  const h = as(ctx.roleManagerToken);
  const target = await createRole([], 'Target');

  const escalate = await request(app)
    .put(`${ROLES}/${target.id}/permissions`)
    .set(h)
    .send({ permissions: ['roles.read', 'users.delete'] });
  const createPowerful = await request(app)
    .post(ROLES)
    .set(h)
    .send({ name: 'Backdoor', permissions: ['users.resetPassword'] });
  assert.equal(escalate.status, 403);
  assert.equal(createPowerful.status, 403);
  assert.equal(await Role.countDocuments({ name: 'Backdoor' }), 0);

  const allowed = await request(app)
    .put(`${ROLES}/${target.id}/permissions`)
    .set(h)
    .send({ permissions: ['roles.read', 'permissions.read'] });
  assert.equal(allowed.status, 200);
  assert.deepEqual(keysOf(allowed.body.data.role), ['permissions.read', 'roles.read']);
});

test('a role manager cannot edit their own role or a role with more access', async () => {
  const h = as(ctx.roleManagerToken);
  const own = ctx.roleManagerRole.id;
  const admin = (await superAdminRole()).id;
  const stronger = (await createRole(['users.delete'], 'Stronger')).id;

  const ownPerms = await request(app).put(`${ROLES}/${own}/permissions`).set(h).send({ permissions: [] });
  const ownName = await request(app).put(`${ROLES}/${own}`).set(h).send({ name: 'Renamed' });
  const ownDelete = await request(app).delete(`${ROLES}/${own}`).set(h);
  for (const r of [ownPerms, ownName, ownDelete]) assert.equal(r.status, 403);

  const strip = await request(app).put(`${ROLES}/${stronger}/permissions`).set(h).send({ permissions: [] });
  const disable = await request(app).put(`${ROLES}/${stronger}`).set(h).send({ status: 'inactive' });
  const remove = await request(app).delete(`${ROLES}/${stronger}`).set(h);
  const renameAdmin = await request(app).put(`${ROLES}/${admin}`).set(h).send({ name: 'Mine' });
  for (const r of [strip, disable, remove, renameAdmin]) assert.equal(r.status, 403);

  assert.equal((await Role.findById(stronger)).permissions.length, 1);
});

test('creating a role with permissions also needs roles.assignPermissions', async () => {
  const creator = await createUser(await createRole(['roles.create', 'roles.read'], 'Role Creator'));
  const h = as(await loginAs(app, creator));

  const empty = await request(app).post(ROLES).set(h).send({ name: 'Empty Shell' });
  const withPerms = await request(app).post(ROLES).set(h).send({ name: 'Loaded', permissions: ['roles.read'] });

  assert.equal(empty.status, 201);
  assert.equal(withPerms.status, 403);
});

test('system roles are protected, even from full-access users', async () => {
  const h = as(ctx.adminToken);
  const fallback = (await defaultRole()).id;
  const otherAdmin = await Role.create({ name: 'Second Full Access', isSuperAdmin: true, isSystem: true });

  const editFullAccess = await request(app)
    .put(`${ROLES}/${otherAdmin.id}/permissions`)
    .set(h)
    .send({ permissions: [] });
  const deleteSystem = await request(app).delete(`${ROLES}/${fallback}`).set(h);
  const disableSystem = await request(app).put(`${ROLES}/${fallback}`).set(h).send({ status: 'inactive' });
  const ownRole = await request(app).put(`${ROLES}/${(await superAdminRole()).id}`).set(h).send({ name: 'Me' });
  assert.equal(editFullAccess.status, 409);
  assert.equal(deleteSystem.status, 409);
  assert.equal(disableSystem.status, 409);
  assert.equal(ownRole.status, 403);

  // What is allowed: describing a system role and giving the default role permissions.
  const rename = await request(app).put(`${ROLES}/${fallback}`).set(h).send({ description: 'Everyone starts here' });
  const grant = await request(app).put(`${ROLES}/${fallback}/permissions`).set(h).send({ permissions: ['leads.read'] });
  assert.equal(rename.status, 200);
  assert.equal(grant.status, 200);

  await request(app).put(`${ROLES}/${fallback}/permissions`).set(h).send({ permissions: [] });
  await otherAdmin.deleteOne();
});

test('delete: refused while users hold the role, allowed once unused', async () => {
  const h = as(ctx.adminToken);
  const role = await createRole(['leads.read'], 'Temporary');
  const user = await createUser(role);

  const inUse = await request(app).delete(`${ROLES}/${role.id}`).set(h);
  assert.equal(inUse.status, 409);

  await User.updateOne({ _id: user._id }, { roleId: (await defaultRole())._id });
  const removed = await request(app).delete(`${ROLES}/${role.id}`).set(h);
  const gone = await request(app).get(`${ROLES}/${role.id}`).set(h);
  assert.equal(removed.status, 200);
  assert.equal(gone.status, 404);
});
