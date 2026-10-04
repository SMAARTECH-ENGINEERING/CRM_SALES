import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_contracts');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Contract } = await import('../src/models/Contract.js');
const { default: ContractReminder } = await import('../src/models/ContractReminder.js');
const { default: ContractReminderPeriod } = await import('../src/models/ContractReminderPeriod.js');
const { default: FollowUp } = await import('../src/models/FollowUp.js');
const { default: User } = await import('../src/models/User.js');
const { default: Customer } = await import('../src/models/Customer.js');
const s = await import('../src/services/seed.service.js');
const { runReminderCheck } = await import('../src/services/contractReminder.service.js');
const { setMailTransport } = await import('../src/services/mail.service.js');
const { CONTRACT_STATUS_SEED } = await import('../src/seeds/contract.seed.js');
const { createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const API = '/api/v1/contracts';
const DAY = 24 * 60 * 60 * 1000;

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const missing = () => new mongoose.Types.ObjectId().toString();
const post = async (p, body) => (await request(app).post(`/api/v1/${p}`).set(admin()).send(body)).body.data;
const statusOf = (category) => ctx.statuses.find((x) => x.category === category);
const day = (base, offset) => new Date(new Date(base).getTime() + offset * DAY).toISOString().slice(0, 10);
const create = (body, token = ctx.adminToken) =>
  request(app)
    .post(API)
    .set(as(token))
    .send({ companyId: ctx.acme.id, startDate: '2027-01-01', endDate: '2027-12-31', amount: 120000, ...body });

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Contract.init(), ContractReminder.init(), ContractReminderPeriod.init(), Customer.init()]);
  await seedRbac();
  await s.seedLeadConfig();
  await s.seedActivityTypes();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.plain = await createUser(await defaultRole());
  ctx.reader = await createUser(await createRole(['contracts.read'], 'Contract Reader'));
  ctx.manager = await createUser(
    await createRole(['contracts.read', 'contracts.create', 'contracts.update', 'followups.read'], 'Account Manager'),
    { firstName: 'Mona', lastName: 'Manager', email: 'mona@example.com' }
  );
  ctx.inactive = await createUser(await defaultRole(), { status: 'inactive' });
  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.readerToken = await loginAs(app, ctx.reader);
  ctx.managerToken = await loginAs(app, ctx.manager);

  ctx.acme = (await post('companies', { name: 'Acme Industries' })).company;
  ctx.bolt = (await post('companies', { name: 'Bolt Traders' })).company;
  ctx.acmeCustomer = (await post('customers', { companyId: ctx.acme.id })).customer;
});

after(async () => {
  setMailTransport(null);
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await s.verifyDeclaredPermissions(), []);
});

test('types, statuses, billing cycles and reminder periods are data: nothing until seeded', async () => {
  assert.equal((await create({})).status, 409, 'a contract needs a default status');
  assert.equal(await s.seedContractSettings(), true);
  assert.equal(await s.seedContractSettings(), false);
  const list = async (p) => (await request(app).get(`/api/v1/${p}`).set(admin())).body.data.items;
  ctx.statuses = await list('contract-statuses');
  ctx.types = await list('contract-types');
  ctx.cycles = await list('billing-cycles');
  ctx.periods = await list('contract-reminder-periods');
  assert.deepEqual(ctx.statuses.map((x) => [x.name, x.category]), CONTRACT_STATUS_SEED.map((x) => [x.name, x.category]));
  assert.equal(ctx.cycles.filter((c) => c.isDefault).length, 1);
  assert.ok(ctx.periods.length > 0 && ctx.periods.every((p) => Number.isInteger(p.daysBefore)));

  const periods = '/api/v1/contract-reminder-periods';
  assert.equal((await request(app).post(periods).set(admin()).send({ name: 'No days' })).status, 422, 'daysBefore is required');
  const taken = ctx.periods[0].daysBefore;
  assert.equal((await request(app).post(periods).set(admin()).send({ name: 'Same days', daysBefore: taken })).status, 409);
  assert.equal((await request(app).post('/api/v1/contract-statuses').set(admin()).send({ name: 'Odd', category: 'won' })).status, 422);
  assert.equal((await request(app).post('/api/v1/billing-cycles').set(admin()).send({ name: 'Weekly-ish', months: 0 })).status, 422);
  assert.equal((await request(app).get(periods).set(as(ctx.readerToken))).status, 200, 'contract users read the lists');
  assert.equal((await request(app).post(periods).set(as(ctx.managerToken)).send({ name: 'Nope', daysBefore: 3 })).status, 403);
});

