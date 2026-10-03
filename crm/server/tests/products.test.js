import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_products');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Product } = await import('../src/models/Product.js');
const { default: ProductCategory } = await import('../src/models/ProductCategory.js');
const { default: Tax } = await import('../src/models/Tax.js');
const { default: Unit } = await import('../src/models/Unit.js');
const { default: User } = await import('../src/models/User.js');
const { verifyDeclaredPermissions } = await import('../src/services/seed.service.js');
const { allKeys, createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } =
  await import('./helpers/fixtures.js');

const API = '/api/v1/products';
const CATEGORIES = '/api/v1/product-categories';
const UNITS = '/api/v1/units';
const TAXES = '/api/v1/taxes';

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const create = (body, token = ctx.adminToken) =>
  request(app).post(API).set(as(token)).send({ name: 'Product', basePrice: 100, ...body });
const names = async (query) =>
  (await request(app).get(`${API}?limit=100&sortBy=name&sortOrder=asc&${query}`).set(admin())).body.data.products.map(
    (p) => p.name
  );
const missing = () => new mongoose.Types.ObjectId().toString();

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Product.init(), ProductCategory.init(), Unit.init(), Tax.init()]);
  await seedRbac();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.plain = await createUser(await defaultRole());
  ctx.reader = await createUser(await createRole(['products.read'], 'Product Reader'));
  // Manages products, but not the catalogue lists behind them.
  const editorKeys = (await allKeys('products')).filter((key) => key !== 'products.manageCatalog');
  ctx.editor = await createUser(await createRole(editorKeys, 'Product Editor'), { firstName: 'Eddie', lastName: 'Editor' });

  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.plainToken = await loginAs(app, ctx.plain);
  ctx.readerToken = await loginAs(app, ctx.reader);
  ctx.editorToken = await loginAs(app, ctx.editor);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await verifyDeclaredPermissions(), []);
});

// --- catalogue lists: categories, units, taxes -------------------------------------------

test('catalogue lists start empty - nothing is built into the API', async () => {
  for (const url of [CATEGORIES, UNITS, TAXES]) {
    assert.deepEqual((await request(app).get(url).set(admin())).body.data.items, [], url);
  }
});

test('categories, units and taxes: full CRUD with their own fields', async () => {
  const category = await request(app).post(CATEGORIES).set(admin()).send({ name: 'Electronics', skuPrefix: 'elec' });
  assert.equal(category.status, 201);
  assert.equal(category.body.data.item.skuPrefix, 'ELEC');
  ctx.electronics = category.body.data.item;
  ctx.services = (await request(app).post(CATEGORIES).set(admin()).send({ name: 'Services' })).body.data.item;
  assert.equal('skuPrefix' in ctx.services, false, 'the prefix is optional');

  const unit = await request(app).post(UNITS).set(admin()).send({ name: 'Piece', symbol: 'pc' });
  assert.equal(unit.status, 201);
  assert.equal(unit.body.data.item.symbol, 'pc');
  ctx.piece = unit.body.data.item;
  ctx.hour = (await request(app).post(UNITS).set(admin()).send({ name: 'Hour', symbol: 'hr' })).body.data.item;

  const tax = await request(app).post(TAXES).set(admin()).send({ name: 'Standard', rate: 18 });
  assert.equal(tax.status, 201);
  assert.equal(tax.body.data.item.rate, 18);
  ctx.standard = tax.body.data.item;
  ctx.zero = (await request(app).post(TAXES).set(admin()).send({ name: 'Exempt', rate: 0 })).body.data.item;
  assert.equal(ctx.zero.rate, 0, 'a zero rate is a real rate');

  // Update
  const renamed = await request(app).put(`${CATEGORIES}/${ctx.services.id}`).set(admin()).send({ skuPrefix: 'SVC' });
  assert.equal(renamed.body.data.item.skuPrefix, 'SVC');
  const cleared = await request(app).put(`${CATEGORIES}/${ctx.services.id}`).set(admin()).send({ skuPrefix: '' });
  assert.equal('skuPrefix' in cleared.body.data.item, false, 'the prefix can be removed');
  const rate = await request(app).put(`${TAXES}/${ctx.standard.id}`).set(admin()).send({ rate: 12.5 });
  assert.equal(rate.body.data.item.rate, 12.5);
  await request(app).put(`${TAXES}/${ctx.standard.id}`).set(admin()).send({ rate: 18 });

  // List and delete
  assert.deepEqual((await request(app).get(UNITS).set(admin())).body.data.items.map((u) => u.symbol), ['pc', 'hr']);
  const spare = (await request(app).post(UNITS).set(admin()).send({ name: 'Spare', symbol: 'sp' })).body.data.item;
  assert.equal((await request(app).delete(`${UNITS}/${spare.id}`).set(admin())).status, 200);
});

