import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_projects');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Project } = await import('../src/models/Project.js');
const { default: ProjectTask } = await import('../src/models/ProjectTask.js');
const { default: User } = await import('../src/models/User.js');
const { default: Customer } = await import('../src/models/Customer.js');
const s = await import('../src/services/seed.service.js');
const { PROJECT_STATUS_SEED, TASK_STATUS_SEED } = await import('../src/seeds/project.seed.js');
const { createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const API = '/api/v1/projects';

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const missing = () => new mongoose.Types.ObjectId().toString();
const post = async (path, body) => (await request(app).post(`/api/v1/${path}`).set(admin()).send(body)).body.data;
const byCategory = (list, category) => list.find((status) => status.category === category);
const create = (body, token = ctx.adminToken) =>
  request(app).post(API).set(as(token)).send({ name: 'Office fit-out', companyId: ctx.acme.id, ...body });
const task = (body, token = ctx.adminToken) =>
  request(app).post(`${API}/${ctx.project.id}/tasks`).set(as(token)).send({ title: 'Survey site', ...body });
const titles = async (query = '') =>
  (await request(app).get(`${API}/${ctx.project.id}/tasks?sortBy=title&${query}`).set(admin())).body.data.tasks.map((t) => t.title);

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Project.init(), ProjectTask.init(), Customer.init()]);
  await seedRbac();
  await s.seedLeadConfig();
  await s.seedQuotationStatuses();
  await s.seedOrderStatuses();
  await s.seedActivityTypes();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.plain = await createUser(await defaultRole());
  ctx.reader = await createUser(await createRole(['projects.read'], 'Project Reader'));
  ctx.lead = await createUser(await createRole(['projects.read', 'projects.update', 'projects.manageTasks'], 'Team Lead'), {
    firstName: 'Lena',
    lastName: 'Lead',
  });
  ctx.dev = await createUser(await defaultRole(), { firstName: 'Dev', lastName: 'One' });
  ctx.outsider = await createUser(await defaultRole(), { firstName: 'Out', lastName: 'Sider' });
  ctx.inactive = await createUser(await defaultRole(), { status: 'inactive' });
  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.readerToken = await loginAs(app, ctx.reader);
  ctx.leadToken = await loginAs(app, ctx.lead);

  ctx.acme = (await post('companies', { name: 'Acme Industries' })).company;
  ctx.bolt = (await post('companies', { name: 'Bolt Traders' })).company;
  ctx.priorities = (await request(app).get('/api/v1/lead-priorities').set(admin())).body.data.items;

  // An order for Acme (which makes Acme a customer), and one for Bolt.
  const tax = (await post('taxes', { name: 'GST 18', rate: 18 })).item;
  const product = (await post('products', { name: 'Desk', basePrice: 1000, taxId: tax.id })).product;
  ctx.acmeOrder = (await post('orders', { companyId: ctx.acme.id, items: [{ productId: product.id, quantity: 2 }] })).order;
  ctx.boltOrder = (await post('orders', { companyId: ctx.bolt.id, items: [{ productId: product.id, quantity: 1 }] })).order;
  ctx.acmeCustomer = await Customer.findOne({ companyId: ctx.acme.id });
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await s.verifyDeclaredPermissions(), []);
});

test('project and task statuses are data: nothing until seeded; projects need a default', async () => {
  assert.equal((await create({})).status, 409);
  assert.equal(await s.seedProjectStatuses(), true);
  assert.equal(await s.seedProjectStatuses(), false);
  ctx.projectStatuses = (await request(app).get('/api/v1/project-statuses').set(admin())).body.data.items;
  ctx.taskStatuses = (await request(app).get('/api/v1/task-statuses').set(admin())).body.data.items;
  assert.deepEqual(ctx.projectStatuses.map((x) => [x.name, x.category]), PROJECT_STATUS_SEED.map((x) => [x.name, x.category]));
  assert.deepEqual(ctx.taskStatuses.map((x) => [x.name, x.category]), TASK_STATUS_SEED.map((x) => [x.name, x.category]));
  assert.equal((await request(app).post('/api/v1/task-statuses').set(admin()).send({ name: 'Odd', category: 'won' })).status, 422);
  assert.equal((await request(app).get('/api/v1/task-statuses').set(as(ctx.readerToken))).status, 200);
  assert.equal((await request(app).post('/api/v1/project-statuses').set(as(ctx.leadToken)).send({ name: 'Nope' })).status, 403);
});