test('every contract endpoint needs a token (401) and a permission (403)', async () => {
  const id = missing();
  const calls = (headers) => [
    request(app).get(API).set(headers),
    request(app).get(`${API}/stats`).set(headers),
    request(app).post(`${API}/reminders/run`).set(headers),
    request(app).post(API).set(headers).send({}),
    request(app).get(`${API}/${id}`).set(headers),
    request(app).put(`${API}/${id}`).set(headers).send({ amount: 1 }),
    request(app).delete(`${API}/${id}`).set(headers),
    request(app).patch(`${API}/${id}/status`).set(headers).send({ statusId: id }),
    request(app).get(`${API}/${id}/reminders`).set(headers),
    request(app).get(`${API}/${id}/timeline`).set(headers),
  ];
  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401, res.req.path);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) assert.equal(res.status, 403, res.req.path);
  // A reader may read but not change anything.
  const reader = await Promise.all(calls(as(ctx.readerToken)));
  assert.deepEqual(
    reader.map((res) => res.status),
    [200, 200, 403, 403, 404, 403, 403, 403, 404, 404]
  );
});

test('create: generated number, defaults, customer link and amount from the server', async () => {
  const res = await create({ contractTypeId: ctx.types[0].id, assignedTo: ctx.manager.id, renewalDate: '2027-12-01', amount: 99999.999, description: 'AMC for 20 printers' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { contract } = res.body.data;
  ctx.contract = contract;
  assert.equal(contract.contractNumber, 'CON-000001');
  assert.equal(contract.status.category, 'active', 'the default status');
  assert.equal(contract.billingCycle.id, ctx.cycles.find((c) => c.isDefault).id, 'the default billing cycle');
  assert.equal(contract.customer.id, ctx.acmeCustomer.id, "linked to the company's customer record");
  assert.equal(contract.contractType.name, ctx.types[0].name);
  assert.equal(contract.assignedToUser.fullName, 'Mona Manager');
  assert.equal(contract.amount, 100000);
  assert.equal(contract.startDate, '2027-01-01T00:00:00.000Z');
  assert.equal(typeof contract.daysToEnd, 'number', 'days to the end, worked out by the server');

  const bolt = (await create({ companyId: ctx.bolt.id, billingCycleId: ctx.cycles[0].id })).body.data.contract;
  assert.equal(bolt.contractNumber, 'CON-000002');
  assert.equal(bolt.customer, undefined, 'Bolt is not a customer');
  assert.equal(bolt.billingCycle.id, ctx.cycles[0].id);
});

test('create: validation and reference checks', async () => {
  const cases = [
    [{ endDate: '2026-12-31' }, 422, 'endDate'],
    [{ renewalDate: '2026-06-01' }, 422, 'renewalDate'],
    [{ amount: -1 }, 422, 'amount'],
    [{ amount: undefined }, 422, 'amount'],
    [{ startDate: 'soon' }, 422, 'startDate'],
    [{ contractNumber: 'MINE-1' }, 422, 'contractNumber'],
    [{ customerId: missing() }, 422, 'customerId'],
    [{ companyId: missing() }, 400, 'companyId'],
    [{ contractTypeId: missing() }, 400, 'contractTypeId'],
    [{ billingCycleId: missing() }, 400, 'billingCycleId'],
    [{ statusId: missing() }, 400, 'statusId'],
    [{ assignedTo: ctx.inactive.id }, 400, 'assignedTo'],
  ];
  for (const [body, status, field] of cases) {
    const res = await create(body);
    assert.equal(res.status, status, `${field}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.errors[0].field, field);
  }
  assert.equal(await Contract.countDocuments(), 2, 'nothing was created');
});

test('update: only what is sent, recorded on the timeline; company and status are not edited here', async () => {
  const url = `${API}/${ctx.contract.id}`;
  let res = await request(app).put(url).set(as(ctx.managerToken)).send({ amount: 125000, billingCycleId: ctx.cycles[1].id });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.contract.amount, 125000);
  assert.equal(res.body.data.contract.description, 'AMC for 20 printers', 'unchanged');

  assert.equal((await request(app).put(url).set(admin()).send({ companyId: ctx.bolt.id })).status, 422);
  assert.equal((await request(app).put(url).set(admin()).send({ statusId: statusOf('draft').id })).status, 422);
  res = await request(app).put(url).set(admin()).send({ endDate: '2026-06-30' });
  assert.equal(res.status, 422, 'the end may not move before the start');
  assert.equal(res.body.errors[0].field, 'endDate');

  const timeline = (await request(app).get(`${url}/timeline`).set(as(ctx.readerToken))).body.data.events;
  assert.deepEqual(timeline.map((e) => e.action), ['updated', 'created']);
  assert.deepEqual(timeline[0].changes.map((c) => c.label), ['Amount', 'Billing cycle']);
});

test('status: by id, recorded; an unknown status is refused', async () => {
  const url = `${API}/${ctx.contract.id}/status`;
  assert.equal((await request(app).patch(url).set(admin()).send({ statusId: missing() })).status, 400);
  const res = await request(app).patch(url).set(admin()).send({ statusId: statusOf('draft').id });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.contract.status.category, 'draft');
  await request(app).patch(url).set(admin()).send({ statusId: statusOf('active').id });
  const timeline = (await request(app).get(`${API}/${ctx.contract.id}/timeline`).set(admin())).body.data.events;
  assert.equal(timeline[0].changes[0].to, statusOf('active').name);
});

test('list and stats: filters, expiring soon and values come from the API', async () => {
  const today = new Date().toISOString().slice(0, 10);
  ctx.soon = (await create({ startDate: day(today, -300), endDate: day(today, 10), amount: 5000 })).body.data.contract;
  assert.equal(ctx.soon.daysToEnd, 10);

  const numbers = async (query) =>
    (await request(app).get(`${API}?limit=100&sortBy=contractNumber&${query}`).set(as(ctx.readerToken))).body.data.contracts.map((c) => c.contractNumber);
  assert.deepEqual(await numbers(''), ['CON-000001', 'CON-000002', 'CON-000003']);
  assert.deepEqual(await numbers(`companyId=${ctx.bolt.id}`), ['CON-000002']);
  assert.deepEqual(await numbers('expiringWithin=30'), ['CON-000003']);
  assert.deepEqual(await numbers('expiringWithin=5'), []);
  assert.deepEqual(await numbers('search=printers'), ['CON-000001']);
  assert.deepEqual(await numbers('statusCategory=draft'), []);
  assert.deepEqual(await numbers(`customerId=${ctx.acmeCustomer.id}`), ['CON-000001', 'CON-000003']);

  const stats = (await request(app).get(`${API}/stats`).set(as(ctx.readerToken))).body.data;
  assert.equal(stats.total, 3);
  assert.deepEqual(stats.byCategory.active, { count: 3, value: 250000 });
  const longest = Math.max(...ctx.periods.map((p) => p.daysBefore));
  assert.deepEqual(stats.expiringSoon, { withinDays: longest, count: 1, value: 5000 });
  assert.equal(stats.pastEndDate, 0);

  const sections = (await request(app).get(`/api/v1/companies/${ctx.acme.id}/sections`).set(admin())).body.data.sections;
  assert.deepEqual(sections.find((x) => x.key === 'contracts'), { key: 'contracts', label: 'Contracts', available: true, count: 2 });
  const summary = (await request(app).get(`/api/v1/customers/${ctx.acmeCustomer.id}/summary`).set(admin())).body.data;
  assert.equal(summary.sections.find((x) => x.key === 'contracts').count, 2);
});

// --- reminders ----------------------------------------------------------------------

const BASE = '2031-03-01';
const at = (offset) => new Date(`${day(BASE, offset)}T09:00:00.000Z`);
const remindersOf = (contract) => ContractReminder.find({ contractId: contract.id }).sort({ createdAt: 1 });

test('reminders: one per period as the end date comes closer, never twice', async () => {
  // Periods are whatever is configured; the test sets its own.
  await ContractReminderPeriod.deleteMany({});
  await ContractReminderPeriod.create([
    { name: 'Six weeks', daysBefore: 42 },
    { name: 'Ten days', daysBefore: 10 },
    { name: 'On the day', daysBefore: 0 },
  ]);
  const sent = [];
  setMailTransport({ sendMail: async (message) => sent.push(message) });

  ctx.amc = (await create({ startDate: day(BASE, -300), endDate: day(BASE, 20), assignedTo: ctx.manager.id })).body.data.contract;
  const result = await runReminderCheck(at(0));
  assert.deepEqual(result.periods, [0, 10, 42]);
  let reminders = await remindersOf(ctx.amc);
  assert.deepEqual(reminders.map((r) => [r.daysBefore, r.daysLeft]), [[42, 20]], 'the period that covers 20 days');
  assert.ok(reminders[0].emailedAt);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'mona@example.com');
  assert.match(sent[0].subject, new RegExp(`${ctx.amc.contractNumber} with Acme Industries ends in 20 days`));

  // Same day, next day: nothing new.
  await runReminderCheck(at(0));
  await runReminderCheck(at(1));
  assert.equal((await remindersOf(ctx.amc)).length, 1);

  // 10 days left, then the end date itself.
  await runReminderCheck(at(10));
  await runReminderCheck(at(15));
  await runReminderCheck(at(20));
  reminders = await remindersOf(ctx.amc);
  assert.deepEqual(reminders.map((r) => [r.daysBefore, r.daysLeft]), [[42, 20], [10, 10], [0, 0]]);
  assert.equal(sent.length, 3);

  // Each one is a follow-up for the person responsible, due on the end date.
  const followUps = (await request(app).get(`/api/v1/followups?relatedType=contract&relatedId=${ctx.amc.id}`).set(as(ctx.managerToken))).body.data.followUps;
  assert.equal(followUps.length, 3);
  assert.ok(followUps.every((f) => f.assignedToUser.id === ctx.manager.id && f.dueDate.startsWith(day(BASE, 20))));
  assert.equal(followUps[0].related.label, ctx.amc.contractNumber);

  const listed = (await request(app).get(`${API}/${ctx.amc.id}/reminders`).set(as(ctx.readerToken))).body.data.reminders;
  assert.equal(listed.length, 3);
  assert.equal(listed[0].recipient.fullName, 'Mona Manager');
  const timeline = (await request(app).get(`${API}/${ctx.amc.id}/timeline`).set(admin())).body.data.events;
  assert.equal(timeline.filter((e) => e.action === 'reminded').length, 3);
});

test('reminders: changing the periods changes what is sent - nothing is fixed in code', async () => {
  const late = (await create({ startDate: day(BASE, -300), endDate: day(BASE, 50) })).body.data.contract;
  await runReminderCheck(at(0));
  assert.equal((await remindersOf(late)).length, 0, 'beyond the longest period (42)');

  await request(app).post('/api/v1/contract-reminder-periods').set(admin()).send({ name: 'Two months', daysBefore: 60 });
  await runReminderCheck(at(0));
  const reminders = await remindersOf(late);
  assert.deepEqual(reminders.map((r) => [r.daysBefore, r.daysLeft]), [[60, 50]]);
  assert.equal(reminders[0].recipientId.toString(), ctx.admin.id, 'no assignee: whoever created it');

  // With every period switched off there are no reminders at all.
  await ContractReminderPeriod.updateMany({}, { isActive: false });
  const quiet = (await create({ startDate: day(BASE, -300), endDate: day(BASE, 5) })).body.data.contract;
  const result = await runReminderCheck(at(0));
  assert.deepEqual(result.periods, []);
  assert.equal((await remindersOf(quiet)).length, 0);
  await ContractReminderPeriod.updateMany({}, { isActive: true });
});

test('reminders: only active contracts; a new end date starts again and voids the old follow-ups', async () => {
  const draft = (await create({ startDate: day(BASE, -300), endDate: day(BASE, 8), statusId: statusOf('draft').id })).body.data.contract;
  const moving = (await create({ startDate: day(BASE, -300), endDate: day(BASE, 9) })).body.data.contract;
  await runReminderCheck(at(0));
  assert.equal((await remindersOf(draft)).length, 0, 'a draft is not reminded');
  const [first] = await remindersOf(moving);
  assert.equal(first.daysBefore, 10);
  assert.equal((await FollowUp.findById(first.followUpId)).status, 'pending');

  // Renewed for another year: the pending reminder is void, and the new date gets its own.
  await request(app).put(`${API}/${moving.id}`).set(admin()).send({ endDate: day(BASE, 30) });
  assert.equal((await FollowUp.findById(first.followUpId)).status, 'cancelled');
  await runReminderCheck(at(0));
  assert.deepEqual((await remindersOf(moving)).map((r) => [r.daysBefore, r.daysLeft]), [[10, 9], [42, 30]]);

  // Cancelling the contract voids its pending reminders too.
  await request(app).patch(`${API}/${moving.id}/status`).set(admin()).send({ statusId: statusOf('cancelled').id });
  const followUps = await FollowUp.find({ relatedId: moving.id });
  assert.ok(followUps.every((f) => f.status === 'cancelled'));
});

test('expiry: active contracts past their end date are marked expired automatically', async () => {
  const ended = (await create({ startDate: day(BASE, -400), endDate: day(BASE, -1) })).body.data.contract;
  const before = (await request(app).get(`${API}/stats`).set(admin())).body.data;
  assert.ok(before.pastEndDate >= 0);

  const result = await runReminderCheck(at(0));
  assert.ok(result.expired >= 1);
  const contract = (await request(app).get(`${API}/${ended.id}`).set(admin())).body.data.contract;
  assert.equal(contract.status.category, 'expired');
  const [event] = (await request(app).get(`${API}/${ended.id}/timeline`).set(admin())).body.data.events;
  assert.equal(event.action, 'status_changed');
  assert.match(event.summary, /automatically/);
  assert.equal(event.actor, undefined, 'done by the system');

  // The reminded contract from the first test has ended too; its follow-ups are voided.
  await runReminderCheck(at(21));
  const amc = (await request(app).get(`${API}/${ctx.amc.id}`).set(admin())).body.data.contract;
  assert.equal(amc.status.category, 'expired');
  assert.ok((await FollowUp.find({ relatedId: ctx.amc.id })).every((f) => f.status === 'cancelled'));
});

test('run now: needs contracts.manageSettings', async () => {
  assert.equal((await request(app).post(`${API}/reminders/run`).set(as(ctx.managerToken))).status, 403);
  const res = await request(app).post(`${API}/reminders/run`).set(admin());
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body.data).sort(), ['checkedAt', 'considered', 'emailed', 'expired', 'periods', 'reminded']);
});

test('delete: soft, and a company with contracts cannot be deleted', async () => {
  assert.equal((await request(app).delete(`/api/v1/companies/${ctx.bolt.id}`).set(admin())).status, 409);
  const bolt = (await request(app).get(`${API}?companyId=${ctx.bolt.id}`).set(admin())).body.data.contracts[0];
  assert.equal((await request(app).delete(`${API}/${bolt.id}`).set(as(ctx.managerToken))).status, 403);
  assert.equal((await request(app).delete(`${API}/${bolt.id}`).set(admin())).status, 200);
  assert.equal((await request(app).get(`${API}/${bolt.id}`).set(admin())).status, 404);
  assert.equal((await request(app).delete(`/api/v1/companies/${ctx.bolt.id}`).set(admin())).status, 200);
});
