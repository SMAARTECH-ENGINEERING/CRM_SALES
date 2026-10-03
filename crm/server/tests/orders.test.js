import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_orders', { SMTP_URL: '', SMTP_HOST: '' });

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Order } = await import('../src/models/Order.js');
const { default: Quotation } = await import('../src/models/Quotation.js');
const { default: User } = await import('../src/models/User.js');
const { seedOrderStatuses, seedQuotationStatuses, verifyDeclaredPermissions } = await import(
  '../src/services/seed.service.js'
);
const { ORDER_STATUS_SEED } = await import('../src/seeds/order.seed.js');
const { allKeys, createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } =
  await import('./helpers/fixtures.js');

const API = '/api/v1/orders';
const QUOTES = '/api/v1/quotations';
const STATUSES = '/api/v1/order-statuses';

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const missing = () => new mongoose.Types.ObjectId().toString();
const post = async (path, body) => (await request(app).post(`/api/v1/${path}`).set(admin()).send(body)).body.data;
const fromQuotation = (quotationId, body = {}, token = ctx.adminToken) =>
  request(app).post(`${API}/from-quotation/${quotationId}`).set(as(token)).send(body);
const statusOf = (list, category) => list.find((status) => status.category === category);
const numbers = async (query) =>
  (await request(app).get(`${API}?limit=100&sortBy=orderNumber&sortOrder=asc&${query}`).set(admin())).body.data.orders.map(
    (o) => o.orderNumber
  );

// A quotation for Acme, optionally moved to a status with the given meaning.
async function quotation(category = 'accepted', body = {}) {
  const created = await post('quotations', {
    companyId: ctx.acme.id,
    contactId: ctx.priya.id,
    items: [
      { productId: ctx.chair.id, quantity: 2, discountPercent: 10 },
      { productId: ctx.lamp.id, quantity: 3 },
    ],
    discountPercent: 10,
    notes: 'Quoted notes',
    ...body,
  });
  const q = created.quotation;
  if (category !== 'draft') {
    await request(app).patch(`${QUOTES}/${q.id}/status`).set(admin()).send({ statusId: statusOf(ctx.quoteStatuses, category).id });
  }
  return q;
}

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Order.init(), Quotation.init()]);
  await seedRbac();
  await seedQuotationStatuses();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.plain = await createUser(await defaultRole());
  ctx.reader = await createUser(await createRole(['orders.read'], 'Order Reader'));
  ctx.clerk = await createUser(await createRole(['orders.read', 'orders.create', 'orders.update'], 'Order Clerk'), {
    firstName: 'Cleo',
    lastName: 'Clerk',
  });
  ctx.manager = await createUser(await createRole(await allKeys('orders'), 'Order Manager'));
  ctx.inactive = await createUser(await defaultRole(), { status: 'inactive' });

  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.readerToken = await loginAs(app, ctx.reader);
  ctx.clerkToken = await loginAs(app, ctx.clerk);
  ctx.managerToken = await loginAs(app, ctx.manager);

  ctx.acme = (await post('companies', { name: 'Acme Industries' })).company;
  ctx.bolt = (await post('companies', { name: 'Bolt Traders' })).company;
  ctx.priya = (await post('contacts', { firstName: 'Priya', lastName: 'Nair', companyId: ctx.acme.id })).contact;
  ctx.omar = (await post('contacts', { firstName: 'Omar', lastName: 'Khan', companyId: ctx.bolt.id })).contact;
  const gst = (await post('taxes', { name: 'GST 18', rate: 18 })).item;
  ctx.chair = (await post('products', { name: 'Ergonomic Chair', basePrice: 1000, taxId: gst.id })).product;
  ctx.lamp = (await post('products', { name: 'Desk Lamp', basePrice: 250.5 })).product;
  ctx.quoteStatuses = (await request(app).get('/api/v1/quotation-statuses').set(admin())).body.data.items;
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await verifyDeclaredPermissions(), []);
});