test('catalogue lists: validation and uniqueness', async () => {
  const cases = {
    'duplicate category name': [request(app).post(CATEGORIES).send({ name: 'ELECTRONICS' }), 409],
    'bad category prefix': [request(app).post(CATEGORIES).send({ name: 'Bad', skuPrefix: 'has space' }), 422],
    'prefix too long': [request(app).post(CATEGORIES).send({ name: 'Bad', skuPrefix: 'ABCDEFGHIJK' }), 422],
    'unit without a symbol': [request(app).post(UNITS).send({ name: 'Box' }), 422],
    'duplicate unit name': [request(app).post(UNITS).send({ name: 'piece', symbol: 'pcs' }), 409],
    'duplicate unit symbol, different case': [request(app).post(UNITS).send({ name: 'Pieces', symbol: 'PC' }), 409],
    'renaming a symbol to one in use': [request(app).put(`${UNITS}/${ctx.hour.id}`).send({ symbol: 'pc' }), 409],
    'tax without a rate': [request(app).post(TAXES).send({ name: 'No Rate' }), 422],
    'negative rate': [request(app).post(TAXES).send({ name: 'Negative', rate: -1 }), 422],
    'rate above 100': [request(app).post(TAXES).send({ name: 'Too Much', rate: 101 }), 422],
    'non-numeric rate': [request(app).post(TAXES).send({ name: 'Words', rate: 'eighteen' }), 422],
    'clearing a required symbol': [request(app).put(`${UNITS}/${ctx.hour.id}`).send({ symbol: '', description: 'x' }), 422],
  };
  for (const [label, [req, status]] of Object.entries(cases)) {
    assert.equal((await req.set(admin())).status, status, label);
  }
  assert.equal((await Unit.findById(ctx.hour.id)).symbol, 'hr');
  const keepOwn = await request(app).put(`${UNITS}/${ctx.hour.id}`).set(admin()).send({ symbol: 'hr' });
  assert.equal(keepOwn.status, 200, 'keeping your own symbol is not a conflict');
});

test('catalogue lists: managed with products.manageCatalog; readable by anyone who works with products', async () => {
  const editor = as(ctx.editorToken);
  for (const url of [CATEGORIES, UNITS, TAXES]) {
    assert.equal((await request(app).get(url).set(editor)).status, 200, url);
    assert.equal((await request(app).get(url).set(as(ctx.readerToken))).status, 200, url);
    assert.equal((await request(app).post(url).set(editor).send({ name: 'Nope', symbol: 'n', rate: 1 })).status, 403, url);
    assert.equal((await request(app).get(url).set(as(ctx.plainToken))).status, 403, url);
    assert.equal((await request(app).get(url)).status, 401, url);
  }
  assert.equal((await request(app).put(`${TAXES}/${ctx.standard.id}`).set(editor).send({ rate: 1 })).status, 403);
  assert.equal((await request(app).delete(`${TAXES}/${ctx.standard.id}`).set(editor)).status, 403);
});

// --- access --------------------------------------------------------------------

test('product endpoints need a token (401) and a permission (403)', async () => {
  const id = missing();
  const calls = (headers) => [
    request(app).get(API).set(headers),
    request(app).get(`${API}/options`).set(headers),
    request(app).get(`${API}/sku-check?sku=ABC-1`).set(headers),
    request(app).post(API).set(headers).send({ name: 'Nope', basePrice: 1 }),
    request(app).get(`${API}/${id}`).set(headers),
    request(app).put(`${API}/${id}`).set(headers).send({ name: 'Nope' }),
    request(app).delete(`${API}/${id}`).set(headers),
  ];
  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) assert.equal(res.status, 403);

  const reader = as(ctx.readerToken);
  assert.equal((await request(app).get(API).set(reader)).status, 200);
  assert.equal((await request(app).get(`${API}/options`).set(reader)).status, 200);
  assert.equal((await request(app).post(API).set(reader).send({ name: 'Nope', basePrice: 1 })).status, 403);
  assert.equal((await request(app).get(`${API}/sku-check?sku=ABC-1`).set(reader)).status, 403);
  assert.equal(await Product.countDocuments(), 0);
});

// --- SKU -------------------------------------------------------------------------

