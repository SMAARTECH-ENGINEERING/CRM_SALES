import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_notifications');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Notification } = await import('../src/models/Notification.js');
const { default: User } = await import('../src/models/User.js');
const s = await import('../src/services/seed.service.js');
const { runNotificationChecks } = await import('../src/services/notification.service.js');
const { runReminderCheck } = await import('../src/services/contractReminder.service.js');
const { createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const API = '/api/v1/notifications';
const DAY = 24 * 60 * 60 * 1000;

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const missing = () => new mongoose.Types.ObjectId().toString();
const call = (method, path, token, body) => request(app)[method](`/api/v1/${path}`).set(as(token)).send(body);
const post = async (path, body, token = ctx.adminToken) => (await call('post', path, token, body)).body.data;
const day = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
// A user's notifications, newest first, optionally of one type.
const inbox = async (who, query = '') => (await request(app).get(`${API}?limit=100${query}`).set(as(ctx[`${who}Token`]))).body.data;
const ofType = async (who, type) => (await inbox(who, `&type=${type}`)).notifications;

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Notification.init()]);
  await seedRbac();
  for (const seed of ['seedLeadConfig', 'seedQuotationStatuses', 'seedOrderStatuses', 'seedTicketSettings', 'seedContractSettings', 'seedPaymentSettings']) {
    await s[seed]();
  }

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  // Works leads, tickets, quotations and payments - and has no notification permission, because there is none.
  ctx.sales = await createUser(
    await createRole(
      ['leads.read', 'leads.create', 'leads.update', 'leads.assign', 'tickets.read', 'tickets.update', 'quotations.read', 'quotations.create', 'quotations.update', 'payments.create', 'payments.read', 'followups.create', 'followups.update', 'followups.read'],
      'Sales'
    ),
    { firstName: 'Sam', lastName: 'Sales' }
  );
  ctx.other = await createUser(await defaultRole(), { firstName: 'Olga', lastName: 'Other' });
  ctx.inactive = await createUser(await defaultRole(), { status: 'inactive' });
  for (const who of ['admin', 'sales', 'other']) ctx[`${who}Token`] = await loginAs(app, ctx[who]);

  ctx.acme = (await post('companies', { name: 'Acme Industries' })).company;
  const tax = (await post('taxes', { name: 'GST 18', rate: 18 })).item;
  ctx.product = (await post('products', { name: 'Desk', basePrice: 1000, taxId: tax.id })).product;
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('notifications need a token, and nothing else: they are the signed-in user\'s own', async () => {
  const id = missing();
  for (const res of await Promise.all([
    request(app).get(API),
    request(app).patch(`${API}/read-all`),
    request(app).patch(`${API}/${id}/read`),
    request(app).delete(`${API}/${id}`),
  ])) {
    assert.equal(res.status, 401, res.req.path);
  }
  // A user whose role grants nothing at all still has an (empty) inbox.
  const res = await request(app).get(API).set(as(ctx.otherToken));
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.data.notifications, res.body.data.unreadCount, res.body.data.pagination.total], [[], 0, 0]);
  assert.equal((await request(app).get(`${API}?type=birthday`).set(admin())).status, 422);
});

test('lead assigned: the new assignee is told - not the person who did it', async () => {
  const lead = (await post('leads', { title: 'Office fit-out', companyId: ctx.acme.id })).lead;
  await call('patch', `leads/${lead.id}/assign`, ctx.adminToken, { assignedTo: ctx.sales.id });

  const [notification] = await ofType('sales', 'lead_assigned');
  assert.deepEqual(
    [notification.title, notification.message, notification.entityType, notification.entityId, notification.isRead, notification.userId],
    ['Lead assigned to you', `${lead.leadNumber} - Office fit-out was assigned to you by Ada Admin`, 'lead', lead.id, false, ctx.sales.id]
  );
  assert.ok(notification.createdAt);
  assert.equal(notification.dedupeKey, undefined);
  assert.equal((await inbox('admin')).notifications.length, 0, 'the actor is not notified');

  // Taking a lead yourself, or creating one for yourself: nobody to tell.
  const own = (await post('leads', { title: 'Mine', assignedTo: ctx.sales.id }, ctx.salesToken)).lead;
  assert.ok(own.id);
  assert.equal((await ofType('sales', 'lead_assigned')).length, 1);
  // Created already assigned to someone else: told.
  await post('leads', { title: 'For Sam', assignedTo: ctx.sales.id });
  assert.equal((await ofType('sales', 'lead_assigned')).length, 2);
  // An inactive user is never notified.
  assert.equal(await Notification.countDocuments({ userId: ctx.inactive._id }), 0);
});