test('order statuses are data: nothing until seeded; an order needs a default to start in', async () => {
  assert.deepEqual((await request(app).get(STATUSES).set(admin())).body.data.items, []);
  const q = await quotation();
  assert.equal((await fromQuotation(q.id)).status, 409, 'no default status yet');
  assert.equal((await Quotation.findById(q.id)).orderId, null, 'the failed attempt released the quotation');

  assert.equal(await seedOrderStatuses(), true);
  assert.equal(await seedOrderStatuses(), false);
  ctx.statuses = (await request(app).get(STATUSES).set(admin())).body.data.items;
  assert.deepEqual(ctx.statuses.map((s) => [s.name, s.category]), ORDER_STATUS_SEED.map((s) => [s.name, s.category]));
  assert.equal((await request(app).post(STATUSES).set(admin()).send({ name: 'Odd', category: 'won' })).status, 422);
  assert.equal((await request(app).get(STATUSES).set(as(ctx.clerkToken))).status, 200);
  assert.equal((await request(app).post(STATUSES).set(as(ctx.clerkToken)).send({ name: 'Nope' })).status, 403);
  ctx.firstQuote = q;
});

test('every order endpoint needs a token (401) and a permission (403)', async () => {
  const id = missing();
  const calls = (headers) => [
    request(app).get(API).set(headers),
    request(app).post(API).set(headers).send({ companyId: ctx.acme.id, items: [{ productId: ctx.chair.id, quantity: 1 }] }),
    request(app).post(`${API}/from-quotation/${ctx.firstQuote.id}`).set(headers).send({}),
    request(app).get(`${API}/${id}`).set(headers),
    request(app).put(`${API}/${id}`).set(headers).send({ notes: 'Nope' }),
    request(app).delete(`${API}/${id}`).set(headers),
    request(app).patch(`${API}/${id}/status`).set(headers).send({ statusId: missing() }),
    request(app).get(`${API}/${id}/timeline`).set(headers),
  ];
  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) assert.equal(res.status, 403);
  const reader = as(ctx.readerToken);
  assert.equal((await request(app).post(`${API}/from-quotation/${ctx.firstQuote.id}`).set(reader).send({})).status, 403);
  assert.equal((await request(app).post(API).set(reader).send({ companyId: ctx.acme.id })).status, 403);
  assert.equal(await Order.countDocuments(), 0);
});

// --- from a quotation -------------------------------------------------------------------

test('from quotation: copies the customer, lines and totals exactly as quoted', async () => {
  const q = await (await request(app).get(`${QUOTES}/${ctx.firstQuote.id}`).set(admin())).body.data.quotation;
  // The product gets dearer after it was quoted; the order keeps the quoted price.
  await request(app).put(`/api/v1/products/${ctx.chair.id}`).set(admin()).send({ basePrice: 5000 });

  const res = await fromQuotation(q.id, { deliveryDate: '2031-01-15', assignedTo: ctx.clerk.id }, ctx.clerkToken);
  assert.equal(res.status, 201);
  const { order } = res.body.data;
  assert.equal(order.orderNumber, 'ORD-000001');
  assert.equal(order.quotationId, q.id);
  assert.equal(order.quotation.quotationNumber, q.quotationNumber);
  assert.equal(order.companyId, ctx.acme.id);
  assert.equal(order.contactId, ctx.priya.id);
  assert.deepEqual(
    order.items.map((i) => [i.name, i.quantity, i.unitPrice, i.taxRate, i.total]),
    q.items.map((i) => [i.name, i.quantity, i.unitPrice, i.taxRate, i.total])
  );
  assert.equal(order.items[0].unitPrice, 1000);
  assert.deepEqual(
    [order.subtotal, order.discountPercent, order.discount, order.tax, order.grandTotal],
    [q.subtotal, q.discountPercent, q.discount, q.tax, q.grandTotal]
  );
  assert.equal(order.status.category, 'open', 'the default status');
  assert.equal(order.orderDate.slice(0, 10), new Date().toISOString().slice(0, 10));
  assert.equal(order.deliveryDate.slice(0, 10), '2031-01-15');
  assert.equal(order.assignedToUser.fullName, 'Cleo Clerk');
  assert.equal(order.notes, 'Quoted notes');
  assert.equal(order.createdBy, ctx.clerk.id);

  // The quotation now points at its order.
  const linked = (await request(app).get(`${QUOTES}/${q.id}`).set(admin())).body.data.quotation;
  assert.equal(linked.orderId, order.id);
  assert.equal(linked.order.orderNumber, 'ORD-000001');
  const events = (await request(app).get(`${API}/${order.id}/timeline`).set(admin())).body.data.events;
  assert.match(events[0].summary, new RegExp(`Created from quotation ${q.quotationNumber}`));
  ctx.order = order;
  ctx.orderQuote = q;
});