test('every project endpoint needs a token (401) and a permission (403)', async () => {
  const id = missing();
  const calls = (headers) => [
    request(app).get(API).set(headers),
    request(app).post(API).set(headers).send({ name: 'Nope', companyId: ctx.acme.id }),
    request(app).get(`${API}/${id}`).set(headers),
    request(app).get(`${API}/${id}/summary`).set(headers),
    request(app).get(`${API}/${id}/timeline`).set(headers),
    request(app).put(`${API}/${id}`).set(headers).send({ name: 'Nope' }),
    request(app).delete(`${API}/${id}`).set(headers),
    request(app).get(`${API}/${id}/tasks`).set(headers),
    request(app).post(`${API}/${id}/tasks`).set(headers).send({ title: 'Nope' }),
    request(app).put(`${API}/${id}/tasks/${missing()}`).set(headers).send({ title: 'Nope' }),
    request(app).delete(`${API}/${id}/tasks/${missing()}`).set(headers),
    request(app).get(`${API}/${id}/milestones`).set(headers),
    request(app).post(`${API}/${id}/milestones`).set(headers).send({ name: 'Nope' }),
  ];
  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) assert.equal(res.status, 403);
  const reader = as(ctx.readerToken);
  assert.equal((await request(app).post(`${API}/${id}/tasks`).set(reader).send({ title: 'Nope' })).status, 403);
  assert.equal(await Project.countDocuments(), 0);
});

// --- projects ---------------------------------------------------------------------

test('create: number, defaults, customer found from the company, team and order checked', async () => {
  const res = await create({
    orderId: ctx.acmeOrder.id,
    description: 'Two floors',
    startDate: '2031-01-05',
    expectedEndDate: '2031-03-31',
    projectManagerId: ctx.lead.id,
    teamMembers: [ctx.dev.id],
    budget: 250000,
  });
  assert.equal(res.status, 201);
  const { project } = res.body.data;
  assert.equal(project.projectNumber, 'PRJ-000001');
  assert.equal(project.customerId, String(ctx.acmeCustomer._id), "the company's customer record, not copied data");
  assert.equal(project.customer.customerNumber, ctx.acmeCustomer.customerNumber);
  assert.equal(project.order.orderNumber, ctx.acmeOrder.orderNumber);
  assert.equal(project.status.category, 'not_started');
  assert.equal(project.priority.name, ctx.priorities.find((p) => p.isDefault).name, 'the default priority');
  assert.equal(project.projectManager.fullName, 'Lena Lead');
  assert.deepEqual(project.teamMembers, [ctx.dev.id]);
  assert.deepEqual(project.team.map((m) => m.fullName), ['Dev One']);
  assert.deepEqual(project.stats, { totalTasks: 0, doneTasks: 0, openTasks: 0, overdueTasks: 0, progress: null });
  ctx.project = project;

  const cases = {
    'no name': [{ name: undefined }, 422, 'name'],
    'unknown company': [{ companyId: missing() }, 400, 'companyId'],
    'order of another company': [{ orderId: ctx.boltOrder.id }, 400, 'orderId'],
    'unknown order': [{ orderId: missing() }, 400, 'orderId'],
    'customer of another company': [{ companyId: ctx.bolt.id, customerId: String(ctx.acmeCustomer._id) }, 400, 'customerId'],
    'unknown status': [{ statusId: missing() }, 400, 'statusId'],
    'unknown priority': [{ priorityId: missing() }, 400, 'priorityId'],
    'inactive manager': [{ projectManagerId: ctx.inactive.id }, 400, 'projectManagerId'],
    'inactive member': [{ teamMembers: [ctx.dev.id, ctx.inactive.id] }, 400, 'teamMembers'],
    'repeated member': [{ teamMembers: [ctx.dev.id, ctx.dev.id] }, 422, 'teamMembers'],
    'end before start': [{ startDate: '2031-02-01', expectedEndDate: '2031-01-01' }, 422, 'expectedEndDate'],
    'negative budget': [{ budget: -1 }, 422, 'budget'],
    'number sent': [{ projectNumber: 'PRJ-9' }, 422, 'projectNumber'],
  };
  for (const [label, [body, status, field]] of Object.entries(cases)) {
    const r = await create(body);
    assert.equal(r.status, status, label);
    assert.ok(r.body.errors.some((e) => e.field === field || e.field.startsWith(`${field}.`)), `${label}: names ${field}`);
  }
  assert.equal(await Project.countDocuments(), 1);

  // A company without a customer record: no customer.
  const bolt = (await create({ name: 'Bolt warehouse', companyId: ctx.bolt.id, orderId: ctx.boltOrder.id })).body.data.project;
  assert.equal(String(bolt.customerId), String((await Customer.findOne({ companyId: ctx.bolt.id }))._id));
  ctx.bolt2 = bolt;
});

