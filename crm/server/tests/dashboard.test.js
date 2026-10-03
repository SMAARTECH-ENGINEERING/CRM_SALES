import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_dashboard');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: User } = await import('../src/models/User.js');
const { default: LeadStatus } = await import('../src/models/LeadStatus.js');
const { default: SeedState } = await import('../src/models/SeedState.js');
const s = await import('../src/services/seed.service.js');
const { resolvePeriod } = await import('../src/services/dashboard.service.js');
const { createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const API = '/api/v1/dashboard';
const DAY = 24 * 60 * 60 * 1000;
const MODULES = ['leads.read', 'opportunities.read', 'customers.read', 'followups.read', 'tickets.read', 'payments.read', 'orders.read', 'activities.read'];

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const call = (method, path, token, body) => request(app)[method](`/api/v1/${path}`).set(as(token)).send(body);
const post = async (path, body, token = ctx.adminToken) => {
  const res = await call('post', path, token, body);
  assert.ok(res.status < 300, `${path}: ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const board = async (section, who = 'admin', query = '') => {
  const res = await request(app).get(`${API}/${section}?${query}`).set(as(ctx[`${who}Token`]));
  assert.equal(res.status, 200, `${section} as ${who}: ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const day = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const value = (metrics, key) => metrics[key].value;

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await User.init();
  await seedRbac();
  for (const seed of ['seedLeadConfig', 'seedActivityTypes', 'seedPipelines', 'seedOrderStatuses', 'seedTicketSettings', 'seedPaymentSettings']) await s[seed]();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.north = (await post('organizations', { name: 'North Region' })).item;
  ctx.south = (await post('organizations', { name: 'South Region' })).item;

  // Sees every module, but only the North organization.
  ctx.norah = await createUser(await createRole(['dashboard.read', ...MODULES], 'Regional Manager'), { firstName: 'Norah', lastName: 'North', organizationId: ctx.north.id });
  // Sees every module, belongs to no organization: only what is assigned to them.
  ctx.solo = await createUser(await createRole(['dashboard.read', ...MODULES], 'Salesperson'), { firstName: 'Sol', lastName: 'Solo' });
  // The dashboard, and leads only.
  ctx.leadsOnly = await createUser(await createRole(['dashboard.read', 'leads.read'], 'Lead Desk'));
  // Every module, but not the dashboard.
  ctx.noDashboard = await createUser(await createRole(MODULES, 'No Dashboard'));
  ctx.plain = await createUser(await defaultRole());
  for (const who of ['norah', 'solo', 'leadsOnly', 'noDashboard', 'plain']) ctx[`${who}Token`] = await loginAs(app, ctx[who]);

  ctx.acme = (await post('companies', { name: 'Acme Industries', organizationId: ctx.north.id })).company;
  ctx.bolt = (await post('companies', { name: 'Bolt Traders', organizationId: ctx.south.id })).company;

  // --- leads: 3 in the North (2 Website, 1 Referral), 1 in the South, 1 with no organization for Sol ---
  const list = async (path) => (await request(app).get(`/api/v1/${path}`).set(as(ctx.adminToken))).body.data.items;
  const [website, referral] = await list('lead-sources');
  const statuses = await list('lead-statuses');
  const qualified = statuses.find((x) => x.isQualified && x.category === 'open');
  const lost = statuses.find((x) => x.category === 'lost');
  const lead = async (body) => (await post('leads', body)).lead;
  const setStatus = (id, status) => call('patch', `leads/${id}/status`, ctx.adminToken, { statusId: status.id });
  const n1 = await lead({ title: 'N1', companyId: ctx.acme.id, organizationId: ctx.north.id, sourceId: website.id });
  const n2 = await lead({ title: 'N2', organizationId: ctx.north.id, sourceId: website.id });
  await lead({ title: 'N3', organizationId: ctx.north.id, sourceId: referral.id });
  const s1 = await lead({ title: 'S1', organizationId: ctx.south.id });
  await lead({ title: 'Solo lead', assignedTo: ctx.solo.id, sourceId: referral.id });
  await setStatus(n1.id, qualified);
  await setStatus(n2.id, lost);
  await setStatus(s1.id, qualified);
  ctx.names = { website: website.name, referral: referral.name, qualified: qualified.name, lost: lost.name };

  // --- opportunities: North 1000 open + 400 won; South 5000 open + 300 lost ---
  const stages = (await request(app).get('/api/v1/pipeline-stages').set(as(ctx.adminToken))).body.data.stages;
  const stageOf = (type) => stages.find((x) => x.type === type);
  ctx.firstStage = stages.filter((x) => x.type === 'open').sort((a, b) => a.order - b.order)[0];
  const opportunity = async (body) => (await post('opportunities', body)).opportunity;
  const move = (id, type) => call('patch', `opportunities/${id}/stage`, ctx.adminToken, { stageId: stageOf(type).id });
  await opportunity({ name: 'North open', companyId: ctx.acme.id, estimatedValue: 1000, probability: 50, assignedTo: ctx.solo.id });
  const northWon = await opportunity({ name: 'North won', companyId: ctx.acme.id, estimatedValue: 400, assignedTo: ctx.norah.id });
  await opportunity({ name: 'South open', companyId: ctx.bolt.id, estimatedValue: 5000, probability: 10 });
  const southLost = await opportunity({ name: 'South lost', companyId: ctx.bolt.id, estimatedValue: 300 });
  await move(northWon.id, 'won');
  await move(southLost.id, 'lost');

  // --- orders: North 2 x desk today (Norah) + 1 x desk four months ago; South 3 x chair (nobody) ---
  const tax = (await post('taxes', { name: 'GST 18', rate: 18 })).item;
  const desk = (await post('products', { name: 'Desk', basePrice: 1000, taxId: tax.id })).product;
  const chair = (await post('products', { name: 'Chair', basePrice: 200, taxId: tax.id })).product;
  await post('orders', { companyId: ctx.acme.id, assignedTo: ctx.norah.id, items: [{ productId: desk.id, quantity: 2 }] });
  await post('orders', { companyId: ctx.acme.id, orderDate: day(-120), items: [{ productId: desk.id, quantity: 1 }] });
  await post('orders', { companyId: ctx.bolt.id, items: [{ productId: chair.id, quantity: 3 }] });

  // --- the rest: a North ticket, a South overdue payment, follow-ups and activities ---
  await post('tickets', { companyId: ctx.acme.id, subject: 'Printer offline' });
  await post('payments', { companyId: ctx.bolt.id, amount: 900, paidAmount: 100, dueDate: day(-3) });
  await post('payments', { companyId: ctx.acme.id, amount: 500, paidAmount: 500 });
  await post('followups', { title: 'Call Acme', relatedType: 'company', relatedId: ctx.acme.id, assignedTo: ctx.norah.id, dueDate: new Date(Date.now() - DAY).toISOString() });
  await post('followups', { title: 'Call Bolt', relatedType: 'company', relatedId: ctx.bolt.id, assignedTo: ctx.solo.id, dueDate: new Date(Date.now() + 5 * DAY).toISOString() });
  const [call1, meeting] = await list('activity-types');
  await post('activities', { typeId: call1.id, subject: 'Intro call', companyId: ctx.acme.id, assignedTo: ctx.norah.id, status: 'completed' });
  await post('activities', { typeId: call1.id, subject: 'Second call', companyId: ctx.acme.id, assignedTo: ctx.norah.id });
  await post('activities', { typeId: meeting.id, subject: 'Site visit', companyId: ctx.bolt.id });
  ctx.types = { call: call1.name, meeting: meeting.name };
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await s.verifyDeclaredPermissions(), []);
});

