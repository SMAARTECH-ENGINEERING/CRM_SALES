import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

const UPLOADS = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-document-uploads-'));
setTestEnv('crm_test_documents', { STORAGE_DRIVER: 'local', UPLOAD_DIR: UPLOADS, UPLOAD_MAX_FILE_MB: '0.01', UPLOAD_MAX_FILES: '2' });

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Document } = await import('../src/models/Document.js');
const { default: User } = await import('../src/models/User.js');
const s = await import('../src/services/seed.service.js');
const { s3Driver, setStorageDriver } = await import('../src/services/storage.service.js');
const { createRole, createUser, defaultRole, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const API = '/api/v1/documents';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const missing = () => new mongoose.Types.ObjectId().toString();
const post = async (p, body) => (await request(app).post(`/api/v1/${p}`).set(admin()).send(body)).body.data;
const filesOnDisk = () => fs.readdirSync(UPLOADS, { recursive: true }).filter((name) => fs.statSync(path.join(UPLOADS, name)).isFile());
// One upload request: `files` is [[buffer, name, type], ...].
function upload(entity, files, token = ctx.adminToken, field = 'files') {
  let req = request(app).post(API).set(as(token));
  for (const [key, value] of Object.entries(entity)) req = req.field(key, value);
  for (const [buffer, filename, contentType] of files) req = req.attach(field, buffer, { filename, contentType });
  return req;
}
// supertest buffers a binary body only when told how.
const download = (id, token = ctx.adminToken) =>
  request(app)
    .get(`${API}/${id}/download`)
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
  await Promise.all([User.init(), Document.init()]);
  await seedRbac();
  await s.seedLeadConfig();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.plain = await createUser(await defaultRole());
  // Works with companies: uploads and reads their documents, deletes only their own.
  ctx.sales = await createUser(await createRole(['documents.read', 'documents.create', 'companies.read'], 'Sales'), { firstName: 'Sam', lastName: 'Sales' });
  ctx.viewer = await createUser(await createRole(['documents.read', 'companies.read'], 'Viewer'));
  // Has every documents permission but may not see companies - only contacts.
  ctx.contactsOnly = await createUser(await createRole(['documents.read', 'documents.create', 'documents.delete', 'contacts.read'], 'Contacts Only'));
  ctx.manager = await createUser(await createRole(['documents.read', 'documents.delete', 'companies.read'], 'Manager'));
  for (const who of ['admin', 'plain', 'sales', 'viewer', 'contactsOnly', 'manager']) ctx[`${who}Token`] = await loginAs(app, ctx[who]);

  ctx.acme = (await post('companies', { name: 'Acme Industries' })).company;
  ctx.priya = (await post('contacts', { firstName: 'Priya', lastName: 'Nair', companyId: ctx.acme.id })).contact;
  ctx.company = { entityType: 'company', entityId: ctx.acme.id };
  ctx.contact = { entityType: 'contact', entityId: ctx.priya.id };
});

after(async () => {
  setStorageDriver();
  await mongoose.connection.dropDatabase();
  await disconnectDB();
  fs.rmSync(UPLOADS, { recursive: true, force: true });
});

test('every permission key used by the routes exists in the database', async () => {
  assert.deepEqual(await s.verifyDeclaredPermissions(), []);
});

test('every document endpoint needs a token (401) and a permission (403)', async () => {
  const id = missing();
  const calls = (headers) => [
    request(app).get(API).set(headers),
    request(app).get(`${API}/config`).set(headers),
    request(app).post(API).set(headers).send({}),
    request(app).get(`${API}/${id}`).set(headers),
    request(app).get(`${API}/${id}/download`).set(headers),
    request(app).delete(`${API}/${id}`).set(headers),
  ];
  for (const res of await Promise.all(calls({}))) assert.equal(res.status, 401, res.req.path);
  for (const res of await Promise.all(calls(as(ctx.plainToken)))) assert.equal(res.status, 403, res.req.path);
  assert.deepEqual((await Promise.all(calls(as(ctx.viewerToken)))).map((res) => res.status), [200, 200, 403, 404, 404, 403]);
});

