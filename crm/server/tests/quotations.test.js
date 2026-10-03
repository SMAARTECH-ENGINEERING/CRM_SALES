import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_quotations', { SMTP_URL: '', SMTP_HOST: '', MAIL_FROM: '' });

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Company } = await import('../src/models/Company.js');
const { default: Contact } = await import('../src/models/Contact.js');
const { default: Product } = await import('../src/models/Product.js');
const { default: Quotation } = await import('../src/models/Quotation.js');
const { default: User } = await import('../src/models/User.js');
const { setMailTransport } = await import('../src/services/mail.service.js');
const { calculateTotals, round2 } = await import('../src/services/quotationTotals.js');
const { seedLeadConfig, seedPipelines, seedQuotationStatuses, verifyDeclaredPermissions } =
  await import('../src/services/seed.service.js');
const { QUOTATION_STATUS_SEED } = await import('../src/seeds/quotation.seed.js');
const { allKeys, createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } =
  await import('./helpers/fixtures.js');

const API = '/api/v1/quotations';
const STATUSES = '/api/v1/quotation-statuses';
const PROFILE = '/api/v1/settings/company';

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const missing = () => new mongoose.Types.ObjectId().toString();
const post = async (path, body) => (await request(app).post(`/api/v1/${path}`).set(admin()).send(body)).body.data;
const line = (product, extra = {}) => ({ productId: product.id, quantity: 1, ...extra });
const create = (body, token = ctx.adminToken) =>
  request(app)
    .post(API)
    .set(as(token))
    .send({ companyId: ctx.acme.id, items: [line(ctx.chair)], ...body });
const get = async (id) => (await request(app).get(`${API}/${id}`).set(admin())).body.data.quotation;
const numbers = async (query) =>
  (await request(app).get(`${API}?limit=100&sortBy=quotationNumber&sortOrder=asc&${query}`).set(admin())).body.data.quotations.map(
    (q) => q.quotationNumber
  );
const statusOf = (category) => ctx.statuses.find((status) => status.category === category);
// supertest buffers a binary body only when told how to parse it.
const pdf = (id, token = ctx.adminToken) =>
  request(app)
    .post(`${API}/${id}/pdf`)
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
  await Promise.all([User.init(), Company.init(), Contact.init(), Product.init(), Quotation.init()]);
  await seedRbac();
  await seedLeadConfig();
  await seedPipelines();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.plain = await createUser(await defaultRole());
  ctx.reader = await createUser(await createRole(['quotations.read'], 'Quotation Reader'));
  // Prepares quotations, but may not send or delete them, or touch settings.
  ctx.rep = await createUser(
    await createRole(['quotations.read', 'quotations.create', 'quotations.update'], 'Sales Rep'),
    { firstName: 'Riya', lastName: 'Rep' }
  );
  ctx.manager = await createUser(await createRole(await allKeys('quotations'), 'Sales Manager'));

  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.readerToken = await loginAs(app, ctx.reader);
  ctx.repToken = await loginAs(app, ctx.rep);
  ctx.managerToken = await loginAs(app, ctx.manager);

  ctx.acme = (
    await post('companies', { name: 'Acme Industries', email: 'accounts@acme.example', address: '12 Mill Road', city: 'Pune' })
  ).company;
  ctx.bolt = (await post('companies', { name: 'Bolt Traders' })).company;
  ctx.priya = (
    await post('contacts', { firstName: 'Priya', lastName: 'Nair', companyId: ctx.acme.id, email: 'priya@acme.example' })
  ).contact;
  ctx.omar = (await post('contacts', { firstName: 'Omar', lastName: 'Khan', companyId: ctx.bolt.id })).contact;
  ctx.acmeDeal = (await post('opportunities', { name: 'Office fit-out', companyId: ctx.acme.id })).opportunity;
  ctx.boltDeal = (await post('opportunities', { name: 'Bolt deal', companyId: ctx.bolt.id })).opportunity;

  const gst = (await post('taxes', { name: 'GST 18', rate: 18 })).item;
  const reduced = (await post('taxes', { name: 'GST 5', rate: 5 })).item;
  const piece = (await post('units', { name: 'Piece', symbol: 'pc' })).item;
  ctx.chair = (await post('products', { name: 'Ergonomic Chair', basePrice: 1000, taxId: gst.id, unitId: piece.id })).product;
  ctx.lamp = (await post('products', { name: 'Desk Lamp', basePrice: 250.5, taxId: reduced.id })).product;
  ctx.manual = (await post('products', { name: 'Setup Manual', basePrice: 99.99 })).product;
  ctx.retired = (await post('products', { name: 'Retired Desk', basePrice: 500, status: 'inactive' })).product;
});

after(async () => {
  setMailTransport(null);
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await verifyDeclaredPermissions(), []);
});