test('the dashboard needs a token, dashboard.read, and each section its module', async () => {
  const sections = ['summary', 'sales', 'leads', 'opportunities', 'activities'];
  const statuses = async (token) => Promise.all(sections.map(async (section) => (await request(app).get(`${API}/${section}`).set(token ? as(token) : {})).status));
  assert.deepEqual(await statuses(null), [401, 401, 401, 401, 401]);
  assert.deepEqual(await statuses(ctx.plainToken), [403, 403, 403, 403, 403]);
  assert.deepEqual(await statuses(ctx.noDashboardToken), [403, 403, 403, 403, 403], 'module permissions alone do not open it');
  assert.deepEqual(await statuses(ctx.leadsOnlyToken), [200, 403, 200, 403, 403]);
  assert.deepEqual(await statuses(ctx.norahToken), [200, 200, 200, 200, 200]);
});

test('periods: today, week, month, quarter, year and custom', async () => {
  const now = new Date('2031-05-14T10:30:00.000Z'); // a Wednesday
  const range = (query) => {
    const { start, end } = resolvePeriod(query, now);
    return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
  };
  assert.deepEqual(range({ period: 'today' }), ['2031-05-14', '2031-05-15']);
  assert.deepEqual(range({ period: 'week' }), ['2031-05-12', '2031-05-19'], 'Monday to Sunday');
  assert.deepEqual(range({ period: 'month' }), ['2031-05-01', '2031-06-01']);
  assert.deepEqual(range({ period: 'quarter' }), ['2031-04-01', '2031-07-01']);
  assert.deepEqual(range({ period: 'year' }), ['2031-01-01', '2032-01-01']);
  assert.deepEqual(range({ period: 'custom', from: new Date('2031-02-10'), to: new Date('2031-02-20') }), ['2031-02-10', '2031-02-21'], 'both days included');
  assert.deepEqual(range({}), ['2031-05-01', '2031-06-01'], 'month by default');

  // Through the API: echoed back with inclusive dates; bad requests are refused.
  const summary = await board('summary', 'admin', 'period=custom&from=2031-02-10&to=2031-02-20');
  assert.deepEqual(summary.period, { key: 'custom', from: '2031-02-10', to: '2031-02-20' });
  assert.equal((await board('summary')).period.key, 'month');
  for (const query of ['period=fortnight', 'period=custom', 'period=custom&from=2031-02-10', 'period=custom&from=2031-02-20&to=2031-02-10', 'period=custom&from=2001-01-01&to=2031-01-01', 'organizationId=nope']) {
    assert.equal((await request(app).get(`${API}/summary?${query}`).set(as(ctx.adminToken))).status, 422, query);
  }
});

