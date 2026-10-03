import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_customers');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Customer } = await import('../src/models/Customer.js');
const { default: Order } = await import('../src/models/Order.js');
const { default: User } = await import('../src/models/User.js');
const { default: Company } = await import('../src/models/Company.js');
const {
  backfillCustomers,
  seedLeadConfig,
  seedOrderStatuses,
  seedPipelines,
  seedQuotationStatuses,
  seedActivityTypes,
  verifyDeclaredPermissions,
} = await import('../src/services/seed.service.js');
const { createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const API = '/api/v1/customers';

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const missing = () => new mongoose.Types.ObjectId().toString();
const post = async (path, body) => (await request(app).post(`/api/v1/${path}`).set(admin()).send(body)).body.data;
const statusId = (list, category) => list.find((s) => s.category === category).id;
const numbersOf = async (query) =>
  (await request(app).get(`${API}?limit=100&${query}`).set(admin())).body.data.customers.map((c) => c.company.name);

// An accepted quotation for `company`, turned into an order.
async function orderFor(company, { quantity = 1, cancel = false } = {}) {
  const { quotation } = await post('quotations', { companyId: company.id, items: [{ productId: ctx.chair.id, quantity }] });
  await request(app).patch(`/api/v1/quotations/${quotation.id}/status`).set(admin()).send({ statusId: statusId(ctx.quoteStatuses, 'accepted') });
  const { order } = await post(`orders/from-quotation/${quotation.id}`, {});
  if (cancel) {
    await request(app).patch(`/api/v1/orders/${order.id}/status`).set(admin()).send({ statusId: statusId(ctx.orderStatuses, 'cancelled') });
  }
  return order;
}

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Customer.init(), Order.init(), Company.init()]);
  await seedRbac();
  await seedLeadConfig();
  await seedPipelines();
  await seedQuotationStatuses();
  await seedOrderStatuses();
  await seedActivityTypes();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.plain = await createUser(await defaultRole());
  ctx.reader = await createUser(await createRole(['customers.read'], 'Customer Reader'));
  ctx.manager = await createUser(await createRole(['customers.read', 'customers.create', 'customers.update'], 'Account Manager'), {
    firstName: 'Mira',
    lastName: 'Manager',
  });
  ctx.inactive = await createUser(await defaultRole(), { status: 'inactive' });
  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.readerToken = await loginAs(app, ctx.reader);
  ctx.managerToken = await loginAs(app, ctx.manager);

  const industry = (await post('industries', { name: 'Manufacturing' })).item;
  ctx.industry = industry;
  ctx.acme = (await post('companies', { name: 'Acme Industries', city: 'Pune', industryId: industry.id, email: 'info@acme.example', assignedTo: ctx.manager.id })).company;
  ctx.bolt = (await post('companies', { name: 'Bolt Traders', city: 'Mumbai' })).company;
  ctx.cedar = (await post('companies', { name: 'Cedar Systems', city: 'Pune' })).company;
  ctx.delta = (await post('companies', { name: 'Delta Clinics', city: 'Chennai' })).company;
  ctx.priya = (await post('contacts', { firstName: 'Priya', lastName: 'Nair', companyId: ctx.acme.id })).contact;
  ctx.ravi = (await post('contacts', { firstName: 'Ravi', lastName: 'Iyer', companyId: ctx.acme.id })).contact;
  ctx.omar = (await post('contacts', { firstName: 'Omar', lastName: 'Khan', companyId: ctx.bolt.id })).contact;
  const gst = (await post('taxes', { name: 'GST 18', rate: 18 })).item;
  ctx.chair = (await post('products', { name: 'Ergonomic Chair', basePrice: 1000, taxId: gst.id })).product;
  ctx.quoteStatuses = (await request(app).get('/api/v1/quotation-statuses').set(admin())).body.data.items;
  ctx.orderStatuses = (await request(app).get('/api/v1/order-statuses').set(admin())).body.data.items;
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await verifyDeclaredPermissions(), []);
});

test('every customer endpoint needs a token (401) and a permission (403)', async () => {
  const id = missing();
  const calls = (headers) => [
    request(app).get(API).set(headers),
    request(app).post(API).set(headers).send({ companyId: ctx.bolt.id }),
    request(app).get(`${API}/${id}`).set(headers),
    request(app).get(`${API}/${id}/summary`).set(headers),
    request(app).get(`${API}/${id}/timeline`).set(headers),
    request(app).put(`${API}/${id}`).set(headers).send({ notes: 'Nope' }),
    request(app).delete(`${API}/${id}`).set(headers),
  ];
  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) assert.equal(res.status, 403);
  const reader = as(ctx.readerToken);
  assert.equal((await request(app).post(API).set(reader).send({ companyId: ctx.bolt.id })).status, 403);
  assert.equal(await Customer.countDocuments(), 0);
});

