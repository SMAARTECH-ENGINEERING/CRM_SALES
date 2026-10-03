import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import { setTestEnv } from './helpers/env.js';

// Default match configuration: company by gstNumber, email, name; contact by email, phone.
setTestEnv('crm_test_lead_conversion');

const { default: app } = await import('../src/app.js');
const { connectDB, disconnectDB } = await import('../src/config/db.js');
const { default: Company } = await import('../src/models/Company.js');
const { default: Contact } = await import('../src/models/Contact.js');
const { default: Lead } = await import('../src/models/Lead.js');
const { default: LeadStatus } = await import('../src/models/LeadStatus.js');
const { default: Opportunity } = await import('../src/models/Opportunity.js');
const { default: User } = await import('../src/models/User.js');
const { seedLeadConfig, seedPipelines } = await import('../src/services/seed.service.js');
const { createRole, createUser, loginAs, seedRbac, superAdminRole } = await import('./helpers/fixtures.js');

const API = '/api/v1/leads';
const GST = '27ABCDE1234F1Z5';

const ctx = {};
const as = (token) => ({ Authorization: `Bearer ${token}` });
const admin = () => as(ctx.adminToken);
const post = async (path, body) => (await request(app).post(`/api/v1/${path}`).set(admin()).send(body)).body.data;
const newLead = async (body) => (await post('leads', { title: 'Lead', ...body })).lead;
const convert = (leadId, body = {}, token = ctx.adminToken) =>
  request(app).post(`${API}/${leadId}/convert`).set(as(token)).send(body);
const counts = async () => ({
  companies: await Company.countDocuments(),
  contacts: await Contact.countDocuments(),
  opportunities: await Opportunity.countDocuments(),
});
const getLead = async (id) => (await request(app).get(`${API}/${id}`).set(admin())).body.data.lead;

before(async () => {
  await connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all([User.init(), Company.init(), Contact.init(), Lead.init(), Opportunity.init()]);
  await seedRbac();
  await seedLeadConfig();
  await seedPipelines();

  ctx.admin = await createUser(await superAdminRole(), { firstName: 'Ada', lastName: 'Admin' });
  ctx.rep = await createUser(await createRole(['leads.read', 'leads.create', 'leads.update'], 'Sales Rep'), {
    firstName: 'Riya',
    lastName: 'Rep',
  });
  ctx.adminToken = await loginAs(app, ctx.admin);
  ctx.repToken = await loginAs(app, ctx.rep);

  ctx.org = (await post('organizations', { name: 'Head Office' })).item;
  ctx.acme = (
    await post('companies', { name: 'Acme Industries', gstNumber: GST, email: 'info@acme.example', phone: '+91 20 5550 1000' })
  ).company;
  ctx.bolt = (await post('companies', { name: 'Bolt Traders', email: 'sales@bolt.example' })).company;
  ctx.priya = (
    await post('contacts', {
      firstName: 'Priya',
      lastName: 'Nair',
      companyId: ctx.acme.id,
      email: 'priya@acme.example',
      phone: '+91 98765 43210',
    })
  ).contact;

  const statuses = (await request(app).get('/api/v1/lead-statuses').set(admin())).body.data.items;
  ctx.status = Object.fromEntries(statuses.map((s) => [s.name, s]));
});