test('SKU: generated when none is given, with the default prefix', async () => {
  const res = await create({ name: '  Widget  ', basePrice: 49.5 }, ctx.editorToken);

  assert.equal(res.status, 201);
  const { product } = res.body.data;
  assert.equal(product.sku, 'PRD-000001');
  assert.equal(product.name, 'Widget');
  assert.equal(product.basePrice, 49.5);
  assert.equal(product.status, 'active');
  assert.equal(product.createdBy, ctx.editor.id);
  assert.equal(product.createdByUser.fullName, 'Eddie Editor');
  for (const field of ['_id', '__v', 'deletedAt', 'costPrice', 'categoryId']) assert.equal(field in product, false, field);
  ctx.widget = product;
});

test("SKU: generated with the category's prefix when it has one", async () => {
  const withPrefix = await create({ name: 'Laptop', categoryId: ctx.electronics.id, basePrice: 55000 });
  const noPrefix = await create({ name: 'Consulting', categoryId: ctx.services.id, basePrice: 2000 });
  const blank = await create({ name: 'Blank SKU', sku: '', basePrice: 10 });

  assert.equal(withPrefix.body.data.product.sku, 'ELEC-000002');
  assert.equal(noPrefix.body.data.product.sku, 'PRD-000003', 'a category without a prefix uses the default');
  assert.equal(blank.body.data.product.sku, 'PRD-000004', "'' means generate");
  ctx.laptop = withPrefix.body.data.product;
  ctx.consulting = noPrefix.body.data.product;
});

test('SKU: a supplied one is normalized, validated and must be unique', async () => {
  const custom = await create({ name: 'Custom', sku: '  hw-cable.2m_blk ' });
  assert.equal(custom.status, 201);
  assert.equal(custom.body.data.product.sku, 'HW-CABLE.2M_BLK');
  ctx.custom = custom.body.data.product;

  const duplicate = await create({ name: 'Copy', sku: 'HW-CABLE.2M_BLK' });
  const duplicateCase = await create({ name: 'Copy', sku: 'hw-cable.2m_blk' });
  for (const res of [duplicate, duplicateCase]) {
    assert.equal(res.status, 409);
    assert.equal(res.body.errors[0].field, 'sku');
  }

  const invalid = {
    'too short': 'A',
    'has a space': 'AB CD',
    'starts with a dash': '-ABC',
    'has a slash': 'AB/CD',
    'too long': 'A'.repeat(41),
    'not a string': 12345,
  };
  for (const [label, sku] of Object.entries(invalid)) {
    const res = await create({ name: 'Bad SKU', sku });
    assert.equal(res.status, 422, label);
    assert.equal(res.body.errors[0].field, 'sku', label);
  }
  assert.equal(await Product.countDocuments({ name: { $in: ['Copy', 'Bad SKU'] } }), 0);
});

test('SKU: generation skips numbers that were entered by hand', async () => {
  // The next generated number would be 5; take it (and 6) manually first.
  assert.equal((await create({ name: 'Manual five', sku: 'PRD-000005' })).status, 201);
  assert.equal((await create({ name: 'Manual six', sku: 'PRD-000006' })).status, 201);

  const next = await create({ name: 'After the manual ones' });
  assert.equal(next.status, 201);
  assert.equal(next.body.data.product.sku, 'PRD-000007');
});

test('SKU: concurrent creates get distinct generated SKUs, and one winner for a hand-entered one', async () => {
  const generated = await Promise.all(Array.from({ length: 10 }, (_, i) => create({ name: `Parallel ${i}` })));
  const skus = generated.map((r) => r.body.data.product.sku);
  assert.ok(generated.every((r) => r.status === 201));
  assert.equal(new Set(skus).size, 10);

  const sameSku = await Promise.all(Array.from({ length: 5 }, (_, i) => create({ name: `Racer ${i}`, sku: 'RACE-1' })));
  assert.deepEqual(sameSku.map((r) => r.status).sort(), [201, 409, 409, 409, 409]);
  assert.equal(await Product.countDocuments({ sku: 'RACE-1' }), 1);
});

test('SKU check: reports availability in the stored form', async () => {
  const h = as(ctx.editorToken);
  const taken = await request(app).get(`${API}/sku-check?sku=hw-cable.2m_blk`).set(h);
  const free = await request(app).get(`${API}/sku-check?sku=new-one`).set(h);
  const invalid = await request(app).get(`${API}/sku-check?sku=a b`).set(h);
  const none = await request(app).get(`${API}/sku-check`).set(h);

  assert.deepEqual(taken.body.data, { sku: 'HW-CABLE.2M_BLK', available: false });
  assert.deepEqual(free.body.data, { sku: 'NEW-ONE', available: true });
  assert.equal(invalid.status, 422);
  assert.equal(none.status, 422);
});

