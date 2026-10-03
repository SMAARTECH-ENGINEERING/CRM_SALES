import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

// The same API with overpayment explicitly switched on.
setTestEnv('crm_test_payments_overpay', { PAYMENT_ALLOW_OVERPAYMENT: 'true' });

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: User } = await import('../src/models/User.js');
const s = await import('../src/services/seed.service.js');
const { createUser, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const ctx = {};
const admin = () => ({ Authorization: `Bearer ${ctx.token}` });
const post = (p, body) => request(app).post(`/api/v1/${p}`).set(admin()).send(body);

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await User.init();
  await seedRbac();
  await s.seedLeadConfig();
  await s.seedOrderStatuses();
  await s.seedPaymentSettings();
  ctx.token = await loginAs(app, await createUser(await superAdminRole()));
  ctx.company = (await post('companies', { name: 'Acme Industries' })).body.data.company;
  const tax = (await post('taxes', { name: 'GST 18', rate: 18 })).body.data.item;
  const product = (await post('products', { name: 'Desk', basePrice: 1000, taxId: tax.id })).body.data.product;
  ctx.order = (await post('orders', { companyId: ctx.company.id, items: [{ productId: product.id, quantity: 1 }] })).body.data.order;
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('with PAYMENT_ALLOW_OVERPAYMENT=true more than the amount can be paid; remaining never goes below zero', async () => {
  let res = await post('payments', { companyId: ctx.company.id, amount: 100, paidAmount: 130 });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { payment } = res.body.data;
  assert.deepEqual([payment.remainingAmount, payment.overpaidAmount, payment.status.category], [0, 30, 'paid']);

  res = await request(app).put(`/api/v1/payments/${payment.id}`).set(admin()).send({ receivedAmount: 20 });
  assert.deepEqual([res.body.data.payment.paidAmount, res.body.data.payment.overpaidAmount], [150, 50]);
});

test('and an order can be invoiced for more than its total', async () => {
  const res = await post('payments', { companyId: ctx.company.id, orderId: ctx.order.id, amount: ctx.order.grandTotal + 500 });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const stats = (await request(app).get(`/api/v1/payments/stats?orderId=${ctx.order.id}`).set(admin())).body.data;
  assert.equal(stats.order.toInvoice, 0);
});