test('summary: every metric is counted in the database, for the period', async () => {
  const { metrics, scope, generatedAt } = await board('summary', 'admin', 'period=year');
  assert.equal(scope.type, 'all');
  assert.deepEqual(scope.organizations.map((o) => o.name), ['North Region', 'South Region']);
  assert.ok(generatedAt);
  assert.deepEqual(
    Object.keys(metrics).sort(),
    ['customers', 'lostValue', 'newLeads', 'openOpportunities', 'openTickets', 'pendingFollowUps', 'pendingPayments', 'pipelineValue', 'qualifiedLeads', 'totalLeads', 'wonValue']
  );
  assert.ok(Object.values(metrics).every((metric) => metric.available));
  assert.equal(value(metrics, 'totalLeads'), 5);
  assert.equal(value(metrics, 'newLeads'), 5);
  assert.equal(value(metrics, 'qualifiedLeads'), 2);
  assert.equal(value(metrics, 'openOpportunities'), 2);
  assert.equal(value(metrics, 'pipelineValue'), 6000);
  assert.deepEqual(metrics.wonValue, { available: true, value: 400, count: 1 });
  assert.deepEqual(metrics.lostValue, { available: true, value: 300, count: 1 });
  assert.deepEqual(metrics.customers, { available: true, value: 2, new: 2 }, 'both companies have orders');
  assert.deepEqual(metrics.pendingFollowUps, { available: true, value: 2, overdue: 1 });
  assert.deepEqual(metrics.openTickets, { available: true, value: 1, unassigned: 1 });
  assert.deepEqual(metrics.pendingPayments, { available: true, value: 1, amount: 800, overdue: 1, overdueAmount: 800 });

  // A period with nothing in it: "in the period" figures drop to zero, standing figures stay.
  const past = (await board('summary', 'admin', 'period=custom&from=2020-01-01&to=2020-12-31')).metrics;
  assert.deepEqual([value(past, 'newLeads'), value(past, 'qualifiedLeads'), value(past, 'wonValue'), value(past, 'lostValue'), past.customers.new], [0, 0, 0, 0, 0]);
  assert.deepEqual([value(past, 'totalLeads'), value(past, 'openOpportunities'), value(past, 'pipelineValue'), value(past, 'customers')], [5, 2, 6000, 2]);
});

