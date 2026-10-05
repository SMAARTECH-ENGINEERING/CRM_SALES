import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

const UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-document-tools-'));
setTestEnv('crm_test_document_tools', { STORAGE_DRIVER: 'local', UPLOAD_DIR: UPLOADS });

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: User } = await import('../src/models/User.js');
const s = await import('../src/services/seed.service.js');
const { createRole, createUser, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const API = '/api/v1/documents';
const PDF = (text) => Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj\n<<>>\nendobj\n`);
const XLSX = Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.from('sheet data')]);
const CSV = Buffer.from('Item,Qty\nFlow meter,4\n');
const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const post = async (p, body) => {
  const res = await request(app).post(`/api/v1/${p}`).set(admin()).send(body);
  assert.ok(res.status < 300, `${p}: ${JSON.stringify(res.body)}`);
  return res.body.data;
};
const download = (url, token = ctx.adminToken) =>
  request(app).get(url).set(as(token)).buffer(true).parse((res, cb) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });
function upload(entityType, entityId, files, fields = {}, token = ctx.adminToken) {
  let req = request(app).post(API).set(as(token)).field('entityType', entityType).field('entityId', entityId);
  for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
  for (const [buffer, name, type] of files) req = req.attach('files', buffer, { filename: name, contentType: type });
  return req;
}
const newVersion = (id, buffer, name, type, fields = {}, token = ctx.adminToken) => {
  let req = request(app).post(`${API}/${id}/versions`).set(as(token));
  for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
  return req.attach('file', buffer, { filename: name, contentType: type });
};

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await User.init();
  await seedRbac();
  await s.seedDocumentSettings();
  for (const seed of ['seedLeadConfig', 'seedPipelines', 'seedQuotationStatuses', 'seedProjectStatuses']) await s[seed]();
  ctx.admin = await createUser(await superAdminRole());
  ctx.adminToken = await loginAs(app, ctx.admin);
  const viewerRole = await createRole(['documents.read', 'companies.read', 'quotations.read', 'projects.read'], 'Viewer');
  ctx.viewerToken = await loginAs(app, await createUser(viewerRole));
  const salesRole = await createRole(['documents.read', 'documents.create', 'documents.update', 'companies.read', 'quotations.read', 'projects.read'], 'Sales');
  ctx.salesToken = await loginAs(app, await createUser(salesRole));

  ctx.fpo = (await post('companies', { name: 'Maa Samaleswari FPO' })).company;
  ctx.other = (await post('companies', { name: 'Hirakud Growers' })).company;
  const tax = (await post('taxes', { name: 'GST 18', rate: 18 })).item;
  const product = (await post('products', { name: '5 MT Cold Storage Unit', basePrice: 850000, taxId: tax.id })).product;
  ctx.quotation = (await post('quotations', { companyId: ctx.fpo.id, items: [{ productId: product.id, quantity: 1 }] })).quotation;
  ctx.project = (await post('projects', { name: '5 MT Cold Storage', companyId: ctx.fpo.id })).project;
  ctx.task = (await post(`projects/${ctx.project.id}/tasks`, { title: 'Commissioning test' })).task;
  ctx.types = (await request(app).get('/api/v1/document-types').set(admin())).body.data.items;
  ctx.statuses = (await request(app).get('/api/v1/document-statuses').set(admin())).body.data.items;
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
  fs.rmSync(UPLOADS, { recursive: true, force: true });
});

test('document types and statuses are lists an administrator manages, with starting values', async () => {
  assert.ok(ctx.types.some((t) => t.name === 'Quotation') && ctx.types.some((t) => t.name === 'Commissioning Report'));
  assert.deepEqual(ctx.statuses.map((x) => x.category), ['draft', 'final', 'archived']);
  assert.equal(ctx.statuses.find((x) => x.isDefault).name, 'Draft');
  const created = await post('document-types', { name: 'Flow Meter Specification' });
  assert.equal(created.item.name, 'Flow Meter Specification');
  assert.equal((await request(app).post('/api/v1/document-types').set(as(ctx.salesToken)).send({ name: 'Nope' })).status, 403);
});

test('a quotation PDF is attached to the quotation, knows its customer, and gets the default status', async () => {
  const quotationType = ctx.types.find((t) => t.name === 'Quotation');
  const res = await upload('quotation', ctx.quotation.id, [[PDF('v1'), 'Cold Storage Quotation.pdf', 'application/pdf']], { documentTypeId: quotationType.id });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const [doc] = res.body.data.documents;
  ctx.doc = doc;
  assert.equal(doc.version, 1);
  assert.equal(doc.versionCount, 1);
  assert.equal(doc.companyId, ctx.fpo.id);
  assert.equal(doc.relatedLabel, `${ctx.quotation.quotationNumber} · Maa Samaleswari FPO`);
  assert.equal(doc.documentType.name, 'Quotation');
  assert.equal(doc.status.name, 'Draft');
  assert.ok(!('versions' in doc) && !('searchKeys' in doc) && !('storageKey' in doc));
});

test('documents can belong to customers and to project tasks too', async () => {
  const onTask = await upload('task', ctx.task.id, [[PDF('report'), 'Commissioning Report.pdf', 'application/pdf']]);
  assert.equal(onTask.status, 201, JSON.stringify(onTask.body));
  assert.equal(onTask.body.data.documents[0].companyId, ctx.fpo.id, 'a task belongs to its project\'s company');
  assert.match(onTask.body.data.documents[0].relatedLabel, /^Task: Commissioning test · Maa Samaleswari FPO$/);
  const projectDoc = await upload('project', ctx.project.id, [[XLSX, 'BOQ.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']]);
  assert.equal(projectDoc.status, 201);
  // A CSV saved by Excel is reported by browsers as an Excel file; it is stored as what it is.
  const csv = await upload('company', ctx.other.id, [[CSV, 'price list.csv', 'application/vnd.ms-excel']]);
  assert.equal(csv.status, 201, JSON.stringify(csv.body));
  assert.equal(csv.body.data.documents[0].fileType, 'text/csv');
});

test('rename keeps the extension; type and status can be changed; a viewer cannot', async () => {
  const final = ctx.statuses.find((x) => x.category === 'final');
  let res = await request(app).patch(`${API}/${ctx.doc.id}`).set(as(ctx.salesToken)).send({ fileName: '5 MT Cold Storage Quotation', statusId: final.id });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.document.fileName, '5 MT Cold Storage Quotation.pdf');
  assert.equal(res.body.data.document.status.name, 'Final');
  res = await request(app).patch(`${API}/${ctx.doc.id}`).set(as(ctx.viewerToken)).send({ fileName: 'x' });
  assert.equal(res.status, 403);
  res = await request(app).patch(`${API}/${ctx.doc.id}`).set(admin()).send({ statusId: new mongoose.Types.ObjectId().toString() });
  assert.equal(res.status, 400);
});

test('saving an edited file makes a new version and keeps the old one; restoring is a new version too', async () => {
  let res = await newVersion(ctx.doc.id, PDF('v2 edited'), 'Cold Storage Quotation_v2.pdf', 'application/pdf', { note: 'Logo and signature added' }, ctx.salesToken);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.document.version, 2);
  assert.equal(res.body.data.document.fileName, 'Cold Storage Quotation_v2.pdf');
  assert.equal(res.body.data.document.versionCount, 2);

  const versions = (await request(app).get(`${API}/${ctx.doc.id}/versions`).set(as(ctx.viewerToken))).body.data.versions;
  assert.deepEqual(versions.map((v) => [v.version, v.current]), [[2, true], [1, false]]);
  assert.equal(versions[1].fileName, '5 MT Cold Storage Quotation.pdf');

  // Both versions can be downloaded.
  assert.match((await download(`${API}/${ctx.doc.id}/download`)).body.toString(), /v2 edited/);
  assert.match((await download(`${API}/${ctx.doc.id}/download?version=1`)).body.toString(), /% v1/);
  assert.equal((await download(`${API}/${ctx.doc.id}/download?version=9`)).status, 404);

  // Restoring needs documents.manageVersions - sales do not have it.
  assert.equal((await request(app).post(`${API}/${ctx.doc.id}/versions/1/restore`).set(as(ctx.salesToken))).status, 403);
  res = await request(app).post(`${API}/${ctx.doc.id}/versions/1/restore`).set(admin());
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.document.version, 3);
  assert.match((await download(`${API}/${ctx.doc.id}/download`)).body.toString(), /% v1/);
  const after = (await request(app).get(`${API}/${ctx.doc.id}/versions`).set(admin())).body.data.versions;
  assert.deepEqual(after.map((v) => v.version), [3, 2, 1], 'nothing was lost');

  // A new version must be a file the documents module accepts.
  res = await newVersion(ctx.doc.id, Buffer.from('MZ not a pdf'), 'evil.pdf', 'application/pdf');
  assert.equal(res.status, 415);
  assert.equal((await newVersion(ctx.doc.id, PDF('x'), 'x.pdf', 'application/pdf', {}, ctx.viewerToken)).status, 403);
});

test('search finds documents by customer and record; filters by kind, type, status, company and date', async () => {
  const list = async (query, token = ctx.adminToken) => {
    const res = await request(app).get(`${API}?${query}`).set(as(token));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    return res.body.data.documents.map((d) => d.fileName).sort();
  };
  // By the customer's name - although no file name contains it.
  assert.deepEqual(await list('search=Samaleswari'), ['BOQ.xlsx', 'Commissioning Report.pdf', '5 MT Cold Storage Quotation.pdf'].sort());
  assert.deepEqual(await list(`search=${ctx.quotation.quotationNumber}`), ['5 MT Cold Storage Quotation.pdf']);
  assert.deepEqual(await list('kind=excel'), ['BOQ.xlsx', 'price list.csv']);
  assert.deepEqual(await list('kind=pdf&search=commissioning'), ['Commissioning Report.pdf']);
  assert.deepEqual(await list(`companyId=${ctx.other.id}`), ['price list.csv']);
  assert.deepEqual(await list(`documentTypeId=${ctx.types.find((t) => t.name === 'Quotation').id}`), ['5 MT Cold Storage Quotation.pdf']);
  const today = new Date().toISOString().slice(0, 10);
  assert.equal((await list(`from=${today}&to=${today}`)).length, 4);
  assert.equal((await list('from=2001-01-01&to=2001-01-02')).length, 0);
  // Most recently changed first - what the dashboard shows.
  const recent = (await request(app).get(`${API}?sortBy=updatedAt&sortOrder=desc&limit=1`).set(admin())).body.data.documents;
  assert.equal(recent[0].id, ctx.doc.id);
  // A user only sees the documents of records they may read. The viewer reads
  // companies, quotations and projects (which covers their tasks), but not
  // customers: all four documents here are on those.
  assert.equal((await list('', ctx.viewerToken)).length, 4);
});

test('global search finds documents', async () => {
  const res = await request(app).get('/api/v1/search?q=Samaleswari').set(admin());
  assert.equal(res.status, 200);
  assert.ok(res.body.data.documents.length >= 3, JSON.stringify(res.body.data.documents));
  assert.equal(res.body.data.documents[0].type, 'document');
});

test('deleting a document removes every version\'s file', async () => {
  const before = fs.readdirSync(UPLOADS, { recursive: true }).filter((n) => fs.statSync(path.join(UPLOADS, n)).isFile()).length;
  const res = await request(app).delete(`${API}/${ctx.doc.id}`).set(admin());
  assert.equal(res.status, 200);
  const afterCount = fs.readdirSync(UPLOADS, { recursive: true }).filter((n) => fs.statSync(path.join(UPLOADS, n)).isFile()).length;
  // Versions 1 and 3 share a file (3 restored 1): two distinct files go.
  assert.equal(before - afterCount, 2);
});