test('backfill: companies that already had orders become customers, once', async () => {
  // Orders written before customers existed: remove the customer the order just made.
  const order = await orderFor(ctx.cedar, { quantity: 2 });
  await Customer.deleteMany({});
  assert.equal(await backfillCustomers(), true);
  const [customer] = await Customer.find();
  assert.equal(String(customer.companyId), ctx.cedar.id);
  assert.equal(String(customer.firstOrderId), order.id);
  assert.equal(customer.customerSince.toISOString().slice(0, 10), order.orderDate.slice(0, 10));

  await Customer.deleteMany({});
  assert.equal(await backfillCustomers(), false, 'runs once; a removed customer is not brought back');
  assert.equal(await Customer.countDocuments(), 0);
});

test('the first order makes a company a customer, referencing that order', async () => {
  const order = await orderFor(ctx.acme, { quantity: 3 });
  const customers = (await request(app).get(`${API}?companyId=${ctx.acme.id}`).set(admin())).body.data.customers;
  assert.equal(customers.length, 1);
  const [customer] = customers;
  assert.equal(customer.customerNumber, 'CUST-000003', 'numbers 1 and 2 went to the backfill test');
  assert.equal(customer.firstOrderId, order.id);
  assert.equal(customer.firstOrder.orderNumber, order.orderNumber);
  assert.equal(customer.accountManagerId, ctx.manager.id, "from the company's assigned user");
  assert.equal(customer.status, 'active');
  ctx.acmeCustomer = customer;

  // A second order does not make a second customer.
  await orderFor(ctx.acme, { quantity: 1 });
  await orderFor(ctx.acme, { quantity: 5, cancel: true });
  assert.equal(await Customer.countDocuments({ companyId: ctx.acme.id }), 1);
});

test('nothing is copied from the company: its details are read from it', async () => {
  const stored = await Customer.findById(ctx.acmeCustomer.id).lean();
  for (const field of ['name', 'email', 'city', 'phone', 'address']) assert.equal(field in stored, false, field);

  await request(app).put(`/api/v1/companies/${ctx.acme.id}`).set(admin()).send({ name: 'Acme Industries Ltd' });
  const res = await request(app).get(`${API}/${ctx.acmeCustomer.id}`).set(as(ctx.readerToken));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.customer.company.name, 'Acme Industries Ltd', 'a rename shows at once');
  assert.equal(res.body.data.customer.company.industry.name, 'Manufacturing');
  await request(app).put(`/api/v1/companies/${ctx.acme.id}`).set(admin()).send({ name: 'Acme Industries' });
});

test('create by hand: validation and one customer per company', async () => {
  const res = await request(app)
    .post(API)
    .set(as(ctx.managerToken))
    .send({ companyId: ctx.bolt.id, primaryContactId: ctx.omar.id, customerSince: '2030-05-01', notes: 'Walk-in account' });
  assert.equal(res.status, 201);
  const { customer } = res.body.data;
  assert.equal(customer.company.name, 'Bolt Traders');
  assert.equal(customer.primaryContact.fullName, 'Omar Khan');
  assert.equal(customer.customerSince.slice(0, 10), '2030-05-01');
  assert.equal('firstOrderId' in customer, false, 'no orders yet');
  assert.deepEqual(customer.stats, { orderCount: 0, orderValue: 0, lastOrderDate: null, openOpportunities: 0 });
  ctx.boltCustomer = customer;

  const cases = {
    'already a customer': [{ companyId: ctx.bolt.id }, 409, 'companyId'],
    'unknown company': [{ companyId: missing() }, 400, 'companyId'],
    'contact of another company': [{ companyId: ctx.delta.id, primaryContactId: ctx.priya.id }, 400, 'primaryContactId'],
    'inactive account manager': [{ companyId: ctx.delta.id, accountManagerId: ctx.inactive.id }, 400, 'accountManagerId'],
    'unknown status': [{ companyId: ctx.delta.id, status: 'vip' }, 422, 'status'],
    'company details sent': [{ companyId: ctx.delta.id, name: 'Copy' }, 422, 'name'],
    'number sent': [{ companyId: ctx.delta.id, customerNumber: 'CUST-1' }, 422, 'customerNumber'],
    'no company': [{}, 422, 'companyId'],
  };
  for (const [label, [body, status, field]] of Object.entries(cases)) {
    const r = await request(app).post(API).set(admin()).send(body);
    assert.equal(r.status, status, label);
    assert.ok(r.body.errors.some((e) => e.field === field), `${label}: names ${field}`);
  }

  // Two requests for the same company at once: one customer.
  const both = await Promise.all([1, 2].map(() => request(app).post(API).set(admin()).send({ companyId: ctx.delta.id })));
  assert.deepEqual(both.map((r) => r.status).sort(), [201, 409]);
  ctx.deltaCustomer = both.find((r) => r.status === 201).body.data.customer;
});