test('RBAC: a figure whose module the user cannot read is unavailable - not zero', async () => {
  const { metrics } = await board('summary', 'leadsOnly');
  assert.equal(metrics.totalLeads.available, true);
  for (const key of ['openOpportunities', 'pipelineValue', 'wonValue', 'lostValue', 'customers', 'pendingFollowUps', 'openTickets', 'pendingPayments']) {
    assert.deepEqual(metrics[key], { available: false }, key);
  }
});

test('organization scope: a user sees their own organization, and only that', async () => {
  const { metrics, scope } = await board('summary', 'norah', 'period=year');
  assert.deepEqual(scope, { type: 'organization', organization: { id: ctx.north.id, name: 'North Region' }, organizations: [] });
  assert.equal(value(metrics, 'totalLeads'), 3);
  assert.equal(value(metrics, 'qualifiedLeads'), 1);
  assert.equal(value(metrics, 'openOpportunities'), 1);
  assert.equal(value(metrics, 'pipelineValue'), 1000);
  assert.equal(value(metrics, 'wonValue'), 400);
  assert.equal(value(metrics, 'lostValue'), 0, 'the lost deal is in the South');
  assert.equal(value(metrics, 'customers'), 1);
  assert.equal(value(metrics, 'openTickets'), 1);
  assert.deepEqual([value(metrics, 'pendingPayments'), metrics.pendingPayments.amount], [0, 0], 'the unpaid invoice is in the South');
  assert.equal(value(metrics, 'pendingFollowUps'), 1, 'follow-ups of the people in the organization');

  // Asking for another organization is refused; asking for your own is fine.
  let res = await request(app).get(`${API}/summary?organizationId=${ctx.south.id}`).set(as(ctx.norahToken));
  assert.equal(res.status, 403);
  assert.match(res.body.message, /your own organization/);
  res = await request(app).get(`${API}/summary?organizationId=${ctx.north.id}`).set(as(ctx.norahToken));
  assert.equal(res.status, 200);

  // Someone who sees everything can look at one organization - the same figures.
  const south = await board('summary', 'admin', `period=year&organizationId=${ctx.south.id}`);
  assert.equal(south.scope.organization.name, 'South Region');
  assert.deepEqual([value(south.metrics, 'totalLeads'), value(south.metrics, 'pipelineValue'), value(south.metrics, 'lostValue'), south.metrics.pendingPayments.amount], [1, 5000, 300, 800]);
  assert.equal((await request(app).get(`${API}/summary?organizationId=${new mongoose.Types.ObjectId()}`).set(as(ctx.adminToken))).status, 400);

  // No organization and no dashboard.viewAll: only what is assigned to you.
  const own = await board('summary', 'solo', 'period=year');
  assert.equal(own.scope.type, 'own');
  assert.deepEqual(
    [value(own.metrics, 'totalLeads'), value(own.metrics, 'openOpportunities'), value(own.metrics, 'pipelineValue'), value(own.metrics, 'wonValue'), value(own.metrics, 'pendingFollowUps'), value(own.metrics, 'openTickets')],
    [1, 1, 1000, 0, 1, 0]
  );
});