// --- the calculation itself ------------------------------------------------------------

test('calculateTotals: line and quotation discounts, tax per line, everything rounded to 2 decimals', () => {
  const totals = calculateTotals(
    [
      { quantity: 2, unitPrice: 1000, discountPercent: 10, taxRate: 18 },
      { quantity: 3, unitPrice: 250.5, discountPercent: 0, taxRate: 5 },
    ],
    10
  );
  assert.deepEqual(
    totals.items.map((item) => [item.discount, item.total, item.tax]),
    [
      [200, 1800, 291.6],
      [0, 751.5, 33.82],
    ]
  );
  assert.deepEqual(
    [totals.subtotal, totals.discount, totals.tax, totals.grandTotal],
    [2551.5, 255.15, 325.42, 2621.77]
  );

  // Half-up even where binary floating point would say otherwise.
  assert.equal(round2(127.575), 127.58);
  assert.equal(round2(1.005), 1.01);
  assert.equal(calculateTotals([{ quantity: 1, unitPrice: 2551.5, taxRate: 0 }], 5).discount, 127.58);
  assert.equal(calculateTotals([{ quantity: 0.333, unitPrice: 10, taxRate: 0 }]).subtotal, 3.33);
  assert.deepEqual(calculateTotals([], 0).grandTotal, 0);
});

// --- configuration: statuses and the company profile -----------------------------------------

test('quotation statuses are data: nothing until seeded, then managed through the API', async () => {
  assert.deepEqual((await request(app).get(STATUSES).set(admin())).body.data.items, []);
  const noDefault = await create({});
  assert.equal(noDefault.status, 409, 'a quotation needs a default status to start in');

  assert.equal(await seedQuotationStatuses(), true);
  assert.equal(await seedQuotationStatuses(), false);
  ctx.statuses = (await request(app).get(STATUSES).set(admin())).body.data.items;
  assert.deepEqual(ctx.statuses.map((s) => [s.name, s.category]), QUOTATION_STATUS_SEED.map((s) => [s.name, s.category]));
  assert.equal(ctx.statuses.filter((s) => s.isDefault).length, 1);

  const added = await request(app).post(STATUSES).set(admin()).send({ name: 'Under review', category: 'sent', color: '#123456' });
  assert.equal(added.status, 201);
  assert.equal((await request(app).post(STATUSES).set(admin()).send({ name: 'Odd', category: 'won' })).status, 422);
  assert.equal((await request(app).delete(`${STATUSES}/${added.body.data.item.id}`).set(admin())).status, 200);

  assert.equal((await request(app).get(STATUSES).set(as(ctx.repToken))).status, 200, 'the builder may read them');
  assert.equal((await request(app).post(STATUSES).set(as(ctx.repToken)).send({ name: 'Nope' })).status, 403);
  assert.equal((await request(app).get(STATUSES).set(as(ctx.plainToken))).status, 403);
});

test('company profile: empty until saved, partial updates, validation and access', async () => {
  const empty = await request(app).get(PROFILE).set(as(ctx.repToken));
  assert.equal(empty.status, 200);
  assert.equal('name' in empty.body.data.profile, false, 'no company details are built in');
  assert.equal(empty.body.data.profile.quotationValidityDays, 30);

  assert.equal((await request(app).get(PROFILE).set(as(ctx.plainToken))).status, 403);
  assert.equal((await request(app).put(PROFILE).set(as(ctx.managerToken)).send({ name: 'Nope Ltd' })).status, 403);
  assert.equal((await request(app).get(PROFILE)).status, 401);

  const cases = {
    'nothing sent': {},
    'short name': { name: 'X' },
    'bad email': { email: 'not-an-email' },
    'bad website': { website: 'ftp://example.com' },
    'bad currency': { currency: 'rupees' },
    'validity out of range': { quotationValidityDays: 0 },
  };
  for (const [label, body] of Object.entries(cases)) {
    assert.equal((await request(app).put(PROFILE).set(admin()).send(body)).status, 422, label);
  }
});

// --- access --------------------------------------------------------------------

test('every quotation endpoint needs a token (401) and a permission (403)', async () => {
  const id = missing();
  const calls = (headers) => [
    request(app).get(API).set(headers),
    request(app).post(API).set(headers).send({ companyId: ctx.acme.id, items: [line(ctx.chair)] }),
    request(app).post(`${API}/calculate`).set(headers).send({ items: [line(ctx.chair)] }),
    request(app).get(`${API}/${id}`).set(headers),
    request(app).put(`${API}/${id}`).set(headers).send({ notes: 'Nope' }),
    request(app).delete(`${API}/${id}`).set(headers),
    request(app).patch(`${API}/${id}/status`).set(headers).send({ statusId: missing() }),
    request(app).post(`${API}/${id}/send`).set(headers).send({}),
    request(app).post(`${API}/${id}/pdf`).set(headers),
    request(app).get(`${API}/${id}/timeline`).set(headers),
  ];

  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) assert.equal(res.status, 403);
  assert.equal(await Quotation.countDocuments(), 0);
});

