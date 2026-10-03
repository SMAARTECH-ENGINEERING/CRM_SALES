import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_reports', { REPORT_EXPORT_MAX_ROWS: '100' });

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: User } = await import('../src/models/User.js');
const { default: Lead } = await import('../src/models/Lead.js');
const s = await import('../src/services/seed.service.js');
const { REPORT_KEYS } = await import('../src/services/report.definitions.js');
const { createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const API = '/api/v1/reports';
const DAY = 24 * 60 * 60 * 1000;
const MODULES = ['leads.read', 'opportunities.read', 'customers.read', 'quotations.read', 'orders.read', 'payments.read', 'tickets.read', 'contracts.read', 'activities.read'];

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const call = (method, path, token, body) => request(app)[method](`/api/v1/${path}`).set(as(token)).send(body);
const post = async (path, body, token = ctx.adminToken) => {
  const res = await call('post', path, token, body);
  assert.ok(res.status < 300, `${path}: ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const run = async (key, query = '', who = 'admin') => {
  const res = await request(app).get(`${API}/${key}?${query}`).set(as(ctx[`${who}Token`]));
  assert.equal(res.status, 200, `${key}?${query} as ${who}: ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const day = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const column = (data, key) => data.rows.map((row) => row[key]);
// supertest buffers a binary body only when told how.
const download = (key, query, token = ctx.adminToken) =>
  request(app)
    .get(`${API}/${key}/export?${query}`)
    .set(as(token))
    .buffer(true)
    .parse((res, done) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await User.init();
  await seedRbac();
  for (const seed of ['seedLeadConfig', 'seedActivityTypes', 'seedPipelines', 'seedQuotationStatuses', 'seedOrderStatuses', 'seedTicketSettings', 'seedContractSettings', 'seedPaymentSettings']) await s[seed]();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.north = (await post('organizations', { name: 'North Region' })).item;
  ctx.norah = await createUser(await createRole(['reports.read', 'reports.export', ...MODULES], 'Regional Manager'), { firstName: 'Norah', lastName: 'North', organizationId: ctx.north.id });
  // Runs lead reports only, and cannot export.
  ctx.leadDesk = await createUser(await createRole(['reports.read', 'leads.read'], 'Lead Desk'));
  ctx.noReports = await createUser(await createRole(MODULES, 'No Reports'));
  ctx.plain = await createUser(await defaultRole());
  for (const who of ['norah', 'leadDesk', 'noReports', 'plain']) ctx[`${who}Token`] = await loginAs(app, ctx[who]);

  ctx.acme = (await post('companies', { name: 'Acme Industries', city: 'Pune', organizationId: ctx.north.id })).company;
  ctx.bolt = (await post('companies', { name: 'Bolt Traders', city: 'Delhi' })).company;
  const list = async (path) => (await request(app).get(`/api/v1/${path}`).set(as(ctx.adminToken))).body.data.items;
  [ctx.website, ctx.referral] = await list('lead-sources');
  ctx.leadStatuses = await list('lead-statuses');

  // Leads: three for Acme / North, one for Bolt.
  const lead = async (body) => (await post('leads', body)).lead;
  await lead({ title: 'Alpha desks', companyId: ctx.acme.id, sourceId: ctx.website.id, estimatedValue: 1000, assignedTo: ctx.norah.id });
  await lead({ title: 'Beta chairs', companyId: ctx.acme.id, sourceId: ctx.referral.id, estimatedValue: 250.5 });
  await lead({ title: '=HYPERLINK("http://evil.example")', companyId: ctx.acme.id, sourceId: ctx.website.id, estimatedValue: 40 });
  await lead({ title: 'Gamma, "quoted" tables', companyId: ctx.bolt.id, sourceId: ctx.website.id, estimatedValue: 9000 });

  await post('opportunities', { name: 'Fit-out', companyId: ctx.acme.id, estimatedValue: 2000, probability: 25, assignedTo: ctx.norah.id });

  const category = (await post('product-categories', { name: 'Furniture' })).item;
  const tax = (await post('taxes', { name: 'GST 18', rate: 18 })).item;
  const desk = (await post('products', { name: 'Desk', basePrice: 1000, taxId: tax.id, categoryId: category.id })).product;
  const chair = (await post('products', { name: 'Chair', basePrice: 200, taxId: tax.id })).product;
  ctx.category = category;
  const quotation = (await post('quotations', { companyId: ctx.acme.id, items: [{ productId: desk.id, quantity: 1 }] })).quotation;
  ctx.quotation = quotation;
  // Orders: Acme 2 desks today (Norah) and 1 chair 40 days ago; Bolt 3 chairs today; one cancelled.
  const order = async (body) => (await post('orders', body)).order;
  await order({ companyId: ctx.acme.id, assignedTo: ctx.norah.id, items: [{ productId: desk.id, quantity: 2 }] });
  await order({ companyId: ctx.acme.id, orderDate: day(-40), items: [{ productId: chair.id, quantity: 1 }] });
  await order({ companyId: ctx.bolt.id, items: [{ productId: chair.id, quantity: 3 }] });
  const cancelledOrder = await order({ companyId: ctx.bolt.id, items: [{ productId: desk.id, quantity: 10 }] });
  const cancelled = (await list('order-statuses')).find((x) => x.category === 'cancelled');
  await call('patch', `orders/${cancelledOrder.id}/status`, ctx.adminToken, { statusId: cancelled.id });

  await post('payments', { companyId: ctx.acme.id, amount: 900, paidAmount: 100, dueDate: day(-3) });
  await post('payments', { companyId: ctx.bolt.id, amount: 500, paidAmount: 500, dueDate: day(-9) });
  await post('tickets', { companyId: ctx.acme.id, subject: 'Printer offline' });
  await post('contracts', { companyId: ctx.acme.id, startDate: day(-100), endDate: day(200), amount: 12000 });
  const [type] = await list('activity-types');
  await post('activities', { typeId: type.id, subject: 'Intro call', companyId: ctx.acme.id, status: 'completed' });
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await s.verifyDeclaredPermissions(), []);
});

test('reports need a token, reports.read, and the permission to read the module', async () => {
  for (const url of [API, `${API}/leads`, `${API}/leads/export`]) {
    assert.equal((await request(app).get(url)).status, 401, url);
    assert.equal((await request(app).get(url).set(as(ctx.plainToken))).status, 403, url);
    assert.equal((await request(app).get(url).set(as(ctx.noReportsToken))).status, 403, `${url}: module permissions alone do not open reports`);
  }
  assert.equal((await request(app).get(`${API}/leads`).set(as(ctx.leadDeskToken))).status, 200);
  assert.equal((await request(app).get(`${API}/orders`).set(as(ctx.leadDeskToken))).status, 403, 'no orders.read');
  assert.equal((await request(app).get(`${API}/leads/export`).set(as(ctx.leadDeskToken))).status, 403, 'no reports.export');
  assert.equal((await request(app).get(`${API}/invoices`).set(as(ctx.adminToken))).status, 422, 'not a report');
});

test('catalogue: the eleven reports, each described by data - and only the ones the user may run', async () => {
  const { reports, exportFormats, exportMaxRows } = (await request(app).get(API).set(as(ctx.adminToken))).body.data;
  assert.deepEqual(reports.map((r) => r.key), ['leads', 'sales', 'opportunities', 'customers', 'products', 'quotations', 'orders', 'payments', 'tickets', 'contracts', 'activities']);
  assert.deepEqual(reports.map((r) => r.key), REPORT_KEYS);
  assert.deepEqual(exportFormats, ['csv', 'xlsx', 'pdf']);
  assert.equal(exportMaxRows, 100);
  for (const report of reports) {
    assert.ok(report.title && report.columns.length && report.dateFields.length && report.sort.by, report.key);
    assert.ok(report.columns.every((c) => ['text', 'number', 'money', 'date', 'datetime'].includes(c.type)), report.key);
  }
  // Filter options are the configured lists, straight from the database.
  const leads = reports.find((r) => r.key === 'leads');
  const status = leads.filters.find((f) => f.key === 'statusId');
  assert.deepEqual(status.options.map((o) => o.label), ctx.leadStatuses.map((x) => x.name));
  assert.deepEqual(leads.filters.map((f) => [f.key, f.type]), [['statusId', 'option'], ['sourceId', 'option'], ['priorityId', 'option'], ['assignedTo', 'user'], ['companyId', 'company']]);
  assert.deepEqual(reports.find((r) => r.key === 'sales').filters[0], { key: 'groupBy', label: 'Group by', type: 'option', required: true, default: 'month', options: [{ value: 'month', label: 'Month' }, { value: 'salesperson', label: 'Salesperson' }, { value: 'company', label: 'Company' }] });

  const mine = (await request(app).get(API).set(as(ctx.leadDeskToken))).body.data.reports;
  assert.deepEqual(mine.map((r) => r.key), ['leads']);
});

test('every report runs and returns exactly its columns', async () => {
  for (const key of REPORT_KEYS) {
    const data = await run(key);
    assert.equal(data.report.key, key);
    assert.ok(data.rows.length > 0, `${key} has rows`);
    assert.deepEqual(Object.keys(data.rows[0]), ['id', ...data.report.columns.map((c) => c.key)], key);
    assert.equal(data.pagination.total >= data.rows.length, true, key);
    assert.ok(data.generatedAt && data.scope.type === 'all' && data.applied.sortBy, key);
  }
});

test('leads: date range, search, filters, sorting and pagination - all done by the database', async () => {
  let data = await run('leads', 'sortBy=estimatedValue&sortOrder=desc');
  assert.deepEqual(column(data, 'estimatedValue'), [9000, 1000, 250.5, 40]);
  assert.deepEqual(data.totals, { estimatedValue: 10290.5 });
  assert.deepEqual([data.rows[1].company, data.rows[1].source, data.rows[1].assignedTo, data.rows[1].status], ['Acme Industries', ctx.website.name, 'Norah North', ctx.leadStatuses.find((x) => x.isDefault).name]);

  // Sorting on a joined column, case-insensitively; ascending when only the column is given.
  data = await run('leads', 'sortBy=title');
  assert.deepEqual(column(data, 'title'), ['=HYPERLINK("http://evil.example")', 'Alpha desks', 'Beta chairs', 'Gamma, "quoted" tables']);
  assert.deepEqual([data.applied.sortBy, data.applied.sortOrder], ['title', 'asc']);

  // Pagination: the totals cover every matching row, not just the page.
  data = await run('leads', 'sortBy=estimatedValue&sortOrder=desc&page=2&limit=3');
  assert.deepEqual(column(data, 'estimatedValue'), [40]);
  assert.deepEqual(data.pagination, { page: 2, limit: 3, total: 4, totalPages: 2 });
  assert.equal(data.totals.estimatedValue, 10290.5);

  // Search: every word, in any text column - including joined ones.
  assert.deepEqual(column(await run('leads', 'search=chairs'), 'title'), ['Beta chairs']);
  assert.deepEqual(column(await run('leads', 'search=bolt'), 'title'), ['Gamma, "quoted" tables']);
  assert.deepEqual(column(await run('leads', `search=acme ${encodeURIComponent(ctx.referral.name)}`), 'title'), ['Beta chairs']);
  assert.equal((await run('leads', 'search=nothing-like-this')).pagination.total, 0);

  // Filters.
  data = await run('leads', `sourceId=${ctx.website.id}&sortBy=estimatedValue`);
  assert.deepEqual(column(data, 'estimatedValue'), [40, 1000, 9000]);
  assert.deepEqual(data.applied.filters, { sourceId: ctx.website.id });
  assert.equal((await run('leads', `companyId=${ctx.bolt.id}`)).pagination.total, 1);
  assert.equal((await run('leads', `assignedTo=${ctx.norah.id}`)).pagination.total, 1);
  assert.equal((await run('leads', `sourceId=${ctx.website.id}&companyId=${ctx.acme.id}`)).pagination.total, 2);

  // Date range: both days included; other date fields can be chosen.
  assert.equal((await run('leads', `from=${day(0)}&to=${day(0)}`)).pagination.total, 4);
  assert.equal((await run('leads', `from=${day(-30)}&to=${day(-1)}`)).pagination.total, 0);
  assert.equal((await run('leads', `from=${day(1)}`)).pagination.total, 0);
  data = await run('leads', `dateField=expectedCloseDate&from=${day(0)}`);
  assert.deepEqual([data.applied.dateField, data.pagination.total], ['expectedCloseDate', 0]);
});

test('bad requests are refused with the field named', async () => {
  const cases = [
    ['leads', 'sortBy=password', 'sortBy'],
    ['leads', 'dateField=updatedAt', 'dateField'],
    ['leads', 'statusId=not-an-id', 'statusId'],
    ['sales', 'groupBy=weekday', 'groupBy'],
    ['payments', 'state=late', 'state'],
    ['leads', `from=${day(0)}&to=${day(-5)}`, undefined],
    ['leads', 'limit=1000', 'limit'],
    ['leads', 'from=yesterday', 'from'],
  ];
  for (const [key, query, field] of cases) {
    const res = await request(app).get(`${API}/${key}?${query}`).set(as(ctx.adminToken));
    assert.equal(res.status, 422, `${key}?${query}: ${JSON.stringify(res.body)}`);
    if (field) assert.equal(res.body.errors[0].field, field);
  }
  // A filter another report has is simply not applied here.
  assert.equal((await run('leads', 'groupBy=company')).pagination.total, 4);
});

test('sales: grouped by month, salesperson or company; cancelled orders left out', async () => {
  let data = await run('sales', 'groupBy=company&sortBy=grandTotal&sortOrder=desc');
  assert.deepEqual(data.rows.map((r) => [r.group, r.orderCount, r.subtotal, r.tax, r.grandTotal, r.averageOrderValue]), [
    ['Acme Industries', 2, 2200, 396, 2596, 1298],
    ['Bolt Traders', 1, 600, 108, 708, 708],
  ]);
  assert.deepEqual(data.totals, { orderCount: 3, subtotal: 2800, tax: 504, grandTotal: 3304 });

  data = await run('sales', 'groupBy=salesperson&sortBy=grandTotal&sortOrder=desc');
  assert.deepEqual(data.rows.map((r) => [r.group, r.grandTotal]), [['Norah North', 2360], ['Unassigned', 944]]);

  data = await run('sales');
  assert.equal(data.applied.filters.groupBy, 'month');
  assert.deepEqual(column(data, 'group'), [...new Set([day(-40).slice(0, 7), day(0).slice(0, 7)])].sort());
  assert.equal(data.totals.grandTotal, 3304);
  // The range applies before grouping.
  assert.deepEqual((await run('sales', `groupBy=company&from=${day(-5)}`)).totals, { orderCount: 2, subtotal: 2600, tax: 468, grandTotal: 3068 });
});

test('products and customers: figures added up from orders', async () => {
  let data = await run('products');
  assert.deepEqual(data.rows.map((r) => [r.name, r.category, r.quantity, r.orderCount, r.revenue, r.tax, r.averagePrice]), [
    ['Desk', 'Furniture', 2, 1, 2000, 360, 1000],
    ['Chair', null, 4, 2, 800, 144, 200],
  ]);
  assert.deepEqual(data.totals, { quantity: 6, revenue: 2800, tax: 504 });
  assert.deepEqual(column(await run('products', `categoryId=${ctx.category.id}`), 'name'), ['Desk']);
  assert.deepEqual(column(await run('products', 'search=chair'), 'name'), ['Chair']);
  assert.deepEqual((await run('products', `companyId=${ctx.bolt.id}`)).rows.map((r) => [r.name, r.quantity]), [['Chair', 3]]);

  data = await run('customers');
  assert.deepEqual(data.rows.map((r) => [r.company, r.city, r.orderCount, r.orderValue]), [['Acme Industries', 'Pune', 2, 2596], ['Bolt Traders', 'Delhi', 1, 708]]);
  assert.deepEqual(data.totals, { orderCount: 3, orderValue: 3304 });
  assert.ok(data.rows[0].lastOrderDate.startsWith(day(0)));
});

test('the other reports: figures and their own filters', async () => {
  let data = await run('orders', 'sortBy=grandTotal&sortOrder=desc');
  assert.equal(data.pagination.total, 4, 'the orders report lists cancelled orders too');
  assert.equal(data.rows[0].grandTotal, 11800);
  data = await run('payments', 'state=overdue');
  assert.deepEqual(data.rows.map((r) => [r.company, r.amount, r.paidAmount, r.remainingAmount, r.overdue]), [['Acme Industries', 900, 100, 800, 'Yes']]);
  assert.deepEqual((await run('payments')).totals, { amount: 1400, paidAmount: 600, remainingAmount: 800 });
  assert.equal((await run('payments', 'state=paid')).rows[0].overdue, '', 'paid in full is never overdue');
  assert.equal((await run('payments', `dateField=dueDate&from=${day(-5)}&to=${day(0)}`)).pagination.total, 1);

  data = await run('opportunities');
  assert.deepEqual([data.rows[0].estimatedValue, data.rows[0].probability, data.rows[0].weightedValue, data.rows[0].status], [2000, 25, 500, 'open']);
  assert.equal((await run('opportunities', 'status=won')).pagination.total, 0);
  data = await run('quotations');
  assert.deepEqual([data.rows[0].quotationNumber, data.rows[0].lines, data.rows[0].grandTotal, data.rows[0].createdBy], [ctx.quotation.quotationNumber, 1, 1180, 'Ada Admin']);
  data = await run('contracts', `dateField=endDate&from=${day(100)}`);
  assert.deepEqual([data.pagination.total, data.totals.amount], [1, 12000]);
  assert.equal((await run('tickets', 'search=printer')).rows[0].subject, 'Printer offline');
  assert.equal((await run('activities', 'status=completed')).rows[0].subject, 'Intro call');
});

test('organization scope: a regional user reports on their organization only', async () => {
  const data = await run('leads', '', 'norah');
  assert.deepEqual(data.scope, { type: 'organization', organization: { id: ctx.north.id, name: 'North Region' }, organizations: [] });
  assert.equal(data.pagination.total, 3);
  assert.deepEqual(column(await run('sales', 'groupBy=company', 'norah'), 'group'), ['Acme Industries']);
  assert.deepEqual((await run('payments', '', 'norah')).totals, { amount: 900, paidAmount: 100, remainingAmount: 800 });
  assert.equal((await request(app).get(`${API}/leads?organizationId=${new mongoose.Types.ObjectId()}`).set(as(ctx.norahToken))).status, 403);
  // Someone who sees everything can narrow to one organization.
  assert.equal((await run('leads', `organizationId=${ctx.north.id}`)).pagination.total, 3);
});

test('CSV export: the same rows, safely quoted', async () => {
  const res = await download('leads', 'format=csv&sortBy=estimatedValue&sortOrder=desc');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  assert.match(res.headers['content-disposition'], /^attachment; filename="leads-report-\d{4}-\d{2}-\d{2}\.csv"$/);
  assert.deepEqual([res.headers['x-report-rows'], res.headers['x-report-total-rows'], res.headers['x-report-truncated']], ['4', '4', 'false']);
  const text = res.body.toString('utf8');
  assert.equal(text.charCodeAt(0), 0xfeff, 'starts with a byte-order mark for Excel');
  const lines = text.slice(1).trimEnd().split('\r\n');
  assert.equal(lines.length, 5);
  assert.equal(lines[0], 'Number,Title,Company,Source,Status,Priority,Estimated value,Assigned to,Expected close,Created');
  // Commas and quotes are quoted; a would-be formula is defused; numbers stay numbers.
  assert.match(lines[1], /^LEAD-\d+,"Gamma, ""quoted"" tables",Bolt Traders,/);
  assert.match(lines[1], /,9000\.00,/);
  assert.match(lines[4], /,"'=HYPERLINK\(""http:\/\/evil\.example""\)",/);
  assert.match(lines[2], /,\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);

  // Filters, search and range apply to the export exactly as to the report; csv is the default.
  const filtered = await download('leads', `search=chairs&from=${day(0)}`);
  assert.equal(filtered.body.toString('utf8').trimEnd().split('\r\n').length, 2);
  assert.equal((await download('leads', 'format=docx')).status, 422);
});

test('Excel and PDF export', async () => {
  let res = await download('sales', 'format=xlsx&groupBy=company');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /spreadsheetml/);
  assert.match(res.headers['content-disposition'], /sales-report-.*\.xlsx"$/);
  assert.equal(res.body.subarray(0, 2).toString('latin1'), 'PK', 'an xlsx file is a zip');
  assert.ok(res.body.length > 1000);

  res = await download('payments', 'format=pdf&state=overdue');
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /application\/pdf/);
  assert.equal(res.body.subarray(0, 5).toString('latin1'), '%PDF-');
  for (const key of REPORT_KEYS) {
    for (const format of ['xlsx', 'pdf']) assert.equal((await download(key, `format=${format}`)).status, 200, `${key}.${format}`);
  }
  // An export with nothing in it is still a valid file.
  assert.equal((await download('leads', 'format=pdf&search=nothing-like-this')).status, 200);
});

test('a report larger than the export limit is cut, and says so', async () => {
  const status = await mongoose.connection.collection('leadstatuses').findOne({ isDefault: true });
  await Lead.insertMany(Array.from({ length: 120 }, (unused, index) => ({ leadNumber: `BULK-${String(index).padStart(4, '0')}`, title: `Bulk lead ${index}`, statusId: status._id, estimatedValue: 1 })));
  const res = await download('leads', 'format=csv&sortBy=leadNumber');
  assert.deepEqual([res.headers['x-report-rows'], res.headers['x-report-total-rows'], res.headers['x-report-truncated']], ['100', '124', 'true']);
  assert.equal(res.body.toString('utf8').trimEnd().split('\r\n').length, 101);
  // The report itself still pages through all of them.
  const data = await run('leads', 'page=7&limit=20');
  assert.deepEqual([data.pagination.total, data.pagination.totalPages, data.rows.length, data.totals.estimatedValue], [124, 7, 4, 10410.5]);
});
