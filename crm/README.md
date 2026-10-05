# CRM

A B2B CRM for the whole customer journey - from first enquiry to delivery,
service and payment - built as a React single-page app on a versioned REST API.

**New to the CRM?** Start with the [user guide](docs/USER_GUIDE.md): one sale - a cold storage - from
enquiry to service contract, step by step.

## Contents

1. [Project overview](#1-project-overview)
2. [Features](#2-features)
3. [Technology stack](#3-technology-stack)
4. [Architecture](#4-architecture)
5. [Folder structure](#5-folder-structure)
6. [Database architecture](#6-database-architecture)
7. [Authentication](#7-authentication)
8. [RBAC](#8-rbac)
9. [API architecture](#9-api-architecture)
10. [Installation](#10-installation)
11. [Environment variables](#11-environment-variables)
12. [MongoDB setup](#12-mongodb-setup)
13. [Seed commands](#13-seed-commands)
14. [Development commands](#14-development-commands)
15. [Production build](#15-production-build)
16. [Deployment](#16-deployment)
17. [Postman collection](#17-postman-collection)
18. [Testing](#18-testing)
19. [Security](#19-security)
20. [Troubleshooting](#20-troubleshooting)
21. [Future improvements](#21-future-improvements)

## 1. Project overview

The CRM follows one company's dealings with another from start to finish:

```text
Company & contacts → Lead → Opportunity (pipeline) → Quotation → Order → Customer
                                                                  ├→ Project & tasks
                                                                  ├→ Payments
                                                                  └→ Tickets, contracts (AMC)
```

Around that flow: activities and follow-ups, documents (with versions, a PDF
editor, a spreadsheet editor, PDF ↔ Excel conversion and print preview - see
[docs/DOCUMENTS.md](docs/DOCUMENTS.md)), notifications, a dashboard, reports,
an audit log, global search and application settings.

Two principles run through it:

- **Nothing about the business is hardcoded.** Statuses, stages, priorities,
  sources, categories, taxes, units, number prefixes, roles and permissions are
  data, managed by administrators.
- **The server decides and calculates.** Totals, taxes, remaining amounts,
  record numbers, progress and dashboard figures come from the API; the web app
  shows them.

## 2. Features

| Area | What it does |
| ---- | ------------ |
| Users, roles, permissions | Accounts, roles built from a permission catalogue, per-action access |
| Companies and contacts | Accounts with their people, duplicate detection, a page per company showing everything related |
| Leads | Capture, assign, follow up, change status, convert into company + contact + opportunity |
| Pipelines and opportunities | Configurable pipelines and stages, a Kanban board, win / loss, stage history |
| Products | Catalogue with categories, units, taxes and generated SKUs |
| Quotations | Line items, server-calculated totals, PDF, email, status flow |
| Orders | Created from an accepted quotation (once) or directly; status flow |
| Customers | A company becomes a customer with its first order; a 360° view |
| Projects and tasks | Team, milestones, tasks, progress |
| Tickets | Conversation with replies and internal notes, attachments, assignment |
| Contracts (AMC) | Types, billing cycles, automatic expiry reminders at configurable periods |
| Payments | What is invoiced, received and outstanding; overdue tracking; no overpayment unless allowed |
| Activities and follow-ups | Calls, meetings, notes; reminders with due dates |
| Documents | Files on any record, in local or S3-compatible storage, checked by type, content and size |
| Notifications | From business events, delivered in real time (Socket.IO) |
| Dashboard | Figures and charts for a chosen period, per user's permissions and organization; widgets can be rearranged |
| Reports | Eleven reports computed by the database; CSV, Excel and PDF export |
| Audit log | Every change, sign-in and sign-out, with before and after; append-only |
| Global search | One box for nine kinds of record, answered from an index |
| Settings | Company details, prefixes, defaults, limits, branding - applied without a restart |
| Interface | Eight colour themes, light / dark / system, text size, English / Odia / Hindi, resizable sidebar, customisable tables, per-user preferences |

Each module is described in detail - model, rules, endpoints, examples - in
[docs/MODULES.md](docs/MODULES.md).

## 3. Technology stack

| | |
| --- | --- |
| **Frontend** | React 19, Vite, JavaScript, Material UI (with X Data Grid and X Charts), React Router, Axios, TanStack Query, React Hook Form + Yup, i18next, Socket.IO client |
| **Backend** | Node.js 20+, Express 5, MongoDB with Mongoose, JWT, bcryptjs, Joi, Helmet, CORS, compression, express-rate-limit, Pino, Socket.IO, Multer, PDFKit, Nodemailer |
| **Testing** | node:test + supertest (server), Vitest + Testing Library (client), Newman (Postman), ESLint |

Material UI is the only UI framework.

## 4. Architecture

```text
Browser ── React SPA ──HTTPS / JSON, Bearer token──► Express API (/api/v1) ──► MongoDB
                     └─ WebSocket (notifications) ─┘        ├─ file storage (local or S3)
                                                            ├─ mail (SMTP, optional)
                                                            └─ background jobs
```

On the server a request passes `helmet → cors → rate limit → audit →
authenticate → requirePermission → validate → service`. Routes hold no logic;
services hold all of it. On the client, server state lives in TanStack Query
and every screen has loading, error and empty states.

Full description: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## 5. Folder structure

```text
crm/
├── client/                      React application
│   └── src/
│       ├── api/                 Axios client and one module per resource
│       ├── components/          Reusable UI; components/ui/ is the shared library
│       ├── context/             Session, user preferences, toasts
│       ├── hooks/               TanStack Query hooks
│       ├── i18n/                Languages (en, od, hi)
│       ├── layouts/             Navigation definition
│       ├── pages/               Route-level screens
│       ├── routes/              Route table and guards
│       ├── theme/               Design system
│       └── utils/
├── server/                      REST API
│   ├── src/
│   │   ├── config/              Environment validation, logger, database
│   │   ├── constants/           Messages, status categories
│   │   ├── controllers/         (auth) request handlers
│   │   ├── jobs/                Background jobs
│   │   ├── middleware/          Auth, permissions, validation, rate limit, audit, errors
│   │   ├── models/              Mongoose schemas
│   │   ├── realtime/            Socket.IO
│   │   ├── routes/              One router per resource
│   │   ├── seeds/               Permission catalogue and first-run list values
│   │   ├── services/            Business logic
│   │   ├── utils/
│   │   ├── validators/          Joi schemas
│   │   ├── app.js               The Express app
│   │   └── server.js            Entry point
│   ├── scripts/                 create-admin, seed, seed-demo, setup-env, e2e-workflow
│   └── tests/
├── postman/
│   ├── CRM.postman_collection.json
│   ├── CRM.postman_environment.json
│   ├── run-collection.js        Runs the collection with Newman
│   └── sample-document.txt      The file the upload request sends
├── docs/                        USER_GUIDE, DOCUMENTS, ARCHITECTURE, DATABASE, API, RBAC, DEPLOYMENT,
│                                TESTING, MODULES, UI_UX, THEMING, I18N
├── README.md
└── .gitignore
```

## 6. Database architecture

MongoDB with Mongoose: 55 collections - business records, the
administrator-managed lists, access control, settings, the audit log.

- Records reference each other by id; deleting is **soft** (`deletedAt`), and
  refused while other records depend on the one being deleted.
- Record numbers (`LEAD-000001`) are generated atomically by the server.
- Every filter and join field is indexed; global search uses a dedicated index.
- Passwords are stored only as bcrypt hashes; files only as details (the bytes
  are in file storage).

Collections, relationships and indexes: [docs/DATABASE.md](docs/DATABASE.md).

## 7. Authentication

JWT, with a short-lived access token and a rotating refresh token.

```text
POST /auth/login          → { user, accessToken (15 min), refreshToken (7 days) }
Authorization: Bearer …   on every request
POST /auth/refresh-token  → a new pair; the old refresh token stops working
POST /auth/logout         → every token of that user stops working
```

- Passwords: bcrypt (12 rounds), a minimum length set in Settings, plus mixed
  character rules.
- Only a hash of the refresh token is stored. Logging out, changing or
  resetting a password, or changing a user's role revokes all their tokens.
- A deactivated user is refused on their next request.
- Failed sign-ins are rate-limited; the answer is the same whether the email
  exists or not.
- The web app keeps the access token in memory only; the refresh token is in
  the browser's local storage, and a 401 triggers one refresh and a retry.

The first administrator is created from the command line - see
[Seed commands](#13-seed-commands).

## 8. RBAC

Access is by permission (`<module>.<action>`, for example `leads.assign`).
Roles are sets of permissions, created and edited in the app; no role name
appears in the code. The user's role is read from the database on every
request, so a change takes effect at once.

The dashboard, reports, global search and audit log are also limited by
**organization**: everything with the module's `viewAll` permission, otherwise
the user's organization, otherwise their own records.

The catalogue and the rules: [docs/RBAC.md](docs/RBAC.md).

## 9. API architecture

REST over JSON under `/api/v1`, 267 routes. One response shape:

```json
{ "success": true, "message": "…", "data": { } }
{ "success": false, "message": "…", "errors": [{ "field": "…", "message": "…" }] }
```

Lists page, search, filter and sort in the database (`page`, `limit`,
`search`, `sortBy`, `sortOrder`). Validation is by Joi; unknown fields are
dropped; fields the server owns are never accepted from the client.

Conventions and every endpoint: [docs/API.md](docs/API.md).

## 10. Installation

Requirements: Node.js 20+, MongoDB 6+ running locally (or a connection string).

```bash
git clone <repository> crm && cd crm
npm run install:all          # root, server and client
npm run setup:env            # creates server/.env (with generated JWT secrets) and client/.env
```

Then create the first administrator and start:

```bash
cd server
# PowerShell: $env:ADMIN_PASSWORD = "..."      bash: export ADMIN_PASSWORD='...'
npm run create:admin -- --first-name Ada --last-name Admin --email ada@yourcompany.com
cd ..
npm run dev                  # API on :5000, web app on :5173
```

Open http://localhost:5173 and sign in.

## 11. Environment variables

`server/.env` (see `server/.env.example`, where every variable is explained):

| Variable | Required | Default | Purpose |
| -------- | -------- | ------- | ------- |
| `NODE_ENV` | no | `development` | `production` tightens defaults |
| `PORT` | no | `5000` | API port |
| `MONGODB_URI` | **yes** | - | Database connection string |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | **yes** | - | Two different random strings, 32+ characters |
| `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN` | no | `15m`, `7d` | Token lifetimes |
| `BCRYPT_SALT_ROUNDS` | no | `12` | Password hashing cost |
| `CORS_ORIGIN` | in practice | none allowed | Address(es) of the web app, comma-separated. Empty means no browser origin is allowed |
| `ALLOW_PUBLIC_REGISTRATION` | no | on outside production | Whether anyone may register |
| `RATE_LIMIT_ENABLED`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` | no | `true`, 15 min, 300 | Requests per address |
| `LOGIN_RATE_LIMIT_WINDOW_MS`, `LOGIN_RATE_LIMIT_MAX` | no | 15 min, 10 | Failed sign-ins per address |
| `TRUST_PROXY` | no | `0` | Number of reverse proxies in front |
| `STORAGE_DRIVER`, `UPLOAD_DIR`, `S3_*` | no | `local`, `uploads` | Where uploaded files go |
| `UPLOAD_MAX_FILE_MB`, `UPLOAD_MAX_FILES`, `UPLOAD_ALLOWED_TYPES` | no | 10, 5, common types | Upload limits (defaults; Settings can override) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` / `SMTP_URL`, `MAIL_FROM` | no | - | Mail server; unset = no email |
| `*_PREFIX`, `*_DIGITS` | no | e.g. `LEAD`, `6` | Record number format (prefixes are defaults; Settings can override) |
| `CONTRACT_REMINDER_INTERVAL_MINUTES`, `NOTIFICATION_CHECK_INTERVAL_MINUTES` | no | `60` | How often the background jobs run; `0` = off |
| `AUDIT_ENABLED` | no | `true` | The audit trail |
| `REPORT_EXPORT_MAX_ROWS` | no | `10000` | Cap on exported rows |
| `LOG_LEVEL` | no | `info` | Pino log level |

`client/.env`:

| Variable | Purpose |
| -------- | ------- |
| `VITE_API_BASE_URL` | The API, including `/api/v1` |
| `VITE_APP_NAME` | Name shown until a company name is set in Settings |
| `VITE_API_TIMEOUT_MS` | Request timeout |
| `VITE_DEV_PORT` | Dev server port (must match `CORS_ORIGIN`) |

Everything in `client/.env` is public. Secrets belong only in `server/.env`,
which is never committed.

## 12. MongoDB setup

Local development:

```bash
# Windows: the MongoDB service installed by the MSI.   macOS: brew services start mongodb-community
# Docker:
docker run -d --name crm-mongo -p 27017:27017 -v crm-mongo:/data/db mongo:7
```

```text
MONGODB_URI=mongodb://127.0.0.1:27017/crm
```

The database and its collections are created on first use; indexes are built
at start. For production use a replica set or a managed cluster with
authentication - see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## 13. Seed commands

| Command (from `server/`) | What it does |
| ------------------------ | ------------ |
| `npm start` / `npm run dev` | On start: loads the permission catalogue, the two starting roles and - once - the first values of each list |
| `npm run seed` | The same, without starting the server |
| `npm run create:admin -- --first-name … --last-name … --email …` | Creates a full-access user; password from `ADMIN_PASSWORD` |
| `npm run seed:demo` | Demo companies, leads, quotations, orders … for trying the app. `-- --force` to run again. **Never in production** |

Seed data lives only in `server/src/seeds/` (permissions and first-run list
values) and `server/scripts/seed-demo.js` (demo records). No business record,
name or figure is written anywhere else in the code.

## 14. Development commands

From the repository root:

| Command | |
| ------- | --- |
| `npm run dev` | API (with reload) and web app (with hot reload) together |
| `npm run dev:server` / `npm run dev:client` | One of them |
| `npm run lint` | ESLint, server and client |
| `npm test` | Server tests, then client tests |
| `npm run test:e2e` | The whole business workflow through a real server |
| `npm run test:postman` | The Postman collection through a real server (Newman) |
| `npm run build` | Production build of the web app |

## 15. Production build

```bash
cd client
VITE_API_BASE_URL=https://crm.yourcompany.com/api/v1 npm run build     # → client/dist
cd ../server
npm ci --omit=dev && NODE_ENV=production npm start
```

The web app is static files; pages are split into chunks and loaded on demand.
The API needs no build step.

## 16. Deployment

Serve `client/dist` as static files and run the API behind a reverse proxy
with TLS; point both at a MongoDB that requires authentication and at object
storage for files. A step-by-step guide with an nginx example, the production
environment, running several instances, upgrading and a go-live checklist:
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## 17. Postman collection

`postman/CRM.postman_collection.json` has a request - with tests - for **every
one of the 267 routes**, in the order the business uses them:

```text
Authentication · Users · Roles · Permissions · Companies · Contacts ·
Lead Configuration · Leads · Activities · Follow-ups · Products · Pipelines ·
Opportunities · Quotations · Orders · Customers · Projects · Tasks · Tickets ·
Contracts · Payments · Documents · Notifications · Dashboard · Reports ·
Audit Logs · Settings · Search · Cleanup
```

1. Import the collection and `postman/CRM.postman_environment.json`; select the
   **CRM** environment.
2. Set `userEmail` and `userPassword` to an account with full access. (The
   environment file ships with them empty - never commit real credentials.)
3. Run any request. With no token yet, it signs in by itself first.

How it works:

- **Ids are saved for you.** A request that creates something stores its id
  (`companyId`, `contactId`, `leadId`, `opportunityId`, `quotationId`,
  `orderId`, `customerId`, `projectId`, `ticketId`, `contractId`, `userId`, …)
  and later requests use it. So the collection can be run from top to bottom.
- **Cleanup** (the last folder) deletes what was created, in an order in which
  each delete is allowed. Skip it to keep the records.
- **Upload Document** sends `postman/sample-document.txt`; in the Postman app,
  choose a file yourself in Body → form-data.
- The Settings folder changes real settings and puts them back at the end.

To run all of it from the command line against a throwaway server:

```bash
npm run test:postman
```

## 18. Testing

```bash
npm run lint            # ESLint
npm test                # server (node:test + supertest) and client (Vitest)
npm run test:e2e        # the business workflow, end to end, through the API
npm run test:postman    # every request in the Postman collection
```

Each uses a database of its own and removes it afterwards; none touches the
database in `.env`. What each layer covers and how to add tests:
[docs/TESTING.md](docs/TESTING.md).

## 19. Security

| Concern | How it is handled |
| ------- | ----------------- |
| Passwords | bcrypt hashes only; never returned, never logged, never in the audit log |
| Tokens | Short access token, rotating refresh token stored as a hash, all revoked on logout / password or role change |
| Authorization | A permission check on every route; the role is read from the database on each request |
| Input | Joi validation on body, query and params; unknown fields dropped; regular-expression input escaped |
| Headers and transport | Helmet; CORS restricted to `CORS_ORIGIN`; 1 MB JSON limit |
| Abuse | Per-address rate limit on the API and a stricter one on failed sign-ins |
| Files | Type, extension and content signature checked; size and count limited; stored under generated names; served only to users who may read the record |
| Errors | One shape; no stack traces or internals in responses |
| Audit | Every change and sign-in recorded, append-only, secrets removed |
| Secrets | Only in `server/.env` (git-ignored); never in settings, the client, Postman or logs |
| Spreadsheet exports | Values that could be read as formulas are neutralised |

`npm audit` reports no known vulnerabilities in either package.

## 20. Troubleshooting

| Symptom | Cause and fix |
| ------- | ------------- |
| The server exits at start naming a variable | `server/.env` is missing it or it is malformed. Run `npm run setup:env`, or fix the value |
| `MongoServerSelectionError` | MongoDB is not running, or `MONGODB_URI` is wrong |
| The web app says it cannot reach the server | The API is not running, or `VITE_API_BASE_URL` points elsewhere. Restart the web app after changing `client/.env` |
| A CORS error in the browser console | `CORS_ORIGIN` in `server/.env` must be exactly the web app's address, including the port |
| Signed in but every page says access denied | The account has the default role, which has no permissions. Sign in as an administrator and give it a role - or create one with `npm run create:admin` |
| "Too many requests" | The rate limit. Wait, raise `RATE_LIMIT_MAX`, or set `RATE_LIMIT_ENABLED=false` on a development machine |
| "Too many login attempts" | Ten failed sign-ins in 15 minutes from one address. Wait, or restart the API in development |
| Quotation email is "marked as sent" but nothing arrives | No mail server is configured (`SMTP_*`). `npm run mail:check` tests the connection |
| Uploaded files disappear after a redeploy | They were on local disk. Use `STORAGE_DRIVER=s3`, or a persistent volume for `UPLOAD_DIR` |
| A new permission does not appear on the Roles screen | Permissions are loaded at start: restart the API |
| Client tests time out | Something else is using the machine. They pass alone; workers are capped in `client/vite.config.js` |
| Demo data appeared in a real database | `npm run seed:demo` was run. Never run it in production |

## 21. Future improvements

Known limits today, and what would come next:

- **Organization scope on list endpoints.** The dashboard, reports, search and
  audit log are limited by organization; plain lists (`GET /leads`, …) are
  limited by permission only. Applying the same scope to every list is the main
  step towards strict multi-organization isolation.
- **Forms.** Long forms are single pages; sections, steppers for quotations and
  orders, draft autosave and MUI date pickers are not built.
- **Translation.** The shell, list pages, tables, sign-in and error pages are
  in English, Odia and Hindi; text inside detail pages, forms and module
  dialogs is English only, and the Odia and Hindi wording needs a native review.
- **Tables.** Column pinning and drag-to-reorder of headers need the paid MUI X
  Pro grid. Bulk actions exist for leads only.
- **Purchasing and devices.** There is no purchase / supplier module and no
  device-data (IoT) module; partner equipment and devices can be catalogued as
  products only.
- **Real-time across instances.** Notifications are pushed by the instance that
  created them; a Redis adapter would deliver them across several.
- **Time zones.** The time-zone setting affects display; "today" for overdue
  and expiry checks is the UTC date.
- **Also:** departments management, saved and scheduled reports, email and
  per-user notification preferences, two-factor sign-in, an import tool,
  browser-level end-to-end tests in the test suite, Docker images.
