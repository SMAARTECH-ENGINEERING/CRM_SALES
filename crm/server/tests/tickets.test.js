import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

const UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-ticket-uploads-'));
setTestEnv('crm_test_tickets', { UPLOAD_DIR: UPLOADS, UPLOAD_MAX_FILE_MB: '0.01', UPLOAD_MAX_FILES: '2' });

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Ticket } = await import('../src/models/Ticket.js');
const { default: User } = await import('../src/models/User.js');
const { default: Customer } = await import('../src/models/Customer.js');
const s = await import('../src/services/seed.service.js');
const { TICKET_STATUS_SEED } = await import('../src/seeds/ticket.seed.js');
const { createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const API = '/api/v1/tickets';

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const missing = () => new mongoose.Types.ObjectId().toString();
const post = async (p, body) => (await request(app).post(`/api/v1/${p}`).set(admin()).send(body)).body.data;
const statusOf = (category) => ctx.statuses.find((x) => x.category === category);
const create = (body, token = ctx.adminToken) =>
  request(app).post(API).set(as(token)).send({ companyId: ctx.acme.id, subject: 'Printer offline', ...body });
const numbers = async (query) =>
  (await request(app).get(`${API}?limit=100&sortBy=ticketNumber&sortOrder=asc&${query}`).set(admin())).body.data.tickets.map((t) => t.ticketNumber);
// supertest buffers a binary body only when told how.
const download = (url, token = ctx.adminToken) =>
  request(app)
    .get(url)
    .set(as(token))
    .buffer(true)
    .parse((res, done) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
const filesOnDisk = () => fs.readdirSync(UPLOADS, { recursive: true }).filter((name) => fs.statSync(path.join(UPLOADS, name)).isFile());

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Ticket.init(), Customer.init()]);
  await seedRbac();
  await s.seedLeadConfig();
  await s.seedActivityTypes();
  await s.seedProjectStatuses();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.plain = await createUser(await defaultRole());
  ctx.reader = await createUser(await createRole(['tickets.read'], 'Ticket Reader'));
  // Works the queue: may take tickets, reply and add notes, but not assign others.
  ctx.agent = await createUser(
    await createRole(['tickets.read', 'tickets.create', 'tickets.update', 'tickets.reply', 'tickets.addInternalNote'], 'Agent'),
    { firstName: 'Asha', lastName: 'Agent' }
  );
  ctx.lead = await createUser(await createRole(['tickets.read', 'tickets.assign'], 'Support Lead'));
  ctx.inactive = await createUser(await defaultRole(), { status: 'inactive' });
  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.readerToken = await loginAs(app, ctx.reader);
  ctx.agentToken = await loginAs(app, ctx.agent);
  ctx.leadToken = await loginAs(app, ctx.lead);

  ctx.acme = (await post('companies', { name: 'Acme Industries' })).company;
  ctx.bolt = (await post('companies', { name: 'Bolt Traders' })).company;
  ctx.priya = (await post('contacts', { firstName: 'Priya', lastName: 'Nair', companyId: ctx.acme.id, email: 'priya@acme.example' })).contact;
  ctx.omar = (await post('contacts', { firstName: 'Omar', lastName: 'Khan', companyId: ctx.bolt.id })).contact;
  ctx.acmeCustomer = (await post('customers', { companyId: ctx.acme.id })).customer;
  ctx.acmeProject = (await post('projects', { name: 'Fit-out', companyId: ctx.acme.id })).project;
  ctx.boltProject = (await post('projects', { name: 'Warehouse', companyId: ctx.bolt.id })).project;
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
  fs.rmSync(UPLOADS, { recursive: true, force: true });
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await s.verifyDeclaredPermissions(), []);
});