// --- create ----------------------------------------------------------------------

test('create: the server prices every line from the product and calculates all totals', async () => {
  const res = await create(
    {
      contactId: ctx.priya.id,
      opportunityId: ctx.acmeDeal.id,
      quotationDate: '2030-01-10',
      validUntil: '2030-02-09',
      items: [
        line(ctx.chair, { quantity: 2, discountPercent: 10, description: ' Black, with arms ' }),
        line(ctx.lamp, { quantity: 3 }),
      ],
      discountPercent: 10,
      notes: 'Delivery in two weeks',
      termsAndConditions: '50% advance',
    },
    ctx.repToken
  );

  assert.equal(res.status, 201);
  const { quotation } = res.body.data;
  assert.equal(quotation.quotationNumber, 'QUO-000001');
  assert.deepEqual(
    quotation.items.map((i) => [i.name, i.sku, i.unit, i.quantity, i.unitPrice, i.discountPercent, i.discount, i.taxName, i.taxRate, i.tax, i.total]),
    [
      ['Ergonomic Chair', ctx.chair.sku, 'pc', 2, 1000, 10, 200, 'GST 18', 18, 291.6, 1800],
      ['Desk Lamp', ctx.lamp.sku, undefined, 3, 250.5, 0, 0, 'GST 5', 5, 33.82, 751.5],
    ]
  );
  assert.equal(quotation.items[0].description, 'Black, with arms');
  assert.deepEqual(
    [quotation.subtotal, quotation.discountPercent, quotation.discount, quotation.tax, quotation.grandTotal],
    [2551.5, 10, 255.15, 325.42, 2621.77]
  );
  assert.equal(quotation.company.name, 'Acme Industries');
  assert.equal(quotation.contact.fullName, 'Priya Nair');
  assert.equal(quotation.opportunity.opportunityNumber, ctx.acmeDeal.opportunityNumber);
  assert.equal(quotation.status.category, 'draft', 'the configured default status');
  assert.equal(quotation.quotationDate.slice(0, 10), '2030-01-10');
  assert.equal(quotation.validUntil.slice(0, 10), '2030-02-09');
  assert.equal(quotation.createdBy, ctx.rep.id);
  for (const field of ['_id', '__v', 'deletedAt', 'sentAt']) assert.equal(field in quotation, false, field);
  ctx.full = quotation;
});

test('create: totals and product facts sent by the client are never used', async () => {
  const res = await create({
    items: [
      {
        ...line(ctx.chair, { quantity: 2 }),
        // None of these may influence the result.
        name: 'Free chair',
        taxRate: 0,
        tax: 0,
        discount: 1999,
        total: 1,
      },
    ],
    subtotal: 1,
    discount: 0,
    tax: 0,
    grandTotal: 1,
  });

  assert.equal(res.status, 201);
  const { quotation } = res.body.data;
  assert.equal(quotation.items[0].name, 'Ergonomic Chair');
  assert.deepEqual([quotation.items[0].taxRate, quotation.items[0].tax, quotation.items[0].discount, quotation.items[0].total], [18, 360, 0, 2000]);
  assert.deepEqual([quotation.subtotal, quotation.discount, quotation.tax, quotation.grandTotal], [2000, 0, 360, 2360]);
  ctx.simple = quotation;
});

test('create: unit price defaults to the product price and may be overridden; dates and terms default from the profile', async () => {
  await request(app).put(PROFILE).set(admin()).send({ quotationValidityDays: 15, quotationTerms: 'Prices valid as stated.' });

  const res = await create({
    items: [line(ctx.manual), line(ctx.manual, { unitPrice: 80 }), line(ctx.chair, { unitPrice: 0 })],
  });
  const { quotation } = res.body.data;
  assert.deepEqual(quotation.items.map((i) => i.unitPrice), [99.99, 80, 0], 'a price of 0 is a real price');
  assert.deepEqual(quotation.items.map((i) => i.taxRate), [0, 0, 18], 'a product without a tax is not taxed');
  assert.equal(quotation.grandTotal, 179.99);

  const today = new Date().toISOString().slice(0, 10);
  assert.equal(quotation.quotationDate.slice(0, 10), today);
  const days = (new Date(quotation.validUntil) - new Date(quotation.quotationDate)) / 86400000;
  assert.equal(days, 15);
  assert.equal(quotation.termsAndConditions, 'Prices valid as stated.');

  // Explicitly empty terms stay empty.
  const noTerms = (await create({ termsAndConditions: '' })).body.data.quotation;
  assert.equal('termsAndConditions' in noTerms, false);
  ctx.defaults = quotation;
});

