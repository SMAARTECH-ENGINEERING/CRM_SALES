import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import { readSheet } from 'read-excel-file/node';
import request from 'supertest';
import writeExcelFile from 'write-excel-file/node';
import { setTestEnv } from './helpers/env.js';

setTestEnv('crm_test_contact_import');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: User } = await import('../src/models/User.js');
const { default: Company } = await import('../src/models/Company.js');
const { default: Contact } = await import('../src/models/Contact.js');
const { createRole, createUser, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const HEADERS = ['Company name *', 'Company email', 'Company phone', 'City', 'GST number', 'First name *', 'Last name *', 'Designation', 'Email', 'Mobile', 'Met at (event)', 'Interested in', 'Notes'];

// A workbook like one filled in after an expo: rows of [company..., person...].
async function workbook(rows, headers = HEADERS) {
  const cell = (value) => (value === '' || value === undefined ? null : typeof value === 'number' ? { value, type: Number } : { value: String(value), type: String });
  return writeExcelFile([headers.map((h) => ({ value: h })), ...rows.map((row) => row.map(cell))], { sheet: 'Contacts' }).toBuffer();
}
const upload = (buffer, { dryRun = false, name = 'cards.xlsx', token = ctx.adminToken } = {}) =>
  request(app).post(`/api/v1/imports/contacts${dryRun ? '?dryRun=true' : ''}`).set(as(token)).attach('file', buffer, name);

const ROWS = [
  //  company,                    company email,                  phone,          city,      GST,  first,     last,       designation,   email,                                mobile,         event,                   interest,       notes
  ['Maa Tarini FPO', 'office@maatarini.example.com', '+91 674 255 0101', 'Cuttack', '', 'Ramesh', 'Behera', 'Director', 'ramesh@maatarini.example.com', 9861012345, 'Krushi Odisha Expo 2026', 'Cold Storage', 'Wants 5 MT before harvest'],
  // Same new company again: created once.
  ['maa tarini fpo', '', '', '', '', 'Sujata', 'Nayak', 'Accounts', 'sujata@maatarini.example.com', '', 'Krushi Odisha Expo 2026', '', ''],
  // A company already in the CRM: the person is added to it.
  ['Hirakud Growers Cooperative', '', '', '', '', 'Bikash', 'Sahu', '', 'bikash@hirakud.example.com', '', '', 'Water Monitoring', ''],
  // Already a contact there: skipped.
  ['Hirakud Growers Cooperative', '', '', '', '', 'Anita', 'Mishra', '', 'anita@hirakud.example.com', '', '', '', ''],
  // Problems: no last name; a phone that is not a phone.
  ['Kalinga Agro', '', 'call me', '', '', 'Prakash', '', '', '', '', '', '', ''],
  // An empty row is ignored.
  ['', '', '', '', '', '', '', '', '', '', '', '', ''],
  // The same person twice in the file.
  ['Maa Tarini FPO', '', '', '', '', 'Ramesh', 'Behera', '', 'RAMESH@maatarini.example.com', '', '', '', ''],
];

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await User.init();
  await seedRbac();
  ctx.admin = await createUser(await superAdminRole());
  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.contactsOnly = await createUser(await createRole(['contacts.create', 'contacts.read'], 'Contacts only'));
  ctx.contactsOnlyToken = await loginAs(app, ctx.contactsOnly);
  const hirakud = await request(app).post('/api/v1/companies').set(as(ctx.adminToken)).send({ name: 'Hirakud Growers Cooperative' });
  ctx.hirakud = hirakud.body.data.company;
  await request(app).post('/api/v1/contacts').set(as(ctx.adminToken)).send({ firstName: 'Anita', lastName: 'Mishra', email: 'anita@hirakud.example.com', companyId: ctx.hirakud.id });
  ctx.file = await workbook(ROWS);
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('the template downloads as an Excel file with the columns to fill in', async () => {
  const res = await request(app).get('/api/v1/imports/contacts/template').set(as(ctx.adminToken)).buffer(true).parse((r, cb) => {
    const chunks = [];
    r.on('data', (c) => chunks.push(c));
    r.on('end', () => cb(null, Buffer.concat(chunks)));
  });
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /spreadsheetml/);
  assert.match(res.headers['content-disposition'], /contacts-import-template\.xlsx/);
  const [header, ...rest] = await readSheet(res.body, 'Contacts');
  assert.ok(header.includes('Company name *') && header.includes('First name *') && header.includes('Met at (event)'), header.join('|'));
  assert.equal(rest.length, 0, 'the sheet to fill in starts empty');
  // The filled-in example is on a sheet of its own, so it is never imported.
  const example = await readSheet(res.body, 'Example');
  assert.equal(example.length, 2);
});