test('SKU: cannot be changed after creation', async () => {
  const res = await request(app).put(`${API}/${ctx.widget.id}`).set(admin()).send({ sku: 'NEW-SKU' });
  assert.equal(res.status, 422);
  assert.equal((await Product.findById(ctx.widget.id)).sku, 'PRD-000001');
});

// --- create ----------------------------------------------------------------------

test('create: stores every field and expands the references', async () => {
  const org = (await request(app).post('/api/v1/organizations').set(admin()).send({ name: 'Head Office' })).body.data.item;
  const res = await create({
    name: 'Router',
    description: 'Dual-band',
    categoryId: ctx.electronics.id,
    unitId: ctx.piece.id,
    basePrice: 2499.99,
    costPrice: 1800,
    taxId: ctx.standard.id,
    status: 'inactive',
    image: 'https://example.com/router.png',
    organizationId: org.id,
  });

  assert.equal(res.status, 201);
  const { product } = res.body.data;
  assert.match(product.sku, /^ELEC-\d{6}$/);
  assert.equal(product.basePrice, 2499.99);
  assert.equal(product.costPrice, 1800);
  assert.equal(product.status, 'inactive');
  assert.equal(product.category.name, 'Electronics');
  assert.deepEqual(product.unit, { name: 'Piece', isActive: true, symbol: 'pc', id: ctx.piece.id });
  assert.equal(product.tax.rate, 18);
  assert.equal(product.organization.name, 'Head Office');
  ctx.router = product;
  ctx.org = org;
});

test('create: validation and references', async () => {
  const retired = await Tax.create({ name: 'Retired', rate: 5, isActive: false, sortOrder: 99 });
  const cases = {
    'missing name': [{ name: undefined }, 422],
    'short name': [{ name: 'A' }, 422],
    'missing price': [{ basePrice: undefined }, 422],
    'negative price': [{ basePrice: -1 }, 422],
    'non-numeric price': [{ basePrice: 'cheap' }, 422],
    'negative cost': [{ costPrice: -1 }, 422],
    'unknown status': [{ status: 'archived' }, 422],
    'image without scheme': [{ image: 'example.com/a.png' }, 422],
    'client-chosen creator': [{ createdBy: ctx.admin.id }, 422],
    'malformed category': [{ categoryId: 'nope' }, 422],
    'unknown category': [{ categoryId: missing() }, 400],
    'unknown unit': [{ unitId: missing() }, 400],
    'unknown tax': [{ taxId: missing() }, 400],
    'inactive tax': [{ taxId: retired.id }, 400],
    'a unit id used as a category': [{ categoryId: ctx.piece.id }, 400],
    'unknown organization': [{ organizationId: missing() }, 400],
  };
  const before = await Product.countDocuments();
  for (const [label, [body, status]] of Object.entries(cases)) {
    const res = await create(body);
    assert.equal(res.status, status, label);
    assert.ok(res.body.errors.length > 0, label);
  }
  assert.equal(await Product.countDocuments(), before, 'nothing was stored');
  await retired.deleteOne();

  assert.equal((await create({ name: 'Free sample', basePrice: 0 })).status, 201, 'a price of zero is allowed');
});

// --- list ------------------------------------------------------------------------

test('list: search, category and status filters', async () => {
  assert.deepEqual(await names('search=router'), ['Router']);
  assert.deepEqual(await names('search=HW-CABLE'), ['Custom'], 'searches the SKU');
  assert.deepEqual(await names('search=dual-band'), ['Router'], 'searches the description');
  assert.deepEqual(await names('search=.*'), []);

  assert.deepEqual(await names(`categoryId=${ctx.electronics.id}`), ['Laptop', 'Router']);
  assert.deepEqual(await names(`categoryId=${ctx.services.id}`), ['Consulting']);
  assert.deepEqual(await names(`categoryId=${missing()}`), []);
  assert.deepEqual(await names('status=inactive'), ['Router']);
  assert.deepEqual(await names(`categoryId=${ctx.electronics.id}&status=active`), ['Laptop']);
  assert.deepEqual(await names(`unitId=${ctx.piece.id}`), ['Router']);
  assert.deepEqual(await names(`taxId=${ctx.standard.id}`), ['Router']);
  assert.deepEqual(await names(`organizationId=${ctx.org.id}`), ['Router']);
});