test('update: team, status (completed sets the actual end date) and history; company fixed', async () => {
  const url = `${API}/${ctx.project.id}`;
  const res = await request(app).put(url).set(as(ctx.leadToken)).send({ teamMembers: [ctx.dev.id, ctx.admin.id], budget: 300000 });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.project.team.map((m) => m.fullName).sort(), ['Ada Admin', 'Dev One']);

  const active = await request(app).put(url).set(admin()).send({ statusId: byCategory(ctx.projectStatuses, 'active').id });
  assert.equal(active.body.data.project.status.category, 'active');
  assert.equal('actualEndDate' in active.body.data.project, false);

  for (const [label, body, status] of [
    ['move company', { companyId: ctx.bolt.id }, 422],
    ['nothing', {}, 422],
    ['bad order', { orderId: ctx.boltOrder.id }, 400],
  ]) {
    assert.equal((await request(app).put(url).set(admin()).send(body)).status, status, label);
  }
  assert.equal((await request(app).put(url).set(as(ctx.readerToken)).send({ name: 'Nope' })).status, 403);

  const events = (await request(app).get(`${url}/timeline`).set(admin())).body.data.events;
  assert.deepEqual(events.map((e) => e.action), ['status_changed', 'updated', 'created']);
  assert.deepEqual(events[1].changes.map((c) => c.label), ['Team', 'Budget']);
});

// --- tasks ---------------------------------------------------------------------

test('tasks: created with the default status; assignee must be on the team; milestone of this project', async () => {
  ctx.milestone = (await post(`projects/${ctx.project.id}/milestones`, { name: 'Design approved', dueDate: '2031-02-01' })).milestone;
  const otherMilestone = (await post(`projects/${ctx.bolt2.id}/milestones`, { name: 'Other' })).milestone;

  const res = await task({ title: 'Draw floor plan', assignedTo: ctx.dev.id, milestoneId: ctx.milestone.id, dueDate: '2031-01-20', estimatedHours: 12 }, ctx.leadToken);
  assert.equal(res.status, 201);
  const created = res.body.data.task;
  assert.equal(created.status.category, 'todo');
  assert.equal(created.assignedToUser.fullName, 'Dev One');
  assert.equal(created.milestone.name, 'Design approved');
  assert.equal('completedAt' in created, false);
  ctx.plan = created;

  ctx.order = (await task({ title: 'Order furniture', assignedTo: ctx.lead.id, dueDate: '2020-01-01' })).body.data.task;
  ctx.wiring = (await task({ title: 'Wiring', assignedTo: ctx.admin.id })).body.data.task;

  const cases = {
    'assignee off the team': [{ assignedTo: ctx.outsider.id }, 400, 'assignedTo'],
    'milestone of another project': [{ milestoneId: otherMilestone.id }, 400, 'milestoneId'],
    'unknown status': [{ statusId: missing() }, 400, 'statusId'],
    'due before start': [{ startDate: '2031-02-01', dueDate: '2031-01-01' }, 422, 'dueDate'],
    'no title': [{ title: '' }, 422, 'title'],
    'completedAt sent': [{ completedAt: '2031-01-01' }, 422, 'completedAt'],
  };
  for (const [label, [body, status, field]] of Object.entries(cases)) {
    const r = await task(body);
    assert.equal(r.status, status, label);
    assert.ok(r.body.errors.some((e) => e.field === field || e.field.startsWith(`${field}.`)), `${label}: names ${field}`);
  }
  assert.equal((await request(app).post(`${API}/${missing()}/tasks`).set(admin()).send({ title: 'Ghost' })).status, 404);
});