test('from quotation: the backend verifies existence, company, acceptance and duplicates', async () => {
  const before = await Order.countDocuments();
  const draft = await quotation('draft');
  const sent = await quotation('sent');
  const rejected = await quotation('rejected');
  const accepted = await quotation('accepted');
  const deleted = await quotation('draft');
  await request(app).delete(`${QUOTES}/${deleted.id}`).set(admin());

  const cases = {
    'unknown quotation': [missing(), {}, 404],
    'deleted quotation': [deleted.id, {}, 404],
    'malformed id': ['not-an-id', {}, 422],
    'draft quotation': [draft.id, {}, 409, /accepted/],
    'sent quotation': [sent.id, {}, 409, /accepted/],
    'rejected quotation': [rejected.id, {}, 409, /accepted/],
    'quotation of another company': [accepted.id, { companyId: ctx.bolt.id }, 400, /another company/],
    'already turned into an order': [ctx.orderQuote.id, {}, 409, /already/],
    'items sent': [accepted.id, { items: [{ productId: ctx.chair.id, quantity: 1 }] }, 422],
    'unknown status': [accepted.id, { statusId: missing() }, 400],
    'inactive assignee': [accepted.id, { assignedTo: ctx.inactive.id }, 400],
    'delivery before order date': [accepted.id, { orderDate: '2031-02-01', deliveryDate: '2031-01-01' }, 422],
  };
  for (const [label, [id, body, status, message]] of Object.entries(cases)) {
    const res = await fromQuotation(id, body);
    assert.equal(res.status, status, label);
    if (message) assert.match(res.body.message, message, label);
  }
  assert.equal(await Order.countDocuments(), before, 'nothing was created');
  assert.equal((await Quotation.findById(accepted.id)).orderId, null, 'refused requests left the quotation free');

  // The matching company is accepted.
  const ok = await fromQuotation(accepted.id, { companyId: ctx.acme.id });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.order.orderNumber, `ORD-${String(before + 1).padStart(6, '0')}`, 'refusals used no numbers');
  ctx.second = ok.body.data.order;
});

test('from quotation: simultaneous requests create exactly one order', async () => {
  const q = await quotation();
  const results = await Promise.all(Array.from({ length: 5 }, () => fromQuotation(q.id)));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409, 409, 409]);
  assert.equal(await Order.countDocuments({ quotationId: q.id }), 1);
  const winner = results.find((r) => r.status === 201).body.data.order;
  assert.equal(String((await Quotation.findById(q.id)).orderId), winner.id);
  ctx.raced = winner;
});

test('POST /orders with a quotationId goes through the same checks', async () => {
  assert.equal((await request(app).post(API).set(admin()).send({ quotationId: ctx.orderQuote.id })).status, 409);
  const q = await quotation();
  const mismatch = await request(app).post(API).set(admin()).send({ quotationId: q.id, companyId: ctx.bolt.id });
  assert.equal(mismatch.status, 400);
  const items = await request(app).post(API).set(admin()).send({ quotationId: q.id, items: [{ productId: ctx.chair.id, quantity: 1 }] });
  assert.equal(items.status, 422);
  const res = await request(app).post(API).set(admin()).send({ quotationId: q.id });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.order.quotationId, q.id);
});