test('ticket assigned: on assignment and when opened already assigned', async () => {
  const ticket = (await post('tickets', { companyId: ctx.acme.id, subject: 'Printer offline' })).ticket;
  await call('patch', `tickets/${ticket.id}/assign`, ctx.adminToken, { assignedTo: ctx.sales.id });
  await post('tickets', { companyId: ctx.acme.id, subject: 'Scanner jam', assignedTo: ctx.sales.id });
  const notifications = await ofType('sales', 'ticket_assigned');
  assert.equal(notifications.length, 2);
  assert.equal(notifications[1].message, `${ticket.ticketNumber} - Printer offline was assigned to you by Ada Admin`);
  assert.deepEqual([notifications[1].entityType, notifications[1].entityId], ['ticket', ticket.id]);
});

test('quotation status changed: whoever prepared it is told when someone else changes it', async () => {
  const quotation = (await post('quotations', { companyId: ctx.acme.id, items: [{ productId: ctx.product.id, quantity: 1 }] }, ctx.salesToken)).quotation;
  const statuses = (await request(app).get('/api/v1/quotation-statuses').set(admin())).body.data.items;
  const sent = statuses.find((x) => x.category === 'sent');
  const accepted = statuses.find((x) => x.category === 'accepted');

  await call('patch', `quotations/${quotation.id}/status`, ctx.salesToken, { statusId: sent.id });
  assert.equal((await ofType('sales', 'quotation_status_changed')).length, 0, 'their own change');
  await call('patch', `quotations/${quotation.id}/status`, ctx.adminToken, { statusId: accepted.id });
  const [notification] = await ofType('sales', 'quotation_status_changed');
  assert.equal(notification.message, `${quotation.quotationNumber} is now ${accepted.name} (was ${sent.name})`);
  assert.deepEqual([notification.entityType, notification.entityId], ['quotation', quotation.id]);
});

test('follow-up due: found by the check, once per due date', async () => {
  const lead = (await post('leads', { title: 'Call back' })).lead;
  const due = new Date(Date.now() - 60 * 1000).toISOString();
  const followUp = (await post('followups', { title: 'Ring the buyer', relatedType: 'lead', relatedId: lead.id, assignedTo: ctx.sales.id, dueDate: due })).followUp;
  await post('followups', { title: 'Next month', relatedType: 'lead', relatedId: lead.id, assignedTo: ctx.sales.id, dueDate: new Date(Date.now() + 30 * DAY).toISOString() });

  let result = await runNotificationChecks();
  assert.equal(result.followUpsDue, 1, 'the one that is due, not the one next month');
  let [notification] = await ofType('sales', 'follow_up_due');
  assert.match(notification.message, /^"Ring the buyer" was due on \d{4}-\d{2}-\d{2}$/);
  assert.deepEqual([notification.entityType, notification.entityId], ['lead', lead.id], 'opens the record it is about');

  // Running again tells nobody twice - even after the user deleted it.
  assert.equal((await runNotificationChecks()).followUpsDue, 0);
  assert.equal((await request(app).delete(`${API}/${notification.id}`).set(as(ctx.salesToken))).status, 200);
  assert.equal((await runNotificationChecks()).followUpsDue, 0);
  assert.equal((await ofType('sales', 'follow_up_due')).length, 0);

  // A reminder date brings it forward; a new due date is a new event; done ones are left alone.
  await call('put', `followups/${followUp.id}`, ctx.adminToken, { dueDate: new Date(Date.now() + 2 * DAY).toISOString(), reminderDate: new Date(Date.now() - 1000).toISOString() });
  result = await runNotificationChecks();
  assert.equal(result.followUpsDue, 1);
  [notification] = await ofType('sales', 'follow_up_due');
  assert.equal(notification.title, 'Follow-up due');
  await call('patch', `followups/${followUp.id}/complete`, ctx.adminToken);
  assert.equal((await runNotificationChecks(new Date(Date.now() + 10 * DAY))).followUpsDue, 0);
});