test('tasks: done records completion, leaving done clears it; changes appear on the project timeline', async () => {
  const url = `${API}/${ctx.project.id}/tasks/${ctx.plan.id}`;
  const done = await request(app).put(url).set(as(ctx.leadToken)).send({ statusId: byCategory(ctx.taskStatuses, 'done').id });
  assert.equal(done.status, 200);
  assert.ok(done.body.data.task.completedAt);
  const reopened = await request(app).put(url).set(admin()).send({ statusId: byCategory(ctx.taskStatuses, 'in_progress').id });
  assert.equal('completedAt' in reopened.body.data.task, false);
  await request(app).put(url).set(admin()).send({ statusId: byCategory(ctx.taskStatuses, 'done').id });

  assert.equal((await request(app).put(url).set(admin()).send({ assignedTo: ctx.outsider.id })).status, 400);
  assert.equal((await request(app).put(`${API}/${ctx.bolt2.id}/tasks/${ctx.plan.id}`).set(admin()).send({ title: 'XY' })).status, 404, 'a task is reached through its own project');

  const events = (await request(app).get(`${API}/${ctx.project.id}/timeline?limit=5`).set(admin())).body.data.events;
  assert.match(events[0].summary, /Task "Draw floor plan" changed/);
  assert.deepEqual(events[0].changes.map((c) => [c.label, c.from, c.to]), [['Status', 'In Progress', 'Done']]);
});

test('tasks: list with filters, search, overdue and sorting', async () => {
  assert.deepEqual(await titles(), ['Draw floor plan', 'Order furniture', 'Wiring']);
  assert.deepEqual(await titles(`assignedTo=${ctx.dev.id}`), ['Draw floor plan']);
  assert.deepEqual(await titles(`milestoneId=${ctx.milestone.id}`), ['Draw floor plan']);
  assert.deepEqual(await titles('statusCategory=done'), ['Draw floor plan']);
  assert.deepEqual(await titles('statusCategory=todo'), ['Order furniture', 'Wiring']);
  assert.deepEqual(await titles('overdue=true'), ['Order furniture'], 'past due and still open');
  assert.deepEqual(await titles('search=wir'), ['Wiring']);
  const sorted = (await request(app).get(`${API}/${ctx.project.id}/tasks?sortBy=dueDate&sortOrder=desc`).set(admin())).body.data.tasks;
  assert.equal(sorted[0].title, 'Draw floor plan');
  assert.equal((await request(app).get(`${API}/${ctx.project.id}/tasks?sortBy=secret`).set(admin())).status, 422);
});

test('milestones: task counts from the database, reached, and protected while tasks use them', async () => {
  const milestones = (await request(app).get(`${API}/${ctx.project.id}/milestones`).set(as(ctx.readerToken))).body.data.milestones;
  assert.deepEqual(milestones.map((m) => [m.name, m.totalTasks, m.doneTasks]), [['Design approved', 1, 1]]);

  const url = `${API}/${ctx.project.id}/milestones/${ctx.milestone.id}`;
  const reached = await request(app).put(url).set(as(ctx.leadToken)).send({ completed: true });
  assert.ok(reached.body.data.milestone.completedAt);
  assert.equal((await request(app).delete(url).set(admin())).status, 409);

  const spare = (await post(`projects/${ctx.project.id}/milestones`, { name: 'Spare' })).milestone;
  assert.equal((await request(app).delete(`${API}/${ctx.project.id}/milestones/${spare.id}`).set(admin())).status, 200);
  assert.equal((await request(app).delete(`${API}/${ctx.bolt2.id}/milestones/${ctx.milestone.id}`).set(admin())).status, 404);
});

test('summary and list figures come from the database', async () => {
  const res = await request(app).get(`${API}/${ctx.project.id}/summary`).set(as(ctx.readerToken));
  assert.equal(res.status, 200);
  const { sections, metrics, project } = res.body.data;
  assert.deepEqual(sections.map((x) => x.key), ['tasks', 'milestones', 'team', 'activities', 'documents', 'tickets', 'timeline']);
  const count = (key) => sections.find((x) => x.key === key).count;
  assert.equal(count('tasks'), 3);
  assert.equal(count('milestones'), 1);
  assert.equal(count('team'), 3, 'manager plus two members');
  assert.equal(count('tickets'), 0, 'tickets are real now; this project has none');
  assert.equal(count('documents'), 0, 'documents are real now; this project has none');
  assert.deepEqual(
    [metrics.tasks.totalTasks, metrics.tasks.doneTasks, metrics.tasks.openTasks, metrics.tasks.overdueTasks, metrics.tasks.progress, metrics.tasks.estimatedHours],
    [3, 1, 2, 1, 33, 12]
  );
  assert.deepEqual(metrics.milestones, { total: 1, completed: 1, overdue: 0 });
  assert.equal(project.stats.progress, 33);

  // A cancelled task does not count towards progress.
  await request(app).put(`${API}/${ctx.project.id}/tasks/${ctx.wiring.id}`).set(admin()).send({ statusId: byCategory(ctx.taskStatuses, 'cancelled').id });
  const list = (await request(app).get(`${API}?companyId=${ctx.acme.id}`).set(admin())).body.data.projects;
  assert.equal(list[0].stats.progress, 50);
});

