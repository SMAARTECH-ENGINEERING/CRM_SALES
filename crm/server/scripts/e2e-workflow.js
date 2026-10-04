// The whole CRM workflow, through the real API, on a throwaway database:
// seed admin -> login -> user and role -> company -> contact -> lead -> assign ->
// follow-up -> opportunity -> pipeline -> quotation -> accept -> order -> customer ->
// project -> task -> ticket -> AMC -> payment -> notification -> dashboard ->
// reports -> audit log - and then what must NOT be possible.
//
//   npm run test:e2e          (from the repository root or from server/)
//
// It starts its own server on its own port and database (crm_e2e_workflow on
// the MongoDB of MONGODB_URI's host) and removes that database afterwards. It
// never touches the database in .env.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.E2E_PORT) || 5097;
const DB = process.env.E2E_MONGODB_URI || 'mongodb://127.0.0.1:27017/crm_e2e_workflow';
const BASE = `http://localhost:${PORT}/api/v1`;
const ADMIN = { email: 'e2e.admin@example.com', password: 'E2e!Adm1n#Pass' };
const REP = { email: 'e2e.rep@example.com', password: 'E2e!Rep#Pass123' };
const childEnv = { ...process.env, NODE_ENV: 'development', PORT: String(PORT), MONGODB_URI: DB, LOG_LEVEL: 'warn', SMTP_URL: '', SMTP_HOST: '', STORAGE_DRIVER: 'local', RATE_LIMIT_ENABLED: 'true', AUDIT_ENABLED: 'true', CONTRACT_REMINDER_INTERVAL_MINUTES: '0', NOTIFICATION_CHECK_INTERVAL_MINUTES: '0' };

await mongoose.connect(DB);
await mongoose.connection.dropDatabase();