test('list: search over company fields, filters, sorting, pagination and real per-row figures', async () => {
  assert.deepEqual(await numbersOf('sortBy=name&sortOrder=asc'), ['Acme Industries', 'Bolt Traders', 'Delta Clinics']);
  assert.deepEqual(await numbersOf('search=pune'), ['Acme Industries'], 'city is searched (Cedar is not a customer)');
  assert.deepEqual(await numbersOf('search=acme industries'), ['Acme Industries']);
  assert.deepEqual(await numbersOf(`search=${ctx.boltCustomer.customerNumber}`), ['Bolt Traders']);
  assert.deepEqual(await numbersOf(`industryId=${ctx.industry.id}`), ['Acme Industries']);
  assert.deepEqual(await numbersOf(`accountManagerId=${ctx.manager.id}`), ['Acme Industries']);
  assert.deepEqual(await numbersOf('sinceFrom=2030-05-01&sinceTo=2030-05-01'), ['Bolt Traders']);
  assert.deepEqual(await numbersOf('sortBy=customerNumber&sortOrder=desc'), ['Delta Clinics', 'Bolt Traders', 'Acme Industries']);

  const page = await request(app).get(`${API}?limit=2&page=2&sortBy=name`).set(admin());
  assert.deepEqual(page.body.data.customers.map((c) => c.company.name), ['Delta Clinics']);
  assert.deepEqual(page.body.data.pagination, { page: 2, limit: 2, total: 3, totalPages: 2 });

  // Figures come from the database: Acme has 3 orders, one cancelled (not counted).
  const acme = (await request(app).get(`${API}?companyId=${ctx.acme.id}`).set(admin())).body.data.customers[0];
  const orders = await Order.find({ companyId: ctx.acme.id });
  const counted = orders.filter((o) => o.grandTotal !== Math.max(...orders.map((x) => x.grandTotal)));
  assert.equal(acme.stats.orderCount, 2);
  assert.equal(acme.stats.orderValue, Math.round(counted.reduce((sum, o) => sum + o.grandTotal, 0) * 100) / 100);
  assert.ok(acme.stats.lastOrderDate);

  for (const query of ['limit=500', 'sortBy=password', 'status=vip', 'industryId=nope']) {
    assert.equal((await request(app).get(`${API}?${query}`).set(admin())).status, 422, query);
  }
});