test('leads: by source and by status', async () => {
  const data = await board('leads', 'admin', 'period=month');
  assert.deepEqual(data.totals, { created: 5, qualified: 2, won: 0, lost: 1, conversionRate: 0 });
  assert.deepEqual(data.bySource.map((row) => [row.name, row.count]), [[ctx.names.website, 2], [ctx.names.referral, 2], ['No source', 1]]);
  const byStatus = Object.fromEntries(data.byStatus.map((row) => [row.name, row.count]));
  assert.equal(byStatus[ctx.names.qualified], 2);
  assert.equal(byStatus[ctx.names.lost], 1);
  assert.equal(data.byStatus.reduce((n, row) => n + row.count, 0), 5);
  assert.ok(data.byStatus.every((row) => row.count > 0 && row.id && row.category));

  const north = await board('leads', 'norah');
  assert.deepEqual(north.bySource.map((row) => [row.name, row.count]), [[ctx.names.website, 2], [ctx.names.referral, 1]]);
  assert.deepEqual((await board('leads', 'admin', 'period=custom&from=2020-01-01&to=2020-01-31')).totals, { created: 0, qualified: 0, won: 0, lost: 0, conversionRate: null });
});

test('opportunities: the open pipeline stage by stage, won and lost in the period', async () => {
  const data = await board('opportunities', 'admin', 'period=month');
  assert.equal(data.pipeline.id, data.pipelines.find((p) => p.isDefault).id);
  assert.deepEqual(data.totals, { open: { count: 2, value: 6000, weightedValue: 1000 }, won: { count: 1, value: 400 }, lost: { count: 1, value: 300 }, winRate: 50 });
  // Every open stage in board order; both open deals are in the first one.
  assert.deepEqual(data.stages.map((x) => x.order), data.stages.map((x) => x.order).sort((a, b) => a - b));
  assert.ok(data.stages.length > 1);
  const [first, ...rest] = data.stages;
  assert.deepEqual([first.id, first.count, first.value, first.weightedValue], [ctx.firstStage.id, 2, 6000, 1000]);
  assert.ok(rest.every((stage) => stage.count === 0 && stage.value === 0));

  const north = await board('opportunities', 'norah');
  assert.deepEqual(north.totals, { open: { count: 1, value: 1000, weightedValue: 500 }, won: { count: 1, value: 400 }, lost: { count: 0, value: 0 }, winRate: 100 });
  assert.equal((await request(app).get(`${API}/opportunities?pipelineId=${new mongoose.Types.ObjectId()}`).set(as(ctx.adminToken))).status, 400);
});

test('sales: monthly sales, salesperson performance, product performance', async () => {
  const data = await board('sales', 'admin', 'period=month');
  // Two orders this month: 2 desks (2360) and 3 chairs (708). The older one is outside the period.
  assert.deepEqual(data.totals, { orderCount: 2, orderValue: 3068, averageOrderValue: 1534 });

  assert.equal(data.monthlySales.length, 12, 'the twelve months ending with this one');
  const thisMonth = new Date().toISOString().slice(0, 7);
  assert.equal(data.monthlySales.at(-1).month, thisMonth);
  assert.deepEqual(data.monthlySales.map((m) => m.month), [...data.monthlySales.map((m) => m.month)].sort());
  const older = day(-120).slice(0, 7);
  const months = Object.fromEntries(data.monthlySales.map((m) => [m.month, m]));
  // In case the older order falls in the same calendar month, compare the sum.
  assert.equal(data.monthlySales.reduce((n, m) => n + m.value, 0), 3068 + 1180);
  assert.equal(months[older].orderCount >= 1, true);

  // Norah sold the desks and won a deal; the chairs were nobody's.
  assert.deepEqual(data.salespeople, [
    { user: { id: ctx.norah.id, fullName: 'Norah North' }, orderCount: 1, orderValue: 2360, wonCount: 1, wonValue: 400 },
    { user: null, orderCount: 1, orderValue: 708, wonCount: 0, wonValue: 0 },
  ]);
  // Revenue is before tax; the best seller first.
  assert.deepEqual(data.products.map((p) => [p.name, p.quantity, p.revenue, p.orderCount]), [['Desk', 2, 2000, 1], ['Chair', 3, 600, 1]]);

  // The year brings the older order in; the North sees only its own.
  const year = await board('sales', 'admin', `period=custom&from=${day(-200)}&to=${day(0)}`);
  assert.equal(year.totals.orderCount, 3);
  assert.deepEqual(year.products.map((p) => [p.name, p.quantity]), [['Desk', 3], ['Chair', 3]]);
  const north = await board('sales', 'norah');
  assert.deepEqual([north.totals.orderCount, north.totals.orderValue, north.products.length], [1, 2360, 1]);
  // Cancelled orders are not sales; a three-year range charts every month of it (36 at most).
  assert.equal((await board('sales', 'admin', `period=custom&from=${day(-1200)}&to=${day(0)}`)).monthlySales.length, 36);
});