after(async () => {
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

// --- access and preconditions ------------------------------------------------------

test('converting needs leads.convert', async () => {
  const lead = await newLead({ companyId: ctx.acme.id });
  const res = await convert(lead.id, {}, ctx.repToken);

  assert.equal(res.status, 403);
  assert.equal((await getLead(lead.id)).isConverted, false);
  ctx.reusable = lead;
});

test('a company is required, and details are refused where the lead already has a record', async () => {
  const none = await newLead({});
  const before = await counts();

  const noCompany = await convert(none.id, {});
  assert.equal(noCompany.status, 422);
  assert.equal(noCompany.body.errors[0].field, 'company');

  const hasCompany = await newLead({ companyId: ctx.acme.id, contactId: ctx.priya.id });
  const companyAgain = await convert(hasCompany.id, { company: { name: 'Something Else' } });
  const contactAgain = await convert(hasCompany.id, { contact: { firstName: 'Some', lastName: 'One' } });
  assert.equal(companyAgain.status, 422);
  assert.equal(companyAgain.body.errors[0].field, 'company');
  assert.equal(contactAgain.status, 422);
  assert.equal(contactAgain.body.errors[0].field, 'contact');

  const invalid = {
    'company without a name': { company: { email: 'x@example.com' } },
    'company with a bad GST number': { company: { name: 'Bad Co', gstNumber: '123' } },
    'company choosing its own code': { company: { name: 'Bad Co', companyCode: 'COMP-999999' } },
    'contact without a last name': { company: { name: 'Good Co' }, contact: { firstName: 'Only' } },
    'contact with a bad email': { company: { name: 'Good Co' }, contact: { firstName: 'A', lastName: 'B', email: 'nope' } },
    'contact naming a company': { company: { name: 'Good Co' }, contact: { firstName: 'A', lastName: 'B', companyId: ctx.acme.id } },
    'negative opportunity value': { company: { name: 'Good Co' }, opportunity: { estimatedValue: -5 } },
    'malformed status': { company: { name: 'Good Co' }, statusId: 'nope' },
  };
  for (const [label, body] of Object.entries(invalid)) {
    assert.equal((await convert(none.id, body)).status, 422, label);
  }

  assert.deepEqual(await counts(), before, 'nothing was created by any rejected request');
  assert.equal((await getLead(none.id)).isConverted, false);
  assert.equal((await convert(new mongoose.Types.ObjectId(), {})).status, 404);
  assert.equal((await convert('nope', {})).status, 422);
});

// --- lead already linked ---------------------------------------------------------------

test('a lead that already has a company and contact links them and creates only the opportunity', async () => {
  const lead = await newLead({
    title: 'ERP rollout',
    companyId: ctx.acme.id,
    contactId: ctx.priya.id,
    estimatedValue: 250000,
    expectedCloseDate: '2027-03-31',
    assignedTo: ctx.rep.id,
    organizationId: ctx.org.id,
  });
  const before = await counts();

  const res = await convert(lead.id);
  assert.equal(res.status, 201);
  const { company, contact, opportunity, lead: converted } = res.body.data;

  assert.deepEqual(await counts(), { ...before, opportunities: before.opportunities + 1 });
  assert.equal(company.action, 'linked');
  assert.equal(company.record.id, ctx.acme.id);
  assert.equal(contact.action, 'linked');
  assert.equal(contact.record.id, ctx.priya.id);

  assert.equal(opportunity.opportunityNumber, 'OPP-000001');
  assert.equal(opportunity.name, 'ERP rollout');
  assert.equal(opportunity.companyId, ctx.acme.id);
  assert.equal(opportunity.contactId, ctx.priya.id);
  assert.equal(opportunity.leadId, lead.id);
  assert.equal(opportunity.estimatedValue, 250000);
  assert.equal(opportunity.expectedCloseDate.slice(0, 10), '2027-03-31');
  assert.equal(opportunity.assignedTo, ctx.rep.id);
  assert.equal(opportunity.organizationId, ctx.org.id);
  assert.equal(opportunity.status, 'open');
  assert.equal(opportunity.createdBy, ctx.admin.id);

  assert.equal(converted.isConverted, true);
  assert.ok(converted.convertedAt);
  assert.equal(converted.convertedByUser.fullName, 'Ada Admin');
  assert.equal(converted.opportunity.opportunityNumber, 'OPP-000001');
  assert.equal(converted.status.name, 'Won', 'moves to the first active "won" status');
  ctx.converted = converted;
});

test('a lead converts once', async () => {
  const before = await counts();
  const again = await convert(ctx.converted.id);

  assert.equal(again.status, 409);
  assert.match(again.body.message, /already been converted/);
  assert.deepEqual(await counts(), before);
  assert.equal(await Opportunity.countDocuments({ leadId: ctx.converted.id }), 1);
});

// --- creating new records ----------------------------------------------------------------

test('with no existing match, the company and contact are created and linked', async () => {
  const lead = await newLead({ title: 'New customer', assignedTo: ctx.rep.id, organizationId: ctx.org.id });
  const before = await counts();

  const res = await convert(lead.id, {
    company: { name: 'Cedar Systems', email: 'hello@cedar.example', city: 'Pune' },
    contact: { firstName: 'Omar', lastName: 'Khan', email: 'omar@cedar.example', preferredContactMethod: 'email' },
  });
  assert.equal(res.status, 201);
  const { company, contact, opportunity, lead: converted } = res.body.data;

  assert.deepEqual(await counts(), {
    companies: before.companies + 1,
    contacts: before.contacts + 1,
    opportunities: before.opportunities + 1,
  });
  assert.equal(company.action, 'created');
  assert.equal('matchedBy' in company, false);
  assert.match(company.record.companyCode, /^COMP-\d{6}$/);
  assert.equal(contact.action, 'created');

  const stored = await Company.findById(company.record.id);
  assert.equal(stored.name, 'Cedar Systems');
  assert.equal(stored.city, 'Pune');
  assert.equal(String(stored.assignedTo), ctx.rep.id, "inherits the lead's owner");
  assert.equal(String(stored.organizationId), ctx.org.id, "inherits the lead's organization");

  const person = await Contact.findById(contact.record.id);
  assert.equal(String(person.companyId), company.record.id, 'the contact belongs to the new company');

  assert.equal(converted.companyId, company.record.id);
  assert.equal(converted.contactId, contact.record.id);
  assert.equal(opportunity.companyId, company.record.id);
  assert.equal(opportunity.contactId, contact.record.id);
  ctx.cedar = company.record;
});

test('a contact is optional', async () => {
  const lead = await newLead({});
  const res = await convert(lead.id, { company: { name: 'Dune Logistics' } });

  assert.equal(res.status, 201);
  assert.equal(res.body.data.contact, null);
  assert.equal('contactId' in res.body.data.opportunity, false);
  assert.equal('contactId' in res.body.data.lead, false);
});

// --- duplicate prevention: companies -------------------------------------------------------

test('company: an existing record is linked instead of creating a duplicate', async () => {
  const cases = [
    ['GST number, even under a different name', { name: 'Acme Inds Pvt Ltd', gstNumber: GST.toLowerCase() }, 'gstNumber', ctx.acme.id],
    ['email, regardless of case', { name: 'A Different Name', email: 'INFO@Acme.example' }, 'email', ctx.acme.id],
    ['name, regardless of case and spacing', { name: '  bolt traders ' }, 'name', ctx.bolt.id],
    ['a company created by an earlier conversion', { name: 'CEDAR SYSTEMS' }, 'name', ctx.cedar.id],
  ];

  for (const [label, company, matchedBy, expectedId] of cases) {
    const lead = await newLead({});
    const before = await counts();
    const res = await convert(lead.id, { company });

    assert.equal(res.status, 201, label);
    assert.equal(res.body.data.company.action, 'matched', label);
    assert.equal(res.body.data.company.matchedBy, matchedBy, label);
    assert.equal(res.body.data.company.record.id, expectedId, label);
    assert.equal((await counts()).companies, before.companies, `${label}: no company created`);
    assert.equal(res.body.data.opportunity.companyId, expectedId, label);
  }

  // The existing record is linked as it is - never overwritten with the details sent.
  const acme = await Company.findById(ctx.acme.id);
  assert.equal(acme.name, 'Acme Industries');
  assert.equal(acme.email, 'info@acme.example');
});

test('company: fields are tried in the configured order, and blank never matches blank', async () => {
  // GST number points at Acme, name at Bolt: GST number comes first.
  const first = await newLead({});
  const res = await convert(first.id, { company: { name: 'Bolt Traders', gstNumber: GST } });
  assert.equal(res.body.data.company.matchedBy, 'gstNumber');
  assert.equal(res.body.data.company.record.id, ctx.acme.id);

  // Bolt has no GST number or phone; a new company without them must not match it.
  const second = await newLead({});
  const before = await counts();
  const fresh = await convert(second.id, { company: { name: 'Echo Foods' } });
  assert.equal(fresh.body.data.company.action, 'created');
  assert.equal((await counts()).companies, before.companies + 1);

  // Phone is not a configured match field, so sharing one does not match.
  const third = await newLead({});
  const samePhone = await convert(third.id, { company: { name: 'Fig Retail', phone: '+91 20 5550 1000' } });
  assert.equal(samePhone.body.data.company.action, 'created');
});

test('company: a deleted company is not matched', async () => {
  const gone = (await post('companies', { name: 'Gone Corp' })).company;
  await request(app).delete(`/api/v1/companies/${gone.id}`).set(admin());

  const lead = await newLead({});
  const res = await convert(lead.id, { company: { name: 'Gone Corp' } });
  assert.equal(res.body.data.company.action, 'created');
  assert.notEqual(res.body.data.company.record.id, gone.id);
});

// --- duplicate prevention: contacts --------------------------------------------------------

test('contact: an existing contact of that company is linked instead of creating a duplicate', async () => {
  const cases = [
    ['email, regardless of case', { firstName: 'P', lastName: 'N', email: 'PRIYA@acme.example' }, 'email'],
    ['phone', { firstName: 'Priya', lastName: 'N', phone: '+91 98765 43210' }, 'phone'],
  ];
  for (const [label, contact, matchedBy] of cases) {
    const lead = await newLead({ companyId: ctx.acme.id });
    const before = await counts();
    const res = await convert(lead.id, { contact });

    assert.equal(res.status, 201, label);
    assert.equal(res.body.data.company.action, 'linked', label);
    assert.equal(res.body.data.contact.action, 'matched', label);
    assert.equal(res.body.data.contact.matchedBy, matchedBy, label);
    assert.equal(res.body.data.contact.record.id, ctx.priya.id, label);
    assert.equal((await counts()).contacts, before.contacts, `${label}: no contact created`);
  }
  assert.equal((await Contact.findById(ctx.priya.id)).firstName, 'Priya', 'the existing contact is not overwritten');
});

test('contact: matching is within the company - the same email elsewhere is a new contact', async () => {
  const lead = await newLead({ companyId: ctx.bolt.id });
  const before = await counts();
  const res = await convert(lead.id, { contact: { firstName: 'Priya', lastName: 'Nair', email: 'priya@acme.example' } });

  assert.equal(res.body.data.contact.action, 'created');
  assert.equal((await counts()).contacts, before.contacts + 1);
  assert.equal(String((await Contact.findById(res.body.data.contact.record.id)).companyId), ctx.bolt.id);
});

test('contact: matched inside a company that was itself matched', async () => {
  const lead = await newLead({});
  const before = await counts();
  const res = await convert(lead.id, {
    company: { name: 'acme industries' },
    contact: { firstName: 'Priya', lastName: 'Nair', email: 'priya@acme.example' },
  });

  assert.equal(res.body.data.company.action, 'matched');
  assert.equal(res.body.data.contact.action, 'matched');
  assert.equal(res.body.data.contact.record.id, ctx.priya.id);
  assert.deepEqual(await counts(), { ...before, opportunities: before.opportunities + 1 });
});

// --- preview ---------------------------------------------------------------------------------

test('dryRun reports what would happen and changes nothing', async () => {
  const lead = await newLead({});
  const before = await counts();
  const body = {
    company: { name: 'ACME INDUSTRIES' },
    contact: { firstName: 'New', lastName: 'Person', email: 'new.person@acme.example' },
  };

  const preview = await convert(lead.id, { ...body, dryRun: true });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.data.dryRun, true);
  assert.equal(preview.body.data.company.action, 'matched');
  assert.equal(preview.body.data.company.matchedBy, 'name');
  assert.equal(preview.body.data.company.record.id, ctx.acme.id);
  assert.deepEqual(preview.body.data.contact, { action: 'create', record: null });
  assert.equal(preview.body.data.status.name, 'Won');

  assert.deepEqual(await counts(), before);
  assert.equal((await getLead(lead.id)).isConverted, false);
  assert.equal((await request(app).get(`${API}/${lead.id}/timeline`).set(admin())).body.data.pagination.total, 1);

  const brandNew = await convert(lead.id, { company: { name: 'Never Seen Before Ltd' }, dryRun: true });
  assert.deepEqual(brandNew.body.data.company, { action: 'create', record: null });
  assert.equal(brandNew.body.data.contact, null);

  // The real conversion does what the preview said.
  const real = await convert(lead.id, body);
  assert.equal(real.status, 201);
  assert.equal(real.body.data.company.action, 'matched');
  assert.equal(real.body.data.contact.action, 'created');
});

// --- opportunity details and status ------------------------------------------------------------

test('opportunity details can be overridden; otherwise they come from the lead', async () => {
  const lead = await newLead({ title: 'From lead', companyId: ctx.acme.id, estimatedValue: 1000, expectedCloseDate: '2027-01-01' });
  const res = await convert(lead.id, {
    opportunity: { name: 'Custom title', estimatedValue: 5000, notes: 'Fast-tracked' },
  });

  const { opportunity } = res.body.data;
  assert.equal(opportunity.name, 'Custom title');
  assert.equal(opportunity.estimatedValue, 5000);
  assert.equal(opportunity.notes, 'Fast-tracked');
  assert.equal(opportunity.expectedCloseDate.slice(0, 10), '2027-01-01', 'not overridden, so taken from the lead');
});

test('status: a named "won" status is used; anything else is refused', async () => {
  const special = await LeadStatus.create({ name: 'Won - Strategic', category: 'won', sortOrder: 500 });
  const lead = await newLead({ companyId: ctx.acme.id });
  const before = await counts();

  const cases = {
    'an open status': ctx.status.Qualified.id,
    'a lost status': ctx.status.Lost.id,
    'an unknown status': new mongoose.Types.ObjectId().toString(),
  };
  for (const [label, statusId] of Object.entries(cases)) {
    const res = await convert(lead.id, { statusId });
    assert.equal(res.status, 422, label);
    assert.equal(res.body.errors[0].field, 'statusId', label);
  }
  assert.deepEqual(await counts(), before);
  assert.equal((await getLead(lead.id)).isConverted, false);

  const res = await convert(lead.id, { statusId: special.id });
  assert.equal(res.status, 201);
  assert.equal(res.body.data.lead.status.name, 'Won - Strategic');
});

test('status: with no active "won" status configured, the lead keeps its status', async () => {
  await LeadStatus.updateMany({ category: 'won' }, { isActive: false });
  const lead = await newLead({ companyId: ctx.acme.id, statusId: ctx.status.Negotiation.id });

  const res = await convert(lead.id);
  await LeadStatus.updateMany({ category: 'won' }, { isActive: true });

  assert.equal(res.status, 201);
  assert.equal(res.body.data.lead.isConverted, true);
  assert.equal(res.body.data.lead.status.name, 'Negotiation');
});

// --- failure and concurrency ---------------------------------------------------------------------

test('a failure part-way leaves the lead unconverted, and a retry does not duplicate what was created', async () => {
  const lead = await newLead({});
  const before = await counts();

  // The company is created, then the contact is rejected (prefers email but has none).
  const failed = await convert(lead.id, {
    company: { name: 'Halo Textiles' },
    contact: { firstName: 'Ira', lastName: 'Shah', phone: '+91 90000 00001', preferredContactMethod: 'email' },
  });
  assert.equal(failed.status, 422);

  const afterFailure = await getLead(lead.id);
  assert.equal(afterFailure.isConverted, false, 'the claim on the lead was released');
  assert.equal('convertedAt' in afterFailure && afterFailure.convertedAt !== null, false);
  assert.equal('opportunityId' in afterFailure, false);
  assert.equal((await counts()).opportunities, before.opportunities, 'no opportunity was left behind');
  assert.equal(await Company.countDocuments({ name: 'Halo Textiles' }), 1);

  // Retry with the contact fixed: the company from the first attempt is found, not recreated.
  const retry = await convert(lead.id, {
    company: { name: 'Halo Textiles' },
    contact: { firstName: 'Ira', lastName: 'Shah', phone: '+91 90000 00001', preferredContactMethod: 'phone' },
  });
  assert.equal(retry.status, 201);
  assert.equal(retry.body.data.company.action, 'matched');
  assert.equal(retry.body.data.contact.action, 'created');
  assert.equal(await Company.countDocuments({ name: 'Halo Textiles' }), 1, 'still exactly one');
  assert.deepEqual(await counts(), {
    companies: before.companies + 1,
    contacts: before.contacts + 1,
    opportunities: before.opportunities + 1,
  });
});

test('a failure before anything is created leaves no trace', async () => {
  const lead = await newLead({});
  const before = await counts();

  // GST number and PAN disagree: rejected when the company is about to be created.
  const res = await convert(lead.id, { company: { name: 'Iris Pharma', gstNumber: '29AAAAA0000A1Z5', panNumber: 'BBBBB1111B' } });
  assert.equal(res.status, 422);
  assert.deepEqual(await counts(), before);
  assert.equal((await getLead(lead.id)).isConverted, false);
  assert.equal((await convert(lead.id, { company: { name: 'Iris Pharma' } })).status, 201);
});

test('simultaneous conversions of one lead: exactly one succeeds, one opportunity, one company', async () => {
  const lead = await newLead({});
  const before = await counts();
  const body = { company: { name: 'Juno Motors' }, contact: { firstName: 'Jay', lastName: 'Rao', email: 'jay@juno.example' } };

  const results = await Promise.all(Array.from({ length: 6 }, () => convert(lead.id, body)));
  const statuses = results.map((r) => r.status).sort();

  assert.deepEqual(statuses, [201, 409, 409, 409, 409, 409]);
  assert.equal(await Opportunity.countDocuments({ leadId: lead.id }), 1);
  assert.equal(await Company.countDocuments({ name: 'Juno Motors' }), 1);
  assert.equal(await Contact.countDocuments({ email: 'jay@juno.example' }), 1);
  assert.deepEqual(await counts(), {
    companies: before.companies + 1,
    contacts: before.contacts + 1,
    opportunities: before.opportunities + 1,
  });
  assert.equal((await getLead(lead.id)).isConverted, true);
});

// --- after conversion -----------------------------------------------------------------------------

test('converted leads are findable, their history shows the conversion, and their records are protected', async () => {
  const converted = (await request(app).get(`${API}?converted=true&limit=100`).set(admin())).body.data;
  const open = (await request(app).get(`${API}?converted=false&limit=100`).set(admin())).body.data;
  assert.equal(converted.pagination.total, await Lead.countDocuments({ convertedAt: { $ne: null } }));
  assert.ok(converted.leads.every((l) => l.isConverted && l.opportunity));
  assert.ok(open.leads.every((l) => !l.isConverted));
  assert.equal(converted.pagination.total + open.pagination.total, await Lead.countDocuments());

  const timeline = (await request(app).get(`${API}/${ctx.converted.id}/timeline`).set(admin())).body.data.events;
  assert.equal(timeline[0].action, 'converted');
  assert.match(timeline[0].summary, /^Opportunity OPP-000001 created; company Acme Industries linked; contact Priya Nair linked$/);
  assert.deepEqual(timeline[0].changes, [{ field: 'status', label: 'Status', from: 'New', to: 'Won' }]);

  const sections = (await request(app).get(`/api/v1/companies/${ctx.acme.id}/sections`).set(admin())).body.data.sections;
  const opportunities = sections.find((s) => s.key === 'opportunities');
  assert.equal(opportunities.available, true);
  assert.equal(opportunities.count, await Opportunity.countDocuments({ companyId: ctx.acme.id }));

  const company = await request(app).delete(`/api/v1/companies/${ctx.acme.id}`).set(admin());
  assert.equal(company.status, 409);
  assert.ok(company.body.errors.some((e) => e.field === 'opportunities'));

  const contact = await request(app).delete(`/api/v1/contacts/${ctx.priya.id}`).set(admin());
  assert.equal(contact.status, 409);
  assert.ok(contact.body.errors.some((e) => e.field === 'opportunities'));
});

test('a deleted lead cannot be converted', async () => {
  const lead = await newLead({ companyId: ctx.acme.id });
  await request(app).delete(`${API}/${lead.id}`).set(admin());
  const before = await counts();

  assert.equal((await convert(lead.id)).status, 404);
  assert.deepEqual(await counts(), before);
});

test('opportunity numbers are unique and sequential across all the conversions above', async () => {
  const numbers = (await Opportunity.find().sort({ opportunityNumber: 1 })).map((o) => o.opportunityNumber);
  assert.equal(new Set(numbers).size, numbers.length);
  assert.equal(numbers[0], 'OPP-000001');
  assert.ok(numbers.every((n) => /^OPP-\d{6}$/.test(n)));
});