test('summary: every section with its real count, and "not available" for modules not built', async () => {
  await post('opportunities', { name: 'Expansion', companyId: ctx.acme.id, estimatedValue: 50000 });
  const types = (await request(app).get('/api/v1/activity-types').set(admin())).body.data.items;
  await post('activities', { typeId: types[0].id, subject: 'Kick-off call', contactId: ctx.priya.id });
  await post('activities', { typeId: types[0].id, subject: 'Overdue visit', companyId: ctx.acme.id, dueDate: '2020-01-01T10:00:00.000Z' });
  await post('quotations', { companyId: ctx.acme.id, items: [{ productId: ctx.chair.id, quantity: 1 }] });

  const res = await request(app).get(`${API}/${ctx.acmeCustomer.id}/summary`).set(as(ctx.readerToken));
  assert.equal(res.status, 200);
  const { sections, metrics, customer } = res.body.data;
  assert.equal(customer.id, ctx.acmeCustomer.id);
  assert.deepEqual(
    sections.map((s) => s.key),
    ['contacts', 'activities', 'opportunities', 'quotations', 'orders', 'projects', 'tickets', 'payments', 'contracts', 'documents', 'timeline']
  );
  const count = (key) => sections.find((s) => s.key === key).count;
  assert.equal(count('contacts'), 2);
  assert.equal(count('activities'), 2);
  assert.equal(count('opportunities'), 1);
  assert.equal(count('quotations'), 4, 'three accepted with orders, one draft');
  assert.equal(count('orders'), 3);
  assert.equal(count('projects'), 0, 'projects are real now; this customer has none');
  assert.equal(count('tickets'), 0, 'tickets are real now; this customer has none');
  assert.equal(count('contracts'), 0, 'contracts are real now; this customer has none');
  assert.equal(count('payments'), 0, 'payments are real now; this customer has none');
  assert.equal(count('documents'), 0, 'documents are real now; this customer has none');
  assert.ok(count('timeline') >= 2, 'customer and company events');

  assert.equal(metrics.orders.orderCount, 2);
  assert.equal(metrics.orders.byCategory.cancelled.count, 1);
  assert.equal(metrics.orders.byCategory.open.count, 2);
  assert.equal(metrics.quotations.byCategory.accepted.count, 3);
  assert.equal(metrics.quotations.byCategory.draft.count, 1);
  assert.equal(metrics.quotations.openValue, metrics.quotations.byCategory.draft.value);
  assert.deepEqual(metrics.opportunities.open, { count: 1, value: 50000 });
  assert.deepEqual(metrics.activities, { total: 2, pending: 2, overdue: 1 });

  assert.equal((await request(app).get(`${API}/${missing()}/summary`).set(admin())).status, 404);
});

test('update and timeline: changes recorded alongside the company history', async () => {
  const url = `${API}/${ctx.acmeCustomer.id}`;
  const res = await request(app).put(url).set(as(ctx.managerToken)).send({ primaryContactId: ctx.priya.id, status: 'inactive', notes: 'Key account' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.customer.primaryContact.fullName, 'Priya Nair');
  assert.equal(res.body.data.customer.status, 'inactive');
  assert.deepEqual(await numbersOf('status=inactive'), ['Acme Industries']);

  const cases = {
    'contact of another company': [{ primaryContactId: ctx.omar.id }, 400],
    'move to another company': [{ companyId: ctx.bolt.id }, 422],
    'nothing': [{}, 422],
  };
  for (const [label, [body, status]] of Object.entries(cases)) {
    assert.equal((await request(app).put(url).set(admin()).send(body)).status, status, label);
  }

  const timeline = (await request(app).get(`${url}/timeline`).set(admin())).body.data;
  const kinds = timeline.events.map((e) => e.entityType);
  assert.ok(kinds.includes('customer') && kinds.includes('company'), 'both histories');
  const update = timeline.events.find((e) => e.entityType === 'customer' && e.action === 'updated');
  assert.deepEqual(update.changes.map((c) => c.label), ['Primary contact', 'Status', 'Notes']);
  const created = timeline.events.find((e) => e.entityType === 'customer' && e.action === 'created');
  assert.match(created.summary, /Became a customer with order ORD-/);
});

test('guards: a customer company and its primary contact cannot be deleted; removing the customer keeps the company', async () => {
  const company = await request(app).delete(`/api/v1/companies/${ctx.delta.id}`).set(admin());
  assert.equal(company.status, 409);
  assert.ok(company.body.errors.some((e) => e.field === 'Customer' || /Customer/.test(e.message)));
  assert.equal((await request(app).delete(`/api/v1/contacts/${ctx.priya.id}`).set(admin())).status, 409);

  assert.equal((await request(app).delete(`${API}/${ctx.deltaCustomer.id}`).set(as(ctx.managerToken))).status, 403);
  assert.equal((await request(app).delete(`${API}/${ctx.deltaCustomer.id}`).set(admin())).status, 200);
  assert.equal((await request(app).get(`${API}/${ctx.deltaCustomer.id}`).set(admin())).status, 404);
  assert.equal((await request(app).get(`/api/v1/companies/${ctx.delta.id}`).set(admin())).status, 200, 'the company stays');
  assert.equal((await request(app).delete(`/api/v1/companies/${ctx.delta.id}`).set(admin())).status, 200, 'and can now be deleted');

  // A removed customer can be added again, with a new number.
  const again = await request(app).post(API).set(admin()).send({ companyId: ctx.cedar.id });
  assert.equal(again.status, 201);
  assert.notEqual(again.body.data.customer.customerNumber, ctx.deltaCustomer.customerNumber);
  assert.equal(again.body.data.customer.firstOrderId, (await Order.findOne({ companyId: ctx.cedar.id })).id, 'its existing first order is referenced');
});