test('an accepted quotation with an order cannot be deleted; deleting the order releases it', async () => {
  const q = await quotation();
  const order = (await fromQuotation(q.id)).body.data.order;
  assert.equal((await request(app).delete(`${QUOTES}/${q.id}`).set(admin())).status, 409);

  assert.equal((await request(app).delete(`${API}/${order.id}`).set(as(ctx.clerkToken))).status, 403);
  assert.equal((await request(app).delete(`${API}/${order.id}`).set(as(ctx.managerToken))).status, 200);
  assert.equal((await request(app).get(`${API}/${order.id}`).set(admin())).status, 404);
  assert.ok(await Order.findById(order.id).setOptions({ withDeleted: true }), 'the record is kept');
  assert.equal((await Quotation.findById(q.id)).orderId, null);

  const again = await fromQuotation(q.id);
  assert.equal(again.status, 201, 'a new order can be created from the released quotation');
  assert.notEqual(again.body.data.order.orderNumber, order.orderNumber, 'numbers are not reused');
});

// --- direct orders ---------------------------------------------------------------------

test('direct order: priced by the server from the products; client totals ignored', async () => {
  const res = await request(app)
    .post(API)
    .set(as(ctx.clerkToken))
    .send({
      companyId: ctx.bolt.id,
      contactId: ctx.omar.id,
      items: [{ productId: ctx.lamp.id, quantity: 4, taxRate: 50, total: 1 }],
      grandTotal: 1,
      orderDate: '2031-03-01',
    });
  assert.equal(res.status, 201);
  const { order } = res.body.data;
  assert.equal('quotationId' in order, false);
  assert.deepEqual([order.items[0].unitPrice, order.items[0].taxRate, order.subtotal, order.grandTotal], [250.5, 0, 1002, 1002]);
  assert.equal(order.orderDate.slice(0, 10), '2031-03-01');
  ctx.direct = order;

  const cases = {
    'no company': [{ items: [{ productId: ctx.lamp.id, quantity: 1 }] }, 422],
    'no items': [{ companyId: ctx.bolt.id }, 422],
    'contact of another company': [{ companyId: ctx.bolt.id, contactId: ctx.priya.id, items: [{ productId: ctx.lamp.id, quantity: 1 }] }, 400],
    'unknown product': [{ companyId: ctx.bolt.id, items: [{ productId: missing(), quantity: 1 }] }, 400],
    'number sent': [{ companyId: ctx.bolt.id, orderNumber: 'ORD-1', items: [{ productId: ctx.lamp.id, quantity: 1 }] }, 422],
  };
  for (const [label, [body, status]] of Object.entries(cases)) {
    assert.equal((await request(app).post(API).set(admin()).send(body)).status, status, label);
  }
});

// --- read ----------------------------------------------------------------------

test('get and list: filters, search, sorting and pagination', async () => {
  assert.equal((await request(app).get(`${API}/${ctx.order.id}`).set(as(ctx.readerToken))).status, 200);
  assert.equal((await request(app).get(`${API}/${missing()}`).set(admin())).status, 404);

  assert.deepEqual(await numbers(`companyId=${ctx.bolt.id}`), [ctx.direct.orderNumber]);
  assert.deepEqual(await numbers(`quotationId=${ctx.orderQuote.id}`), ['ORD-000001']);
  assert.deepEqual(await numbers(`assignedTo=${ctx.clerk.id}`), ['ORD-000001']);
  assert.deepEqual(await numbers('search=ORD-000001'), ['ORD-000001']);
  assert.ok((await numbers('search=lamp')).includes(ctx.direct.orderNumber), 'item names are searched');
  assert.deepEqual(await numbers('dateFrom=2031-03-01&dateTo=2031-03-01'), [ctx.direct.orderNumber]);
  assert.equal((await numbers('statusCategory=open')).length, await Order.countDocuments());
  assert.deepEqual(await numbers('statusCategory=completed'), []);

  const page = await request(app).get(`${API}?limit=2&page=1&sortBy=orderNumber&sortOrder=asc`).set(admin());
  assert.deepEqual(page.body.data.orders.map((o) => o.orderNumber), ['ORD-000001', 'ORD-000002']);
  assert.equal(page.body.data.pagination.total, await Order.countDocuments());
  for (const query of ['limit=500', 'sortBy=password', 'statusCategory=maybe']) {
    assert.equal((await request(app).get(`${API}?${query}`).set(admin())).status, 422, query);
  }
});

// --- update and status ----------------------------------------------------------------