test('list: price range, bounds included', async () => {
  assert.deepEqual(await names('minPrice=2000&maxPrice=3000'), ['Consulting', 'Router']);
  assert.deepEqual(await names('minPrice=2499.99&maxPrice=2499.99'), ['Router'], 'both bounds are inclusive');
  assert.deepEqual(await names('minPrice=50000'), ['Laptop']);
  assert.deepEqual(await names('maxPrice=0'), ['Free sample']);
  assert.deepEqual(await names('minPrice=0&maxPrice=49.5&search=widget'), ['Widget']);
  assert.deepEqual(await names('minPrice=1000000'), []);
  assert.equal((await names('minPrice=&maxPrice=')).length, await Product.countDocuments(), "'' means no bound");

  const h = admin();
  const reversed = await request(app).get(`${API}?minPrice=500&maxPrice=100`).set(h);
  assert.equal(reversed.status, 422);
  assert.equal(reversed.body.errors[0].field, 'minPrice');
  for (const bad of ['minPrice=-1', 'maxPrice=cheap']) {
    assert.equal((await request(app).get(`${API}?${bad}`).set(h)).status, 422, bad);
  }
});

test('list: sorting and pagination', async () => {
  const h = as(ctx.readerToken);
  const total = await Product.countDocuments();

  const page = await request(app).get(`${API}?page=2&limit=5&sortBy=sku&sortOrder=asc`).set(h);
  assert.deepEqual(page.body.data.pagination, { page: 2, limit: 5, total, totalPages: Math.ceil(total / 5) });
  assert.equal(page.body.data.products.length, 5);

  const dearest = await request(app).get(`${API}?limit=1&sortBy=basePrice&sortOrder=desc`).set(h);
  const cheapest = await request(app).get(`${API}?limit=1&sortBy=basePrice&sortOrder=asc`).set(h);
  assert.equal(dearest.body.data.products[0].name, 'Laptop');
  assert.equal(cheapest.body.data.products[0].name, 'Free sample');

  for (const bad of ['sortBy=deletedAt', 'limit=500', 'page=0', 'status=archived', 'categoryId=nope']) {
    assert.equal((await request(app).get(`${API}?${bad}`).set(h)).status, 422, bad);
  }
});

// --- options: what product pickers use -------------------------------------------------

test('options: active products only, searchable, with what a line item needs', async () => {
  const h = as(ctx.readerToken);
  const all = (await request(app).get(`${API}/options?limit=100`).set(h)).body.data.products;
  assert.equal(all.some((p) => p.name === 'Router'), false, 'inactive products are not offered');
  assert.ok(all.every((p) => p.status === 'active'));

  const laptop = (await request(app).get(`${API}/options?search=laptop`).set(h)).body.data.products;
  assert.deepEqual(Object.keys(laptop[0]).sort(), ['basePrice', 'id', 'name', 'sku', 'status', 'tax', 'unit']);
  assert.deepEqual(
    { sku: laptop[0].sku, name: laptop[0].name, basePrice: laptop[0].basePrice, unit: laptop[0].unit, tax: laptop[0].tax },
    { sku: 'ELEC-000002', name: 'Laptop', basePrice: 55000, unit: null, tax: null }
  );

  // By id: a picker can show a product that is already on a record, even if inactive.
  const byId = (await request(app).get(`${API}/options?id=${ctx.router.id}`).set(h)).body.data.products;
  assert.equal(byId.length, 1);
  assert.equal(byId[0].unit.symbol, 'pc');
  assert.equal(byId[0].tax.rate, 18);

  assert.equal((await request(app).get(`${API}/options?search=elec-0000`).set(h)).body.data.products[0].name, 'Laptop');
  assert.equal((await request(app).get(`${API}/options?limit=2`).set(h)).body.data.products.length, 2);
  assert.equal((await request(app).get(`${API}/options?limit=1000`).set(h)).status, 422);
});

// --- get / update ----------------------------------------------------------------

test('get: one product, 404 for unknown, 422 for a malformed id', async () => {
  const h = as(ctx.readerToken);
  const ok = await request(app).get(`${API}/${ctx.router.id}`).set(h);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.product.category.name, 'Electronics');
  assert.equal((await request(app).get(`${API}/${missing()}`).set(h)).status, 404);
  assert.equal((await request(app).get(`${API}/nope`).set(h)).status, 422);
  // "options" and "sku-check" are routes, not ids.
  assert.equal((await request(app).get(`${API}/options`).set(h)).status, 200);
});