let failed = 0;
let step = 0;
const check = (name, cond, detail = '') => {
  step += 1;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${String(step).padStart(2)}. ${name}${cond ? '' : '  -> ' + String(detail).slice(0, 400)}`);
  if (!cond) failed++;
};
async function call(method, url, { body, token } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}
const ok = (r) => r.status >= 200 && r.status < 300 && r.body?.success === true;
const show = (r) => `${r.status} ${JSON.stringify(r.body)}`;
const day = (offset) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

const made = spawnSync(process.execPath, ['scripts/create-admin.js', '--first-name', 'E2E', '--last-name', 'Admin', '--email', ADMIN.email], { cwd: SERVER_DIR, env: { ...childEnv, ADMIN_PASSWORD: ADMIN.password }, encoding: 'utf8' });
const server = { output: '' };
server.child = spawn(process.execPath, ['src/server.js'], { cwd: SERVER_DIR, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
server.child.stdout.on('data', (d) => (server.output += d));
server.child.stderr.on('data', (d) => (server.output += d));
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(BASE + '/health')).ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 200));
}

try {
  check('Seed admin (create-admin script)', made.status === 0, made.stdout + made.stderr);

  let r = await call('POST', '/auth/login', { body: ADMIN });
  check('Login', ok(r) && r.body.data.accessToken, show(r));
  const token = r.body.data.accessToken;
  const admin = r.body.data.user;
  const list = async (url, key = 'items') => (await call('GET', url, { token })).body.data[key];

  // A role with the permissions of a sales rep - chosen from the catalogue, not written here.
  const catalogue = (await call('GET', '/permissions', { token })).body.data.permissions ?? (await call('GET', '/permissions', { token })).body.data.items;
  const repKeys = catalogue.filter((p) => ['leads', 'followups', 'companies', 'contacts'].includes(p.module) && ['read', 'update', 'create'].includes(p.action)).map((p) => p.key);
  r = await call('POST', '/roles', { token, body: { name: 'Sales Rep', description: 'Works the leads assigned to them' } });
  const role = r.body.data?.role;
  const perms = await call('PUT', `/roles/${role?.id}/permissions`, { token, body: { permissions: repKeys } });
  r = await call('POST', '/users', { token, body: { firstName: 'Ravi', lastName: 'Rep', email: REP.email, password: REP.password } });
  check('Create User', ok(r) && r.body.data.user.email === REP.email && !('passwordHash' in r.body.data.user), show(r));
  const rep = r.body.data.user;
  r = await call('PUT', `/users/${rep.id}`, { token, body: { roleId: role.id } });
  check('Assign Role (a role built from the permission catalogue)', ok(perms) && ok(r) && r.body.data.user.roleId === role.id, show(r));

  r = await call('POST', '/companies', { token, body: { name: 'Northwind Waterworks', city: 'Bhubaneswar', email: 'office@northwind.example.com', phone: '+91 98765 43210' } });
  check('Create Company', ok(r) && /-\d{6}$/.test(r.body.data.company.companyCode), show(r));
  const company = r.body.data.company;

  r = await call('POST', '/contacts', { token, body: { firstName: 'Meera', lastName: 'Das', email: 'meera.das@northwind.example.com', designation: 'Plant Manager', companyId: company.id } });
  check('Create Contact', ok(r) && r.body.data.contact.companyId === company.id, show(r));
  const contact = r.body.data.contact;

  r = await call('POST', '/leads', { token, body: { title: 'Flow meters for the intake line', companyId: company.id, contactId: contact.id, estimatedValue: 450000 } });
  check('Create Lead', ok(r) && r.body.data.lead.leadNumber && r.body.data.lead.status, show(r));
  const lead = r.body.data.lead;

  r = await call('PATCH', `/leads/${lead.id}/assign`, { token, body: { assignedTo: rep.id } });
  check('Assign Lead', ok(r) && r.body.data.lead.assignedTo === rep.id, show(r));

  r = await call('POST', '/followups', { token, body: { title: 'Call Meera about the site survey', relatedType: 'lead', relatedId: lead.id, assignedTo: rep.id, dueDate: new Date(Date.now() + 2 * 864e5).toISOString() } });
  check('Schedule Follow-up', ok(r) && r.body.data.followUp.status === 'pending', show(r));

  r = await call('POST', '/opportunities', { token, body: { name: 'Intake line flow metering', companyId: company.id, contactId: contact.id, estimatedValue: 450000, probability: 40, assignedTo: rep.id } });
  check('Create Opportunity', ok(r) && r.body.data.opportunity.opportunityNumber && r.body.data.opportunity.stage, show(r));
  const opportunity = r.body.data.opportunity;

  const stages = (await list('/pipeline-stages', 'stages')).filter((s) => s.pipelineId === opportunity.pipelineId).sort((a, b) => a.order - b.order);
  const path_ = [...stages.filter((s) => s.type === 'open' && s.id !== opportunity.stageId), stages.find((s) => s.type === 'won')];
  let moved = true;
  let last;
  for (const stage of path_) {
    last = await call('PATCH', `/opportunities/${opportunity.id}/stage`, { token, body: { stageId: stage.id } });
    moved = moved && ok(last) && last.body.data.opportunity.stageId === stage.id;
  }
  check(`Move Opportunity through Pipeline (${path_.length} moves, ends won)`, moved && last.body.data.opportunity.status === 'won', show(last));

  const tax = (await call('POST', '/taxes', { token, body: { name: 'GST 18%', rate: 18 } })).body.data.item;
  const product = (await call('POST', '/products', { token, body: { name: 'Electromagnetic flow meter DN100', basePrice: 85000, taxId: tax.id } })).body.data.product;
  r = await call('POST', '/quotations', { token, body: { companyId: company.id, contactId: contact.id, opportunityId: opportunity.id, items: [{ productId: product.id, quantity: 4 }] } });
  // 4 x 85,000 = 340,000 + 18% = 401,200 - worked out by the server.
  check('Create Quotation (totals calculated by the server)', ok(r) && r.body.data.quotation.grandTotal === 401200, show(r));
  const quotation = r.body.data.quotation;

  const accepted = (await list('/quotation-statuses')).find((s) => s.category === 'accepted');
  r = await call('PATCH', `/quotations/${quotation.id}/status`, { token, body: { statusId: accepted.id } });
  check('Accept Quotation', ok(r) && r.body.data.quotation.statusId === accepted.id, show(r));

  r = await call('POST', `/orders/from-quotation/${quotation.id}`, { token, body: {} });
  check('Create Order (from the accepted quotation)', ok(r) && r.body.data.order.grandTotal === 401200 && r.body.data.order.quotationId === quotation.id, show(r));
  const order = r.body.data.order;
  const again = await call('POST', `/orders/from-quotation/${quotation.id}`, { token, body: {} });

  r = await call('GET', `/customers?companyId=${company.id}`, { token });
  let customer = r.body.data?.customers?.[0];
  if (!customer) customer = (await call('POST', '/customers', { token, body: { companyId: company.id } })).body.data?.customer;
  check('Create Customer (the company became one with its first order; a second order from the same quotation is refused)', Boolean(customer?.customerNumber) && again.status === 409, `${JSON.stringify(customer)} / again ${again.status}`);

  r = await call('POST', '/projects', { token, body: { name: 'Intake line metering - installation', companyId: company.id, orderId: order.id, startDate: day(1), expectedEndDate: day(45), projectManagerId: admin.id, teamMembers: [rep.id] } });
  check('Create Project', ok(r) && r.body.data.project.projectNumber && r.body.data.project.customerId === customer.id, show(r));
  const project = r.body.data.project;

  r = await call('POST', `/projects/${project.id}/tasks`, { token, body: { title: 'Site survey and pipe measurements', assignedTo: rep.id, dueDate: day(5) } });
  check('Create Project Task', ok(r) && r.body.data.task.projectId === project.id, show(r));

  r = await call('POST', '/tickets', { token, body: { companyId: company.id, contactId: contact.id, subject: 'Display on meter 2 is blank', description: 'Reported by the plant manager.' } });
  check('Create Support Ticket', ok(r) && r.body.data.ticket.ticketNumber && r.body.data.ticket.status, show(r));

  r = await call('POST', '/contracts', { token, body: { companyId: company.id, startDate: day(0), endDate: day(365), amount: 60000 } });
  check('Create AMC (contract)', ok(r) && r.body.data.contract.contractNumber && r.body.data.contract.customerId === customer.id, show(r));

  r = await call('POST', '/payments', { token, body: { companyId: company.id, orderId: order.id, amount: 401200, dueDate: day(15) } });
  const payment = r.body.data?.payment;
  const received = await call('PUT', `/payments/${payment?.id}`, { token, body: { receivedAmount: 150000 } });
  const over = await call('PUT', `/payments/${payment?.id}`, { token, body: { receivedAmount: 999999 } });
  check('Record Payment (remaining worked out by the server; overpayment refused)', ok(r) && ok(received) && received.body.data.payment.remainingAmount === 251200 && received.body.data.payment.paidAmount === 150000 && over.status >= 400, `${show(received)} / over ${over.status}`);

  // The rep, signed in as themselves.
  r = await call('POST', '/auth/login', { body: REP });
  const repToken = r.body.data?.accessToken;
  r = await call('GET', '/notifications', { token: repToken });
  const types = (r.body.data?.notifications ?? []).map((n) => n.type);
  check('Generate Notification (the rep was told about the lead assigned to them)', ok(r) && types.includes('lead_assigned') && r.body.data.unreadCount >= 1, show(r));

  r = await call('GET', '/dashboard/summary?period=month', { token });
  const m = r.body.data?.metrics ?? {};
  check('View Dashboard (figures match what was just created)', ok(r) && m.totalLeads?.value === 1 && m.customers?.value === 1 && m.wonValue?.value === 450000 && m.openTickets?.value === 1 && m.pendingPayments?.amount === 251200, JSON.stringify(m));

  const reports = (await call('GET', '/reports', { token })).body.data?.reports ?? [];
  const sales = await call('GET', `/reports/${reports.find((x) => /sales|order/.test(x.key))?.key}`, { token });
  const csv = await fetch(`${BASE}/reports/${reports[0]?.key}/export?format=csv`, { headers: { Authorization: `Bearer ${token}` } });
  check(`View Reports (${reports.length} reports; one run, one exported as CSV)`, reports.length >= 10 && ok(sales) && Array.isArray(sales.body.data.rows) && csv.status === 200 && /csv/.test(csv.headers.get('content-type') ?? ''), `${show(sales)} / csv ${csv.status}`);

  await new Promise((res) => setTimeout(res, 600));
  r = await call('GET', '/audit-logs?limit=100', { token });
  const actions = new Set((r.body.data?.auditLogs ?? []).map((e) => e.action));
  const text = JSON.stringify(r.body);
  check('View Audit Log (logins, creates, an assignment, status changes - and no secrets)', ok(r) && ['LOGIN', 'CREATE', 'ASSIGN', 'STATUS_CHANGE'].every((a) => actions.has(a)) && !text.includes(ADMIN.password) && !text.includes(REP.password) && !/accessToken":"ey/.test(text), [...actions].join(','));

  // --- what must not be possible ----------------------------------------------------
  const forbidden = await call('GET', '/users', { token: repToken });
  const repLeads = await call('GET', '/leads', { token: repToken });
  check('RBAC: the rep may read leads but not users', forbidden.status === 403 && ok(repLeads), `${forbidden.status} ${repLeads.status}`);
  const anonymous = await call('GET', '/leads');
  const badToken = await call('GET', '/leads', { token: 'not-a-token' });
  check('Authentication: no token and a bad token are refused', anonymous.status === 401 && badToken.status === 401, `${anonymous.status} ${badToken.status}`);
  const invalid = await call('POST', '/leads', { token, body: { title: '' } });
  check('Validation: a bad request is refused with the field named', invalid.status === 422 && invalid.body.success === false && invalid.body.errors[0].field === 'title', show(invalid));
  const missing = await call('GET', '/leads/000000000000000000000000', { token });
  check('Errors have one shape: { success: false, message, errors }', missing.status === 404 && missing.body.success === false && typeof missing.body.message === 'string' && Array.isArray(missing.body.errors), show(missing));
  const del = await call('DELETE', `/leads/${lead.id}`, { token });
  const gone = await call('GET', `/leads/${lead.id}`, { token });
  const kept = await mongoose.connection.collection('leads').findOne({ _id: new mongoose.Types.ObjectId(lead.id) });
  check('Soft delete: a deleted lead is hidden from the API but kept in the database', ok(del) && gone.status === 404 && kept && kept.deletedAt instanceof Date, `${del.status} ${gone.status}`);
  const page = await call('GET', '/companies?page=1&limit=5&search=north', { token });
  check('Pagination and search on lists', ok(page) && page.body.data.pagination.total === 1 && page.body.data.pagination.limit === 5, show(page));
  const health = await fetch(BASE + '/health');
  check('Security headers (Helmet) and rate-limit headers are sent', Boolean(health.headers.get('x-content-type-options')) && Boolean(health.headers.get('ratelimit') || health.headers.get('ratelimit-limit') || health.headers.get('ratelimit-policy')), [...health.headers.keys()].join(','));
  const cors = await fetch(BASE + '/health', { headers: { Origin: 'https://evil.example.com' } });
  check('CORS: an unknown origin is not allowed', !cors.headers.get('access-control-allow-origin'), cors.headers.get('access-control-allow-origin'));
  check('Server log has no errors', !/"level":(50|60)|ERROR|FATAL/.test(server.output), server.output.slice(-800));
} finally {
  await new Promise((resolve) => { server.child.once('exit', resolve); server.child.kill(); });
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nThe whole workflow passed');
process.exit(failed ? 1 : 0);