test('payment overdue: whoever recorded it, the account manager and the order owner - once', async () => {
  // Admin's order for Acme (which makes it a customer), managed by `other`, with a payment recorded by sales.
  const order = (await post('orders', { companyId: ctx.acme.id, assignedTo: ctx.admin.id, items: [{ productId: ctx.product.id, quantity: 2 }] })).order;
  const customer = (await request(app).get(`/api/v1/customers?companyId=${ctx.acme.id}`).set(admin())).body.data.customers[0];
  await call('put', `customers/${customer.id}`, ctx.adminToken, { accountManagerId: ctx.other.id });
  const late = (await post('payments', { companyId: ctx.acme.id, orderId: order.id, amount: 1000, paidAmount: 400, dueDate: day(-3) }, ctx.salesToken)).payment;
  await post('payments', { companyId: ctx.acme.id, amount: 500, dueDate: day(5) }, ctx.salesToken);
  await post('payments', { companyId: ctx.acme.id, amount: 200, paidAmount: 200, dueDate: day(-9) }, ctx.salesToken);

  const result = await runNotificationChecks();
  assert.equal(result.paymentsOverdue, 3, 'one overdue payment, three people');
  for (const who of ['sales', 'other', 'admin']) {
    const [notification] = await ofType(who, 'payment_overdue');
    assert.equal(notification.message, `${late.invoiceNumber} (Acme Industries): 600.00 outstanding, due ${day(-3)} - 3 days ago`, who);
    assert.deepEqual([notification.entityType, notification.entityId], ['payment', late.id]);
  }
  assert.equal((await runNotificationChecks()).paymentsOverdue, 0);
});

test('contract expiring: the reminder also notifies the person responsible', async () => {
  const contract = (await post('contracts', { companyId: ctx.acme.id, startDate: day(-300), endDate: day(5), amount: 1000, assignedTo: ctx.sales.id })).contract;
  await runReminderCheck();
  await runReminderCheck();
  const notifications = await ofType('sales', 'contract_expiring');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].message, `Contract ${contract.contractNumber} with Acme Industries ends in 5 days`);
  assert.deepEqual([notifications[0].entityType, notifications[0].entityId], ['contract', contract.id]);
});

test('read, read all, delete - and only your own', async () => {
  let data = await inbox('sales');
  const total = data.notifications.length;
  assert.ok(total >= 6);
  assert.equal(data.unreadCount, total);
  assert.deepEqual(data.notifications.map((n) => n.createdAt), data.notifications.map((n) => n.createdAt).sort().reverse(), 'newest first');
  const [first, second] = data.notifications;

  // Someone else's notification does not exist as far as you can tell.
  for (const res of [
    await request(app).patch(`${API}/${first.id}/read`).set(as(ctx.otherToken)),
    await request(app).delete(`${API}/${first.id}`).set(as(ctx.otherToken)),
    await request(app).patch(`${API}/${first.id}/read`).set(admin()),
  ]) {
    assert.equal(res.status, 404);
  }

  let res = await request(app).patch(`${API}/${first.id}/read`).set(as(ctx.salesToken));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.notification.isRead, true);
  assert.ok(res.body.data.notification.readAt);
  assert.equal(res.body.data.unreadCount, total - 1);
  // Reading twice changes nothing.
  assert.equal((await request(app).patch(`${API}/${first.id}/read`).set(as(ctx.salesToken))).body.data.unreadCount, total - 1);

  data = await inbox('sales', '&isRead=false');
  assert.equal(data.notifications.length, total - 1);
  assert.ok(!data.notifications.some((n) => n.id === first.id));
  assert.equal((await inbox('sales', '&isRead=true')).notifications.length, 1);

  res = await request(app).delete(`${API}/${second.id}`).set(as(ctx.salesToken));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.unreadCount, total - 2);
  assert.equal((await request(app).delete(`${API}/${second.id}`).set(as(ctx.salesToken))).status, 404);

  // Read all: only this user's.
  const othersUnread = (await inbox('other')).unreadCount;
  res = await request(app).patch(`${API}/read-all`).set(as(ctx.salesToken));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, { updated: total - 2, unreadCount: 0 });
  assert.equal((await inbox('sales')).unreadCount, 0);
  assert.equal((await inbox('other')).unreadCount, othersUnread, 'untouched');
  assert.equal((await request(app).patch(`${API}/not-an-id/read`).set(admin())).status, 422);

  // Paging.
  data = (await request(app).get(`${API}?page=2&limit=2`).set(as(ctx.salesToken))).body.data;
  assert.deepEqual([data.notifications.length, data.pagination.page, data.pagination.total], [2, 2, total - 1]);
});
