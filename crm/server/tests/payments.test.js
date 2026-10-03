import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_payments');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Payment } = await import('../src/models/Payment.js');
const { default: User } = await import('../src/models/User.js');
const { default: Customer } = await import('../src/models/Customer.js');
const s = await import('../src/services/seed.service.js');
const { PAYMENT_STATUS_SEED } = await import('../src/seeds/payment.seed.js');
const { createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const API = '/api/v1/payments';
const DAY = 24 * 60 * 60 * 1000;

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const missing = () => new mongoose.Types.ObjectId().toString();
const post = async (p, body) => (await request(app).post(`/api/v1/${p}`).set(admin()).send(body)).body.data;
const statusOf = (category) => ctx.statuses.find((x) => x.category === category);
const day = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const create = (body, token = ctx.adminToken) =>
  request(app).post(API).set(as(token)).send({ companyId: ctx.acme.id, amount: 1000, ...body });
const update = (id, body, token = ctx.adminToken) => request(app).put(`${API}/${id}`).set(as(token)).send(body);
const numbers = async (query) =>
  (await request(app).get(`${API}?limit=100&sortBy=invoiceNumber&sortOrder=asc&${query}`).set(admin())).body.data.payments.map((p) => p.invoiceNumber);

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Payment.init(), Customer.init()]);
  await seedRbac();
  await s.seedLeadConfig();
  await s.seedOrderStatuses();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.plain = await createUser(await defaultRole());
  ctx.reader = await createUser(await createRole(['payments.read'], 'Payment Reader'));
  ctx.clerk = await createUser(await createRole(['payments.read', 'payments.create', 'payments.update'], 'Accounts Clerk'));
  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.readerToken = await loginAs(app, ctx.reader);
  ctx.clerkToken = await loginAs(app, ctx.clerk);

  ctx.acme = (await post('companies', { name: 'Acme Industries' })).company;
  ctx.bolt = (await post('companies', { name: 'Bolt Traders' })).company;
  const tax = (await post('taxes', { name: 'GST 18', rate: 18 })).item;
  const product = (await post('products', { name: 'Desk', basePrice: 1000, taxId: tax.id })).product;
  // Creating an order makes Acme a customer.
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

test('methods and statuses are data: nothing until seeded', async () => {
  assert.equal((await create({})).status, 409, 'a payment needs a status of the right meaning');
  assert.equal(await s.seedPaymentSettings(), true);
  assert.equal(await s.seedPaymentSettings(), false);
  ctx.statuses = (await request(app).get('/api/v1/payment-statuses').set(admin())).body.data.items;
  ctx.methods = (await request(app).get('/api/v1/payment-methods').set(admin())).body.data.items;
  assert.deepEqual(ctx.statuses.map((x) => [x.name, x.category]), PAYMENT_STATUS_SEED.map((x) => [x.name, x.category]));
  assert.ok(ctx.methods.length > 0);
  assert.equal((await request(app).post('/api/v1/payment-statuses').set(admin()).send({ name: 'No meaning' })).status, 422);
  assert.equal((await request(app).post('/api/v1/payment-statuses').set(admin()).send({ name: 'Odd', category: 'overdue' })).status, 422);
  assert.equal((await request(app).get('/api/v1/payment-methods').set(as(ctx.readerToken))).status, 200);
  assert.equal((await request(app).post('/api/v1/payment-methods').set(as(ctx.clerkToken)).send({ name: 'Barter' })).status, 403);
});

test('every payment endpoint needs a token (401) and a permission (403)', async () => {
  const id = missing();
  const calls = (headers) => [
    request(app).get(API).set(headers),
    request(app).get(`${API}/stats`).set(headers),
    request(app).post(API).set(headers).send({}),
    request(app).get(`${API}/${id}`).set(headers),
    request(app).put(`${API}/${id}`).set(headers).send({ notes: 'x' }),
    request(app).delete(`${API}/${id}`).set(headers),
    request(app).get(`${API}/${id}/timeline`).set(headers),
  ];
  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401, res.req.path);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) assert.equal(res.status, 403, res.req.path);
  const reader = await Promise.all(calls(as(ctx.readerToken)));
  assert.deepEqual(reader.map((res) => res.status), [200, 200, 403, 404, 403, 403, 404]);
});