test('create: validation, and references that must exist and belong together', async () => {
  const before = await Quotation.countDocuments();
  const cases = {
    'missing company': [{ companyId: undefined }, 422, 'companyId'],
    'no items': [{ items: [] }, 422, 'items'],
    'items missing': [{ items: undefined }, 422, 'items'],
    'item without product': [{ items: [{ quantity: 1 }] }, 422, 'items.0.productId'],
    'zero quantity': [{ items: [line(ctx.chair, { quantity: 0 })] }, 422, 'items.0.quantity'],
    'negative price': [{ items: [line(ctx.chair, { unitPrice: -1 })] }, 422, 'items.0.unitPrice'],
    'line discount over 100': [{ items: [line(ctx.chair, { discountPercent: 101 })] }, 422, 'items.0.discountPercent'],
    'quotation discount over 100': [{ discountPercent: 150 }, 422, 'discountPercent'],
    'bad date': [{ quotationDate: 'tomorrow' }, 422, 'quotationDate'],
    'valid until before the date': [{ quotationDate: '2030-01-10', validUntil: '2030-01-09' }, 422, 'validUntil'],
    'number sent by the client': [{ quotationNumber: 'QUO-9' }, 422, 'quotationNumber'],
    'unknown company': [{ companyId: missing() }, 400, 'companyId'],
    'unknown contact': [{ contactId: missing() }, 400, 'contactId'],
    'contact of another company': [{ contactId: ctx.omar.id }, 400, 'contactId'],
    'unknown opportunity': [{ opportunityId: missing() }, 400, 'opportunityId'],
    'opportunity of another company': [{ opportunityId: ctx.boltDeal.id }, 400, 'opportunityId'],
    'unknown product': [{ items: [line(ctx.chair), { productId: missing(), quantity: 1 }] }, 400, 'items.1.productId'],
    'inactive product': [{ items: [line(ctx.retired)] }, 400, 'items.0.productId'],
    'unknown status': [{ statusId: missing() }, 400, 'statusId'],
  };
  for (const [label, [body, status, field]] of Object.entries(cases)) {
    const res = await create(body);
    assert.equal(res.status, status, label);
    assert.ok(res.body.errors.some((e) => e.field === field), `${label}: names ${field}`);
  }
  assert.equal(await Quotation.countDocuments(), before, 'nothing was created');

  // Rejected requests did not use up numbers.
  const next = (await create({ companyId: ctx.bolt.id, quotationDate: '2030-03-01' })).body.data.quotation;
  assert.equal(next.quotationNumber, `QUO-${String(before + 1).padStart(6, '0')}`);
  ctx.boltQuote = next;
});

// --- calculate (preview) ---------------------------------------------------------------

test('calculate: returns priced lines and totals without saving anything', async () => {
  const before = await Quotation.countDocuments();
  const res = await request(app)
    .post(`${API}/calculate`)
    .set(as(ctx.repToken))
    .send({ items: [line(ctx.chair, { quantity: 2, discountPercent: 10 }), line(ctx.lamp, { quantity: 3 })], discountPercent: 10 });

  assert.equal(res.status, 200);
  const { data } = res.body;
  assert.deepEqual([data.subtotal, data.discount, data.tax, data.grandTotal], [2551.5, 255.15, 325.42, 2621.77]);
  assert.deepEqual(data.items.map((i) => [i.name, i.unitPrice, i.taxRate, i.total]), [
    ['Ergonomic Chair', 1000, 18, 1800],
    ['Desk Lamp', 250.5, 5, 751.5],
  ]);
  assert.equal(await Quotation.countDocuments(), before);

  assert.equal((await request(app).post(`${API}/calculate`).set(admin()).send({ items: [] })).status, 422);
  assert.equal((await request(app).post(`${API}/calculate`).set(admin()).send({ items: [line(ctx.retired)] })).status, 400);
  assert.equal((await request(app).post(`${API}/calculate`).set(as(ctx.readerToken)).send({ items: [line(ctx.chair)] })).status, 403);
});

// --- read ----------------------------------------------------------------------

