# CRM Server

Express + MongoDB REST API. See the [root README](../README.md) for the full setup guide.

## Quick start

```bash
npm install
npm run setup:env   # creates .env with generated JWT secrets
npm run dev         # http://localhost:5000/api/v1
```

## Scripts

| Command             | Purpose                                             |
| ------------------- | --------------------------------------------------- |
| `npm run dev`       | Start with file watching (`node --watch`)           |
| `npm start`         | Start for production                                |
| `npm test`          | Run the test suite (`node:test` + supertest)        |
| `npm run setup:env` | Create `.env` from `.env.example` (never overwrites) |
| `npm run create:admin -- --first-name ... --last-name ... --email ...` | Create a user with the full-access role (password from `ADMIN_PASSWORD`) |
| `npm run seed`      | Load the permission catalogue, seed roles and (once) the initial lead sources, statuses and priorities, activity types, sales pipeline and quotation statuses. Also done on every start |

Tests need a reachable MongoDB. They use throwaway `crm_test_*` databases on
`mongodb://127.0.0.1:27017` (override with `MONGODB_TEST_URI_BASE`) and never the database in `.env`.

## Protecting a route

```js
import authenticate from '../middleware/authenticate.js';
import authorize from '../middleware/authorize.js';
import requirePermission from '../middleware/requirePermission.js';

router.get('/me', authenticate, controller.me);                                        // any signed-in user
router.post('/', authenticate, requirePermission('leads.create'), controller.create);  // must hold it (all, if several)
router.get('/', authenticate, authorize('roles.read', 'users.read'), controller.list); // any one is enough
```

`authenticate` sets `req.user` (the Mongoose document, with its role and the role's permissions
loaded from MongoDB in `req.user.roleId`) and `req.auth` (the token claims). The two permission
middlewares then check the key against that role - nothing is read from the token.

To add a permission: add it to `src/seeds/rbac.seed.js`, use its key in `requirePermission(...)`,
and restart (the seed runs on start). It can then be granted to roles from the Roles screen;
full-access roles hold it automatically. A key used in code but missing from the database is
logged as a warning at startup. Add the key to `client/src/utils/permissions.js` if the UI needs it.

Rules that depend on the target record (for example "may this user manage that user") belong in
the service, as in `src/services/user.service.js` and `src/services/role.service.js`. Use
`hasPermission`, `coversRole` and `coversKeys` from `src/utils/permissions.js`, and wrap any key
checked there in `declarePermission('...')` so the startup check covers it too.

## Layout

| Folder            | Responsibility                                                   |
| ----------------- | ---------------------------------------------------------------- |
| `src/config`      | Environment validation, logger, database connection              |
| `src/constants`   | HTTP statuses, messages, shared enums                            |
| `src/routes`      | Route definitions; `routes/index.js` mounts every module         |
| `src/controllers` | HTTP layer: read the request, call a service, send the response  |
| `src/services`    | Business logic and database access                               |
| `src/models`      | Mongoose schemas                                                 |
| `src/seeds`       | Seed data: the permission catalogue, the two starting roles, and the initial lead configuration, activity types and pipeline |
| `src/validators`  | Joi schemas used by the `validate` middleware                    |
| `src/middleware`  | Auth, validation, rate limiting, not-found, error handling       |
| `src/utils`       | `ApiError`, response helpers, JWT and password helpers           |
| `src/jobs`        | Scheduled / background jobs                                      |
| `scripts`         | One-off maintenance scripts                                      |
| `tests`           | API tests                                                        |

## Adding a module

1. Model in `src/models`, Joi schemas in `src/validators`.
2. Logic in `src/services`; throw `ApiError` for expected failures.
3. Controller in `src/controllers`; respond with `sendSuccess`.
4. Router in `src/routes`, registered in `src/routes/index.js`.

Reusable pieces for a new module:

- **Generated codes** (`COMP-000001` style): `nextSequence('<series>')` and `formatCode(...)` in
  `src/services/sequence.service.js`.
- **List endpoints:** `searchFilter(search, fields)` and `paginationMeta(...)` in `src/utils/query.js`.
- **Global search:** to make a model findable, call `searchable(schema, [fields])` in the model
  (`src/models/shared/searchable.js`) and add a category to `CATEGORIES` in
  `src/services/search.service.js`. Existing records are indexed on the next start.
- **JSON shape:** `jsonOptions({ omit, aliases })` in `src/models/shared/json.js`.
- **History:** `recordEvent(...)`, `diffSnapshots(...)` and `listEvents(...)` in
  `src/services/timeline.service.js`.
- **Soft delete:** `softDelete(schema)` in `src/models/shared/softDelete.js`.
- **Activities and follow-ups for a new kind of record:** add it to `RELATIONS` in
  `src/services/relation.service.js` (and remove its field from `PENDING_RELATION_FIELDS`). The
  activity and follow-up APIs then accept and validate it.
- **An administrator-managed list of values** (like lead sources, activity types, units or taxes):
  `createLeadConfigModel(...)`, an entry in `LEAD_CONFIG` (with `extraFields` and optional
  `uniqueFields`), its rules in `validators/leadConfig.validator.js`, and `leadConfigRouter(...)`.