test('list projects: search, filters, member filter, sorting, pagination', async () => {
  const names = async (query) => (await request(app).get(`${API}?sortBy=name&sortOrder=asc&${query}`).set(admin())).body.data.projects.map((p) => p.name);
  assert.deepEqual(await names(''), ['Bolt warehouse', 'Office fit-out']);
  assert.deepEqual(await names('search=PRJ-000001'), ['Office fit-out']);
  assert.deepEqual(await names(`memberId=${ctx.dev.id}`), ['Office fit-out']);
  assert.deepEqual(await names(`memberId=${ctx.lead.id}`), ['Office fit-out'], 'as manager');
  assert.deepEqual(await names(`orderId=${ctx.boltOrder.id}`), ['Bolt warehouse']);
  assert.deepEqual(await names('statusCategory=active'), ['Office fit-out']);
  assert.deepEqual(await names(`customerId=${ctx.acmeCustomer._id}`), ['Office fit-out']);
  const page = await request(app).get(`${API}?limit=1&page=2&sortBy=name&sortOrder=asc`).set(admin());
  assert.deepEqual(page.body.data.pagination, { page: 2, limit: 1, total: 2, totalPages: 2 });
  assert.equal((await request(app).get(`${API}?sortBy=secret`).set(admin())).status, 422);
});

test('completing a project sets its actual end date: today, but not before its start', async () => {
  const res = await request(app).put(`${API}/${ctx.project.id}`).set(admin()).send({ statusId: byCategory(ctx.projectStatuses, 'completed').id });
  assert.equal(res.status, 200);
  // This project starts in 2031.
  assert.equal(res.body.data.project.actualEndDate.slice(0, 10), '2031-01-05');
});

test('other modules: activities about a project, company and customer pages count projects', async () => {
  const types = (await request(app).get('/api/v1/activity-types').set(admin())).body.data.items;
  const activity = await post('activities', { typeId: types[0].id, subject: 'Site walk-through', projectId: ctx.project.id });
  assert.equal(activity.activity.project.name, 'Office fit-out');
  assert.equal(activity.activity.companyId, ctx.acme.id, 'the company comes from the project');
  const followUp = await post('followups', { title: 'Confirm handover', relatedType: 'project', relatedId: ctx.project.id, dueDate: '2031-04-01T10:00:00.000Z' });
  assert.equal(followUp.followUp.related.label, 'PRJ-000001 - Office fit-out');

  const summary = (await request(app).get(`${API}/${ctx.project.id}/summary`).set(admin())).body.data;
  assert.equal(summary.sections.find((x) => x.key === 'activities').count, 1);

  const sections = (await request(app).get(`/api/v1/companies/${ctx.acme.id}/sections`).set(admin())).body.data.sections;
  assert.deepEqual((({ available, count }) => [available, count])(sections.find((x) => x.key === 'projects')), [true, 1]);
  const customer = (await request(app).get(`/api/v1/customers/${ctx.acmeCustomer._id}/summary`).set(admin())).body.data;
  assert.equal(customer.sections.find((x) => x.key === 'projects').count, 1);
  assert.equal((await request(app).delete(`/api/v1/project-statuses/${byCategory(ctx.projectStatuses, 'completed').id}`).set(admin())).status, 409);

  const orderOptions = await request(app).get(`/api/v1/orders/options?companyId=${ctx.acme.id}`).set(as(ctx.leadToken));
  assert.equal(orderOptions.status, 200, 'project editors can pick orders');
  assert.deepEqual(orderOptions.body.data.orders.map((o) => o.orderNumber), [ctx.acmeOrder.orderNumber]);
});

test('delete: tasks deleted and a project deleted are hidden', async () => {
  assert.equal((await request(app).delete(`${API}/${ctx.project.id}/tasks/${ctx.order.id}`).set(as(ctx.leadToken))).status, 200);
  assert.deepEqual(await titles(), ['Draw floor plan', 'Wiring']);
  assert.equal((await request(app).delete(`${API}/${ctx.bolt2.id}`).set(as(ctx.leadToken))).status, 403);
  assert.equal((await request(app).delete(`${API}/${ctx.bolt2.id}`).set(admin())).status, 200);
  assert.equal((await request(app).get(`${API}/${ctx.bolt2.id}`).set(admin())).status, 404);
  assert.ok(await Project.findById(ctx.bolt2.id).setOptions({ withDeleted: true }));
});