test('activities: by type, by status, by person; follow-ups', async () => {
  const data = await board('activities', 'admin', 'period=month');
  assert.deepEqual(data.totals, { total: 3, pending: 2, completed: 1, cancelled: 0, overdue: 0 });
  assert.deepEqual(data.byType.map((row) => [row.name, row.count]), [[ctx.types.call, 2], [ctx.types.meeting, 1]]);
  const norah = data.byUser.find((row) => row.user?.id === ctx.norah.id);
  assert.deepEqual([norah.count, norah.completed], [2, 1]);
  assert.deepEqual(data.followUps, { available: true, pending: 2, overdue: 1, dueToday: 0, completedInPeriod: 0 });

  const north = await board('activities', 'norah');
  assert.deepEqual([north.totals.total, north.followUps.pending], [2, 1]);
});

test('"qualified" is a flag on the lead status, set by administrators', async () => {
  // Databases seeded before the flag existed get it once, by seed name; never again.
  await LeadStatus.updateMany({}, { $set: { isQualified: false } });
  await SeedState.deleteOne({ _id: 'leadStatusQualifiedFlag' });
  assert.equal((await board('summary', 'admin', 'period=year')).metrics.qualifiedLeads.value, 0);
  assert.equal(await s.flagQualifiedLeadStatuses(), true);
  assert.equal(await s.flagQualifiedLeadStatuses(), false);
  assert.equal((await board('summary', 'admin', 'period=year')).metrics.qualifiedLeads.value, 2);

  // Marking "lost" as qualified in Settings changes the figure - no code involved.
  const lost = await LeadStatus.findOne({ category: 'lost' });
  const res = await request(app).put(`/api/v1/lead-statuses/${lost.id}`).set(as(ctx.adminToken)).send({ isQualified: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.item.isQualified, true);
  assert.equal((await board('summary', 'admin', 'period=year')).metrics.qualifiedLeads.value, 3);
});

test('a user can be given an organization through the users API', async () => {
  let res = await request(app).put(`/api/v1/users/${ctx.solo.id}`).set(as(ctx.adminToken)).send({ organizationId: ctx.south.id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual([res.body.data.user.organizationId, res.body.data.user.organization.name], [ctx.south.id, 'South Region']);
  assert.equal((await board('summary', 'solo', 'period=year')).scope.organization.name, 'South Region');
  res = await request(app).put(`/api/v1/users/${ctx.solo.id}`).set(as(ctx.adminToken)).send({ organizationId: new mongoose.Types.ObjectId().toString() });
  assert.equal(res.status, 400);
  res = await request(app).put(`/api/v1/users/${ctx.solo.id}`).set(as(ctx.adminToken)).send({ organizationId: null });
  assert.equal(res.body.data.user.organizationId, undefined);
});
