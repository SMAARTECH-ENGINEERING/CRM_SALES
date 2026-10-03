import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_audit', { AUDIT_ENABLED: 'true' });

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: AuditLog } = await import('../src/models/AuditLog.js');
const { default: User } = await import('../src/models/User.js');
const s = await import('../src/services/seed.service.js');
const { describeRequest, flushAudit, sanitize } = await import('../src/services/audit.service.js');
const { PASSWORD, allKeys, createRole, createUser, defaultRole, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const API = '/api/v1/audit-logs';
const NEW_PASSWORD = 'An0ther!Passw0rd';
const AGENT = 'AuditTest/1.0 (unit)';

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}`, 'User-Agent': AGENT });
const call = (method, path, token, body) => request(app)[method](`/api/v1/${path}`).set(as(token)).send(body);
const login = (email, password = PASSWORD) => request(app).post('/api/v1/auth/login').set('User-Agent', AGENT).send({ email, password });
// The entries written so far, oldest first (waits for the ones still being written).
async function entries(filter = {}) {
  await flushAudit();
  return AuditLog.find(filter).sort({ timestamp: 1, _id: 1 }).lean();
}
const last = async (filter = {}) => (await entries(filter)).at(-1);
const list = async (query = '', token = ctx.adminToken) => {
  await flushAudit();
  const res = await request(app).get(`${API}?limit=100&${query}`).set(as(token));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data;
};

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), AuditLog.init()]);
  await seedRbac();
  await s.seedLeadConfig();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.adminLogin = await login(ctx.admin.email);
  ctx.adminToken = ctx.adminLogin.body.data.accessToken;
  ctx.north = (await call('post', 'organizations', ctx.adminToken, { name: 'North Region' })).body.data.item;

  // Reads the log of their organization only.
  ctx.norah = await createUser(await createRole(['audit.read', 'companies.create', 'companies.update'], 'Regional Auditor'), { firstName: 'Norah', lastName: 'North', organizationId: ctx.north.id });
  // Reads only their own entries: no organization, no audit.viewAll.
  ctx.solo = await createUser(await createRole(['audit.read', 'companies.create'], 'Self Auditor'), { firstName: 'Sol', lastName: 'Solo' });
  ctx.plain = await createUser(await defaultRole());
  for (const who of ['norah', 'solo', 'plain']) ctx[`${who}Token`] = (await login(ctx[who].email)).body.data.accessToken;
});

after(async () => {
  await flushAudit();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await s.verifyDeclaredPermissions(), []);
});

test('LOGIN: who, from where, with what browser - and never the password', async () => {
  const [entry] = await entries({ action: 'LOGIN', userId: ctx.admin._id });
  assert.deepEqual(
    [entry.action, entry.entityType, String(entry.entityId), entry.success, entry.statusCode, entry.method, entry.path, entry.userAgent],
    ['LOGIN', 'user', ctx.admin.id, true, 200, 'POST', '/api/v1/auth/login', AGENT]
  );
  assert.match(entry.ipAddress, /127\.0\.0\.1|::1/);
  assert.ok(entry.timestamp instanceof Date);
  assert.deepEqual(entry.newData, { email: ctx.admin.email }, 'the email only');

  // A failed sign-in is recorded too, against nobody.
  assert.equal((await login(ctx.admin.email, 'Wr0ng!Passw0rd')).status, 401);
  const failed = await last({ action: 'LOGIN' });
  assert.deepEqual([failed.success, failed.statusCode, failed.userId, failed.newData], [false, 401, undefined, { email: ctx.admin.email }]);
});

test('CREATE, UPDATE and DELETE: the record, then only what changed, then what was removed', async () => {
  const created = (await call('post', 'companies', ctx.adminToken, { name: 'Acme Industries', city: 'Pune' })).body.data.company;
  let entry = await last();
  assert.deepEqual([entry.action, entry.entityType, String(entry.entityId), String(entry.userId), entry.oldData], ['CREATE', 'company', created.id, ctx.admin.id, undefined]);
  assert.deepEqual([entry.newData.name, entry.newData.city, entry.newData.id], ['Acme Industries', 'Pune', created.id]);

  await call('put', `companies/${created.id}`, ctx.adminToken, { city: 'Mumbai', phone: '+91 22 5550 0100' });
  entry = await last();
  assert.equal(entry.action, 'UPDATE');
  assert.deepEqual(entry.oldData, { city: 'Pune' });
  assert.deepEqual(entry.newData, { city: 'Mumbai', phone: '+91 22 5550 0100' });

  await call('delete', `companies/${created.id}`, ctx.adminToken);
  entry = await last();
  assert.deepEqual([entry.action, String(entry.entityId), entry.newData], ['DELETE', created.id, undefined]);
  assert.deepEqual([entry.oldData.name, entry.oldData.city], ['Acme Industries', 'Mumbai']);
});

test('ASSIGN and STATUS_CHANGE', async () => {
  const lead = (await call('post', 'leads', ctx.adminToken, { title: 'Office fit-out' })).body.data.lead;
  await call('patch', `leads/${lead.id}/assign`, ctx.adminToken, { assignedTo: ctx.norah.id });
  let entry = await last();
  assert.deepEqual([entry.action, entry.entityType, String(entry.entityId), entry.oldData, entry.newData], ['ASSIGN', 'lead', lead.id, undefined, { assignedTo: ctx.norah.id }]);

  const statuses = (await request(app).get('/api/v1/lead-statuses').set(as(ctx.adminToken))).body.data.items;
  const next = statuses.find((x) => !x.isDefault);
  await call('patch', `leads/${lead.id}/status`, ctx.adminToken, { statusId: next.id });
  entry = await last();
  assert.deepEqual([entry.action, entry.oldData, entry.newData], ['STATUS_CHANGE', { statusId: lead.statusId }, { statusId: next.id }]);
  ctx.lead = lead;
});

test('PERMISSION_CHANGE: a role\'s permissions, and which role a user has', async () => {
  const role = await createRole(['leads.read'], 'Lead Reader');
  const keys = await allKeys('leads');
  await call('put', `roles/${role.id}/permissions`, ctx.adminToken, { permissions: keys });
  let entry = await last();
  assert.deepEqual([entry.action, entry.entityType, String(entry.entityId)], ['PERMISSION_CHANGE', 'role', role.id]);
  assert.deepEqual([entry.oldData.permissions.length, entry.newData.permissions.length], [1, keys.length]);

  await call('put', `users/${ctx.plain.id}`, ctx.adminToken, { roleId: role.id });
  entry = await last();
  assert.deepEqual([entry.action, entry.entityType, String(entry.entityId), entry.newData.roleId], ['PERMISSION_CHANGE', 'user', ctx.plain.id, role.id]);
  // An ordinary edit of a user is an UPDATE.
  await call('put', `users/${ctx.plain.id}`, ctx.adminToken, { designation: 'Clerk' });
  assert.equal((await last()).action, 'UPDATE');
});

test('PASSWORD_CHANGE and LOGOUT: recorded, with no data at all', async () => {
  // An administrator sets someone's password.
  const reset = await call('patch', `users/${ctx.plain.id}/reset-password`, ctx.adminToken, { newPassword: NEW_PASSWORD });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  let entry = await last();
  assert.deepEqual([entry.action, entry.entityType, String(entry.entityId), String(entry.userId), entry.oldData, entry.newData], ['PASSWORD_CHANGE', 'user', ctx.plain.id, ctx.admin.id, undefined, undefined]);

  // A user changes their own; a wrong current password is recorded as refused.
  const token = (await login(ctx.plain.email, NEW_PASSWORD)).body.data.accessToken;
  const wrong = await call('post', 'auth/change-password', token, { currentPassword: 'Wr0ng!Passw0rd', newPassword: PASSWORD });
  assert.ok(wrong.status >= 400);
  entry = await last();
  assert.deepEqual([entry.action, entry.success, String(entry.userId), entry.newData], ['PASSWORD_CHANGE', false, ctx.plain.id, undefined]);
  const changed = await call('post', 'auth/change-password', token, { currentPassword: NEW_PASSWORD, newPassword: PASSWORD });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  entry = await last();
  assert.deepEqual([entry.action, entry.success, String(entry.entityId)], ['PASSWORD_CHANGE', true, ctx.plain.id]);

  const again = await login(ctx.plain.email);
  await call('post', 'auth/logout', again.body.data.accessToken, { refreshToken: again.body.data.refreshToken });
  entry = await last();
  assert.deepEqual([entry.action, String(entry.userId), String(entry.entityId), entry.newData], ['LOGOUT', ctx.plain.id, ctx.plain.id, undefined]);
  // Signing out revoked the earlier tokens; the later tests need a live one.
  ctx.plainToken = (await login(ctx.plain.email)).body.data.accessToken;
});

test('no password, hash or token is ever stored', async () => {
  // Creating a user sends a password; the stored record has a hash.
  const res = await call('post', 'users', ctx.adminToken, { firstName: 'New', lastName: 'Hire', email: 'new.hire@example.com', password: NEW_PASSWORD });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const entry = await last();
  assert.deepEqual([entry.action, entry.entityType, entry.newData.email], ['CREATE', 'user', 'new.hire@example.com']);
  assert.ok(!('passwordHash' in entry.newData) && !('refreshTokenHash' in entry.newData) && !('password' in entry.newData));

  const everything = JSON.stringify(await entries());
  for (const secret of [PASSWORD, NEW_PASSWORD, 'Wr0ng!Passw0rd', ctx.adminToken, ctx.adminLogin.body.data.refreshToken]) {
    assert.ok(!everything.includes(secret), 'a secret was written to the audit log');
  }
  assert.ok(!/\$2[aby]\$\d\d\$/.test(everything), 'a bcrypt hash was written to the audit log');

  // The sanitizer itself: secrets by name at any depth, long values cut.
  const clean = sanitize({ name: 'x', password: 'p', nested: { accessToken: 't', apiKey: 'k', list: [{ refreshTokenHash: 'h', ok: 1 }] }, note: 'y'.repeat(5000) });
  assert.deepEqual([clean.password, clean.nested.accessToken, clean.nested.apiKey, clean.nested.list[0].refreshTokenHash, clean.nested.list[0].ok], ['[REDACTED]', '[REDACTED]', '[REDACTED]', '[REDACTED]', 1]);
  assert.ok(clean.note.length < 2100);
});

test('what is not audited: reading, refused requests, token renewal', async () => {
  const count = (await entries()).length;
  await request(app).get('/api/v1/companies').set(as(ctx.adminToken));
  await call('post', 'companies', ctx.adminToken, { name: '' });
  await call('post', 'companies', ctx.plainToken, { name: 'Not allowed' });
  await request(app).post('/api/v1/auth/refresh-token').send({ refreshToken: ctx.adminLogin.body.data.refreshToken });
  await call('patch', 'notifications/read-all', ctx.adminToken);
  assert.equal((await entries()).length, count);

  assert.deepEqual(describeRequest('POST', '/tickets/64b000000000000000000001/replies'), { entityType: 'ticket', entityId: '64b000000000000000000001', Model: mongoose.model('Ticket'), action: 'UPDATE' });
  assert.equal(describeRequest('PATCH', '/opportunities/64b000000000000000000001/stage').action, 'STATUS_CHANGE');
  assert.equal(describeRequest('PUT', '/settings/company').entityType, 'settings');
});

test('the log cannot be changed or deleted', async () => {
  const entry = await AuditLog.findOne();
  await assert.rejects(AuditLog.updateOne({ _id: entry._id }, { $set: { action: 'DELETE' } }), /cannot be changed/);
  await assert.rejects(AuditLog.deleteOne({ _id: entry._id }), /cannot be changed/);
  await assert.rejects(AuditLog.deleteMany({}), /cannot be changed/);
  entry.action = 'DELETE';
  await assert.rejects(entry.save(), /cannot be changed/);
  for (const method of ['put', 'patch', 'delete', 'post']) {
    assert.equal((await call(method, method === 'post' ? 'audit-logs' : `audit-logs/${entry.id}`, ctx.adminToken, {})).status, 404, method);
  }
});

test('reading the log: only authorized users', async () => {
  const id = (await AuditLog.findOne()).id;
  for (const url of [API, `${API}/filters`, `${API}/${id}`]) {
    assert.equal((await request(app).get(url)).status, 401, url);
    assert.equal((await request(app).get(url).set(as(ctx.plainToken))).status, 403, url);
    assert.equal((await request(app).get(url).set(as(ctx.adminToken))).status, 200, url);
  }
});

test('filters: user, action, entity and date range; newest first, paged', async () => {
  const all = await list();
  assert.ok(all.auditLogs.length >= 12);
  assert.deepEqual(all.auditLogs.map((e) => e.timestamp), [...all.auditLogs.map((e) => e.timestamp)].sort().reverse());
  // The list is for scanning: the data is on the entry.
  assert.ok(all.auditLogs.every((e) => !('oldData' in e) && !('newData' in e)));
  assert.equal(all.auditLogs.find((e) => e.userId === ctx.admin.id).user.fullName, 'Ada Admin');

  let data = await list(`userId=${ctx.plain.id}`);
  assert.ok(data.auditLogs.length >= 3 && data.auditLogs.every((e) => e.userId === ctx.plain.id));
  data = await list('action=PASSWORD_CHANGE');
  assert.deepEqual([data.auditLogs.length, new Set(data.auditLogs.map((e) => e.action)).size], [3, 1]);
  assert.equal((await list('action=PASSWORD_CHANGE&success=false')).auditLogs.length, 1);
  data = await list('entityType=lead');
  assert.deepEqual(data.auditLogs.map((e) => e.action), ['STATUS_CHANGE', 'ASSIGN', 'CREATE']);
  assert.equal((await list(`entityType=lead&entityId=${ctx.lead.id}&action=ASSIGN`)).auditLogs.length, 1);
  assert.equal((await list('search=reset-password')).auditLogs.length, 1);

  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await list(`from=${today}&to=${today}`)).pagination.total, all.pagination.total);
  assert.equal((await list('to=2020-12-31')).pagination.total, 0);
  assert.equal((await list('from=2099-01-01')).pagination.total, 0);

  data = (await request(app).get(`${API}?page=2&limit=5&sortOrder=asc`).set(as(ctx.adminToken))).body.data;
  assert.deepEqual([data.auditLogs.length, data.pagination.page, data.pagination.total], [5, 2, all.pagination.total]);
  for (const query of ['action=READ', 'userId=nope', 'from=2031-02-10&to=2031-02-01', 'limit=500']) {
    assert.equal((await request(app).get(`${API}?${query}`).set(as(ctx.adminToken))).status, 422, query);
  }

  const filters = (await request(app).get(`${API}/filters`).set(as(ctx.adminToken))).body.data;
  assert.deepEqual(filters.actions, ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ASSIGN', 'STATUS_CHANGE', 'PASSWORD_CHANGE', 'PERMISSION_CHANGE']);
  assert.ok(['company', 'lead', 'role', 'user'].every((type) => filters.entityTypes.includes(type)));
});

test('one entry: the full record, with before and after', async () => {
  const update = await last({ action: 'UPDATE', entityType: 'company' });
  const res = await request(app).get(`${API}/${update._id}`).set(as(ctx.adminToken));
  assert.equal(res.status, 200);
  const { auditLog } = res.body.data;
  assert.deepEqual(
    Object.keys(auditLog).sort(),
    ['action', 'entityId', 'entityType', 'id', 'ipAddress', 'method', 'newData', 'oldData', 'path', 'statusCode', 'success', 'timestamp', 'user', 'userAgent', 'userId']
  );
  assert.deepEqual([auditLog.oldData, auditLog.newData.city, auditLog.user.email], [{ city: 'Pune' }, 'Mumbai', ctx.admin.email]);
  assert.equal((await request(app).get(`${API}/${new mongoose.Types.ObjectId()}`).set(as(ctx.adminToken))).status, 404);
  assert.equal((await request(app).get(`${API}/nope`).set(as(ctx.adminToken))).status, 422);
});

test('scope: an organization\'s auditor sees that organization; without one, only your own actions', async () => {
  const mine = (await call('post', 'companies', ctx.norahToken, { name: 'Northern Lights' })).body.data.company;
  await call('post', 'companies', ctx.soloToken, { name: 'Solo Works' });
  const created = await last({ action: 'CREATE', entityId: new mongoose.Types.ObjectId(mine.id) });
  assert.equal(String(created.organizationId), ctx.north.id, "stamped with the actor's organization");

  const north = await list('', ctx.norahToken);
  assert.ok(north.auditLogs.length >= 2);
  assert.ok(north.auditLogs.every((e) => e.organizationId === ctx.north.id));
  assert.equal(north.auditLogs[0].organization.name, 'North Region');

  const solo = await list('', ctx.soloToken);
  assert.deepEqual(solo.auditLogs.map((e) => [e.action, e.userId]), [['CREATE', ctx.solo.id], ['LOGIN', ctx.solo.id]]);
  // Someone else's entry does not exist as far as they can tell.
  assert.equal((await request(app).get(`${API}/${created._id}`).set(as(ctx.soloToken))).status, 404);
  assert.equal((await request(app).get(`${API}/${created._id}`).set(as(ctx.norahToken))).status, 200);
  assert.equal((await list(`userId=${ctx.admin.id}`, ctx.soloToken)).auditLogs.length, 0);
});