test('update: changes what is sent, clears optional fields, keeps the SKU', async () => {
  const h = as(ctx.editorToken);
  const url = `${API}/${ctx.router.id}`;

  const res = await request(app)
    .put(url)
    .set(h)
    .send({ name: 'Router Pro', basePrice: 0, costPrice: '', taxId: null, status: 'active', categoryId: ctx.services.id });
  assert.equal(res.status, 200);
  const { product } = res.body.data;
  assert.equal(product.name, 'Router Pro');
  assert.equal(product.basePrice, 0, 'a price of zero is a real price');
  assert.equal(product.status, 'active');
  assert.equal(product.category.name, 'Services');
  for (const field of ['costPrice', 'taxId']) assert.equal(field in product, false, field);
  assert.equal(product.sku, ctx.router.sku, 'moving category does not change the SKU');
  assert.equal(product.unit.symbol, 'pc', 'omitted fields are untouched');
  assert.equal(product.description, 'Dual-band');

  const cases = {
    'empty body': [{}, 422],
    'negative price': [{ basePrice: -5 }, 422],
    'unknown unit': [{ unitId: missing() }, 400],
    'client-chosen creator': [{ createdBy: ctx.admin.id }, 422],
  };
  for (const [label, [body, status]] of Object.entries(cases)) {
    assert.equal((await request(app).put(url).set(h).send(body)).status, status, label);
  }
  assert.equal((await request(app).put(`${API}/${missing()}`).set(h).send({ name: 'Ghost' })).status, 404);
  await request(app).put(url).set(h).send({ basePrice: 2499.99, taxId: ctx.standard.id });
});

// --- relationships with the catalogue lists ----------------------------------------------

test('a category, unit or tax that products use cannot be deleted - only deactivated', async () => {
  for (const [url, id] of [
    [CATEGORIES, ctx.services.id],
    [UNITS, ctx.piece.id],
    [TAXES, ctx.standard.id],
  ]) {
    const res = await request(app).delete(`${url}/${id}`).set(admin());
    assert.equal(res.status, 409, url);
    assert.match(res.body.message, /Deactivate/, url);
  }

  // Deactivating keeps it on existing products but stops new ones using it.
  await request(app).put(`${UNITS}/${ctx.piece.id}`).set(admin()).send({ isActive: false });
  assert.equal((await create({ name: 'New with old unit', unitId: ctx.piece.id })).status, 400);
  const existing = (await request(app).get(`${API}/${ctx.router.id}`).set(admin())).body.data.product;
  assert.equal(existing.unit.symbol, 'pc');
  assert.equal(existing.unit.isActive, false);
  // A product keeps its (now inactive) unit when other fields are edited.
  assert.equal((await request(app).put(`${API}/${ctx.router.id}`).set(admin()).send({ description: 'Tri-band' })).status, 200);
  await request(app).put(`${UNITS}/${ctx.piece.id}`).set(admin()).send({ isActive: true });

  assert.equal((await request(app).delete(`${UNITS}/${ctx.hour.id}`).set(admin())).status, 200, 'unused values can go');
});

// --- delete ----------------------------------------------------------------------

test('delete: soft-deletes, hides the product, and its SKU is never reused', async () => {
  assert.equal((await request(app).delete(`${API}/${ctx.custom.id}`).set(as(ctx.readerToken))).status, 403);
  const h = as(ctx.editorToken);
  assert.equal((await request(app).delete(`${API}/${ctx.custom.id}`).set(h)).status, 200);

  assert.equal((await request(app).get(`${API}/${ctx.custom.id}`).set(h)).status, 404);
  assert.equal((await request(app).delete(`${API}/${ctx.custom.id}`).set(h)).status, 404);
  assert.deepEqual(await names('search=HW-CABLE'), []);
  assert.deepEqual((await request(app).get(`${API}/options?id=${ctx.custom.id}`).set(h)).body.data.products, []);

  const stored = await Product.findById(ctx.custom.id).setOptions({ withDeleted: true });
  assert.ok(stored.deletedAt instanceof Date, 'record is kept');

  const reuse = await create({ name: 'Reuse', sku: 'HW-CABLE.2M_BLK' });
  assert.equal(reuse.status, 409);
  const check = await request(app).get(`${API}/sku-check?sku=HW-CABLE.2M_BLK`).set(h);
  assert.equal(check.body.data.available, false);
});