test('the preview says what would happen to each row - and changes nothing', async () => {
  const before = { companies: await Company.countDocuments(), contacts: await Contact.countDocuments() };
  const res = await upload(ctx.file, { dryRun: true });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const { rows, summary, dryRun } = res.body.data;
  assert.equal(dryRun, true);
  assert.deepEqual(summary, { rows: 6, companiesNew: 1, companiesExisting: 1, contactsNew: 3, contactsExisting: 1, rowsWithProblems: 2 });
  assert.deepEqual(rows.map((r) => [r.rowNumber, r.companyAction, r.contactAction]), [
    [2, 'new', 'new'],
    [3, 'new', 'new'],
    [4, 'existing', 'new'],
    [5, 'existing', 'existing'],
    [6, 'none', 'none'],
    [8, 'new', 'existing'],
  ]);
  const problems = rows.find((r) => r.rowNumber === 6).problems.join(' | ');
  assert.match(problems, /Last name/);
  assert.match(problems, /Company phone/);
  assert.match(rows.find((r) => r.rowNumber === 8).problems[0], /earlier row/);
  assert.deepEqual({ companies: await Company.countDocuments(), contacts: await Contact.countDocuments() }, before);
});

test('the import creates the companies once and the contacts under them, with the expo details in the notes', async () => {
  const res = await upload(ctx.file);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.summary.contactsNew, 3);
  const tarini = await Company.find({ name: /maa tarini/i });
  assert.equal(tarini.length, 1, 'one company for both rows');
  assert.match(tarini[0].companyCode, /-\d{6}$/);
  assert.equal(tarini[0].email, 'office@maatarini.example.com');
  const people = await Contact.find({ companyId: tarini[0]._id }).sort({ firstName: 1 });
  assert.deepEqual(people.map((p) => p.firstName), ['Ramesh', 'Sujata']);
  // A mobile number Excel stored as a number comes through in full.
  assert.equal(people[0].phone, '9861012345');
  assert.equal(people[0].notes, 'Met at: Krushi Odisha Expo 2026\nInterested in: Cold Storage\nWants 5 MT before harvest');
  assert.equal(await Contact.countDocuments({ companyId: ctx.hirakud.id }), 2);
  assert.equal(await Company.countDocuments({ name: 'Kalinga Agro' }), 0, 'a row with problems creates nothing');
});

test('importing the same file again adds nothing', async () => {
  const res = await upload(ctx.file);
  assert.deepEqual(res.body.data.summary, { rows: 6, companiesNew: 0, companiesExisting: 2, contactsNew: 0, contactsExisting: 4, rowsWithProblems: 2 });
});

test('columns are found by their heading, in any order', async () => {
  const file = await workbook([['Ganjam', 'Seafood Exports', 'Lata', 'Das']], ['City', 'Company name', 'First name', 'Last name']);
  const res = await upload(file);
  assert.equal(res.body.data.summary.contactsNew, 1);
  assert.equal((await Company.findOne({ name: 'Seafood Exports' })).city, 'Ganjam');
});

test('refuses what it cannot use, and needs both permissions', async () => {
  assert.equal((await upload(Buffer.from('name,email'), { name: 'cards.csv' })).status, 400);
  assert.equal((await upload(Buffer.from('not really excel'), { name: 'cards.xlsx' })).status, 400);
  const noColumns = await upload(await workbook([['x']], ['Whatever']));
  assert.equal(noColumns.status, 400);
  assert.match(JSON.stringify(noColumns.body.errors), /Company name/);
  assert.equal((await upload(await workbook([]))).status, 400);
  assert.equal((await upload(ctx.file, { token: ctx.contactsOnlyToken })).status, 403);
  assert.equal((await request(app).get('/api/v1/imports/contacts/template')).status, 401);
});