- **Putting products on a record:** store the product id, and let the form use
  `GET /products/options` (add your permission to its `authorize(...)` list).
- **Finding an existing company / contact before creating one:** `findMatchingCompany` and
  `findMatchingContact` in `src/services/duplicate.service.js` (fields from `COMPANY_MATCH_FIELDS`
  / `CONTACT_MATCH_FIELDS`).
- **Stopping a referenced record being deleted:** `registerCompanySection(..., { blocksDelete: true })`,
  `registerContactDeleteGuard(...)`, `registerLeadConfigUsage(...)`.
- **Putting a record into a pipeline stage:** `resolveStartingStage({ pipelineId, stageId })` and
  `resolveTargetStage(pipelineId, stageId)` in `src/services/pipeline.service.js` validate the
  stage; `insertOpportunity(fields, start, actor)` in `src/services/opportunity.service.js`
  creates an opportunity from already-validated fields (lead conversion uses it).
- **"Is it open, won or lost?"** Read the stage's `type` (`STAGE_TYPE`) or a lead status's
  `category` - never a stage or status name.
- **Money on a document:** `calculateTotals(lines, discountPercent)` in
  `src/services/quotationTotals.js` - the only place amounts are worked out. `priceLines` /
  `applyTotals` in `src/services/lineItems.service.js` turn client lines into priced ones (used by
  quotations and orders), and `lineItemSchema` / `totalsFields` in `src/models/shared/lineItem.js`
  store them.
- **File uploads:** `uploadFiles(field)` (multer, memory, limits from `UPLOAD_*`) before
  `validate(...)` on the route, then `storeFiles(req.files, folder)` once every check has passed,
  and `removeFiles` if the request then fails - see `src/services/upload.service.js` and the ticket
  routes. Serve files only through an authenticated route, by stored id, never by a client path.
- **Storage:** files go through `src/services/storage.service.js` (`putObject`, `getObject`,
  `removeObject`), never `fs` directly, so they work on both drivers. `storeFiles` / `openFile` /
  `sendFile` in `upload.service.js` are the usual way in. To let a new kind of record have
  documents, add it to `DOCUMENT_ENTITIES` in `src/services/document.service.js` with the
  permission needed to see it.
- **Settings:** anything an administrator should be able to change is a setting, not an
  environment variable: add it to a group in `src/models/AppSettings.js`, give it a default in
  `defaults()` in `src/services/settings.service.js`, validate it in `src/routes/settings.routes.js`,
  and read it with `(await getSettings()).<group>.<field>` where it is needed. Never put a
  secret there. Tests call `resetSettingsCache()` when they start from an empty database.
- **Audit:** nothing to do for a new module - `src/middleware/audit.js` records every changing
  request. To get a before / after for a new collection, add its route name and model to
  `MODELS` in `src/services/audit.service.js`; without that the entry holds what was sent.
  Tests run with `AUDIT_ENABLED=false` (see `tests/helpers/env.js`) except `tests/audit.test.js`.
- **Reports:** add a definition to `src/services/report.definitions.js` (start collection, row
  stages, columns, date fields, filters, totals). `report.service.js` runs it and
  `reportExport.service.js` exports it; there is nothing to add to routes, validators or the
  client.
- **Notifications:** call `notifyUsers` (in `src/services/notification.service.js`) from the
  service where the event happens, with recipients read from the record and `exclude: actor`.
  For events found by a timer, pass a `dedupeKey` so each is sent once. Real-time delivery
  (`src/realtime/socket.js`) is automatic and a no-op where no socket server runs (tests).
- **Background jobs:** put the work in a service that is safe to run repeatedly (claim each unit
  in the database first), and a small timer in `src/jobs/` started from `server.js` only - see
  `src/jobs/contractReminders.job.js` and `src/services/contractReminder.service.js`. Tests call
  the service directly with a chosen date.
- **Records that belong to a parent** (tasks and milestones of a project): routes
  `/parents/:id/children/:childId`, and always look the child up *with* its parent id, so a child
  cannot be reached through another parent (see `findTask` in `src/services/project.service.js`).
- **A record that is "about" another one** (like Customer about Company): store the reference
  and join it (`$lookup`) for search and filters - see `listCustomers` in
  `src/services/customer.service.js` - rather than copying fields that then go stale.
- **Stopping a company being deleted by something that is not a page section:**
  `registerCompanyDeleteGuard(label, count)` in `src/services/companySection.service.js`.
- **"Create X from Y" exactly once:** claim Y with one conditional update before writing X (see
  `createOrderFromQuotation` in `src/services/order.service.js`, and lead conversion), and
  release the claim if anything fails. Never store totals a
  client sent; strip them in the validator (`Joi.any().strip()`).
- **Our own company details** (for documents): `getCompanyProfile()` / `requireCompanyProfile()` in
  `src/services/settings.service.js`.
- **A PDF or an email:** pdfkit as in `src/services/quotationPdf.service.js`; `sendMail` and
  `isMailConfigured` in `src/services/mail.service.js` (tests swap the transport with
  `setMailTransport`).
- **A section on the company page:** `registerCompanySection('<key>', { count })` in
  `src/services/companySection.service.js`.

Express 5 forwards rejected promises from async handlers to the central error handler, so
controllers need no `try/catch` wrappers.