test('create: the server works out the remaining amount and the status', async () => {
  let res = await create({ orderId: ctx.acmeOrder.id, dueDate: day(10), notes: 'First instalment' }, ctx.clerkToken);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  ctx.first = res.body.data.payment;
  assert.equal(ctx.first.invoiceNumber, 'INV-000001');
  assert.equal(ctx.first.paidAmount, 0);
  assert.equal(ctx.first.remainingAmount, 1000);
  assert.equal(ctx.first.status.category, 'unpaid');
  assert.equal(ctx.first.customer.id, ctx.acmeCustomer.id, "linked to the company's customer record");
  assert.equal(ctx.first.order.orderNumber, ctx.acmeOrder.orderNumber);
  assert.equal(ctx.first.paymentDate, undefined);
  assert.deepEqual([ctx.first.isOverdue, ctx.first.daysOverdue], [false, 0]);

  // Part paid at creation, with its own invoice number.
  res = await create({ invoiceNumber: 'acc/2031/17', amount: 500.555, paidAmount: 200, paymentMethodId: ctx.methods[0].id });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  ctx.second = res.body.data.payment;
  assert.equal(ctx.second.invoiceNumber, 'ACC/2031/17');
  assert.deepEqual([ctx.second.amount, ctx.second.paidAmount, ctx.second.remainingAmount], [500.56, 200, 300.56]);
  assert.equal(ctx.second.status.category, 'partially_paid');
  assert.ok(ctx.second.paymentDate, 'dated today when money was received');

  // Paid in full; a status that contradicts the amounts is replaced.
  res = await create({ companyId: ctx.bolt.id, amount: 300, paidAmount: 300, statusId: statusOf('unpaid').id });
  ctx.third = res.body.data.payment;
  assert.equal(ctx.third.status.category, 'paid');
  assert.equal(ctx.third.remainingAmount, 0);
  assert.equal(ctx.third.invoiceNumber, 'INV-000002', 'a typed number does not use up a generated one');
});