test('update: dates, assignee and notes; new lines are repriced; customer and source are fixed', async () => {
  const url = `${API}/${ctx.order.id}`;
  const res = await request(app).put(url).set(as(ctx.clerkToken)).send({ deliveryDate: '2031-02-01', notes: 'Gate 2', assignedTo: null });
  assert.equal(res.status, 200);
  const { order } = res.body.data;
  assert.equal(order.deliveryDate.slice(0, 10), '2031-02-01');
  assert.equal('assignedTo' in order, false);
  assert.equal(order.grandTotal, ctx.order.grandTotal, 'money untouched');

  // Resending lines reads the product again (its new price).
  const repriced = (await request(app).put(url).set(admin()).send({ items: [{ productId: ctx.chair.id, quantity: 1 }], discountPercent: 0 })).body.data.order;
  assert.deepEqual([repriced.items[0].unitPrice, repriced.subtotal, repriced.grandTotal], [5000, 5000, 5900]);

  const cases = {
    'change customer': { companyId: ctx.bolt.id },
    'change quotation': { quotationId: missing() },
    'status on PUT': { statusId: statusOf(ctx.statuses, 'completed').id },
    'nothing': {},
    'delivery before order': { deliveryDate: '2000-01-01' },
  };
  for (const [label, body] of Object.entries(cases)) {
    assert.equal((await request(app).put(url).set(admin()).send(body)).status, 422, label);
  }
  assert.equal((await request(app).put(url).set(admin()).send({ contactId: ctx.omar.id })).status, 400);

  const events = (await request(app).get(`${url}/timeline`).set(admin())).body.data.events;
  assert.deepEqual(events.map((e) => e.action), ['updated', 'updated', 'created']);
  assert.deepEqual(events[1].changes.map((c) => c.label), ['Delivery date', 'Assigned to', 'Notes']);
});

test('status: its own endpoint; completed and cancelled orders are locked', async () => {
  const url = `${API}/${ctx.second.id}`;
  const done = await request(app).patch(`${url}/status`).set(as(ctx.clerkToken)).send({ statusId: statusOf(ctx.statuses, 'completed').id });
  assert.equal(done.status, 200);
  assert.equal(done.body.data.order.status.category, 'completed');
  assert.equal((await request(app).put(url).set(admin()).send({ notes: 'Too late' })).status, 409);

  await request(app).patch(`${url}/status`).set(admin()).send({ statusId: statusOf(ctx.statuses, 'cancelled').id });
  assert.equal((await request(app).put(url).set(admin()).send({ notes: 'Too late' })).status, 409);
  await request(app).patch(`${url}/status`).set(admin()).send({ statusId: statusOf(ctx.statuses, 'in_progress').id });
  assert.equal((await request(app).put(url).set(admin()).send({ notes: 'Back on' })).status, 200);

  assert.equal((await request(app).patch(`${url}/status`).set(admin()).send({ statusId: missing() })).status, 400);
  assert.equal((await request(app).patch(`${url}/status`).set(as(ctx.readerToken)).send({ statusId: statusOf(ctx.statuses, 'open').id })).status, 403);
  const events = (await request(app).get(`${url}/timeline?limit=10`).set(admin())).body.data.events;
  assert.equal(events.filter((e) => e.action === 'status_changed').length, 3);

  // A status in use cannot be deleted.
  assert.equal((await request(app).delete(`${STATUSES}/${statusOf(ctx.statuses, 'in_progress').id}`).set(admin())).status, 409);
});

test('the company page counts orders, and they block deleting the company and contact', async () => {
  const sections = (await request(app).get(`/api/v1/companies/${ctx.bolt.id}/sections`).set(admin())).body.data.sections;
  const section = sections.find((s) => s.key === 'orders');
  assert.deepEqual([section.available, section.count], [true, await Order.countDocuments({ companyId: ctx.bolt.id })]);
  const company = await request(app).delete(`/api/v1/companies/${ctx.bolt.id}`).set(admin());
  assert.equal(company.status, 409);
  assert.ok(company.body.errors.some((e) => e.field === 'orders'));
  assert.equal((await request(app).delete(`/api/v1/contacts/${ctx.omar.id}`).set(admin())).status, 409);
});