test('get and list: filters, search, sorting and pagination', async () => {
  assert.equal((await request(app).get(`${API}/${ctx.full.id}`).set(as(ctx.readerToken))).status, 200);
  assert.equal((await request(app).get(`${API}/${missing()}`).set(admin())).status, 404);
  assert.equal((await request(app).get(`${API}/nope`).set(admin())).status, 422);

  assert.deepEqual(await numbers(`companyId=${ctx.bolt.id}`), [ctx.boltQuote.quotationNumber]);
  assert.deepEqual(await numbers(`contactId=${ctx.priya.id}`), ['QUO-000001']);
  assert.deepEqual(await numbers(`opportunityId=${ctx.acmeDeal.id}`), ['QUO-000001']);
  assert.deepEqual(await numbers(`createdBy=${ctx.rep.id}`), ['QUO-000001']);
  assert.deepEqual(await numbers('search=QUO-000002'), ['QUO-000002']);
  assert.deepEqual(await numbers('search=lamp'), ['QUO-000001'], 'item names are searched');
  assert.deepEqual(await numbers('search=delivery'), ['QUO-000001'], 'notes are searched');
  assert.deepEqual(await numbers('dateFrom=2030-01-10&dateTo=2030-01-10'), ['QUO-000001']);
  assert.deepEqual(await numbers('dateFrom=2030-01-11&dateTo=2030-03-01'), [ctx.boltQuote.quotationNumber]);
  assert.equal((await numbers('statusCategory=draft')).length, await Quotation.countDocuments());
  assert.deepEqual(await numbers('statusCategory=accepted'), []);
  assert.deepEqual(await numbers(`statusId=${statusOf('sent').id}`), []);

  const page = await request(app).get(`${API}?limit=2&page=1&sortBy=grandTotal&sortOrder=desc`).set(admin());
  assert.equal(page.body.data.quotations[0].quotationNumber, 'QUO-000001');
  const total = await Quotation.countDocuments();
  assert.deepEqual(page.body.data.pagination, { page: 1, limit: 2, total, totalPages: Math.ceil(total / 2) });

  for (const query of ['limit=500', 'sortBy=password', 'statusCategory=maybe', 'dateFrom=yesterday']) {
    assert.equal((await request(app).get(`${API}?${query}`).set(admin())).status, 422, query);
  }
});

// --- update ----------------------------------------------------------------------

test('update: new lines replace the old ones and every total is recalculated', async () => {
  const url = `${API}/${ctx.simple.id}`;
  const res = await request(app)
    .put(url)
    .set(as(ctx.repToken))
    .send({ items: [line(ctx.chair, { quantity: 1 }), line(ctx.manual, { quantity: 4 })], grandTotal: 5 });
  assert.equal(res.status, 200);
  const { quotation } = res.body.data;
  assert.deepEqual(quotation.items.map((i) => [i.name, i.quantity, i.total]), [
    ['Ergonomic Chair', 1, 1000],
    ['Setup Manual', 4, 399.96],
  ]);
  assert.deepEqual([quotation.subtotal, quotation.tax, quotation.grandTotal], [1399.96, 180, 1579.96]);

  const timeline = (await request(app).get(`${url}/timeline`).set(admin())).body.data.events;
  assert.deepEqual(timeline.map((e) => e.action), ['updated', 'created']);
  assert.deepEqual(timeline[0].changes.map((c) => c.label), ['Items', 'Grand total']);
  assert.equal(timeline[0].changes[1].to, '1579.96');
});

test('update: changing only the discount recalculates from the stored lines, at the prices they were quoted', async () => {
  const url = `${API}/${ctx.simple.id}`;
  // The product gets dearer and its tax changes after the quotation was written.
  await request(app).put(`/api/v1/products/${ctx.chair.id}`).set(admin()).send({ basePrice: 5000, taxId: '' });

  const res = await request(app).put(url).set(admin()).send({ discountPercent: 50, notes: 'Half price' });
  const { quotation } = res.body.data;
  assert.deepEqual(quotation.items.map((i) => [i.unitPrice, i.taxRate, i.tax]), [
    [1000, 18, 90],
    [99.99, 0, 0],
  ]);
  assert.deepEqual([quotation.subtotal, quotation.discount, quotation.tax, quotation.grandTotal], [1399.96, 699.98, 90, 789.98]);
  assert.equal(quotation.notes, 'Half price');

  // An edit that touches neither lines nor discount leaves the money alone.
  const notesOnly = (await request(app).put(url).set(admin()).send({ notes: '' })).body.data.quotation;
  assert.equal(notesOnly.grandTotal, 789.98);
  assert.equal('notes' in notesOnly, false);

  // Resending the lines reads the product again: its new tax, and its new price where none is given.
  const repriced = (
    await request(app).put(url).set(admin()).send({ items: [line(ctx.chair), line(ctx.chair, { unitPrice: 1000 })], discountPercent: 0 })
  ).body.data.quotation;
  assert.deepEqual(repriced.items.map((i) => [i.unitPrice, i.taxRate]), [
    [5000, 0],
    [1000, 0],
  ]);
  assert.equal(repriced.grandTotal, 6000);
});