test('categories, priorities and statuses are data: nothing until seeded', async () => {
  assert.equal((await create({})).status, 409, 'a ticket needs a default status');
  assert.equal(await s.seedTicketSettings(), true);
  assert.equal(await s.seedTicketSettings(), false);
  ctx.statuses = (await request(app).get('/api/v1/ticket-statuses').set(admin())).body.data.items;
  ctx.priorities = (await request(app).get('/api/v1/ticket-priorities').set(admin())).body.data.items;
  ctx.categories = (await request(app).get('/api/v1/ticket-categories').set(admin())).body.data.items;
  assert.deepEqual(ctx.statuses.map((x) => [x.name, x.category]), TICKET_STATUS_SEED.map((x) => [x.name, x.category]));
  assert.equal(ctx.priorities.filter((p) => p.isDefault).length, 1);
  assert.equal(ctx.categories.length, 5);
  assert.equal((await request(app).post('/api/v1/ticket-priorities').set(admin()).send({ name: 'No level' })).status, 422, 'level is required');
  assert.equal((await request(app).post('/api/v1/ticket-statuses').set(admin()).send({ name: 'Odd', category: 'won' })).status, 422);
  assert.equal((await request(app).get('/api/v1/ticket-categories').set(as(ctx.readerToken))).status, 200);
  assert.equal((await request(app).post('/api/v1/ticket-categories').set(as(ctx.agentToken)).send({ name: 'Nope' })).status, 403);
});

test('every ticket endpoint needs a token (401) and a permission (403)', async () => {
  const id = missing();
  const calls = (headers) => [
    request(app).get(API).set(headers),
    request(app).get(`${API}/stats`).set(headers),
    request(app).post(API).set(headers).send({ companyId: ctx.acme.id, subject: 'Nope' }),
    request(app).get(`${API}/${id}`).set(headers),
    request(app).put(`${API}/${id}`).set(headers).send({ subject: 'Nope' }),
    request(app).delete(`${API}/${id}`).set(headers),
    request(app).patch(`${API}/${id}/assign`).set(headers).send({ assignedTo: null }),
    request(app).patch(`${API}/${id}/status`).set(headers).send({ statusId: missing() }),
    request(app).post(`${API}/${id}/replies`).set(headers).send({ body: 'Nope' }),
    request(app).post(`${API}/${id}/internal-notes`).set(headers).send({ body: 'Nope' }),
    request(app).get(`${API}/${id}/conversation`).set(headers),
    request(app).get(`${API}/${id}/attachments/${missing()}`).set(headers),
  ];
  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) assert.equal(res.status, 403);
  const reader = as(ctx.readerToken);
  assert.equal((await request(app).post(`${API}/${id}/replies`).set(reader).send({ body: 'Nope' })).status, 403);
  assert.equal((await request(app).post(`${API}/${id}/internal-notes`).set(reader).send({ body: 'Nope' })).status, 403);
  assert.equal(await Ticket.countDocuments(), 0);
});

// --- create ----------------------------------------------------------------------

test('create (JSON): number, defaults, customer found from the company', async () => {
  const res = await create(
    { contactId: ctx.priya.id, projectId: ctx.acmeProject.id, description: 'Since Monday', categoryId: ctx.categories[1].id, assignedTo: ctx.agent.id },
    ctx.agentToken
  );
  assert.equal(res.status, 201);
  const { ticket } = res.body.data;
  assert.equal(ticket.ticketNumber, 'TKT-000001');
  assert.equal(ticket.customerId, ctx.acmeCustomer.id, "the company's customer record");
  assert.equal(ticket.contact.fullName, 'Priya Nair');
  assert.equal(ticket.project.projectNumber, ctx.acmeProject.projectNumber);
  assert.equal(ticket.status.category, 'open');
  assert.equal(ticket.priority.name, ctx.priorities.find((p) => p.isDefault).name);
  assert.equal(ticket.category.name, ctx.categories[1].name);
  assert.equal(ticket.assignedToUser.fullName, 'Asha Agent', 'agents may take a ticket themselves');
  assert.deepEqual(ticket.attachments, []);
  for (const field of ['resolvedAt', 'closedAt', 'deletedAt']) assert.equal(field in ticket, false, field);
  ctx.ticket = ticket;
});