test('config: the upload rules and the kinds of record this user can attach to', async () => {
  const { data } = (await request(app).get(`${API}/config`).set(as(ctx.salesToken))).body;
  assert.equal(data.field, 'files');
  assert.equal(data.maxFiles, 2);
  assert.equal(data.maxFileBytes, Math.round(0.01 * 1024 * 1024));
  assert.ok(data.allowedTypes.includes('application/pdf'));
  assert.deepEqual(data.entityTypes, ['company']);
  const all = (await request(app).get(`${API}/config`).set(admin())).body.data.entityTypes;
  assert.deepEqual(all, ['company', 'contact', 'lead', 'opportunity', 'quotation', 'order', 'project', 'ticket', 'contract', 'payment']);
});

test('upload: the file goes to storage, only its details to the database', async () => {
  const res = await upload(ctx.company, [[PDF, 'Contract draft.pdf', 'application/pdf'], [PNG, 'site photo.png', 'image/png']], ctx.salesToken);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const [pdf, png] = res.body.data.documents;
  ctx.pdf = pdf;
  ctx.png = png;
  assert.deepEqual(
    [pdf.fileName, pdf.fileType, pdf.fileSize, pdf.entityType, pdf.entityId],
    ['Contract draft.pdf', 'application/pdf', PDF.length, 'company', ctx.acme.id]
  );
  assert.equal(pdf.fileUrl, `/api/v1/documents/${pdf.id}/download`);
  assert.equal(pdf.uploadedByUser.fullName, 'Sam Sales');
  assert.deepEqual(pdf.entity, { type: 'company', id: ctx.acme.id, label: 'Acme Industries' });
  assert.ok(pdf.createdAt);
  assert.equal(pdf.storageKey, undefined, 'where it is stored is never sent');

  // On disk under a random name; in MongoDB there is no file content at all.
  const stored = filesOnDisk();
  assert.equal(stored.length, 2);
  assert.ok(stored.every((name) => !/Contract|photo/.test(name)));
  const raw = await Document.collection.findOne({ _id: new mongoose.Types.ObjectId(pdf.id) });
  assert.deepEqual(
    Object.keys(raw).sort(),
    ['__v', '_id', 'createdAt', 'entityId', 'entityType', 'fileName', 'fileSize', 'fileType', 'storageDriver', 'storageKey', 'uploadedBy']
  );
  assert.match(raw.storageKey, new RegExp(`^documents/company/${ctx.acme.id}/[0-9a-f-]{36}\\.pdf$`));

  // It shows on the company: its Documents section and its timeline.
  const sections = (await request(app).get(`/api/v1/companies/${ctx.acme.id}/sections`).set(admin())).body.data.sections;
  assert.deepEqual(sections.find((x) => x.key === 'documents'), { key: 'documents', label: 'Documents', available: true, count: 2 });
  const [event] = (await request(app).get(`/api/v1/companies/${ctx.acme.id}/timeline`).set(admin())).body.data.events;
  assert.equal(event.summary, 'Document uploaded: Contract draft.pdf, site photo.png');
});