test('update: a product already on the quotation stays allowed after it is deactivated', async () => {
  const quotation = (await create({ items: [line(ctx.lamp)] })).body.data.quotation;
  await request(app).put(`/api/v1/products/${ctx.lamp.id}`).set(admin()).send({ status: 'inactive' });

  const url = `${API}/${quotation.id}`;
  const kept = await request(app).put(url).set(admin()).send({ items: [line(ctx.lamp, { quantity: 2 })] });
  assert.equal(kept.status, 200);
  assert.equal(kept.body.data.quotation.subtotal, 501);
  const preview = await request(app)
    .post(`${API}/calculate`)
    .set(admin())
    .send({ items: [line(ctx.lamp)], quotationId: quotation.id });
  assert.equal(preview.status, 200);

  // But it cannot be put on a quotation that does not have it.
  assert.equal((await request(app).put(`${API}/${ctx.boltQuote.id}`).set(admin()).send({ items: [line(ctx.lamp)] })).status, 400);
  await request(app).put(`/api/v1/products/${ctx.lamp.id}`).set(admin()).send({ status: 'active' });
});

test('update: relations stay consistent; status and server-owned fields are refused', async () => {
  const url = `${API}/${ctx.full.id}`;
  const cases = {
    'contact of another company': [{ contactId: ctx.omar.id }, 400],
    'opportunity of another company': [{ opportunityId: ctx.boltDeal.id }, 400],
    'company the contact does not belong to': [{ companyId: ctx.bolt.id }, 400],
    'valid until before the stored date': [{ validUntil: '2029-12-31' }, 422],
    'status on PUT': [{ statusId: statusOf('sent').id }, 422],
    'number on PUT': [{ quotationNumber: 'QUO-1' }, 422],
    'empty items': [{ items: [] }, 422],
    'only calculated fields (nothing left)': [{ grandTotal: 1 }, 422],
  };
  for (const [label, [body, status]] of Object.entries(cases)) {
    assert.equal((await request(app).put(url).set(admin()).send(body)).status, status, label);
  }

  const moved = await request(app).put(url).set(admin()).send({ companyId: ctx.bolt.id, contactId: null, opportunityId: '' });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.data.quotation.company.name, 'Bolt Traders');
  for (const field of ['contactId', 'opportunityId']) assert.equal(field in moved.body.data.quotation, false, field);
  await request(app)
    .put(url)
    .set(admin())
    .send({ companyId: ctx.acme.id, contactId: ctx.priya.id, opportunityId: ctx.acmeDeal.id });

  assert.equal((await request(app).put(url).set(as(ctx.readerToken)).send({ notes: 'Nope' })).status, 403);
  assert.equal((await request(app).put(`${API}/${missing()}`).set(admin()).send({ notes: 'Ghost' })).status, 404);
  const unchanged = await get(ctx.full.id);
  assert.equal(unchanged.grandTotal, 2621.77);
});

// --- status ----------------------------------------------------------------------

test('status: changed through its own endpoint; accepted and rejected quotations are locked', async () => {
  const url = `${API}/${ctx.defaults.id}`;
  const accepted = await request(app).patch(`${url}/status`).set(as(ctx.repToken)).send({ statusId: statusOf('accepted').id });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.data.quotation.status.category, 'accepted');

  const locked = await request(app).put(url).set(admin()).send({ notes: 'Too late' });
  assert.equal(locked.status, 409);
  await request(app).patch(`${url}/status`).set(admin()).send({ statusId: statusOf('rejected').id });
  assert.equal((await request(app).put(url).set(admin()).send({ notes: 'Too late' })).status, 409);

  // Reopened, it can be edited again.
  await request(app).patch(`${url}/status`).set(admin()).send({ statusId: statusOf('draft').id });
  assert.equal((await request(app).put(url).set(admin()).send({ notes: 'Reopened' })).status, 200);

  assert.equal((await request(app).patch(`${url}/status`).set(admin()).send({ statusId: missing() })).status, 400);
  assert.equal((await request(app).patch(`${url}/status`).set(admin()).send({})).status, 422);
  assert.equal((await request(app).patch(`${url}/status`).set(as(ctx.readerToken)).send({ statusId: statusOf('sent').id })).status, 403);

  const events = (await request(app).get(`${url}/timeline?limit=4`).set(admin())).body.data.events;
  assert.deepEqual(events.map((e) => e.action), ['updated', 'status_changed', 'status_changed', 'status_changed']);
  assert.deepEqual([events[1].changes[0].from, events[1].changes[0].to], ['Rejected', 'Draft']);

  // A status that quotations use can be deactivated but not deleted.
  assert.equal((await request(app).delete(`${STATUSES}/${statusOf('sent').id}`).set(admin())).status, 200, 'unused');
  ctx.statuses = (await request(app).get(STATUSES).set(admin())).body.data.items;
  const inUse = ctx.statuses.find((s) => s.category === 'expired');
  await request(app).patch(`${url}/status`).set(admin()).send({ statusId: inUse.id });
  assert.equal((await request(app).delete(`${STATUSES}/${inUse.id}`).set(admin())).status, 409);
  await request(app).patch(`${url}/status`).set(admin()).send({ statusId: statusOf('draft').id });
  ctx.sent = (await request(app).post(STATUSES).set(admin()).send({ name: 'Dispatched', category: 'sent' })).body.data.item;
});

