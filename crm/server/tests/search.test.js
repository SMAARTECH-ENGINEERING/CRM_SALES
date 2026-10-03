import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_search');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: User } = await import('../src/models/User.js');
const { default: Company } = await import('../src/models/Company.js');
const { default: Lead } = await import('../src/models/Lead.js');
const { default: Quotation } = await import('../src/models/Quotation.js');
const s = await import('../src/services/seed.service.js');
const { backfillSearchKeys, SEARCH_CATEGORIES } = await import('../src/services/search.service.js');
const { searchKeysOf, searchWords } = await import('../src/utils/searchKeys.js');
const { createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const READ = ['companies', 'contacts', 'leads', 'opportunities', 'quotations', 'orders', 'projects', 'tickets', 'contracts'].map((m) => `${m}.read`);
const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const call = (method, path, token, body) => request(app)[method](`/api/v1/${path}`).set(as(token)).send(body);
const post = async (path, body, token = ctx.adminToken) => {
  const res = await call('post', path, token, body);
  assert.ok(res.status < 300, `${path}: ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const find = async (q, who = 'admin', extra = '') => {
  const res = await request(app).get(`/api/v1/search?q=${encodeURIComponent(q)}${extra}`).set(as(ctx[`${who}Token`]));
  assert.equal(res.status, 200, `"${q}" as ${who}: ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const titles = (list) => list.map((item) => item.title).sort();
const counts = (data) => Object.fromEntries(Object.entries(data).filter(([, list]) => list.length).map(([key, list]) => [key, list.length]));

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await User.init();
  await seedRbac();
  for (const seed of ['seedLeadConfig', 'seedPipelines', 'seedQuotationStatuses', 'seedOrderStatuses', 'seedProjectStatuses', 'seedTicketSettings', 'seedContractSettings']) await s[seed]();
  await Promise.all([Company.init(), Lead.init(), Quotation.init()]);

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.north = (await post('organizations', { name: 'North Region' })).item;
  ctx.south = (await post('organizations', { name: 'South Region' })).item;

  // Reads every module, but belongs to the North organization.
  ctx.norah = await createUser(await createRole(READ, 'Regional Manager'), { organizationId: ctx.north.id });
  // Reads every module, belongs to no organization: only their own records.
  ctx.solo = await createUser(await createRole(READ, 'Salesperson'));
  // Reads every module and searches everything.
  ctx.wide = await createUser(await createRole([...READ, 'search.viewAll'], 'Head Office'), { organizationId: ctx.north.id });
  ctx.leadsOnly = await createUser(await createRole(['leads.read'], 'Lead Desk'));
  ctx.plain = await createUser(await defaultRole());
  for (const who of ['norah', 'solo', 'wide', 'leadsOnly', 'plain']) ctx[`${who}Token`] = await loginAs(app, ctx[who]);

  ctx.acme = (await post('companies', { name: 'Acme Industries', city: 'Pune', phone: '+91 98765 43210', organizationId: ctx.north.id })).company;
  ctx.bolt = (await post('companies', { name: 'Bolt Traders', city: 'Chennai', organizationId: ctx.south.id, assignedTo: ctx.solo.id })).company;
  ctx.cafe = (await post('companies', { name: 'Café Société', organizationId: ctx.south.id })).company;

  ctx.asha = (await post('contacts', { firstName: 'Asha', lastName: 'Rao', email: 'asha.rao@acme.example', designation: 'Purchase Head', companyId: ctx.acme.id })).contact;
  await post('contacts', { firstName: 'Bala', lastName: 'Iyer', companyId: ctx.bolt.id });

  ctx.lead = (await post('leads', { title: 'Warehouse racking', companyId: ctx.acme.id, tags: ['storage'] })).lead;
  await post('leads', { title: 'Warehouse lighting', organizationId: ctx.south.id });
  ctx.soloLead = (await post('leads', { title: 'Warehouse flooring', assignedTo: ctx.solo.id })).lead;

  await post('opportunities', { name: 'Racking phase two', companyId: ctx.acme.id });
  const tax = (await post('taxes', { name: 'GST 18', rate: 18 })).item;
  const desk = (await post('products', { name: 'Desk', basePrice: 1000, taxId: tax.id })).product;
  ctx.quotation = (await post('quotations', { companyId: ctx.acme.id, items: [{ productId: desk.id, quantity: 1 }] })).quotation;
  await post('quotations', { companyId: ctx.bolt.id, items: [{ productId: desk.id, quantity: 2 }] });
  ctx.order = (await post('orders', { companyId: ctx.acme.id, items: [{ productId: desk.id, quantity: 1 }] })).order;
  ctx.project = (await post('projects', { name: 'Racking installation', companyId: ctx.acme.id })).project;
  ctx.ticket = (await post('tickets', { companyId: ctx.acme.id, subject: 'Racking bolt missing' })).ticket;
  const today = new Date().toISOString().slice(0, 10);
  const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  ctx.contract = (await post('contracts', { companyId: ctx.acme.id, startDate: today, endDate: nextYear, amount: 1200 })).contract;
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('search keys: words, numbers without their zeros, phone numbers', () => {
  assert.deepEqual(searchWords('  Café Société, LD-000012 '), ['cafe', 'societe', 'ld', '000012']);
  const keys = searchKeysOf(['LD-000012', 'asha.rao@acme.example', ['storage', null], '+91 98765 43210', undefined]);
  for (const key of ['ld', '000012', '12', 'asha', 'rao', 'acme', 'storage', '919876543210', '9876543210']) assert.ok(keys.includes(key), key);
});

test('returns every category, each a list of { id, type, title, subtitle }', async () => {
  const data = await find('acme');
  assert.deepEqual(Object.keys(data), SEARCH_CATEGORIES);
  assert.deepEqual(Object.keys(data), ['companies', 'contacts', 'leads', 'opportunities', 'quotations', 'orders', 'projects', 'tickets', 'contracts']);
  assert.deepEqual(data.companies, [{ id: ctx.acme.id, type: 'company', title: 'Acme Industries', subtitle: `${ctx.acme.companyCode} · Pune` }]);
  // A contact is found by the words of their email.
  assert.deepEqual(data.contacts, [{ id: ctx.asha.id, type: 'contact', title: 'Asha Rao', subtitle: 'Purchase Head · Acme Industries · asha.rao@acme.example' }]);
  // Records without a name of their own are found through their company.
  assert.equal(data.quotations[0].id, ctx.quotation.id);
  assert.equal(data.quotations[0].title, ctx.quotation.quotationNumber);
  assert.match(data.quotations[0].subtitle, /^Acme Industries/);
  assert.equal(data.orders[0].id, ctx.order.id);
  assert.equal(data.contracts[0].id, ctx.contract.id);
  assert.equal(data.quotations.length, 1);
});

test('matches the beginning of words, every word, in any case and without accents', async () => {
  assert.deepEqual(counts(await find('rack')), { leads: 1, opportunities: 1, projects: 1, tickets: 1 });
  // Every word must match.
  assert.deepEqual(counts(await find('RACKING bolt')), { tickets: 1 });
  assert.deepEqual(titles((await find('wareh')).leads), ['Warehouse flooring', 'Warehouse lighting', 'Warehouse racking']);
  assert.deepEqual(titles((await find('cafe soc')).companies), ['Café Société']);
  // The middle of a word is not a match.
  assert.deepEqual(counts(await find('cking')), {});
  assert.deepEqual(titles((await find('storage')).leads), ['Warehouse racking']);
});

test('finds a record by its number, with or without the zeros, and a company by phone', async () => {
  assert.equal((await find(ctx.lead.leadNumber)).leads[0].id, ctx.lead.id);
  const [prefix, digits] = ctx.lead.leadNumber.split('-');
  assert.equal((await find(`${prefix} ${Number(digits)}`)).leads[0].id, ctx.lead.id);
  assert.equal((await find(ctx.ticket.ticketNumber.toLowerCase())).tickets[0].id, ctx.ticket.id);
  assert.equal((await find(ctx.project.projectNumber)).projects[0].id, ctx.project.id);
  for (const phone of ['9876543210', '98765 43210', '+91-98765-43210']) assert.equal((await find(phone)).companies[0]?.id, ctx.acme.id, phone);
});

test('RBAC: only the modules the user may read are searched', async () => {
  const data = await find('wareh', 'leadsOnly');
  // No organization, nothing assigned: this user has no leads of their own.
  assert.deepEqual(counts(data), {});
  assert.deepEqual(counts(await find('acme', 'plain')), {});
  assert.deepEqual(counts(await find('rack', 'plain')), {});

  await call('patch', `leads/${ctx.lead.id}/assign`, ctx.adminToken, { assignedTo: ctx.leadsOnly.id });
  const mine = await find('rack', 'leadsOnly');
  assert.deepEqual(counts(mine), { leads: 1 });
  assert.deepEqual(Object.keys(mine), SEARCH_CATEGORIES);
});

test('scope: an organization member finds only that organization\'s records', async () => {
  assert.deepEqual(titles((await find('wareh', 'norah')).leads), ['Warehouse racking']);
  assert.deepEqual(counts(await find('bolt', 'norah')), { tickets: 1 });
  assert.deepEqual(counts(await find('cafe', 'norah')), {});
  const acme = counts(await find('acme', 'norah'));
  assert.deepEqual(acme, { companies: 1, contacts: 1, quotations: 1, orders: 1, contracts: 1 });
});

test('scope: without an organization, only the user\'s own records', async () => {
  assert.deepEqual(titles((await find('wareh', 'solo')).leads), ['Warehouse flooring']);
  // Bolt is assigned to them - and so its contact is theirs to find.
  assert.deepEqual(counts(await find('bolt', 'solo')), { companies: 1 });
  assert.deepEqual(counts(await find('bala', 'solo')), { contacts: 1 });
  assert.deepEqual(counts(await find('acme', 'solo')), {});
});

test('scope: search.viewAll finds everything', async () => {
  assert.equal((await find('wareh', 'wide')).leads.length, 3);
  assert.deepEqual(counts(await find('bolt', 'wide')), { companies: 1, quotations: 1, tickets: 1 });
});

test('follows edits and deletions', async () => {
  const company = (await post('companies', { name: 'Zephyr Mills' })).company;
  assert.equal((await find('zephyr')).companies.length, 1);
  const res = await call('put', `companies/${company.id}`, ctx.adminToken, { name: 'Quartz Mills' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal((await find('zephyr')).companies.length, 0);
  assert.equal((await find('quartz')).companies.length, 1);
  await call('delete', `companies/${company.id}`, ctx.adminToken);
  assert.equal((await find('quartz')).companies.length, 0);
});

test('limit caps each category; the keys are never sent to clients', async () => {
  assert.equal((await find('wareh', 'admin', '&limit=2')).leads.length, 2);
  const created = await call('post', 'companies', ctx.adminToken, { name: 'Keyless Corp' });
  assert.ok(!JSON.stringify(created.body).includes('searchKeys'));
  const got = await call('get', `leads/${ctx.lead.id}`, ctx.adminToken);
  assert.ok(!JSON.stringify(got.body).includes('searchKeys'));
});

test('validation and authentication', async () => {
  for (const query of ['', '?q=', '?q=a', `?q=${'x'.repeat(101)}`, '?q=acme&limit=50']) {
    const res = await request(app).get(`/api/v1/search${query}`).set(as(ctx.adminToken));
    assert.equal(res.status, 422, query);
    assert.equal(res.body.success, false);
  }
  assert.equal((await request(app).get('/api/v1/search?q=acme')).status, 401);
  // Nothing to look for once punctuation is set aside: empty, not an error.
  assert.deepEqual(counts(await find('--')), {});
  // Typed patterns are matched literally.
  assert.deepEqual(counts(await find('.*')), {});
});

test('the query is answered from the index, never by reading the collection', async () => {
  const stagesOf = (plan) => [plan.stage, ...(plan.inputStage ? stagesOf(plan.inputStage) : []), ...(plan.inputStages ?? []).flatMap(stagesOf)];
  const plans = [
    await Lead.find({ $and: [{ searchKeys: /^wareh/ }, { searchKeys: /^rack/ }] }).sort({ updatedAt: -1 }).limit(5).explain('queryPlanner'),
    await Company.find({ searchKeys: /^acme/ }).limit(5).explain('queryPlanner'),
    await Quotation.find({ $or: [{ searchKeys: /^qt/ }, { companyId: { $in: [new mongoose.Types.ObjectId(ctx.acme.id)] } }] }).limit(5).explain('queryPlanner'),
  ];
  for (const plan of plans) {
    const stages = stagesOf(plan.queryPlanner.winningPlan);
    assert.ok(stages.includes('IXSCAN'), stages.join(','));
    assert.ok(!stages.includes('COLLSCAN'), stages.join(','));
  }
});

test('records that have no keys yet are indexed by the backfill', async () => {
  const now = new Date();
  await Company.collection.insertOne({ companyCode: 'OLD-000001', name: 'Legacy Foundry', status: 'active', deletedAt: null, createdAt: now, updatedAt: now });
  assert.equal((await find('legacy')).companies.length, 0);
  assert.equal(await backfillSearchKeys(), 1);
  const found = (await find('legacy')).companies;
  assert.equal(found.length, 1);
  assert.equal(found[0].subtitle, 'OLD-000001');
  assert.equal((await find('old 1')).companies.length, 1);
  // Nothing left to do the second time.
  assert.equal(await backfillSearchKeys(), 0);
  const stored = await Company.collection.findOne({ name: 'Legacy Foundry' });
  assert.equal(stored.updatedAt.getTime(), now.getTime());
});