test('create (multipart): files are stored and described, never by the name sent', async () => {
  const res = await request(app)
    .post(API)
    .set(admin())
    .field('companyId', ctx.acme.id)
    .field('subject', 'Screen flickers')
    .attach('attachments', Buffer.from('error log line'), { filename: '../../evil.txt', contentType: 'text/plain' })
    .attach('attachments', Buffer.from([0x89, 0x50, 0x4e, 0x47]), { filename: 'photo.png', contentType: 'image/png' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { ticket } = res.body.data;
  assert.deepEqual(ticket.attachments.map((a) => [a.fileName, a.mimeType, a.size]), [
    ['evil.txt', 'text/plain', 14],
    ['photo.png', 'image/png', 4],
  ]);
  assert.equal('storedName' in ticket.attachments[0], false, 'the stored path is never sent');
  assert.equal(filesOnDisk().length, 2);
  assert.ok(filesOnDisk().every((name) => !name.includes('evil')), 'stored under a random name');
  ctx.withFiles = ticket;
});

test('create: validation and references', async () => {
  const before = await Ticket.countDocuments();
  const cases = {
    'no subject': [{ subject: '' }, 422, 'subject'],
    'no company': [{ companyId: undefined }, 422, 'companyId'],
    'unknown company': [{ companyId: missing() }, 400, 'companyId'],
    'contact of another company': [{ contactId: ctx.omar.id }, 400, 'contactId'],
    'project of another company': [{ projectId: ctx.boltProject.id }, 400, 'projectId'],
    'unknown category': [{ categoryId: missing() }, 400, 'categoryId'],
    'unknown priority': [{ priorityId: missing() }, 400, 'priorityId'],
    'inactive assignee': [{ assignedTo: ctx.inactive.id }, 400, 'assignedTo'],
    'customer sent': [{ customerId: ctx.acmeCustomer.id }, 422, 'customerId'],
    'number sent': [{ ticketNumber: 'TKT-1' }, 422, 'ticketNumber'],
  };
  for (const [label, [body, status, field]] of Object.entries(cases)) {
    const res = await create(body);
    assert.equal(res.status, status, label);
    assert.ok(res.body.errors.some((e) => e.field === field), `${label}: names ${field}`);
  }
  // An agent may not hand a new ticket to someone else.
  assert.equal((await create({ assignedTo: ctx.admin.id }, ctx.agentToken)).status, 403);
  assert.equal(await Ticket.countDocuments(), before);
});

test('uploads: type, size and count limits; a refused request leaves no file behind', async () => {
  const before = filesOnDisk().length;
  const exe = await request(app)
    .post(API)
    .set(admin())
    .field('companyId', ctx.acme.id)
    .field('subject', 'Bad file')
    .attach('attachments', Buffer.from('MZ'), { filename: 'tool.exe', contentType: 'application/x-msdownload' });
  assert.equal(exe.status, 415);
  const big = await request(app)
    .post(API)
    .set(admin())
    .field('companyId', ctx.acme.id)
    .field('subject', 'Big file')
    .attach('attachments', Buffer.alloc(20000, 1), { filename: 'big.txt', contentType: 'text/plain' });
  assert.equal(big.status, 413, 'UPLOAD_MAX_FILE_MB is 0.01 here');
  const many = await request(app)
    .post(API)
    .set(admin())
    .field('companyId', ctx.acme.id)
    .field('subject', 'Many files')
    .attach('attachments', Buffer.from('a'), { filename: 'a.txt', contentType: 'text/plain' })
    .attach('attachments', Buffer.from('b'), { filename: 'b.txt', contentType: 'text/plain' })
    .attach('attachments', Buffer.from('c'), { filename: 'c.txt', contentType: 'text/plain' });
  assert.equal(many.status, 400, 'UPLOAD_MAX_FILES is 2 here');
  const invalid = await request(app)
    .post(API)
    .set(admin())
    .field('companyId', missing())
    .field('subject', 'Unknown company')
    .attach('attachments', Buffer.from('a'), { filename: 'a.txt', contentType: 'text/plain' });
  assert.equal(invalid.status, 400);
  const wrongField = await request(app)
    .post(API)
    .set(admin())
    .field('companyId', ctx.acme.id)
    .field('subject', 'Wrong field')
    .attach('files', Buffer.from('a'), { filename: 'a.txt', contentType: 'text/plain' });
  assert.equal(wrongField.status, 400);
  assert.equal(filesOnDisk().length, before);
});

test('attachments download with their name and type; readers may download', async () => {
  const [log] = ctx.withFiles.attachments;
  const res = await download(`${API}/${ctx.withFiles.id}/attachments/${log.id}`, ctx.readerToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.toString(), 'error log line');
  assert.match(res.headers['content-type'], /text\/plain/);
  assert.match(res.headers['content-disposition'], /attachment; filename="evil.txt"/);
  assert.equal((await request(app).get(`${API}/${ctx.withFiles.id}/attachments/${missing()}`).set(admin())).status, 404);
  assert.equal((await request(app).get(`${API}/${ctx.ticket.id}/attachments/${log.id}`).set(admin())).status, 404, 'only through its own ticket');
});

// --- assignment, status, edits ------------------------------------------------------

test('assign: take it yourself; giving it to someone else needs tickets.assign', async () => {
  const url = `${API}/${ctx.withFiles.id}/assign`;
  assert.equal((await request(app).patch(url).set(as(ctx.agentToken)).send({ assignedTo: ctx.agent.id })).status, 200);
  assert.equal((await request(app).patch(url).set(as(ctx.agentToken)).send({ assignedTo: ctx.admin.id })).status, 403);
  assert.equal((await request(app).patch(url).set(as(ctx.agentToken)).send({ assignedTo: null })).status, 200, 'letting go of your own');
  assert.equal((await request(app).patch(url).set(as(ctx.leadToken)).send({ assignedTo: ctx.agent.id })).status, 200);
  assert.equal((await request(app).patch(url).set(as(ctx.agentToken)).send({ assignedTo: ctx.agent.id })).status, 200, 'no change');
  const reassign = await request(app).patch(url).set(as(ctx.leadToken)).send({ assignedTo: ctx.admin.id });
  assert.equal(reassign.body.data.ticket.assignedToUser.fullName, 'Ada Admin');
  assert.equal((await request(app).patch(url).set(admin()).send({ assignedTo: ctx.inactive.id })).status, 400);
  assert.equal((await request(app).patch(url).set(admin()).send({})).status, 422);
});

test('status: resolved and closed are timestamped; reopening clears them', async () => {
  const url = `${API}/${ctx.ticket.id}/status`;
  const resolved = (await request(app).patch(url).set(as(ctx.agentToken)).send({ statusId: statusOf('resolved').id })).body.data.ticket;
  assert.ok(resolved.resolvedAt);
  assert.equal('closedAt' in resolved, false);
  const closed = (await request(app).patch(url).set(admin()).send({ statusId: statusOf('closed').id })).body.data.ticket;
  assert.equal(closed.resolvedAt, resolved.resolvedAt, 'kept from when it was resolved');
  assert.ok(closed.closedAt);
  assert.equal((await request(app).patch(url).set(admin()).send({ statusId: missing() })).status, 400);
  assert.equal((await request(app).patch(url).set(as(ctx.readerToken)).send({ statusId: statusOf('open').id })).status, 403);
});

test('replies: refused on a closed ticket; internal notes are not', async () => {
  const replies = `${API}/${ctx.ticket.id}/replies`;
  const notes = `${API}/${ctx.ticket.id}/internal-notes`;
  const refused = await request(app).post(replies).set(as(ctx.agentToken)).send({ body: 'Hello?' });
  assert.equal(refused.status, 409);
  assert.match(refused.body.message, /closed/);
  assert.equal((await request(app).post(notes).set(as(ctx.agentToken)).send({ body: 'Customer called again' })).status, 201);

  const reopened = (await request(app).patch(`${API}/${ctx.ticket.id}/status`).set(admin()).send({ statusId: statusOf('in_progress').id })).body.data.ticket;
  for (const field of ['resolvedAt', 'closedAt']) assert.equal(field in reopened, false, `${field} cleared`);

  const reply = await request(app)
    .post(replies)
    .set(as(ctx.agentToken))
    .field('body', 'Please try the new driver attached.')
    .attach('attachments', Buffer.from('driver'), { filename: 'driver.zip', contentType: 'application/zip' });
  assert.equal(reply.status, 201, JSON.stringify(reply.body));
  const { message } = reply.body.data;
  assert.equal(message.type, 'reply');
  assert.equal(message.author.fullName, 'Asha Agent');
  assert.deepEqual(message.attachments.map((a) => [a.fileName, a.internal]), [['driver.zip', false]]);

  const note = await request(app)
    .post(notes)
    .set(admin())
    .field('body', 'Escalated to vendor')
    .attach('attachments', Buffer.from('ticket#123'), { filename: 'vendor.txt', contentType: 'text/plain' });
  assert.equal(note.body.data.message.attachments[0].internal, true, 'files on a note are internal too');

  for (const body of [{}, { body: '' }, { body: '   ' }]) {
    assert.equal((await request(app).post(replies).set(admin()).send(body)).status, 422, JSON.stringify(body));
  }
  assert.equal((await request(app).post(`${API}/${missing()}/replies`).set(admin()).send({ body: 'x' })).status, 404);

  const ticket = (await request(app).get(`${API}/${ctx.ticket.id}`).set(admin())).body.data.ticket;
  assert.equal(ticket.replyCount, 1, 'notes are not replies');
  assert.equal(ticket.attachments.length, 2);
});

test('conversation: replies, notes and events as one feed, oldest first', async () => {
  await request(app).put(`${API}/${ctx.ticket.id}`).set(as(ctx.agentToken)).send({ priorityId: ctx.priorities.at(-1).id });
  const res = await request(app).get(`${API}/${ctx.ticket.id}/conversation`).set(as(ctx.readerToken));
  assert.equal(res.status, 200);
  const { items, counts, attachments, ticket } = res.body.data;
  assert.equal(ticket.id, ctx.ticket.id);
  assert.deepEqual(attachments, [], 'no files came with the ticket itself');
  assert.deepEqual(counts, { replies: 1, internalNotes: 2, events: 5 });
  assert.deepEqual(
    items.map((item) => (item.kind === 'message' ? item.type : item.action)),
    ['created', 'status_changed', 'status_changed', 'internal_note', 'status_changed', 'reply', 'internal_note', 'updated']
  );
  const dates = items.map((item) => new Date(item.createdAt).getTime());
  assert.deepEqual(dates, [...dates].sort((a, b) => a - b));
  const reply = items.find((item) => item.type === 'reply');
  assert.equal(reply.attachments[0].fileName, 'driver.zip');
  const edit = items.at(-1);
  assert.equal(edit.changes[0].label, 'Priority');
  assert.equal(edit.actor.fullName, 'Asha Agent');
});

test('update: details only; company, status and assignment refused here', async () => {
  const url = `${API}/${ctx.ticket.id}`;
  const res = await request(app).put(url).set(as(ctx.agentToken)).send({ subject: 'Printer offline on floor 2', contactId: null, projectId: '' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.ticket.subject, 'Printer offline on floor 2');
  for (const field of ['contactId', 'projectId']) assert.equal(field in res.body.data.ticket, false, field);
  for (const body of [{ companyId: ctx.bolt.id }, { statusId: statusOf('open').id }, { assignedTo: ctx.agent.id }, {}]) {
    assert.equal((await request(app).put(url).set(admin()).send(body)).status, 422, JSON.stringify(body));
  }
  assert.equal((await request(app).put(url).set(admin()).send({ contactId: ctx.omar.id })).status, 400);
});

test('list and stats: filters, search, queue counts', async () => {
  await create({ subject: 'Invoice question', categoryId: ctx.categories[2].id, contactId: ctx.priya.id });
  const boltTicket = (await create({ companyId: ctx.bolt.id, subject: 'Delivery late', projectId: ctx.boltProject.id })).body.data.ticket;

  assert.deepEqual(await numbers(`companyId=${ctx.bolt.id}`), [boltTicket.ticketNumber]);
  assert.deepEqual(await numbers(`projectId=${ctx.acmeProject.id}`), [], 'that link was removed above');
  assert.deepEqual(await numbers(`customerId=${ctx.acmeCustomer.id}`).then((n) => n.length), 3);
  assert.deepEqual(await numbers('search=invoice'), ['TKT-000003']);
  assert.deepEqual(await numbers(`categoryId=${ctx.categories[2].id}`), ['TKT-000003']);
  assert.deepEqual(await numbers(`assignedTo=${ctx.admin.id}`), ['TKT-000002']);
  assert.deepEqual((await numbers('unassigned=true')).length, 2);
  assert.deepEqual(await numbers('statusCategory=in_progress'), ['TKT-000001']);
  assert.equal((await numbers('openOnly=true')).length, 4);
  const sorted = (await request(app).get(`${API}?sortBy=lastActivityAt&sortOrder=desc`).set(admin())).body.data.tickets;
  assert.equal(sorted[0].ticketNumber, boltTicket.ticketNumber);
  for (const query of ['sortBy=secret', 'statusCategory=done', 'limit=500']) {
    assert.equal((await request(app).get(`${API}?${query}`).set(admin())).status, 422, query);
  }

  const stats = (await request(app).get(`${API}/stats`).set(as(ctx.readerToken))).body.data;
  assert.deepEqual(stats, { byCategory: { open: 3, in_progress: 1, waiting: 0, resolved: 0, closed: 0 }, unassignedOpen: 2, total: 4 });
  const mine = (await request(app).get(`${API}/stats?assignedTo=${ctx.admin.id}`).set(admin())).body.data;
  assert.equal(mine.total, 1);
});

test('other modules: company, customer and project pages count tickets; activities can be about one', async () => {
  const sections = (await request(app).get(`/api/v1/companies/${ctx.acme.id}/sections`).set(admin())).body.data.sections;
  assert.deepEqual((({ available, count }) => [available, count])(sections.find((x) => x.key === 'tickets')), [true, 3]);
  const customer = (await request(app).get(`/api/v1/customers/${ctx.acmeCustomer.id}/summary`).set(admin())).body.data;
  assert.equal(customer.sections.find((x) => x.key === 'tickets').count, 3);
  const project = (await request(app).get(`/api/v1/projects/${ctx.boltProject.id}/summary`).set(admin())).body.data;
  assert.deepEqual((({ available, count }) => [available, count])(project.sections.find((x) => x.key === 'tickets')), [true, 1]);

  const types = (await request(app).get('/api/v1/activity-types').set(admin())).body.data.items;
  const activity = await post('activities', { typeId: types[0].id, subject: 'Called about the printer', ticketId: ctx.ticket.id });
  assert.equal(activity.activity.ticket.ticketNumber, 'TKT-000001');
  assert.equal(activity.activity.companyId, ctx.acme.id);

  assert.equal((await request(app).delete(`/api/v1/contacts/${ctx.priya.id}`).set(admin())).status, 409);
  assert.equal((await request(app).delete(`/api/v1/ticket-statuses/${statusOf('in_progress').id}`).set(admin())).status, 409);
});

test('delete: soft delete hides the ticket; its files stay on disk', async () => {
  const before = filesOnDisk().length;
  assert.equal((await request(app).delete(`${API}/${ctx.withFiles.id}`).set(as(ctx.agentToken))).status, 403);
  assert.equal((await request(app).delete(`${API}/${ctx.withFiles.id}`).set(admin())).status, 200);
  assert.equal((await request(app).get(`${API}/${ctx.withFiles.id}`).set(admin())).status, 404);
  assert.equal((await request(app).get(`${API}/${ctx.withFiles.id}/attachments/${ctx.withFiles.attachments[0].id}`).set(admin())).status, 404);
  assert.ok(await Ticket.findById(ctx.withFiles.id).setOptions({ withDeleted: true }));
  assert.equal(filesOnDisk().length, before);
});