// --- PDF -------------------------------------------------------------------------

test('pdf: refused until the company profile says who we are', async () => {
  const res = await request(app).post(`${API}/${ctx.full.id}/pdf`).set(admin());
  assert.equal(res.status, 409);
  assert.match(res.body.message, /company profile/i);
});

test('pdf: a real PDF carrying the profile, the customer, the lines and the totals', async () => {
  const saved = await request(app).put(PROFILE).set(admin()).send({
    name: 'Zenith Workspaces',
    legalName: 'Zenith Workspaces Pvt Ltd',
    address: '4 Harbour Street',
    city: 'Kochi',
    country: 'India',
    email: 'Sales@Zenith.example',
    phone: '0484 555 0100',
    gstNumber: '32abcde1234f1z5',
    currency: 'inr',
    bankDetails: 'Account 000123, Harbour Bank',
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.profile.email, 'sales@zenith.example');
  assert.equal(saved.body.data.profile.currency, 'INR');
  assert.equal(saved.body.data.profile.quotationValidityDays, 15, 'fields not sent are kept');

  const res = await pdf(ctx.full.id, ctx.readerToken);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/pdf');
  assert.equal(res.headers['content-disposition'], 'attachment; filename="QUO-000001.pdf"');
  assert.equal(res.body.subarray(0, 5).toString(), '%PDF-');
  assert.ok(res.body.length > 1500);
  assert.match(res.body.subarray(-1024).toString(), /%%EOF/);
  // The document properties are stored uncompressed.
  const raw = res.body.toString('latin1');
  assert.match(raw, /Quotation QUO-000001/);
  assert.match(raw, /Zenith Workspaces/);
  assert.match(raw, /Quotation for Acme Industries/);
  assert.equal((raw.match(/\/Type \/Page\b/g) ?? []).length, 1);

  assert.equal((await pdf(missing())).status, 404);
});

test('pdf: a long quotation flows onto more pages', async () => {
  const items = Array.from({ length: 60 }, (_, index) =>
    line(ctx.manual, { quantity: index + 1, description: `Line ${index + 1} with a description that is long enough to wrap in the item column` })
  );
  const long = (await create({ items, termsAndConditions: 'Clause. '.repeat(400) })).body.data.quotation;
  assert.equal(long.items.length, 60);

  const res = await pdf(long.id);
  assert.equal(res.status, 200);
  const pages = (res.body.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
  assert.ok(pages >= 3, `expected several pages, got ${pages}`);
  await request(app).delete(`${API}/${long.id}`).set(admin());
});

// --- send ------------------------------------------------------------------------

test('send without SMTP: nothing is emailed, the quotation is marked as sent and says so', async () => {
  const url = `${API}/${ctx.full.id}/send`;
  assert.equal((await request(app).post(url).set(as(ctx.repToken)).send({})).status, 403);

  const res = await request(app).post(url).set(as(ctx.managerToken)).send({});
  assert.equal(res.status, 200);
  assert.match(res.body.message, /not configured/);
  assert.deepEqual(res.body.data.email, { delivered: false, to: 'priya@acme.example', reason: 'Email is not configured (SMTP_URL)' });
  const { quotation } = res.body.data;
  assert.equal(quotation.status.id, ctx.sent.id, 'a draft moves to the first active "sent" status');
  assert.ok(quotation.sentAt);
  assert.equal(quotation.sentBy, ctx.manager.id);

  const events = (await request(app).get(`${API}/${ctx.full.id}/timeline?limit=2`).set(admin())).body.data.events;
  assert.deepEqual(events.map((e) => e.action), ['status_changed', 'sent']);
  assert.match(events[1].summary, /Marked as sent/);
});

test('send with SMTP: emails the PDF to the contact, or to the address given', async () => {
  // Stands in for the SMTP connection: records what would have been sent.
  const sent = [];
  setMailTransport({ sendMail: async (message) => sent.push(message) });

  const res = await request(app).post(`${API}/${ctx.simple.id}/send`).set(admin()).send({ to: 'Buyer@Acme.example', subject: 'Your quote' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.email, { delivered: true, to: 'buyer@acme.example' });
  assert.equal(res.body.data.quotation.sentTo, 'buyer@acme.example');
  assert.equal(res.body.data.quotation.status.category, 'sent');

  const [message] = sent;
  assert.equal(message.to, 'buyer@acme.example');
  assert.equal(message.from, 'sales@zenith.example', 'from the company profile');
  assert.equal(message.subject, 'Your quote');
  assert.match(message.text, /QUO-000002/);
  assert.equal(message.attachments[0].filename, 'QUO-000002.pdf');
  assert.equal(message.attachments[0].content.subarray(0, 5).toString(), '%PDF-');

  // Defaults: the contact's email, and a subject naming us.
  await request(app).patch(`${API}/${ctx.full.id}/status`).set(admin()).send({ statusId: statusOf('accepted').id });
  const again = await request(app).post(`${API}/${ctx.full.id}/send`).set(admin()).send({});
  assert.equal(again.body.data.email.to, 'priya@acme.example');
  assert.equal(sent[1].subject, 'Quotation QUO-000001 from Zenith Workspaces');
  assert.match(sent[1].text, /Dear Priya Nair/);
  assert.equal(again.body.data.quotation.status.category, 'accepted', 'only a draft is moved to sent');

  // No contact and no company email: an address is required.
  const noRecipient = await request(app).post(`${API}/${ctx.boltQuote.id}/send`).set(admin()).send({});
  assert.equal(noRecipient.status, 400);
  assert.equal(noRecipient.body.errors[0].field, 'to');
  assert.equal((await request(app).post(`${API}/${ctx.boltQuote.id}/send`).set(admin()).send({ to: 'nope' })).status, 422);
  assert.equal(sent.length, 2);
});

test('send: a mail server failure is reported and the quotation is not marked as sent', async () => {
  setMailTransport({ sendMail: async () => Promise.reject(new Error('connection refused')) });

  const res = await request(app).post(`${API}/${ctx.boltQuote.id}/send`).set(admin()).send({ to: 'omar@bolt.example' });
  assert.equal(res.status, 502);
  const quotation = await get(ctx.boltQuote.id);
  assert.equal(quotation.status.category, 'draft');
  assert.equal('sentAt' in quotation, false);
  setMailTransport(null);
});

// --- delete and other modules ------------------------------------------------------------

test('delete: soft-deletes, hides the quotation, and its number is not reused', async () => {
  const doomed = (await create({})).body.data.quotation;
  assert.equal((await request(app).delete(`${API}/${doomed.id}`).set(as(ctx.repToken))).status, 403);
  assert.equal((await request(app).delete(`${API}/${doomed.id}`).set(as(ctx.managerToken))).status, 200);
  assert.equal((await request(app).get(`${API}/${doomed.id}`).set(admin())).status, 404);
  assert.deepEqual(await numbers(`search=${doomed.quotationNumber}`), []);
  assert.ok(await Quotation.findById(doomed.id).setOptions({ withDeleted: true }), 'the record is kept');

  const next = (await create({})).body.data.quotation;
  assert.ok(Number(next.quotationNumber.split('-')[1]) > Number(doomed.quotationNumber.split('-')[1]));
});

test('the company page counts quotations, and they block deleting the company and contact', async () => {
  const sections = (await request(app).get(`/api/v1/companies/${ctx.acme.id}/sections`).set(admin())).body.data.sections;
  const section = sections.find((s) => s.key === 'quotations');
  assert.equal(section.available, true);
  assert.equal(section.count, await Quotation.countDocuments({ companyId: ctx.acme.id }));

  const company = await request(app).delete(`/api/v1/companies/${ctx.acme.id}`).set(admin());
  assert.equal(company.status, 409);
  assert.ok(company.body.errors.some((e) => e.field === 'quotations'));
  assert.equal((await request(app).delete(`/api/v1/contacts/${ctx.priya.id}`).set(admin())).status, 409);
});

test('pickers: the builder can load companies, contacts, opportunities and products with quotation permissions alone', async () => {
  const h = as(ctx.repToken);
  const options = await request(app).get(`/api/v1/opportunities/options?companyId=${ctx.acme.id}`).set(h);
  assert.equal(options.status, 200);
  assert.deepEqual(options.body.data.opportunities.map((o) => o.name), ['Office fit-out']);
  assert.deepEqual(Object.keys(options.body.data.opportunities[0]).sort(), ['companyId', 'id', 'name', 'opportunityNumber', 'status']);
  const byId = await request(app).get(`/api/v1/opportunities/options?id=${ctx.boltDeal.id}`).set(h);
  assert.deepEqual(byId.body.data.opportunities.map((o) => o.name), ['Bolt deal']);

  for (const path of ['companies/options', `contacts/options?companyId=${ctx.acme.id}`, 'products/options', 'settings/company']) {
    assert.equal((await request(app).get(`/api/v1/${path}`).set(h)).status, 200, path);
  }
  assert.equal((await request(app).get('/api/v1/opportunities/options').set(as(ctx.plainToken))).status, 403);
});