test('create: a client cannot send the remaining amount, and references are checked', async () => {
  const cases = [
    [{ remainingAmount: 0 }, 422, 'remainingAmount'],
    [{ customerId: missing() }, 422, 'customerId'],
    [{ amount: 0 }, 422, 'amount'],
    [{ amount: undefined }, 422, 'amount'],
    [{ paidAmount: -5 }, 422, 'paidAmount'],
    [{ invoiceNumber: 'has space' }, 422, 'invoiceNumber'],
    [{ invoiceNumber: 'ACC/2031/17' }, 409, 'invoiceNumber'],
    [{ companyId: missing() }, 400, 'companyId'],
    [{ orderId: missing() }, 400, 'orderId'],
    [{ orderId: ctx.boltOrder.id }, 400, 'orderId'],
    [{ paymentMethodId: missing() }, 400, 'paymentMethodId'],
    [{ statusId: missing() }, 400, 'statusId'],
  ];
  for (const [body, status, field] of cases) {
    const res = await create(body);
    assert.equal(res.status, status, `${field}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.errors[0].field, field);
  }
  assert.match((await create({ remainingAmount: 0 })).body.errors[0].message, /calculated by the server/);
  assert.equal(await Payment.countDocuments(), 3, 'nothing was created');
});

test('no more can be paid than is outstanding', async () => {
  let res = await create({ amount: 100, paidAmount: 100.01 });
  assert.equal(res.status, 422);
  assert.equal(res.body.errors[0].field, 'paidAmount');
  assert.match(res.body.errors[0].message, /more than the amount outstanding/);

  res = await update(ctx.first.id, { paidAmount: 1000.5 });
  assert.equal(res.status, 422);
  res = await update(ctx.first.id, { receivedAmount: 1200 });
  assert.equal(res.status, 422);
  assert.equal(res.body.errors[0].field, 'receivedAmount');
  // Lowering the amount below what was already paid is the same mistake.
  res = await update(ctx.second.id, { amount: 150 });
  assert.equal(res.status, 422);
  assert.equal((await request(app).get(`${API}/${ctx.first.id}`).set(admin())).body.data.payment.paidAmount, 0, 'unchanged');
});

test("an order's invoices cannot add up to more than the order", async () => {
  const total = ctx.acmeOrder.grandTotal;
  // 1000 of it is already invoiced by the first payment.
  let res = await create({ orderId: ctx.acmeOrder.id, amount: total - 1000 + 0.01 });
  assert.equal(res.status, 422);
  assert.equal(res.body.errors[0].field, 'amount');
  assert.match(res.body.errors[0].message, /more than the order total/);

  res = await create({ orderId: ctx.acmeOrder.id, amount: total - 1000 });
  assert.equal(res.status, 201, 'exactly the rest is fine');
  ctx.rest = res.body.data.payment;
  assert.equal((await update(ctx.first.id, { amount: 1000.01 })).status, 422, 'nor by raising one later');
  assert.equal((await update(ctx.second.id, { orderId: ctx.acmeOrder.id })).status, 422, 'nor by attaching another');

  const stats = (await request(app).get(`${API}/stats?orderId=${ctx.acmeOrder.id}`).set(admin())).body.data;
  assert.deepEqual(stats.order, { id: ctx.acmeOrder.id, orderNumber: ctx.acmeOrder.orderNumber, grandTotal: total, invoiced: total, toInvoice: 0 });

  // A cancelled payment no longer counts against the order.
  res = await update(ctx.rest.id, { statusId: statusOf('cancelled').id });
  assert.equal(res.body.data.payment.status.category, 'cancelled');
  assert.equal((await request(app).get(`${API}/stats?orderId=${ctx.acmeOrder.id}`).set(admin())).body.data.order.toInvoice, total - 1000);
  // An order with payments cannot be deleted.
  assert.equal((await request(app).delete(`/api/v1/orders/${ctx.acmeOrder.id}`).set(admin())).status, 409);
});

test('update: money received is added by the server; the status follows', async () => {
  let res = await update(ctx.first.id, { receivedAmount: 400, paymentMethodId: ctx.methods[1].id, paymentDate: day(-1) }, ctx.clerkToken);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  let payment = res.body.data.payment;
  assert.deepEqual([payment.paidAmount, payment.remainingAmount, payment.status.category], [400, 600, 'partially_paid']);
  assert.ok(payment.paymentDate.startsWith(day(-1)));

  res = await update(ctx.first.id, { receivedAmount: 600 });
  payment = res.body.data.payment;
  assert.deepEqual([payment.paidAmount, payment.remainingAmount, payment.status.category], [1000, 0, 'paid']);
  assert.ok(payment.paymentDate.startsWith(day(0)), 'a new receipt is dated today');

  // Corrections use the total; back to nothing paid clears the date.
  res = await update(ctx.first.id, { paidAmount: 0 });
  payment = res.body.data.payment;
  assert.deepEqual([payment.paidAmount, payment.remainingAmount, payment.status.category, payment.paymentDate], [0, 1000, 'unpaid', undefined]);

  assert.equal((await update(ctx.first.id, { paidAmount: 10, receivedAmount: 10 })).status, 422, 'one or the other');
  assert.equal((await update(ctx.first.id, { remainingAmount: 1 })).status, 422);
  assert.equal((await update(ctx.first.id, { companyId: ctx.bolt.id })).status, 422);
  assert.equal((await update(ctx.first.id, { invoiceNumber: 'NEW-1' })).status, 422);

  const events = (await request(app).get(`${API}/${ctx.first.id}/timeline`).set(as(ctx.readerToken))).body.data.events;
  assert.deepEqual(events.map((e) => e.action), ['updated', 'updated', 'updated', 'created']);
  assert.deepEqual(events[1].changes.map((c) => [c.label, c.from, c.to]).slice(0, 2), [
    ['Paid', '400.00', '1000.00'],
    ['Remaining', '600.00', undefined],
  ].map(([l, f, t]) => [l, f, t ?? '0.00']));
});

test('cancelled stays cancelled until a live status is asked for', async () => {
  let res = await update(ctx.rest.id, { notes: 'Customer disputed this' });
  assert.equal(res.body.data.payment.status.category, 'cancelled');
  // Re-opening is checked against the order again: 1000 is invoiced, so the rest fits.
  res = await update(ctx.rest.id, { statusId: statusOf('paid').id });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.payment.status.category, 'unpaid', 'the amounts decide, not the request');
});

test('list: Paid, Partially Paid, Unpaid and Overdue filters; overdue is worked out by the server', async () => {
  // Due yesterday and not paid in full -> overdue. Paid in full and past due -> not.
  ctx.late = (await create({ amount: 250, dueDate: day(-3) })).body.data.payment;
  await create({ companyId: ctx.bolt.id, amount: 80, paidAmount: 80, dueDate: day(-30) });
  assert.deepEqual([ctx.late.isOverdue, ctx.late.daysOverdue], [true, 3]);

  assert.deepEqual(await numbers(''), ['ACC/2031/17', 'INV-000001', 'INV-000002', 'INV-000003', 'INV-000004', 'INV-000005']);
  assert.deepEqual(await numbers('state=paid'), ['INV-000002', 'INV-000005']);
  assert.deepEqual(await numbers('state=partially_paid'), ['ACC/2031/17']);
  assert.deepEqual(await numbers('state=unpaid'), ['INV-000001', 'INV-000003', 'INV-000004']);
  assert.deepEqual(await numbers('state=overdue'), ['INV-000004']);
  assert.deepEqual(await numbers('state=cancelled'), []);
  assert.deepEqual(await numbers(`state=overdue&statusId=${statusOf('paid').id}`), [], 'a contradiction matches nothing');
  assert.deepEqual(await numbers(`companyId=${ctx.bolt.id}`), ['INV-000002', 'INV-000005']);
  assert.deepEqual(await numbers(`orderId=${ctx.acmeOrder.id}`), ['INV-000001', 'INV-000003']);
  assert.deepEqual(await numbers(`customerId=${ctx.acmeCustomer.id}`), ['ACC/2031/17', 'INV-000001', 'INV-000003', 'INV-000004']);
  assert.deepEqual(await numbers('search=disputed'), ['INV-000003']);
  assert.equal((await request(app).get(`${API}?state=late`).set(admin())).status, 422);

  // A part payment on the overdue one keeps it overdue; paying it off ends that.
  await update(ctx.late.id, { receivedAmount: 50 });
  assert.deepEqual(await numbers('state=overdue'), ['INV-000004']);
  const stats = (await request(app).get(`${API}/stats`).set(as(ctx.readerToken))).body.data;
  assert.deepEqual(stats.overdue, { count: 1, remaining: 200 });
  assert.deepEqual(stats.byCategory.paid, { count: 2, amount: 380, paid: 380, remaining: 0 });
  assert.equal(stats.byCategory.partially_paid.count, 2);
  assert.equal(stats.totals.outstanding, stats.byCategory.unpaid.remaining + stats.byCategory.partially_paid.remaining);
  await update(ctx.late.id, { receivedAmount: 200 });
  assert.deepEqual(await numbers('state=overdue'), []);

  const sections = (await request(app).get(`/api/v1/companies/${ctx.acme.id}/sections`).set(admin())).body.data.sections;
  assert.deepEqual(sections.find((x) => x.key === 'payments'), { key: 'payments', label: 'Payments', available: true, count: 4 });
  const summary = (await request(app).get(`/api/v1/customers/${ctx.acmeCustomer.id}/summary`).set(admin())).body.data;
  assert.equal(summary.sections.find((x) => x.key === 'payments').count, 4);
});

test('delete: soft; the invoice number stays taken', async () => {
  assert.equal((await request(app).delete(`${API}/${ctx.second.id}`).set(as(ctx.clerkToken))).status, 403);
  assert.equal((await request(app).delete(`${API}/${ctx.second.id}`).set(admin())).status, 200);
  assert.equal((await request(app).get(`${API}/${ctx.second.id}`).set(admin())).status, 404);
  assert.equal((await create({ invoiceNumber: 'ACC/2031/17' })).status, 409);
});