test('upload: file type, content, size and count are validated; a refused request stores nothing', async () => {
  const before = filesOnDisk().length;
  const big = Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(20 * 1024, 65)]);
  const cases = [
    ['no file', upload(ctx.company, []), 400, 'files'],
    ['wrong field', upload(ctx.company, [[PDF, 'a.pdf', 'application/pdf']], ctx.adminToken, 'attachments'), 400, 'attachments'],
    ['type not allowed', upload(ctx.company, [[Buffer.from('MZ'), 'tool.bin', 'application/octet-stream']]), 415, 'files'],
    ['content is not what the type says', upload(ctx.company, [[Buffer.from('<script>alert(1)</script>'), 'photo.png', 'image/png']]), 415, 'files'],
    ['binary sent as text', upload(ctx.company, [[Buffer.from([0x4d, 0x5a, 0, 0, 3]), 'notes.txt', 'text/plain']]), 415, 'files'],
    ['a page sent as text', upload(ctx.company, [[Buffer.from('<html></html>'), 'page.html', 'text/plain']]), 415, 'files'],
    ['empty', upload(ctx.company, [[Buffer.alloc(0), 'empty.pdf', 'application/pdf']]), 400, 'files'],
    ['too large', upload(ctx.company, [[big, 'big.pdf', 'application/pdf']]), 413, 'files'],
    ['too many', upload(ctx.company, [[PDF, 'a.pdf', 'application/pdf'], [PDF, 'b.pdf', 'application/pdf'], [PDF, 'c.pdf', 'application/pdf']]), 400, 'files'],
    // One bad file refuses the whole request, including the good one.
    ['one of two is bad', upload(ctx.company, [[PDF, 'ok.pdf', 'application/pdf'], [Buffer.from('nope'), 'bad.pdf', 'application/pdf']]), 415, 'files'],
    ['unknown record', upload({ entityType: 'company', entityId: missing() }, [[PDF, 'a.pdf', 'application/pdf']]), 400, 'entityId'],
    ['unknown kind', upload({ entityType: 'invoice', entityId: ctx.acme.id }, [[PDF, 'a.pdf', 'application/pdf']]), 422, 'entityType'],
    ['no record given', upload({ entityType: 'company' }, [[PDF, 'a.pdf', 'application/pdf']]), 422, 'entityId'],
    ['details cannot be sent', upload({ ...ctx.company, fileSize: '1' }, [[PDF, 'a.pdf', 'application/pdf']]), 422, 'fileSize'],
  ];
  for (const [name, call, status, field] of cases) {
    const res = await call;
    assert.equal(res.status, status, `${name}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.errors[0].field, field, name);
  }
  assert.equal(filesOnDisk().length, before, 'nothing was stored');
  assert.equal(await Document.countDocuments(), 2);
});

test('authorization: documents follow the record they belong to', async () => {
  // Upload needs documents.create AND access to the record.
  assert.equal((await upload(ctx.company, [[PDF, 'a.pdf', 'application/pdf']], ctx.viewerToken)).status, 403, 'no documents.create');
  let res = await upload(ctx.company, [[PDF, 'a.pdf', 'application/pdf']], ctx.contactsOnlyToken);
  assert.equal(res.status, 403, 'every documents permission, but not companies.read');
  assert.match(res.body.message, /do not have access to the record/);
  res = await upload(ctx.contact, [[PDF, 'Visiting card.pdf', 'application/pdf']], ctx.contactsOnlyToken);
  assert.equal(res.status, 201);
  ctx.card = res.body.data.documents[0];
  assert.equal((await upload(ctx.contact, [[PDF, 'a.pdf', 'application/pdf']], ctx.salesToken)).status, 403, 'sales cannot see contacts');

  // Reading and downloading: the same rule.
  for (const url of [`${API}/${ctx.pdf.id}`, `${API}/${ctx.pdf.id}/download`, `${API}?entityType=company&entityId=${ctx.acme.id}`]) {
    assert.equal((await request(app).get(url).set(as(ctx.contactsOnlyToken))).status, 403, url);
    assert.equal((await request(app).get(url).set(as(ctx.viewerToken))).status, 200, url);
  }
  assert.equal((await request(app).delete(`${API}/${ctx.pdf.id}`).set(as(ctx.contactsOnlyToken))).status, 403, 'documents.delete is not enough either');

  // The list across everything shows only what each user may see.
  const names = async (token, query = '') =>
    (await request(app).get(`${API}?sortBy=fileName&sortOrder=asc${query}`).set(as(token))).body.data.documents.map((d) => d.fileName);
  assert.deepEqual(await names(ctx.adminToken), ['Contract draft.pdf', 'site photo.png', 'Visiting card.pdf']);
  assert.deepEqual(await names(ctx.salesToken), ['Contract draft.pdf', 'site photo.png']);
  assert.deepEqual(await names(ctx.contactsOnlyToken), ['Visiting card.pdf']);
  assert.deepEqual(await names(ctx.adminToken, '&search=photo'), ['site photo.png']);
  assert.deepEqual(await names(ctx.adminToken, `&uploadedBy=${ctx.sales.id}`), ['Contract draft.pdf', 'site photo.png']);
  assert.equal((await request(app).get(`${API}?entityId=${ctx.acme.id}`).set(admin())).status, 422, 'entityId needs entityType');
});

test('get and download: the details, then the bytes with a safe download response', async () => {
  let res = await request(app).get(`${API}/${ctx.png.id}`).set(as(ctx.viewerToken));
  assert.equal(res.status, 200);
  assert.equal(res.body.data.document.fileName, 'site photo.png');

  res = await download(ctx.png.id, ctx.viewerToken);
  assert.equal(res.status, 200);
  assert.ok(res.body.equals(PNG), 'byte for byte');
  assert.match(res.headers['content-type'], /image\/png/);
  assert.match(res.headers['content-disposition'], /^attachment; filename="site photo\.png"/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['content-length'], String(PNG.length));
  assert.equal((await request(app).get(`${API}/not-an-id`).set(admin())).status, 422);
});

test('delete: your own uploads, or any with documents.delete; the file leaves storage too', async () => {
  // The viewer cannot; sales can delete what sales uploaded.
  assert.equal((await request(app).delete(`${API}/${ctx.png.id}`).set(as(ctx.viewerToken))).status, 403);
  assert.equal(filesOnDisk().length, 3);
  assert.equal((await request(app).delete(`${API}/${ctx.png.id}`).set(as(ctx.salesToken))).status, 200);
  assert.equal(filesOnDisk().length, 2);
  assert.equal((await request(app).get(`${API}/${ctx.png.id}`).set(admin())).status, 404);

  // Someone else's: only with documents.delete.
  const other = (await upload(ctx.company, [[PDF, 'From admin.pdf', 'application/pdf']])).body.data.documents[0];
  const res = await request(app).delete(`${API}/${other.id}`).set(as(ctx.salesToken));
  assert.equal(res.status, 403);
  assert.match(res.body.message, /only delete documents you uploaded/);
  assert.equal((await request(app).delete(`${API}/${other.id}`).set(as(ctx.managerToken))).status, 200);

  // A record whose file is gone from storage answers 404 on download, not 500.
  fs.rmSync(UPLOADS, { recursive: true, force: true });
  fs.mkdirSync(UPLOADS);
  assert.equal((await download(ctx.pdf.id)).status, 404);
});

test('object storage: the same API on the S3 driver', async () => {
  // A stand-in for the S3 client that records what it is sent.
  const bucket = new Map();
  const sent = [];
  class Command {
    constructor(input) {
      this.input = input;
    }
  }
  class PutObjectCommand extends Command {}
  class GetObjectCommand extends Command {}
  class DeleteObjectCommand extends Command {}
  const client = {
    async send(command) {
      sent.push([command.constructor.name, command.input.Bucket, command.input.Key]);
      const { Key, Body } = command.input;
      if (command instanceof PutObjectCommand) return bucket.set(Key, { Body, ContentType: command.input.ContentType });
      if (command instanceof DeleteObjectCommand) return bucket.delete(Key);
      if (!bucket.has(Key)) throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
      return { Body: Readable.from(bucket.get(Key).Body) };
    },
  };
  setStorageDriver(s3Driver({ bucket: 'crm-files', keyPrefix: 'crm/test/' }, { client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand }));

  const before = filesOnDisk().length;
  let res = await upload(ctx.company, [[PDF, 'In the bucket.pdf', 'application/pdf']]);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const [document] = res.body.data.documents;
  assert.equal(filesOnDisk().length, before, 'nothing on the local disk');
  const [key] = [...bucket.keys()];
  assert.match(key, new RegExp(`^crm/test/documents/company/${ctx.acme.id}/[0-9a-f-]{36}\\.pdf$`));
  assert.equal(bucket.get(key).ContentType, 'application/pdf');
  assert.equal((await Document.findById(document.id)).storageDriver, 's3');

  res = await download(document.id);
  assert.equal(res.status, 200);
  assert.ok(res.body.equals(PDF));

  assert.equal((await request(app).delete(`${API}/${document.id}`).set(admin())).status, 200);
  assert.equal(bucket.size, 0, 'removed from the bucket');
  assert.deepEqual(sent.map(([name, name2]) => [name, name2]), [
    ['PutObjectCommand', 'crm-files'],
    ['GetObjectCommand', 'crm-files'],
    ['DeleteObjectCommand', 'crm-files'],
  ]);

  // A refused upload reaches the bucket not at all.
  sent.length = 0;
  assert.equal((await upload(ctx.company, [[Buffer.from('nope'), 'bad.pdf', 'application/pdf']])).status, 415);
  assert.equal(sent.length, 0);
  setStorageDriver();
});
