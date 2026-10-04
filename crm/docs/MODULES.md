# CRM - module reference

> The detailed description of every module: models, rules, endpoints and examples.
> For the overview, setup and operations see the [README](../README.md).

A B2B CRM built as a React single-page app on top of a versioned REST API.

Implemented so far:

- **Module 01 - Project Foundation**: project structure, tooling, security middleware,
  centralized API/error handling, and a health endpoint.
- **Module 02 - Authentication**: JWT login with refresh-token rotation, password policy,
  login rate limiting, and a protected React app with a `/login` page.
- **Module 03 - Users**: user management API with permission-based authorization, and `/users`
  and `/users/:id` screens (search, filter, pagination, create, edit, activate/deactivate,
  reset password, delete).
- **Module 04 - Dynamic RBAC**: roles and permissions stored in MongoDB and resolved on every
  request, role management API and screens (`/roles`, `/roles/:id`, `/permissions`), a
  permission-driven sidebar and a reusable `<PermissionGate />`.
- **Module 05 - Companies / Accounts**: company records with server-generated codes, search,
  filtering, sorting and pagination, a tabbed detail page whose sections load from the API, and a
  change timeline.
- **Module 06 - Contacts**: people at a company. Every contact belongs to a company that must
  exist; list with company, status and search filters; a company picker that searches the API.
- **Module 07 - Lead configuration**: lead sources, statuses and priorities as data that
  administrators manage, with a one-time seed of initial values and an API-driven dropdown for
  lead forms.
- **Module 08 - Lead management**: leads with server-generated numbers, assignment, status,
  a timeline, and conversion into a company, contact and opportunity that reuses existing records
  instead of duplicating them.
- **Module 09 - Activities and follow-ups**: a generic system for any record - database-driven
  activity types, activities related to companies, contacts, leads and opportunities, follow-ups
  with completion and rescheduling, and reusable `ActivityTimeline`, `ActivityForm` and
  `FollowUpDialog` components.
- **Module 10 - Products and services**: a product catalogue with generated or validated SKUs,
  administrator-managed categories, units and taxes, search with category, status and price-range
  filters, and a product picker for later modules.
- **Module 11 - Pipelines and opportunities**: any number of sales pipelines whose stages (name,
  order, probability, colour, status) live in MongoDB, opportunities that move through them, and
  a Kanban board whose columns are drawn from those stages, with drag and drop validated by the
  API.
- **Module 12 - Quotations**: quotations for a company whose every amount is calculated by the
  server from product prices and taxes, administrator-managed statuses, a company profile stored
  in MongoDB, a generated PDF, sending by email, and an API-driven quotation builder.
- **Module 13 - Orders**: orders created from accepted quotations - with the backend checking the
  quotation exists, belongs to the company, is accepted and has no order yet, and an atomic claim
  that makes duplicate orders impossible - or entered directly, with administrator-managed statuses.
- **Module 14 - Customers**: customers that reference their company, primary contact and first
  order instead of copying them, created automatically by a first order or by hand, with a
  360-degree view whose every count and figure comes from the database.
- **Module 15 - Projects and tasks**: projects linked to a company, its customer record and an
  order, with tasks, milestones and a team; project and task statuses as administrator-managed
  lists, progress worked out in the database, and a project page with real counts.
- **Module 16 - Support tickets**: tickets with administrator-managed categories, priorities and
  statuses, replies and internal notes with file attachments, and a ticket page built as one
  conversation feed.
- **Module 17 - Contracts (AMC)**: contracts with administrator-managed types, statuses and
  billing cycles, and automatic expiry reminders whose periods are data, not code.
- **Module 18 - Payment tracking**: invoices to collect with the remaining amount and status
  calculated by the server, overpayment refused unless configured, and Paid / Partially paid /
  Unpaid / Overdue filters.
- **Module 19 - Document management**: files attached to any of ten kinds of record, kept in
  object storage (S3-compatible) with only their details in MongoDB, validated by type, content
  and size, and readable only by users who may see the record.
- **Module 20 - Notifications**: per-user notifications produced by business events (assignments,
  status changes, due and overdue dates), with recipients read from the records, delivered in
  real time over Socket.IO.
- **Module 21 - Dashboard**: metrics and charts served by five endpoints for a chosen period,
  limited by each user's permissions and organization.
- **Module 22 - Reporting**: eleven reports computed by the database, each with a date range,
  search, filters, sorting and paging, exported to CSV, Excel and PDF.
- **Module 23 - Audit logs**: every change, sign-in and sign-out recorded automatically with who,
  what changed, and from where - with no secrets stored, and no way to edit an entry.
- **Module 24 - Settings**: company, CRM, sales, quotation, notification, email, document and
  security settings stored in the database and applied without a restart.
- **Module 25 - Global search**: one search box for companies, contacts, leads, opportunities,
  quotations, orders, projects, tickets and contracts, answered from a database index and limited
  by each user's permissions and organization.
- **Design system and UI**: a central theme with eight colour themes, light / dark / system,
  text sizes, English / Odia / Hindi, a resizable sidebar, customisable tables and dashboard, and
  per-user preferences saved to the account.

Business modules are added on top (see [Future modules](#future-modules)).

## Contents

- [Technology stack](#technology-stack)
- [Architecture](#architecture)
- [Folder structure](#folder-structure)
- [Requirements](#requirements)
- [Installation](#installation)
- [Environment variables](#environment-variables)
- [MongoDB setup](#mongodb-setup)
- [Backend setup](#backend-setup)
- [Frontend setup](#frontend-setup)
- [Development commands](#development-commands)
- [API base URL](#api-base-url)
- [Authentication](#authentication)
- [Users](#users)
- [Roles and permissions (RBAC)](#roles-and-permissions-rbac)
- [Companies](#companies)
- [Contacts](#contacts)
- [Lead configuration](#lead-configuration)
- [Leads](#leads)
- [Activities and follow-ups](#activities-and-follow-ups)
- [Products](#products)
- [Pipelines and opportunities](#pipelines-and-opportunities)
- [Quotations](#quotations)
- [Orders](#orders)
- [Customers](#customers)
- [Projects and tasks](#projects-and-tasks)
- [Support tickets](#support-tickets)
- [Contracts (AMC)](#contracts-amc)
- [Payment tracking](#payment-tracking)
- [Document management](#document-management)
- [Notifications](#notifications)
- [Dashboard](#dashboard)
- [Reporting](#reporting)
- [Audit logs](#audit-logs)
- [Application settings](#application-settings)
- [Global search](#global-search)
- [Design system, preferences and languages](#design-system-preferences-and-languages)
- [Postman usage](#postman-usage)
- [Security](#security)
- [Future modules](#future-modules)

## Technology stack

| Layer    | Technology                                                                            |
| -------- | ------------------------------------------------------------------------------------- |
| Frontend | React 19, Vite, JavaScript, Material UI, React Router, Axios, TanStack Query, React Hook Form, Yup |
| Backend  | Node.js, Express 5, JavaScript (ES modules), Mongoose, Joi                            |
| Database | MongoDB                                                                               |
| Auth     | JWT (access + refresh tokens), bcryptjs                                               |
| Documents | pdfkit (quotation PDFs), nodemailer (sending quotations)                             |
| Security | Helmet, CORS allow-list, express-rate-limit, compression                              |
| Logging  | Pino / pino-http                                                                      |
| Testing  | `node:test`, supertest                                                                |

## Architecture

```text
Browser (React SPA)
   │  Axios client -> attaches Bearer token, unwraps the response envelope
   ▼
Express API  /api/v1
   │  helmet -> cors -> compression -> body parsing -> rate limit
   │  routes -> validate (Joi) -> controllers -> services -> models
   │  notFound -> errorHandler  (single place that formats every error)
   ▼
MongoDB (Mongoose)
```

- **Layered backend.** Routes declare endpoints, controllers handle HTTP, services hold business
  logic, models own persistence. Validation runs before a controller is reached.
- **One response format.** Every response is produced by `server/src/utils/apiResponse.js`.

  Success:

  ```json
  { "success": true, "message": "", "data": null }
  ```

  Error:

  ```json
  { "success": false, "message": "", "errors": [] }
  ```

  `errors` is a list of `{ "field": "...", "message": "..." }` objects.

- **Centralized error handling.** Code throws `ApiError`; `server/src/middleware/errorHandler.js`
  converts it - plus Mongoose, JWT, and body-parser errors - into the error format. Unexpected
  errors are logged and returned as a generic 500 in production.
- **Centralized API handling on the client.** `client/src/api/axiosClient.js` is the only place
  that talks HTTP. Failures are rejected as an `ApiError` with `message`, `status`, and `errors`.
- **Nothing is hardcoded.** Records come from MongoDB and configuration from environment
  variables. There is no seed or mock business data in the codebase.

## Folder structure

```text
crm/
├── client/                      React application
│   ├── src/
│   │   ├── api/                 Axios client, query client, resource API functions
│   │   ├── components/          Reusable UI; components/ui/ is the shared component library
│   │   ├── context/             Context providers (auth session, user preferences)
│   │   ├── i18n/                Languages: setup and locales/<id>/common.json
│   │   ├── hooks/               Query hooks and shared hooks
│   │   ├── layouts/             Page shells
│   │   ├── pages/               Route-level screens
│   │   ├── routes/              Route table
│   │   ├── theme/               Design system: colours, typography, spacing, shadows, overrides
│   │   ├── utils/               Env access, token storage
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── .env.example
│   ├── package.json
│   └── README.md
├── server/                      REST API
│   ├── src/
│   │   ├── config/              Env validation, logger, database
│   │   ├── constants/           Statuses, messages, enums
│   │   ├── controllers/
│   │   ├── jobs/                Background jobs
│   │   ├── middleware/          Auth, validation, rate limit, errors
│   │   ├── models/              Mongoose schemas
│   │   ├── routes/
│   │   ├── services/            Business logic
│   │   ├── utils/               ApiError, responses, JWT, passwords
│   │   ├── validators/          Joi schemas
│   │   ├── app.js               Express app (no network / DB side effects)
│   │   └── server.js            Entry point: DB connect, listen, shutdown
│   ├── scripts/
│   ├── tests/
│   ├── .env.example
│   ├── package.json
│   └── README.md
├── docs/                        UI_UX.md, THEMING.md, I18N.md
├── postman/
│   ├── CRM.postman_collection.json
│   └── CRM.postman_environment.json
├── package.json                 Root scripts that run client + server together
└── README.md
```

## Requirements

- Node.js 20 or newer (developed on Node 24) and npm
- MongoDB 6 or newer, local or MongoDB Atlas
- Postman (optional, for the API collection)

## Installation

From the `crm/` folder:

```bash
npm run install:all   # installs root, server and client dependencies
npm run setup:env     # creates server/.env (with generated JWT secrets) and client/.env
npm run dev           # starts the API and the web client together
```

Then open <http://localhost:5173>. You are redirected to `/login`; create an account first (see
[Creating the first user](#creating-the-first-user)). After signing in, the home page shows a live
"API status" card that calls the health endpoint.

`setup:env` never overwrites an existing `.env` file.

## Environment variables

Real `.env` files are git-ignored. Only `.env.example` files are committed.

### Server (`server/.env`)

| Variable                 | Required | Default                 | Description                                         |
| ------------------------ | -------- | ----------------------- | --------------------------------------------------- |
| `NODE_ENV`               | no       | `development`           | `development`, `test` or `production`               |
| `PORT`                   | no       | `5000`                  | API port                                            |
| `API_PREFIX`             | no       | `/api/v1`               | Versioned route prefix                              |
| `MONGODB_URI`            | **yes**  | -                       | MongoDB connection string                           |
| `JWT_ACCESS_SECRET`      | **yes**  | -                       | Access-token signing secret, 32+ characters         |
| `JWT_REFRESH_SECRET`     | **yes**  | -                       | Refresh-token signing secret, 32+ characters        |
| `JWT_ACCESS_EXPIRES_IN`  | no       | `15m`                   | Access-token lifetime                               |
| `JWT_REFRESH_EXPIRES_IN` | no       | `7d`                    | Refresh-token lifetime                              |
| `BCRYPT_SALT_ROUNDS`     | no       | `12`                    | Password hashing cost (10-15)                       |
| `ALLOW_PUBLIC_REGISTRATION` | no    | `true`, but `false` in production | Whether anyone can call `POST /auth/register`. When `false`, only a signed-in admin can. **A default**: Application settings -> Security overrides it |
| `LOGIN_RATE_LIMIT_WINDOW_MS` | no   | `900000`                | Window for counting failed logins                   |
| `LOGIN_RATE_LIMIT_MAX`   | no       | `10`                    | Failed logins allowed per IP per window             |
| `COMPANY_CODE_PREFIX`    | no       | `COMP`                  | Prefix of generated company codes (1-10 uppercase letters/digits) |
| `COMPANY_CODE_DIGITS`    | no       | `6`                     | Zero-padded width of the number in company codes (3-12) |
| `LEAD_NUMBER_PREFIX`, `LEAD_NUMBER_DIGITS` | no | `LEAD`, `6` | Format of generated lead numbers (`LEAD-000001`)    |
| `OPPORTUNITY_NUMBER_PREFIX`, `OPPORTUNITY_NUMBER_DIGITS` | no | `OPP`, `6` | Format of generated opportunity numbers |
| `STORAGE_DRIVER` | no | `local` | Where uploaded files are kept: `s3` (any S3-compatible object store - use in production) or `local` (the `UPLOAD_DIR` folder) |
| `S3_BUCKET` | with `s3` | - | The bucket; it must exist and should be private |
| `S3_REGION` | no | `us-east-1` | |
| `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE` | no | -, `false` | For stores other than AWS (MinIO: `http://localhost:9000` and `true`) |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | no | - | Both or neither; without them the SDK uses the machine's own credentials |
| `S3_KEY_PREFIX` | no | - | Optional folder inside the bucket |
| `AUDIT_ENABLED` | no | `true` | Record the audit log. Leave on; `false` exists for test runs |
| `REPORT_EXPORT_MAX_ROWS` | no | `10000` | The most rows one report export (CSV, Excel, PDF) may hold |
| `NOTIFICATION_CHECK_INTERVAL_MINUTES` | no | `15` | How often the server looks for follow-ups that have come due and payments that have become overdue, to notify the people concerned; `0` = off |
| `INVOICE_NUMBER_PREFIX`, `INVOICE_NUMBER_DIGITS` | no | `INV`, `6` | Format of generated invoice numbers (when none is entered) |
| `PAYMENT_ALLOW_OVERPAYMENT` | no | `false` | `true` allows paying more than the invoice amount, and invoicing an order for more than its total |
| `CONTRACT_NUMBER_PREFIX`, `CONTRACT_NUMBER_DIGITS` | no | `CON`, `6` | Format of generated contract numbers |
| `CONTRACT_REMINDER_INTERVAL_MINUTES` | no | `60` | How often the server checks for contract reminders and expiry; `0` = off. The reminder periods themselves are data (Settings) |
| `TICKET_NUMBER_PREFIX`, `TICKET_NUMBER_DIGITS` | no | `TKT`, `6` | Format of generated ticket numbers |
| `UPLOAD_DIR`             | no       | `uploads`               | Where ticket attachments are stored; relative paths are from the server folder |
| `UPLOAD_MAX_FILE_MB`     | no       | `10`                    | Largest file accepted                               |
| `UPLOAD_MAX_FILES`       | no       | `5`                     | Files per request                                   |
| `UPLOAD_ALLOWED_TYPES`   | no       | images, PDF, text, CSV, ZIP, Word, Excel | Comma-separated MIME types; `image/*` allows a family |
| `PROJECT_NUMBER_PREFIX`, `PROJECT_NUMBER_DIGITS` | no | `PRJ`, `6` | Format of generated project numbers |
| `CUSTOMER_NUMBER_PREFIX`, `CUSTOMER_NUMBER_DIGITS` | no | `CUST`, `6` | Format of generated customer numbers |
| `ORDER_NUMBER_PREFIX`, `ORDER_NUMBER_DIGITS` | no | `ORD`, `6` | Format of generated order numbers |
| `QUOTATION_NUMBER_PREFIX`, `QUOTATION_NUMBER_DIGITS` | no | `QUO`, `6` | Format of generated quotation numbers |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | no | empty, `587` | Outgoing mail server for "Send quotation" (port 465 = TLS). Gmail: `smtp.gmail.com`, `465`, your address and an **App Password**. Empty: nothing is emailed; sending only marks the quotation as sent. Check with `npm run mail:check` |
| `SMTP_URL`               | no       | empty                   | Alternative to the four above, e.g. `smtps://you%40gmail.com:app-password@smtp.gmail.com:465` (an `@` in the user name must be written `%40`) |
| `MAIL_FROM`              | no       | the profile's email   | Sender address of quotation emails                  |
| `PRODUCT_SKU_PREFIX`, `PRODUCT_SKU_DIGITS` | no | `PRD`, `6` | Format of generated product SKUs when the product's category has no prefix of its own |
| `COMPANY_MATCH_FIELDS`   | no       | `gstNumber,email,name`  | Fields used, in order, to find an existing company before creating one on lead conversion. Allowed: `gstNumber`, `panNumber`, `email`, `phone`, `website`, `name` |
| `CONTACT_MATCH_FIELDS`   | no       | `email,phone`           | The same for contacts, within the company. Allowed: `email`, `phone`, `alternatePhone`, `name` |
| `CORS_ORIGIN`            | no       | *(none)*                | Comma-separated list of allowed browser origins     |
| `RATE_LIMIT_WINDOW_MS`   | no       | `900000`                | Rate-limit window in milliseconds                   |
| `RATE_LIMIT_MAX`         | no       | `300`                   | Requests allowed per IP per window                  |
| `TRUST_PROXY`            | no       | `0`                     | Number of reverse proxies in front of the API       |
| `LOG_LEVEL`              | no       | `info`                  | Pino log level                                      |

The server validates these at startup and exits with a list of problems if any are missing or
invalid.

### Client (`client/.env`)

| Variable              | Required | Default | Description                                       |
| --------------------- | -------- | ------- | ------------------------------------------------- |
| `VITE_API_BASE_URL`   | **yes**  | -       | API base URL including `/api/v1`                  |
| `VITE_APP_NAME`       | no       | `CRM`   | Name shown in the app bar and browser tab         |
| `VITE_API_TIMEOUT_MS` | no       | `15000` | Request timeout                                   |
| `VITE_DEV_PORT`       | no       | `5173`  | Dev server port                                   |

`VITE_` variables are embedded in the browser bundle and are public. Never put secrets there.

## MongoDB setup

**Local.** Install MongoDB Community Server and make sure the service is running, then use:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/crm
```

The `crm` database is created automatically on first write.

**Atlas.** Create a cluster, a database user, and allow your IP address, then use the connection
string Atlas gives you:

```text
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-host>/crm
```

The API will not start if it cannot reach MongoDB within 10 seconds.

## Backend setup

```bash
cd server
npm install
npm run setup:env     # or copy .env.example to .env and fill in the secrets
npm run dev
```

Check it:

```bash
curl http://localhost:5000/api/v1/health
```

```json
{ "success": true, "message": "CRM API is running" }
```

## Frontend setup

```bash
cd client
npm install
cp .env.example .env  # PowerShell: Copy-Item .env.example .env
npm run dev
```

The app runs on <http://localhost:5173>. If you change `VITE_DEV_PORT`, add the new origin to
`CORS_ORIGIN` in `server/.env`.

## Development commands

Run from `crm/`:

| Command               | Purpose                                         |
| --------------------- | ----------------------------------------------- |
| `npm run install:all` | Install root, server and client dependencies    |
| `npm run setup:env`   | Create missing `.env` files                     |
| `npm run dev`         | Run API and client together                     |
| `npm run dev:server`  | Run only the API                                |
| `npm run dev:client`  | Run only the client                             |
| `npm test`            | Run the API tests, then the client tests. The API tests need MongoDB and use throwaway `crm_test_*` databases |
| `npm run test:server` / `npm run test:client` | Run one of the two suites       |
| `npm run seed`        | Load the permission catalogue, seed roles and (once) the initial lead configuration, activity types and sales pipeline. Also done on every API start |
| `npm run seed:demo`   | Load a set of demo records (companies, contacts, leads, opportunities, activities, products, quotations, orders, customers, projects, tickets) through the normal services. Runs once; `-- --force` adds another set; `-- --orders` only turns accepted quotations without an order into orders; `-- --customers` only makes some companies customers by hand; `-- --projects` only adds projects, milestones and tasks for customers that have none; `-- --documents` only adds a few small sample documents, if there are none; `-- --payments` only adds payments in every state (paid, part paid, unpaid, overdue), if there are none; `-- --contracts` only adds contracts ending at various dates, if there are none; `-- --tickets` only adds tickets with conversations, if there are none |
| `npm --prefix server run create:admin -- --first-name ... --last-name ... --email ...` | Create a user with the full-access role |
| `npm run build`       | Production build of the client (`client/dist`)  |
| `npm start`           | Start the API without file watching             |

`server/` and `client/` are independent packages, so `npm install` and `npm run dev` also work
inside each folder.

## API base URL

```text
http://localhost:5000/api/v1
```

| Method | Path                    | Auth                    | Description                              |
| ------ | ----------------------- | ----------------------- | ---------------------------------------- |
| GET    | `/health`               | Public                  | Liveness check                           |
| POST   | `/auth/register`        | Public or `users.create` (config) | Sign up (default role)         |
| POST   | `/auth/login`           | Public                  | Sign in; returns user + tokens           |
| POST   | `/auth/refresh-token`   | Refresh token in body   | Exchange a refresh token for a new pair  |
| GET    | `/auth/me`              | Access token            | The signed-in user                       |
| POST   | `/auth/change-password` | Access token            | Change password; returns a new token pair |
| POST   | `/auth/logout`          | Access token            | Revoke the session                       |
| GET    | `/users`                | `users.read`            | List users (search, filter, sort, paginate) |
| POST   | `/users`                | `users.create`          | Create a user                            |
| GET    | `/users/:id`            | `users.read`            | One user                                 |
| PUT    | `/users/:id`            | `users.update`          | Update a user                            |
| PATCH  | `/users/:id/status`     | `users.changeStatus`    | Activate / deactivate                    |
| PATCH  | `/users/:id/reset-password` | `users.resetPassword` | Set a new password for a user          |
| DELETE | `/users/:id`            | `users.delete`          | Delete (soft) a user                     |
| GET    | `/roles`                | `roles.read` or `users.read` | List roles                          |
| POST   | `/roles`                | `roles.create`          | Create a role                            |
| GET    | `/roles/:id`            | `roles.read`            | One role with its permissions            |
| PUT    | `/roles/:id`            | `roles.update`          | Update name, description, status         |
| PUT    | `/roles/:id/permissions` | `roles.assignPermissions` | Replace a role's permissions          |
| DELETE | `/roles/:id`            | `roles.delete`          | Delete a role                            |
| GET    | `/permissions`          | `permissions.read` or `roles.read` | The permission catalogue      |
| GET    | `/departments`          | `users.read`            | Active departments, for dropdowns        |
| GET    | `/users/options`        | `users.read`, `companies.create` or `companies.update` | Names of active users, for "assign to" pickers |
| GET    | `/companies`            | `companies.read`        | List companies (search, filter, sort, paginate) |
| POST   | `/companies`            | `companies.create`      | Create a company                         |
| GET    | `/companies/:id`        | `companies.read`        | One company                              |
| PUT    | `/companies/:id`        | `companies.update`      | Update a company                         |
| DELETE | `/companies/:id`        | `companies.delete`      | Delete (soft) a company                  |
| GET    | `/companies/:id/sections` | `companies.read`      | Detail-page sections with availability and counts |
| GET    | `/companies/:id/timeline` | `companies.read`      | The company's change history             |
| GET    | `/industries`, `/company-types`, `/organizations` | any `companies.*` read/create/update | Active entries, for dropdowns |
| POST   | `/industries`, `/company-types`, `/organizations` | `companies.manageLookups` | Add an entry |
| GET    | `/companies/options`    | `companies.read` or any of `contacts.read` / `.create` / `.update` | Code and name of companies, for pickers |
| GET    | `/contacts`             | `contacts.read`         | List contacts (company, status, search; sort, paginate) |
| POST   | `/contacts`             | `contacts.create`       | Create a contact                         |
| GET    | `/contacts/:id`         | `contacts.read`         | One contact                              |
| PUT    | `/contacts/:id`         | `contacts.update`       | Update a contact                         |
| DELETE | `/contacts/:id`         | `contacts.delete`       | Delete (soft) a contact                  |
| GET    | `/lead-sources`, `/lead-statuses`, `/lead-priorities` | `leadConfig.manage` or any of `leads.read` / `.create` / `.update` | List the configured values |
| POST   | `/lead-sources`, `/lead-statuses`, `/lead-priorities` | `leadConfig.manage` | Add a value                    |
| PUT    | `/lead-sources/:id`, `/lead-statuses/:id`, `/lead-priorities/:id` | `leadConfig.manage` | Update a value     |
| DELETE | `/lead-sources/:id`, `/lead-statuses/:id`, `/lead-priorities/:id` | `leadConfig.manage` | Delete a value     |
| GET    | `/leads`                | `leads.read`            | List leads (search, filter, sort, paginate) |
| POST   | `/leads`                | `leads.create`          | Create a lead                            |
| GET    | `/leads/:id`            | `leads.read`            | One lead                                 |
| PUT    | `/leads/:id`            | `leads.update`          | Update a lead                            |
| DELETE | `/leads/:id`            | `leads.delete`          | Delete (soft) a lead                     |
| PATCH  | `/leads/:id/assign`     | `leads.assign`          | Assign or unassign                       |
| PATCH  | `/leads/:id/status`     | `leads.update`          | Change status                            |
| POST   | `/leads/:id/convert`    | `leads.convert`         | Convert (or preview with `dryRun`)       |
| GET    | `/leads/:id/timeline`   | `leads.read`            | The lead's history                       |
| GET    | `/activities`           | `activities.read`       | List activities (by related record, type, status, ...) |
| POST   | `/activities`           | `activities.create`     | Log or plan an activity                  |
| PUT    | `/activities/:id`       | `activities.update`     | Update (e.g. complete) an activity       |
| DELETE | `/activities/:id`       | `activities.delete`     | Delete (soft) an activity                |
| GET    | `/activity-types`       | `activities.manageTypes` or any of `activities.read` / `.create` / `.update` | List activity types |
| POST / PUT / DELETE | `/activity-types`, `/activity-types/:id` | `activities.manageTypes` | Manage activity types |
| GET    | `/followups`            | `followups.read`        | List follow-ups (by related record, assignee, status, ...) |
| POST   | `/followups`            | `followups.create`      | Create a follow-up                       |
| PUT    | `/followups/:id`        | `followups.update`      | Update, cancel or reopen a follow-up     |
| PATCH  | `/followups/:id/complete` | `followups.update`    | Mark completed                           |
| PATCH  | `/followups/:id/reschedule` | `followups.update`  | Move the due date                        |
| GET    | `/products`             | `products.read`         | List products (search, category, status, price range, sort, paginate) |
| POST   | `/products`             | `products.create`       | Create a product                         |
| GET    | `/products/:id`         | `products.read`         | One product                              |
| PUT    | `/products/:id`         | `products.update`       | Update a product                         |
| DELETE | `/products/:id`         | `products.delete`       | Delete (soft) a product                  |
| GET    | `/products/options`     | `products.read`         | Active products for pickers              |
| GET    | `/products/sku-check`   | `products.create` or `products.update` | Whether a SKU is free     |
| GET    | `/product-categories`, `/units`, `/taxes` | `products.manageCatalog` or any of `products.read` / `.create` / `.update` | List the catalogue lists |
| POST / PUT / DELETE | `/product-categories`, `/units`, `/taxes` (and `/:id`) | `products.manageCatalog` | Manage the catalogue lists |
| GET    | `/contacts/options`     | `contacts.read` or any of `leads.read` / `.create` / `.update` | Names of contacts, for pickers |
| GET    | `/pipelines`            | `pipelines.manage`, any of `opportunities.read` / `.create` / `.update`, or `leads.convert` | List pipelines with stage and opportunity counts |
| POST   | `/pipelines`            | `pipelines.manage`      | Create a pipeline                        |
| GET    | `/pipelines/:id`        | as `GET /pipelines`     | One pipeline with its stages             |
| PUT    | `/pipelines/:id`        | `pipelines.manage`      | Update, make default, activate / deactivate |
| DELETE | `/pipelines/:id`        | `pipelines.manage`      | Delete a pipeline and its stages         |
| GET    | `/pipeline-stages`      | as `GET /pipelines`     | Stages in board order (`?pipelineId`, `?status`) |
| POST   | `/pipeline-stages`      | `pipelines.manage`      | Add a stage at the end of a pipeline     |
| PUT    | `/pipeline-stages/:id`  | `pipelines.manage`      | Update a stage                           |
| DELETE | `/pipeline-stages/:id`  | `pipelines.manage`      | Delete a stage                           |
| PATCH  | `/pipeline-stages/reorder` | `pipelines.manage`   | Set the order of a pipeline's stages     |
| GET    | `/opportunities`        | `opportunities.read`    | List opportunities (search, filter, sort, paginate) |
| GET    | `/opportunities/board`  | `opportunities.read`    | One pipeline as Kanban columns with totals |
| POST   | `/opportunities`        | `opportunities.create`  | Create an opportunity                    |
| GET    | `/opportunities/:id`    | `opportunities.read`    | One opportunity                          |
| PUT    | `/opportunities/:id`    | `opportunities.update`  | Update an opportunity                    |
| DELETE | `/opportunities/:id`    | `opportunities.delete`  | Delete (soft) an opportunity             |
| PATCH  | `/opportunities/:id/stage` | `opportunities.update` | Move to another stage (target validated) |
| PATCH  | `/opportunities/:id/assign` | `opportunities.assign` | Assign or unassign                     |
| GET    | `/opportunities/:id/timeline` | `opportunities.read` | The opportunity's history             |
| GET    | `/opportunities/options` | `opportunities.read` or `quotations.create` / `.update` | Number and name of opportunities, for pickers (`?companyId`) |
| GET    | `/quotations`           | `quotations.read`       | List quotations (search, filter, sort, paginate) |
| POST   | `/quotations`           | `quotations.create`     | Create a quotation (totals calculated by the server) |
| POST   | `/quotations/calculate` | `quotations.create` or `.update` | Price lines and totals without saving |
| GET    | `/quotations/:id`       | `quotations.read`       | One quotation                            |
| PUT    | `/quotations/:id`       | `quotations.update`     | Update a quotation (totals recalculated) |
| DELETE | `/quotations/:id`       | `quotations.delete`     | Delete (soft) a quotation                |
| PATCH  | `/quotations/:id/status` | `quotations.update`    | Change status                            |
| POST   | `/quotations/:id/send`  | `quotations.send`       | Email the quotation (or mark it sent)    |
| POST   | `/quotations/:id/pdf`   | `quotations.read`       | The quotation as a PDF file              |
| GET    | `/quotations/:id/timeline` | `quotations.read`    | The quotation's history                  |
| GET / POST / PUT / DELETE | `/quotation-statuses` (and `/:id`) | read: `quotations.manageStatuses` or `quotations.read` / `.create` / `.update`; change: `quotations.manageStatuses` | Quotation statuses |
| GET    | `/search?q=`            | any signed-in user      | Global search: one list of results per category |
| GET    | `/auth/preferences`     | any signed-in user      | Their own interface preferences          |
| PUT    | `/auth/preferences`     | any signed-in user      | Merge changes into their preferences; `null` resets one |
| GET    | `/settings/public`      | none                    | Company name, logo and branding, for the sign-in page |
| GET    | `/settings/company`     | `settings.manage` or `quotations.read` / `.create` / `.update` | The company profile |
| PUT    | `/settings/company`     | `settings.manage`       | Update the company profile               |
| GET    | `/orders`               | `orders.read`           | List orders (search, filter, sort, paginate) |
| POST   | `/orders`               | `orders.create`         | Create an order (directly, or with `quotationId`) |
| POST   | `/orders/from-quotation/:quotationId` | `orders.create` | Create the order of an accepted quotation |
| GET    | `/orders/:id`           | `orders.read`           | One order                                |
| PUT    | `/orders/:id`           | `orders.update`         | Update an order                          |
| DELETE | `/orders/:id`           | `orders.delete`         | Delete (soft) an order; releases its quotation |
| PATCH  | `/orders/:id/status`    | `orders.update`         | Change status                            |
| GET    | `/orders/:id/timeline`  | `orders.read`           | The order's history                      |
| GET    | `/customers`            | `customers.read`        | List customers (search, filters, paginate) with order figures |
| POST   | `/customers`            | `customers.create`      | Make a company a customer                |
| GET    | `/customers/:id`        | `customers.read`        | One customer                             |
| GET    | `/customers/:id/summary` | `customers.read`       | The 360-degree view: sections with real counts, and figures |
| GET    | `/customers/:id/timeline` | `customers.read`      | The customer's and its company's history |
| PUT    | `/customers/:id`        | `customers.update`      | Update a customer                        |
| DELETE | `/customers/:id`        | `customers.delete`      | Remove the customer designation          |
| GET / POST / PUT / DELETE | `/order-statuses` (and `/:id`) | read: `orders.manageStatuses` or `orders.read` / `.create` / `.update`; change: `orders.manageStatuses` | Order statuses |

## Authentication

### Authentication flow

1. **Register** (`POST /auth/register`) creates a user with a bcrypt-hashed password and the
   default role. Registration is open outside production; in production it needs the
   `users.create` permission unless `ALLOW_PUBLIC_REGISTRATION` says otherwise. A role can never be
   chosen here - sending `role`, `roleId` or `permissions` is rejected.
2. **Login** (`POST /auth/login`) checks the email and password, then that the account is active,
   and returns the user, an access token and a refresh token.
3. **Authenticated requests** send `Authorization: Bearer <accessToken>`. The `authenticate`
   middleware verifies the token, loads the user, and rejects revoked tokens (401) and inactive
   accounts (403).
4. **Refresh** (`POST /auth/refresh-token`) trades the refresh token for a new pair when the
   access token expires.
5. **Logout** (`POST /auth/logout`) revokes both tokens on the server immediately.

Failure responses:

| Situation                              | Status | Message                               |
| -------------------------------------- | ------ | ------------------------------------- |
| Wrong password **or** unknown email    | 401    | `Invalid email or password` (identical for both) |
| Account inactive                       | 403    | `This account is inactive...`         |
| Missing, expired or revoked token      | 401    | `Authentication required` / `Invalid or expired token` |
| Too many failed logins from one IP     | 429    | `Too many failed login attempts...`   |
| Registration closed                    | 403    | `Public registration is disabled`     |
| Password does not meet the rules       | 422    | `Validation failed` with field errors |

**Password rules:** 8-72 characters, with at least one lowercase letter, one uppercase letter, one
number and one special character. A new password must differ from the current one.

**Roles and permissions:** see [Users - permissions](#permissions). The signed-in user's role and
its permissions are part of the `/auth/me` and login responses (`user.role.permissions`).

**Never returned:** `password`, `passwordHash`, `refreshTokenHash` (and `tokenVersion`) are removed
from every serialized user by the model itself.

### JWT flow

| Token   | Lifetime (default)              | Signed with          | Claims                         |
| ------- | ------------------------------- | -------------------- | ------------------------------ |
| Access  | `JWT_ACCESS_EXPIRES_IN` (15m)   | `JWT_ACCESS_SECRET`  | `sub`, `tv`, `type`            |
| Refresh | `JWT_REFRESH_EXPIRES_IN` (7d)   | `JWT_REFRESH_SECRET` | `sub`, `tv`, `type`, `jti`     |

- **Rotation.** The server stores only a SHA-256 hash of the current refresh token. Each refresh
  atomically replaces it, so a refresh token works exactly once; replaying an old one returns 401.
- **Revocation.** Each user has a `tokenVersion` (`tv` claim). Logout, password change or reset,
  role change, deactivation and deletion increment it, which invalidates every access and refresh
  token issued before - there is no waiting for the access token to expire.
- **No permissions in tokens.** Tokens identify the user only. The role and its permissions are
  read from the database on every request, so access changes apply at once.
- **Token types.** A refresh token cannot be used as an access token or vice versa (separate
  secrets plus a `type` claim).
- **One session per user.** Because a single refresh-token hash is stored, signing in on a second
  device ends the first device's session at its next refresh. Supporting several concurrent
  devices needs a sessions collection (not part of this module).

How the web client uses them:

- The **access token is kept in memory only**. The **refresh token is kept in `localStorage`** so
  the session survives a reload.
- Axios attaches the access token to every request. On page load (no access token yet) or on a
  401, it refreshes once and replays the request. Refreshes are serialized within a tab and across
  tabs (Web Locks), since refresh tokens are single-use.
- If the refresh is rejected, the session is cleared and `ProtectedRoute` redirects to `/login`,
  remembering the page to return to. Signing out in one tab signs out the others.

### Creating the first user

Create a user with the full-access role from the server. This is needed in every environment:
accounts made through `POST /auth/register` get the default role, which starts with no
permissions, so they cannot manage users or roles.

```bash
cd server
# PowerShell: $env:ADMIN_PASSWORD = "..."     bash: export ADMIN_PASSWORD='...'
npm run create:admin -- --first-name <first> --last-name <last> --email admin@your-company.com
```

That user can then sign in, create roles on the `/roles` screen, and create other users on the
`/users` screen.

### API examples

Replace the placeholder values with your own.

```bash
# Register
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"firstName":"<first>","lastName":"<last>","email":"<email>","password":"<password>"}'

# Login
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<email>","password":"<password>"}'
```

Login response:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "<id>",
      "firstName": "<first>",
      "lastName": "<last>",
      "fullName": "<first> <last>",
      "email": "<email>",
      "roleId": "<role id>",
      "role": { "id": "<role id>", "key": "user", "name": "User", "permissions": [], "isSystem": true },
      "status": "active",
      "lastLogin": "<ISO date>",
      "createdAt": "<ISO date>",
      "updatedAt": "<ISO date>"
    },
    "accessToken": "<jwt>",
    "refreshToken": "<jwt>"
  }
}
```

```bash
# Current user
curl http://localhost:5000/api/v1/auth/me -H "Authorization: Bearer <accessToken>"

# Refresh (returns { accessToken, refreshToken }; the old refresh token stops working)
curl -X POST http://localhost:5000/api/v1/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refreshToken>"}'

# Change password (returns a new { accessToken, refreshToken }; older tokens are revoked)
curl -X POST http://localhost:5000/api/v1/auth/change-password \
  -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"currentPassword":"<current>","newPassword":"<new>"}'

# Logout
curl -X POST http://localhost:5000/api/v1/auth/logout -H "Authorization: Bearer <accessToken>"
```

Error example (wrong credentials):

```json
{ "success": false, "message": "Invalid email or password", "errors": [] }
```

## Users

### User model

| Field          | Type                | Notes                                                        |
| -------------- | ------------------- | ------------------------------------------------------------ |
| `firstName`    | string, required    | Max 50                                                       |
| `lastName`     | string, required    | Max 50                                                       |
| `email`        | string, required    | Unique, stored lowercase                                     |
| `phone`        | string              | Digits, spaces, `+ - ( )`, 7-20 characters                   |
| `passwordHash` | string, required    | bcrypt; never selected by default, never serialized          |
| `roleId`       | ObjectId -> `Role`  | Required. Decides the user's permissions                     |
| `departmentId` | ObjectId -> `Department` | Optional                                                |
| `designation`  | string              | Max 100                                                      |
| `profileImage` | string              | `http(s)` URL (no file upload yet)                           |
| `status`       | `active` \| `inactive` | Inactive users cannot sign in or use existing tokens      |
| `lastLogin`    | date                | Set on each successful login                                 |
| `createdBy`    | ObjectId -> `User`  | Who created the record; empty for self sign-up and `create:admin` |
| `createdAt`, `updatedAt` | date      | Maintained automatically                                     |

Also stored: `passwordChangedAt` (returned), and the internal fields `refreshTokenHash`,
`tokenVersion` and `deletedAt` (soft-delete marker), which are never returned.

In responses each reference keeps its id and, when loaded, gains an expanded object:
`roleId` + `role`, `departmentId` + `department`, `createdBy` + `createdByUser`. `fullName` is
computed.

Supporting models: **Role** and **Permission** (see
[Roles and permissions](#roles-and-permissions-rbac)) and **Department** (`name`, `description`,
`isActive`), which is read-only until its own module exists.

### Permissions

Authorization is permission-based and enforced on the server for every request. A user's
permissions come only from their role document. These are the permissions the user endpoints ask
for:

| Permission            | Allows                                                     |
| --------------------- | ---------------------------------------------------------- |
| `users.read`          | List and view users; list roles and departments (for the dropdowns) |
| `users.create`        | Create users                                               |
| `users.update`        | Edit profile fields                                        |
| `users.changeStatus`  | Activate / deactivate                                      |
| `users.resetPassword` | Set another user's password                                |
| `users.delete`        | Delete users                                               |
| `users.assignRole`    | Choose a user's role on create or update                   |

Rules on top of the permission checks, so that user management cannot be used to gain access:

- **Permissions cannot be sent.** A `permissions` or `role` field in a request body is rejected
  (422). The only way to change access is `roleId`.
- **Assigning a role** needs `users.assignRole`, and the role may not carry any permission the
  caller lacks, and must be active. Only a full-access user can therefore create or promote
  another full-access user.
- **Managing a user** (edit, status, reset password, delete) is refused if that user has any
  permission the caller lacks. This stops, for example, resetting an administrator's password to
  take over the account.
- **Yourself:** you cannot change your own role or status, delete yourself, or use reset-password
  on yourself (use `POST /auth/change-password`).
- **Sessions are revoked** when a user's role changes, when they are deactivated or deleted, and
  when their password is reset.

### List query parameters

`GET /users?page=1&limit=20&search=&status=&roleId=&sortBy=createdAt&sortOrder=desc`

| Parameter   | Values                                                                                 | Default     |
| ----------- | -------------------------------------------------------------------------------------- | ----------- |
| `page`      | 1 and up                                                                               | `1`         |
| `limit`     | 1-100                                                                                  | `20`        |
| `search`    | Text; every word must match first name, last name, email, phone or designation         | -           |
| `status`    | `active`, `inactive`                                                                   | -           |
| `roleId`    | Role id                                                                                | -           |
| `departmentId` | Department id                                                                       | -           |
| `sortBy`    | `firstName`, `lastName`, `email`, `designation`, `status`, `lastLogin`, `createdAt`    | `createdAt` |
| `sortOrder` | `asc`, `desc`                                                                          | `desc`      |

Invalid values return 422 rather than being ignored.

### Behaviour worth knowing

- **`PUT /users/:id` is a partial update:** only the fields sent are changed. Send `""` or `null`
  to clear `phone`, `designation`, `profileImage` or `departmentId`. `status` and `password` are
  rejected here; they have their own endpoints.
- **`POST /users` without `roleId`** assigns the default User role.
- **Delete is a soft delete.** The user disappears from every endpoint and is signed out, but the
  record is kept so references from other records stay valid. The email stays reserved: creating
  a user with it returns 409 `This email belongs to a deleted user`.
- **Reset password** takes the new password in the request; nothing is emailed.

### Examples

```bash
TOKEN=<accessToken>
API=http://localhost:5000/api/v1

# List: second page of active users matching "smith", sorted by name
curl "$API/users?page=2&limit=20&search=smith&status=active&sortBy=firstName&sortOrder=asc" \
  -H "Authorization: Bearer $TOKEN"

# Create (roleId, departmentId, phone, designation, profileImage are optional)
curl -X POST "$API/users" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"firstName":"<first>","lastName":"<last>","email":"<email>","password":"<password>","roleId":"<role id>","designation":"<title>"}'

# Get one
curl "$API/users/<id>" -H "Authorization: Bearer $TOKEN"

# Update
curl -X PUT "$API/users/<id>" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"designation":"<title>","phone":"<phone>","departmentId":null}'

# Deactivate / activate
curl -X PATCH "$API/users/<id>/status" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"inactive"}'

# Reset password
curl -X PATCH "$API/users/<id>/reset-password" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"newPassword":"<new password>"}'

# Delete
curl -X DELETE "$API/users/<id>" -H "Authorization: Bearer $TOKEN"
```

List response:

```json
{
  "success": true,
  "message": "Users retrieved",
  "data": {
    "users": [
      {
        "id": "<id>",
        "firstName": "<first>",
        "lastName": "<last>",
        "fullName": "<first> <last>",
        "email": "<email>",
        "designation": "<title>",
        "status": "active",
        "roleId": "<role id>",
        "role": { "id": "<role id>", "key": "user", "name": "User", "permissions": [], "isSystem": true },
        "createdBy": "<user id>",
        "createdByUser": { "id": "<user id>", "firstName": "<first>", "lastName": "<last>", "fullName": "<first> <last>", "email": "<email>" },
        "createdAt": "<ISO date>",
        "updatedAt": "<ISO date>"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

Refused for lack of access:

```json
{ "success": false, "message": "You are not allowed to assign this role", "errors": [] }
```

### Screens

- **`/users`** - MUI DataGrid with server-side pagination and sorting, search (debounced), status
  and role filters, and a row menu: view, edit, activate/deactivate, reset password, delete. The
  list state is kept in the URL.
- **`/users/:id`** - details with the same actions.

Buttons and menu items appear only when the signed-in user's permissions allow the action; the
"Users" navigation entry and both routes need `users.read`. This is a convenience only - the API
makes the real decision.

## Roles and permissions (RBAC)

Access control is data, not code. Roles, the permission catalogue, and which role holds which
permission all live in MongoDB and can be changed at runtime from the Roles screen or the API.
The code contains no role names and no role-to-permission rules; a route only states which
permission key it needs.

### Models

**Permission**

| Field         | Notes                                              |
| ------------- | -------------------------------------------------- |
| `module`      | For example `leads`                                |
| `action`      | For example `create`                               |
| `key`         | `<module>.<action>`, unique - what routes ask for  |
| `description` | Shown in the UI                                    |

**Role**

| Field           | Notes                                                                    |
| --------------- | ------------------------------------------------------------------------ |
| `name`          | Unique (case-insensitive)                                                |
| `description`   | Optional                                                                 |
| `status`        | `active` \| `inactive`. An inactive role grants nothing and cannot be assigned |
| `permissions[]` | References to Permission documents                                       |
| `createdAt`, `updatedAt` | Maintained automatically                                        |
| `isSystem`      | Seed-only flag: the role cannot be deleted or deactivated                |
| `isSuperAdmin`  | Seed-only flag: the role holds every permission, including future ones   |
| `isDefault`     | Seed-only flag: the role given to users created without an explicit role |

The three flags cannot be set through the API (422). Responses also include `userCount`.

### Seed

`server/src/seeds/rbac.seed.js` is the one place where role names and the permission catalogue are
written down. It is loaded on every API start and by `npm run seed`:

- **Permissions** are upserted by key: `users.*`, `roles.*`, `permissions.read`, plus `leads.create`,
  `leads.read`, `leads.update`, `leads.delete` as examples for a module that is not built yet.
- **Two roles** are created if no role carries their flag: "Administrator" (`isSuperAdmin`) and
  "User" (`isDefault`). After that they are ordinary documents - rename them freely.
- Re-running never duplicates anything, never removes anything, and never undoes edits made in
  the app.

### How a request is authorized

```text
authenticate            verify JWT -> load user -> load role -> load the role's permissions (MongoDB)
requirePermission(key)  role active AND (role.isSuperAdmin OR key in role.permissions) -> else 403
```

Middleware:

| Middleware                   | Meaning                                                              |
| ---------------------------- | -------------------------------------------------------------------- |
| `authenticate`               | Signed-in, active user; loads role and permissions from the database |
| `requirePermission(...keys)` | Must hold **every** listed permission                                |
| `authorize(...keys)`         | Must hold **at least one** listed permission (none listed: any signed-in user) |

```js
router.post('/', authenticate, requirePermission('leads.create'), controller.create);
router.get('/', authenticate, authorize('roles.read', 'users.read'), controller.list);
```

Because nothing is cached in the token, changing a role's permissions or status applies to every
user with that role on their next request - no new login.

At startup the API compares every key used in `requirePermission` / `authorize` with the database
and logs a warning for any that do not exist (a typo would otherwise silently deny everyone but
full-access users).

**Adding a permission for a new module:** add it to the seed file, guard the route with
`requirePermission('<module>.<action>')`, restart. It then appears on the Roles screen to be granted.

### Rules that stop role management being used to gain access

- **You can only grant what you hold.** Creating a role with permissions, or assigning them, is
  refused if the list contains a permission the caller lacks.
- **You cannot manage a role with more access than you have** (edit, deactivate, change
  permissions, delete).
- **You cannot modify the role you hold yourself** - no self-promotion and no locking yourself out.
- **Creating a role with permissions** needs `roles.assignPermissions` as well as `roles.create`.
- **System roles** cannot be deleted or deactivated, and a full-access role's permissions cannot
  be edited. The default role's permissions can be.
- **A role in use cannot be deleted** (409); reassign its users first.
- Unknown permission keys are rejected (400), never silently dropped.

### API examples

Permissions are sent as keys.

```bash
# Catalogue (optionally ?module=leads or ?search=...)
curl "$API/permissions" -H "Authorization: Bearer $TOKEN"

# Create a role
curl -X POST "$API/roles" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"<name>","description":"<text>","permissions":["leads.read","leads.create"]}'

# List (?page ?limit ?search ?status ?sortBy=name|status|createdAt|updatedAt ?sortOrder)
curl "$API/roles?search=<text>&status=active" -H "Authorization: Bearer $TOKEN"

# Update name / description / status (only the fields sent)
curl -X PUT "$API/roles/<id>" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"inactive"}'

# Replace the role's permissions with exactly this list ([] removes all)
curl -X PUT "$API/roles/<id>/permissions" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"permissions":["leads.read","leads.update"]}'

# Delete
curl -X DELETE "$API/roles/<id>" -H "Authorization: Bearer $TOKEN"
```

Role in a response:

```json
{
  "id": "<id>",
  "name": "<name>",
  "description": "<text>",
  "status": "active",
  "permissions": [
    { "id": "<id>", "module": "leads", "action": "read", "key": "leads.read", "description": "View leads" }
  ],
  "isSystem": false,
  "isSuperAdmin": false,
  "isDefault": false,
  "userCount": 0,
  "createdAt": "<ISO date>",
  "updatedAt": "<ISO date>"
}
```

### Frontend

The client learns what the signed-in user may do from `user.permissions` in the login and
`/auth/me` responses: a flat list of keys the API resolved from the database (for a full-access
role, every key that exists). It never looks at role names.

```jsx
<PermissionGate permission="leads.create">
  <Button>New lead</Button>
</PermissionGate>

<PermissionGate permission={['leads.read', 'leads.export']}>...</PermissionGate>   {/* all */}
<PermissionGate anyOf={['roles.read', 'permissions.read']}>...</PermissionGate>     {/* any */}
<PermissionGate permission="leads.delete" fallback={<Hint />}>...</PermissionGate>
```

- **Sidebar:** entries are listed in `client/src/layouts/navigation.js`, each with the permission
  it needs; an entry is rendered only for users who hold it.
- **Routes:** `<RequirePermission>` guards `/users`, `/roles` and `/permissions`.
- **Buttons:** create, edit, delete and the other actions on the Users and Roles screens appear
  only when permitted, including the "only what you hold" rules above (for example, permission
  checkboxes you cannot grant are disabled).
- **Staying current:** permissions are reloaded when the window regains focus and whenever the API
  answers 403.
- **Screens:** `/roles` (list, create, edit, delete), `/roles/:id` (details and the permission
  checklist grouped by module), `/permissions` (read-only catalogue).

Hiding is a convenience. Every action is checked again by the API.

### Verification

| Check                                           | Where it is tested                                                |
| ----------------------------------------------- | ----------------------------------------------------------------- |
| User without permission receives 403            | `server/tests/rbac.test.js`, `server/tests/users.test.js`         |
| User with permission succeeds                   | Same; including grant/revoke taking effect on the same token      |
| Frontend hides unauthorized actions             | `client/src/**/*.test.jsx` (gate, sidebar, role page)             |
| Backend still protects the endpoint             | Every endpoint is called directly with an under-privileged token  |

## Companies

A company (account) is the organization you do business with. Later modules - contacts, leads,
opportunities and so on - attach to it.

### Database model

**Company**

| Field            | Type                        | Notes                                                    |
| ---------------- | --------------------------- | -------------------------------------------------------- |
| `companyCode`    | string, unique, immutable   | Generated by the server, e.g. `COMP-000001`              |
| `name`           | string, required            | 2-200 characters                                         |
| `legalName`      | string                      | Registered name, if different                            |
| `industryId`     | ObjectId -> `Industry`      |                                                          |
| `companyTypeId`  | ObjectId -> `CompanyType`   |                                                          |
| `email`          | string                      | Stored lowercase                                         |
| `phone`          | string                      | Digits, spaces, `+ - ( )`, 7-20 characters               |
| `website`        | string                      | `http(s)` URL                                            |
| `address`, `city`, `state`, `country`, `postalCode` | string |                                            |
| `gstNumber`      | string                      | 15-character GSTIN, stored uppercase; unique among live companies |
| `panNumber`      | string                      | 10-character PAN, stored uppercase                       |
| `assignedTo`     | ObjectId -> `User`          | The user responsible for the account                     |
| `organizationId` | ObjectId -> `Organization`  | Which of your organizations owns the account             |
| `status`         | `active` \| `inactive`      | Default `active`                                         |
| `notes`          | string                      | Up to 5000 characters                                    |
| `createdBy`      | ObjectId -> `User`          | Set by the server                                        |
| `createdAt`, `updatedAt` | date                | Maintained automatically                                 |

Internal: `deletedAt` (soft-delete marker, never returned).

**Supporting collections**

| Collection      | Fields                                                    | Purpose                                 |
| --------------- | --------------------------------------------------------- | --------------------------------------- |
| `Industry`, `CompanyType`, `Organization` | `name` (unique), `description`, `isActive`, `createdBy` | Lists the company form picks from |
| `Counter`       | `_id` (series name), `seq`                                | Last number issued per code series      |
| `TimelineEvent` | `entityType`, `entityId`, `action`, `changes[]`, `actorId`, `createdAt` | Append-only change history |

### Relationships

```text
Company ── industryId ─────▶ Industry
        ── companyTypeId ──▶ CompanyType
        ── organizationId ─▶ Organization     (our own business unit / entity)
        ── assignedTo ─────▶ User             (account owner)
        ── createdBy ──────▶ User
TimelineEvent ── entityId ─▶ Company          (entityType = "company")
              ── actorId ──▶ User
```

In responses each reference keeps its id and gains an expanded object: `industryId` + `industry`,
`companyTypeId` + `companyType`, `organizationId` + `organization`, `assignedTo` +
`assignedToUser`, `createdBy` + `createdByUser`.

References are checked when they are set: the industry, type and organization must exist and be
active, and the assignee must be an active user. A company keeps a value that is deactivated
later.

### Company code

- Generated on create from an atomic counter in MongoDB, so concurrent requests never receive the
  same code.
- Format `<COMPANY_CODE_PREFIX>-<number padded to COMPANY_CODE_DIGITS>`, from the environment.
- Cannot be sent or changed by clients (422).
- A number is taken only after validation passes, so rejected requests leave no gaps. Codes of
  deleted companies are never reused.

### Validation rules worth knowing

- Only `name` is required.
- `gstNumber` must be a well-formed GSTIN and `panNumber` a well-formed PAN. When both are given,
  characters 3-12 of the GSTIN must equal the PAN.
- A GST number already used by another live company is rejected (409) - it almost always means a
  duplicate account. PAN is not checked for uniqueness, because one legal entity can hold several
  GST registrations.
- Email addresses are checked for format only, not against a list of known top-level domains.
- `PUT` is a partial update; `""` or `null` clears an optional field.
- Delete is a soft delete: the company disappears from every endpoint but the record stays.
- A company that still has contacts, leads or opportunities cannot be deleted (409, with the
  counts); delete or move them first.

### List query parameters

`GET /companies?page=1&limit=20&search=&status=&industryId=&sortBy=createdAt&sortOrder=desc`

| Parameter   | Values                                                                                   | Default     |
| ----------- | ---------------------------------------------------------------------------------------- | ----------- |
| `page`, `limit` | `limit` 1-100                                                                        | `1`, `20`   |
| `search`    | Every word must match code, name, legal name, email, phone, GST, PAN or city             | -           |
| `status`    | `active`, `inactive`                                                                     | -           |
| `industryId`, `companyTypeId`, `organizationId`, `assignedTo` | Ids                                    | -           |
| `city`, `state`, `country` | Exact match, case-insensitive                                             | -           |
| `sortBy`    | `companyCode`, `name`, `city`, `state`, `country`, `status`, `createdAt`, `updatedAt`    | `createdAt` |
| `sortOrder` | `asc`, `desc`                                                                            | `desc`      |

Invalid values return 422.

### Detail page sections

The detail page shows Overview plus twelve sections: Contacts, Leads, Opportunities, Quotations,
Orders, Projects, Tickets, Payments, Contracts, Documents, Activities and Timeline. The tabs and their
counts come from `GET /companies/:id/sections`:

```json
{
  "sections": [
    { "key": "contacts", "label": "Contacts", "available": false, "count": null },
    { "key": "timeline", "label": "Timeline", "available": true, "count": 2 }
  ]
}
```

- **Overview** is the company record itself.
- **Timeline** is live: every create, update and delete is recorded with who did it, when, and
  the before/after value of each changed field. It is served by `GET /companies/:id/timeline`
  (`?page`, `?limit`).
- **Contacts** is live: the tab shows the real number of contacts and lists them from
  `GET /contacts?companyId=<id>`, with an "Add contact" button.
- **Leads** is live: the real count, and a list from `GET /leads?companyId=<id>` with an
  "Add lead" button.
- **Quotations** is live: the real count, and a list from `GET /quotations?companyId=<id>` with an
  "Add quotation" button.
- **Orders** is live: the real count, and a list from `GET /orders?companyId=<id>`.
- **Opportunities** is live: the real count, and a list from `GET /opportunities?companyId=<id>`
  with an "Add opportunity" button.
- **Activities** is live: the real count, and the company's activities and follow-ups (see
  [Activities and follow-ups](#activities-and-follow-ups)). It includes activities logged on the
  company's contacts, leads and opportunities.
- **Projects**, **Tickets** and **Contracts** are live in the same way.
- **Payments** is live: the real count, totals from the API and a list from
  `GET /payments?companyId=<id>`.
- **Documents** is live: the real count, and the company's files with upload, download and
  delete (see [Document management](#document-management)).
- A section whose module did not exist would be reported as `available: false` with
  `count: null`; none is now. No count is ever made up.

When a module is built, it becomes available by registering a count on the server
(`registerCompanySection('contacts', { count, blocksDelete })` in
`server/src/services/companySection.service.js`) and a view on the client (`SECTION_VIEWS` in
`client/src/pages/CompanyDetailPage.jsx`). A section registered with `blocksDelete: true` also
stops the company being deleted while it holds records.

### Permissions

| Permission                | Allows                                              |
| ------------------------- | --------------------------------------------------- |
| `companies.read`          | List and view companies, their sections and timeline |
| `companies.create`        | Create companies                                    |
| `companies.update`        | Edit companies                                      |
| `companies.delete`        | Delete companies                                    |
| `companies.manageLookups` | Add industries, company types and organizations     |

Any user with `companies.read` sees every company; access is not yet narrowed to the assigned
user.

### Examples

```bash
# Create (only name is required)
curl -X POST "$API/companies" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"<name>","industryId":"<industry id>","city":"<city>","gstNumber":"<gstin>","assignedTo":"<user id>"}'

# List: active companies in a city matching a search, sorted by name
curl "$API/companies?search=<text>&status=active&city=<city>&sortBy=name&sortOrder=asc" \
  -H "Authorization: Bearer $TOKEN"

# Get, update, delete
curl "$API/companies/<id>" -H "Authorization: Bearer $TOKEN"
curl -X PUT "$API/companies/<id>" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"phone":"<phone>","status":"inactive","industryId":null}'
curl -X DELETE "$API/companies/<id>" -H "Authorization: Bearer $TOKEN"

# Detail page
curl "$API/companies/<id>/sections" -H "Authorization: Bearer $TOKEN"
curl "$API/companies/<id>/timeline?page=1&limit=20" -H "Authorization: Bearer $TOKEN"

# Lookup lists (also /company-types and /organizations)
curl "$API/industries" -H "Authorization: Bearer $TOKEN"
curl -X POST "$API/industries" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"<name>"}'
```

Company in a response:

```json
{
  "id": "<id>",
  "companyCode": "COMP-000001",
  "name": "<name>",
  "status": "active",
  "city": "<city>",
  "industryId": "<industry id>",
  "industry": { "id": "<industry id>", "name": "<industry>" },
  "assignedTo": "<user id>",
  "assignedToUser": { "id": "<user id>", "firstName": "<first>", "lastName": "<last>", "fullName": "<first> <last>", "email": "<email>" },
  "createdBy": "<user id>",
  "createdByUser": { "id": "<user id>", "fullName": "<first> <last>", "email": "<email>" },
  "createdAt": "<ISO date>",
  "updatedAt": "<ISO date>"
}
```

Timeline event:

```json
{
  "id": "<id>",
  "action": "updated",
  "changes": [{ "field": "city", "label": "City", "from": "<old>", "to": "<new>" }],
  "actor": { "id": "<user id>", "fullName": "<first> <last>" },
  "createdAt": "<ISO date>"
}
```

### Screens

| Route                 | Needs                                  | What it shows                                    |
| --------------------- | -------------------------------------- | ------------------------------------------------ |
| `/companies`          | `companies.read`                       | DataGrid with server-side paging and sorting, search, and status / industry / type filters |
| `/companies/new`      | `companies.create`                     | The form, in cards                               |
| `/companies/:id`      | `companies.read`                       | Header with chips, and the section tabs          |
| `/companies/:id/edit` | `companies.read` + `companies.update`  | The same form, pre-filled                        |

Users with `companies.manageLookups` get a "+" beside the industry, company type and organization
dropdowns to add an entry in a dialog without leaving the form.

## Contacts

A contact is a person at a company.

### Relationship

```text
Contact ── companyId ──▶ Company     (required: every contact belongs to exactly one company)
        ── createdBy ──▶ User
```

`companyId` is checked on every write, and nothing is stored if it fails:

| Sent as `companyId`                                   | Result |
| ----------------------------------------------------- | ------ |
| Missing, empty, `null`, malformed, or not a string    | 422    |
| Well-formed id that is not a company, or a deleted company | 400 |
| Id of an existing company (active or inactive)        | Accepted |

On update the company can be changed to another existing company but never cleared. In the other
direction, a company cannot be deleted while it still has contacts, so a contact is never left
pointing at nothing.

### Database model

| Field                    | Type                   | Notes                                              |
| ------------------------ | ---------------------- | -------------------------------------------------- |
| `firstName`, `lastName`  | string, required       | Max 50 each                                        |
| `companyId`              | ObjectId -> `Company`, required | See above                                 |
| `designation`            | string                 | Max 100                                            |
| `department`             | string                 | The contact's department at their company (free text) |
| `email`                  | string                 | Stored lowercase; unique within a company          |
| `phone`, `alternatePhone` | string                | Digits, spaces, `+ - ( )`, 7-20 characters         |
| `preferredContactMethod` | `email` \| `phone` \| `whatsapp` \| `sms` | Needs the detail it uses on record |
| `status`                 | `active` \| `inactive` | Default `active`                                   |
| `notes`                  | string                 | Up to 5000 characters                              |
| `createdBy`              | ObjectId -> `User`     | Set by the server                                  |
| `createdAt`, `updatedAt` | date                   | Maintained automatically                           |

Internal: `deletedAt` (soft-delete marker, never returned). Responses add `fullName`, and expand
the references as `company` (`id`, `companyCode`, `name`, `status`) and `createdByUser`.

### Rules worth knowing

- **Preferred method:** `email` needs an email; `phone`, `whatsapp` and `sms` need a phone number.
  This is checked against the record as it will be after the update, so removing the phone of a
  contact who prefers WhatsApp is refused (422).
- **Duplicate email:** two live contacts of the same company cannot share an email (409). The same
  email at a different company is allowed, and contacts without an email never clash.
- **`PUT` is a partial update;** `""` or `null` clears an optional field.
- **Delete is a soft delete.**

### List query parameters

`GET /contacts?page=1&limit=20&companyId=&status=&search=&sortBy=createdAt&sortOrder=desc`

| Parameter   | Values                                                                              | Default     |
| ----------- | ----------------------------------------------------------------------------------- | ----------- |
| `page`, `limit` | `limit` 1-100                                                                   | `1`, `20`   |
| `companyId` | Company id                                                                          | -           |
| `status`    | `active`, `inactive`                                                                | -           |
| `search`    | Every word must match first name, last name, email, phone, alternate phone, designation or department | - |
| `sortBy`    | `firstName`, `lastName`, `email`, `designation`, `department`, `status`, `createdAt`, `updatedAt` | `createdAt` |
| `sortOrder` | `asc`, `desc`                                                                       | `desc`      |

Invalid values return 422.

### Company selector

The company field on the contact form and the company filter on the list are the same component
(`client/src/components/companies/CompanySelect.jsx`). Its options always come from the API:

- `GET /companies/options?search=<text>&limit=20` - the first matches when it opens, then a
  server-side search (by name or code) as the user types, so it works however many companies exist.
- `GET /companies/options?id=<id>` - to show the name of a company that is already selected, for
  example when arriving from a company page via `/contacts/new?companyId=<id>`.

The endpoint returns only `id`, `companyCode`, `name` and `status`, and is open to users who work
with contacts but do not have `companies.read`. Deleted companies are never offered.

### Permissions

| Permission        | Allows                    |
| ----------------- | ------------------------- |
| `contacts.read`   | List and view contacts    |
| `contacts.create` | Create contacts           |
| `contacts.update` | Edit contacts             |
| `contacts.delete` | Delete contacts           |

### Examples

```bash
# Create (firstName, lastName and companyId are required)
curl -X POST "$API/contacts" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"firstName":"<first>","lastName":"<last>","companyId":"<company id>","email":"<email>","preferredContactMethod":"email"}'

# List: active contacts of one company matching a search
curl "$API/contacts?companyId=<company id>&status=active&search=<text>" -H "Authorization: Bearer $TOKEN"

# Get, update, delete
curl "$API/contacts/<id>" -H "Authorization: Bearer $TOKEN"
curl -X PUT "$API/contacts/<id>" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"designation":"<title>","alternatePhone":""}'
curl -X DELETE "$API/contacts/<id>" -H "Authorization: Bearer $TOKEN"

# Options for a company picker
curl "$API/companies/options?search=<text>" -H "Authorization: Bearer $TOKEN"
```

Contact in a response:

```json
{
  "id": "<id>",
  "firstName": "<first>",
  "lastName": "<last>",
  "fullName": "<first> <last>",
  "companyId": "<company id>",
  "company": { "id": "<company id>", "companyCode": "COMP-000001", "name": "<company>", "status": "active" },
  "email": "<email>",
  "preferredContactMethod": "email",
  "status": "active",
  "createdBy": "<user id>",
  "createdByUser": { "id": "<user id>", "fullName": "<first> <last>", "email": "<email>" },
  "createdAt": "<ISO date>",
  "updatedAt": "<ISO date>"
}
```

An invalid company id:

```json
{
  "success": false,
  "message": "Company not found",
  "errors": [{ "field": "companyId", "message": "Company not found" }]
}
```

### Screens

| Route           | Needs             | What it shows                                                      |
| --------------- | ----------------- | ------------------------------------------------------------------ |
| `/contacts`     | `contacts.read`   | DataGrid with server-side paging and sorting, search, and company and status filters |
| `/contacts/new` | `contacts.create` | The form. `?companyId=<id>` preselects the company                 |
| `/contacts/:id` | `contacts.read`   | Details, with Edit (in a dialog) and Delete                        |

Contacts also appear on the company page's Contacts tab.

## Lead configuration

Where a lead came from, what stage it is at, and how urgent it is are not fixed lists in the
code. They are three collections that administrators manage; lead forms read them from the API.

### Models

All three share: `name` (unique regardless of case), `description`, `sortOrder` (position in
lists and dropdowns), `isActive`, `createdBy`, `createdAt`, `updatedAt`.

| Model          | Extra fields                          | Notes                                              |
| -------------- | ------------------------------------- | -------------------------------------------------- |
| `LeadSource`   | -                                     | Where a lead came from                             |
| `LeadStatus`   | `category`, `color`, `isDefault`      | A stage in the pipeline                            |
| `LeadPriority` | `level`, `color`, `isDefault`         | Urgency. `level` 1-100: higher is more urgent      |

- **`category`** (`open` \| `won` \| `lost`) says what a status means for the pipeline. Status
  names are free text; code that needs to know whether a lead is closed looks at the category,
  never at the name.
- **`color`** is an optional hex colour (`#1976d2`) for chips and lists.
- **`isActive: false`** stops a value being offered on lead forms while keeping it on leads that
  already use it.
- **`isDefault`** marks the value a new lead gets when none is chosen (statuses and priorities).

### The default

There is always exactly one default status and one default priority:

- Making a value the default takes it away from the previous one.
- The default cannot be switched off, deactivated or deleted - only moved to another value.
- An inactive value cannot be made the default.
- The first value added to an empty list becomes its default.

### Delete or deactivate

`DELETE` removes a value permanently. It is refused (409) for the default, and for a value that
leads use, so a value in use can only be deactivated. (The Leads module registers its usage
check with `registerLeadConfigUsage(...)` in `server/src/services/leadConfig.service.js`.)

### Seed

`server/src/seeds/leadConfig.seed.js` holds the initial values:

| List       | Initial values                                                                          |
| ---------- | --------------------------------------------------------------------------------------- |
| Sources    | Website, Referral, Cold Call, Email Campaign, Social Media, Trade Show, Walk-in          |
| Statuses   | New (default), Contacted, Qualified, Proposal Sent, Negotiation, Won (won), Lost (lost)  |
| Priorities | Low, Medium (default), High, Urgent                                                      |

```bash
cd server
npm run seed
```

The same seed runs on the first server start. It is applied **once**: it is recorded in the
`seedstates` collection, so a value an administrator later renames, deactivates or deletes is
never re-created, and a list that already had values before the first seed is left alone. These
names appear nowhere else - not in the API code and not in the React code.

### Lead forms

Lead forms use `<LeadConfigSelect>` (`client/src/components/leads/LeadConfigSelect.jsx`), whose
options are the active values returned by the API:

```jsx
<LeadConfigSelect list={LEAD_CONFIG.SOURCES} label="Source" value={sourceId} onChange={setSourceId} />
<LeadConfigSelect list={LEAD_CONFIG.STATUSES} label="Status" value={statusId} onChange={setStatusId} selectDefault required />
<LeadConfigSelect list={LEAD_CONFIG.PRIORITIES} label="Priority" value={priorityId} onChange={setPriorityId} selectDefault />
```

- It requests `GET /lead-statuses?isActive=true` (and the equivalents) and shows exactly what
  comes back, in the configured order, with each value's colour.
- `selectDefault` preselects whichever value the API marks as default.
- `current` keeps a lead's existing value selectable after it has been deactivated.

It is used by the lead form (`/leads/new`, `/leads/:id/edit`), the status control on a lead's
page, and the filters on the leads list.

### Settings screen

`/settings` has a tab per list: Lead sources, Lead statuses and Lead priorities (each needs
`leadConfig.manage`) and Activity types (needs `activities.manageTypes`). A user sees only the
tabs they may manage. Administrators can add, edit, activate or deactivate, make default, and
delete values; changes apply immediately.

### Permissions

| Permission          | Allows                                             |
| ------------------- | -------------------------------------------------- |
| `leadConfig.manage` | Add, edit and delete sources, statuses, priorities |

Reading the lists needs `leadConfig.manage` or any of `leads.read`, `leads.create`,
`leads.update`, so people who work with leads can fill in the forms without being able to change
the configuration. The Administrator role holds everything.

### List query parameters

| Parameter  | Values                                                              |
| ---------- | ------------------------------------------------------------------- |
| `isActive` | `true` (what lead forms offer), `false` (deactivated only); omit for all |
| `search`   | Matches the name                                                    |

Results are sorted by `sortOrder`, then name.

### Examples

```bash
# What a lead form asks for
curl "$API/lead-statuses?isActive=true" -H "Authorization: Bearer $TOKEN"

# Add a source
curl -X POST "$API/lead-sources" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"<name>","description":"<text>"}'

# Add a status (category and color are optional)
curl -X POST "$API/lead-statuses" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"<name>","category":"open","color":"#607d8b"}'

# Add a priority (level is required)
curl -X POST "$API/lead-priorities" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"<name>","level":5}'

# Rename, reorder, deactivate, or make default (only the fields sent are changed)
curl -X PUT "$API/lead-statuses/<id>" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"sortOrder":15,"isDefault":true}'
curl -X PUT "$API/lead-sources/<id>" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"isActive":false}'

# Delete
curl -X DELETE "$API/lead-sources/<id>" -H "Authorization: Bearer $TOKEN"
```

A status in a response:

```json
{
  "id": "<id>",
  "name": "<name>",
  "description": "<text>",
  "category": "open",
  "color": "#1976d2",
  "sortOrder": 10,
  "isActive": true,
  "isDefault": true,
  "createdAt": "<ISO date>",
  "updatedAt": "<ISO date>"
}
```

Trying to delete the default:

```json
{
  "success": false,
  "message": "The default cannot be deleted. Make another one the default first.",
  "errors": []
}
```

## Leads

A lead is a possible deal: something worth following up that may become an opportunity.

### Database model

**Lead**

| Field               | Type                        | Notes                                                    |
| ------------------- | --------------------------- | -------------------------------------------------------- |
| `leadNumber`        | string, unique, immutable   | Generated by the server, e.g. `LEAD-000001`              |
| `companyId`         | ObjectId -> `Company`       | Optional: a lead can start before the company is on record |
| `contactId`         | ObjectId -> `Contact`       | Optional; must belong to the lead's company              |
| `title`             | string, required            | 2-200 characters                                         |
| `description`       | string                      | Up to 5000 characters                                    |
| `sourceId`          | ObjectId -> `LeadSource`    |                                                          |
| `statusId`          | ObjectId -> `LeadStatus`, required | Defaults to the configured default status         |
| `priorityId`        | ObjectId -> `LeadPriority`  | Defaults to the configured default priority              |
| `estimatedValue`    | number                      | 0 or more; a plain amount in one implied currency        |
| `assignedTo`        | ObjectId -> `User`          | The user working the lead                                |
| `expectedCloseDate` | date                        |                                                          |
| `notes`             | string                      | Up to 5000 characters                                    |
| `tags`              | string[]                    | Up to 20, each up to 30 characters, unique ignoring case |
| `organizationId`    | ObjectId -> `Organization`  |                                                          |
| `createdBy`         | ObjectId -> `User`          | Set by the server                                        |
| `createdAt`, `updatedAt` | date                   | Maintained automatically                                 |

Set by conversion only: `convertedAt`, `convertedBy`, `opportunityId`. Responses add `isConverted`
and expand every reference (`company`, `contact`, `source`, `status`, `priority`,
`assignedToUser`, `organization`, `createdByUser`, `convertedByUser`, `opportunity`).

**Supporting collections**

| Collection    | Fields                                                              | Purpose                          |
| ------------- | ------------------------------------------------------------------- | -------------------------------- |
| `Opportunity` | See [Pipelines and opportunities](#pipelines-and-opportunities) | Created by conversion, or directly |

### Relationships

```text
Lead ── companyId ──────▶ Company          contactId ─▶ Contact (of that company)
     ── sourceId / statusId / priorityId ─▶ LeadSource / LeadStatus / LeadPriority
     ── assignedTo, createdBy ─▶ User       organizationId ─▶ Organization
     ── opportunityId ──▶ Opportunity      (after conversion; Opportunity.leadId points back)
TimelineEvent ── entityId ─▶ Lead   (entityType = "lead")
Activity.leadId ─▶ Lead             FollowUp (relatedType = "lead").relatedId ─▶ Lead
```

Rules that keep these consistent:

- A contact always brings its own company: sending only `contactId` sets `companyId` too, and a
  contact from a different company than `companyId` is refused (400).
- Source, status, priority and organization must exist and be active when they are set. A lead
  keeps a value that is deactivated later.
- A company or contact that leads or opportunities point to cannot be deleted (409), and a lead
  configuration value that leads use cannot be deleted - only deactivated.

### Lead number

`LEAD-000001`: generated on create from an atomic counter, formatted from `LEAD_NUMBER_PREFIX`
and `LEAD_NUMBER_DIGITS`. It cannot be sent or changed, rejected requests consume no numbers,
and numbers of deleted leads are never reused. Opportunity numbers (`OPP-000001`) work the same
way.

### Assignment and status

- **`PATCH /leads/:id/assign`** `{ "assignedTo": "<user id>" }` or `null` to unassign. Needs
  `leads.assign`; the user must be active.
- On **create**, anyone may assign the lead to themselves; assigning it to someone else needs
  `leads.assign`.
- **`PATCH /leads/:id/status`** `{ "statusId": "<id>" }`. Needs `leads.update`.
- `PUT /leads/:id` rejects `statusId` and `assignedTo` (422) so that each goes through its own
  endpoint, permission and timeline entry.

### Conversion

`POST /leads/:id/convert` turns a lead into an **opportunity** linked to a **company** and,
optionally, a **contact**. Existing records are always preferred over new ones.

| For the...  | If the lead already has one | Otherwise                                                    |
| ----------- | --------------------------- | ------------------------------------------------------------ |
| Company     | It is used (`linked`). Sending `company` is refused (422) | `company` is **required**. Existing companies are searched; a match is linked (`matched`), else a new company is created (`created`) |
| Contact     | It is used (`linked`). Sending `contact` is refused (422) | `contact` is optional. If sent, the company's contacts are searched; a match is linked, else a new contact is created |
| Opportunity | -                           | Always created, with its own number                          |

**Duplicate search.** Before anything is created, existing records are searched on the fields
configured in the environment, in order; the first match wins:

- `COMPANY_MATCH_FIELDS` (default `gstNumber,email,name`)
- `CONTACT_MATCH_FIELDS` (default `email,phone`) - within the company only, so the same person at
  another company is a different contact

Matching ignores case and surrounding spaces. A field left empty in the request is skipped, so
blank never matches blank. Deleted records never match. A matched record is linked exactly as
it is: the details in the request do not overwrite it. The response names the field that matched
(`matchedBy`).

**Preview.** With `"dryRun": true` nothing is written; the response reports what would happen
(`linked`, `matched` or `create` for the company and the contact, and the status the lead would
move to). The Convert dialog in the web app always shows this review before converting.

**What conversion sets.**

- The opportunity takes its name (the lead's title), estimated value, expected close date,
  priority, owner, organization and source from the lead; `opportunity.name`, `.estimatedValue`,
  `.expectedCloseDate` and `.notes` in the request override them.
- The opportunity starts in the first active stage of the default pipeline, or in
  `opportunity.pipelineId` / `opportunity.stageId` if sent. The stage is checked before anything
  is written (400 if it is unknown or inactive; 409 if no pipeline is configured), and the
  preview reports the `pipeline` and `stage` it would use.
- A company created by conversion inherits the lead's owner and organization.
- The lead gets `convertedAt`, `convertedBy`, `opportunityId`, the company and contact, and moves
  to `statusId` if given (it must be an active status whose category is `won`), otherwise to the
  first active `won` status. If none is configured, it keeps its status.

**Safety.**

- A lead converts once. A second attempt returns 409.
- Simultaneous conversions of the same lead: exactly one succeeds; the rest get 409. The lead is
  claimed atomically before anything is created, so it can never produce two opportunities.
- If a step fails part-way (for example the contact is rejected after the company was created),
  the claim is released and the lead stays unconverted. Retrying is safe: the company from the
  first attempt is found by the duplicate search rather than created again. MongoDB transactions
  are not used, so a company created before a failure does remain.
- Company and contact details are validated exactly like a normal create.

### Activities, follow-ups and timeline

- **Activities** and **follow-ups** on a lead use the generic system described in
  [Activities and follow-ups](#activities-and-follow-ups): `GET /activities?leadId=<id>` and
  `GET /followups?relatedType=lead&relatedId=<id>`. They need the `activities.*` and
  `followups.*` permissions, not `leads.update`.
- **Timeline** is written automatically: creation, edits (with before/after values), assignment,
  status changes, conversion (with a summary of what was created or linked) and deletion.

### List query parameters

`GET /leads?page=1&limit=20&search=&statusId=&assignedTo=&sortBy=createdAt&sortOrder=desc`

| Parameter        | Values                                                                       | Default     |
| ---------------- | ---------------------------------------------------------------------------- | ----------- |
| `page`, `limit`  | `limit` 1-100                                                                | `1`, `20`   |
| `search`         | Every word must match number, title, description or a tag                    | -           |
| `statusId`, `sourceId`, `priorityId`, `assignedTo`, `companyId`, `contactId`, `organizationId` | Ids | - |
| `statusCategory` | `open`, `won`, `lost` - by what the status means, whatever statuses are called | -         |
| `converted`      | `true`, `false`                                                              | -           |
| `sortBy`         | `leadNumber`, `title`, `estimatedValue`, `expectedCloseDate`, `createdAt`, `updatedAt` | `createdAt` |
| `sortOrder`      | `asc`, `desc`                                                                | `desc`      |

Invalid values return 422.

### Permissions

| Permission      | Allows                                                                    |
| --------------- | ------------------------------------------------------------------------- |
| `leads.read`    | List and view leads, their activities, follow-ups and timeline            |
| `leads.create`  | Create leads                                                              |
| `leads.update`  | Edit leads and change status                                              |
| `leads.delete`  | Delete leads                                                              |
| `leads.assign`  | Assign leads to other users                                               |
| `leads.convert` | Convert leads. This can create a company and a contact, so it does not additionally require `companies.create` or `contacts.create` |

Any user with `leads.read` sees every lead; access is not narrowed to the assigned user.

### Examples

```bash
# Create (only title is required)
curl -X POST "$API/leads" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"<title>","companyId":"<company id>","estimatedValue":150000,"expectedCloseDate":"2027-03-31","tags":["<tag>"]}'

# List: open, unconverted leads assigned to a user, largest first
curl "$API/leads?statusCategory=open&converted=false&assignedTo=<user id>&sortBy=estimatedValue&sortOrder=desc" \
  -H "Authorization: Bearer $TOKEN"

# Assign, change status
curl -X PATCH "$API/leads/<id>/assign" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"assignedTo":"<user id>"}'
curl -X PATCH "$API/leads/<id>/status" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"statusId":"<status id>"}'

# Preview, then convert (company/contact only when the lead has none)
curl -X POST "$API/leads/<id>/convert" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"dryRun":true,"company":{"name":"<name>","email":"<email>"},"contact":{"firstName":"<first>","lastName":"<last>","email":"<email>"}}'
curl -X POST "$API/leads/<id>/convert" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"company":{"name":"<name>","email":"<email>"},"contact":{"firstName":"<first>","lastName":"<last>","email":"<email>"}}'
```

Conversion response (here the company already existed and the contact was new):

```json
{
  "success": true,
  "message": "Lead converted successfully",
  "data": {
    "lead": { "id": "<id>", "leadNumber": "LEAD-000002", "isConverted": true, "status": { "name": "<won status>", "category": "won" } },
    "company": { "action": "matched", "matchedBy": "email", "record": { "id": "<id>", "companyCode": "COMP-000001", "name": "<name>" } },
    "contact": { "action": "created", "record": { "id": "<id>", "firstName": "<first>", "lastName": "<last>" } },
    "opportunity": { "id": "<id>", "opportunityNumber": "OPP-000002", "name": "<name>", "companyId": "<id>", "contactId": "<id>", "leadId": "<id>", "pipelineId": "<id>", "stageId": "<id>", "probability": 10, "status": "open" }
  }
}
```

Preview response (`dryRun`): the same `company` / `contact` shape with `action` of `linked`,
`matched` or `create`, plus `status` (the status the lead would move to) and `"dryRun": true`.

### Screens

| Route             | Needs                           | What it shows                                              |
| ----------------- | ------------------------------- | ---------------------------------------------------------- |
| `/leads`          | `leads.read`                    | DataGrid with server-side paging and sorting, search, and status, priority, source and conversion filters |
| `/leads/new`      | `leads.create`                  | The form. `?companyId=<id>` preselects the company         |
| `/leads/:id`      | `leads.read`                    | Header with status and priority, actions, and tabs: Overview, Activities, Follow-ups, Timeline |
| `/leads/:id/edit` | `leads.read` + `leads.update`   | The same form, pre-filled                                  |

On a lead's page: the status dropdown, Edit, Assign, Convert and Delete each appear only with
their permission; Convert disappears once the lead is converted. Source, status and priority
choices everywhere come from [Lead configuration](#lead-configuration).

## Activities and follow-ups

One system serves every kind of record. An **activity** is something done, or to be done, about
one or more records; a **follow-up** is something to do about one record by a certain time.

### Activity types

Activity types are data. `ActivityType` has `name` (unique regardless of case), `description`,
`color`, `sortOrder`, `isActive`. `server/src/seeds/activity.seed.js` holds the initial values -
Call, Meeting, Email, Task, Note, Demo, Site Visit - loaded **once** by `npm run seed` or the
first server start; after that administrators manage them in Settings or through
`/activity-types`. These names appear nowhere else in the server or the React code: forms load
the active types from `GET /activity-types?isActive=true`.

A type that activities use cannot be deleted (409), only deactivated. A deactivated type stays
on existing activities but cannot be chosen for new ones.

### Database model

**Activity**

| Field           | Type                         | Notes                                                    |
| --------------- | ---------------------------- | -------------------------------------------------------- |
| `typeId`        | ObjectId -> `ActivityType`, required | Must be active when set                          |
| `subject`       | string, required             | 2-200 characters                                         |
| `description`   | string                       | Up to 5000 characters                                    |
| `companyId`     | ObjectId -> `Company`        | Filled in automatically when the others imply a company  |
| `contactId`     | ObjectId -> `Contact`        |                                                          |
| `leadId`        | ObjectId -> `Lead`           |                                                          |
| `opportunityId` | ObjectId -> `Opportunity`    |                                                          |
| `customerId`, `projectId` | ObjectId -> `Customer`, `Project` | Like the others: checked, and they fill in the company |
| `ticketId`, `contractId` | ObjectId -> `Ticket`, `Contract` | Checked like the others; they fill in the company |
| `assignedTo`    | ObjectId -> `User`           | Defaults to whoever records it                           |
| `dueDate`       | date                         |                                                          |
| `completedAt`   | date                         | Set when completed; cannot be in the future              |
| `status`        | `pending` \| `completed` \| `cancelled` | Default `pending`                             |
| `priority`      | `low` \| `medium` \| `high`  | Default `medium`                                         |
| `createdBy`     | ObjectId -> `User`           | Set by the server                                        |

Responses expand `type`, `company`, `contact`, `lead`, `opportunity`, `assignedToUser` and
`createdByUser`. Activities are soft-deleted.

**FollowUp**

| Field          | Type                        | Notes                                                     |
| -------------- | --------------------------- | --------------------------------------------------------- |
| `title`        | string, required            | 2-300 characters                                          |
| `description`  | string                      | Up to 5000 characters                                     |
| `relatedType`  | `company` \| `contact` \| `lead` \| `opportunity` \| `customer` \| `project` \| `ticket` \| `contract`, required | The kind of record it is about |
| `relatedId`    | ObjectId, required          | That record's id                                          |
| `assignedTo`   | ObjectId -> `User`          | Defaults to whoever creates it                            |
| `dueDate`      | date, required              |                                                           |
| `priority`     | `low` \| `medium` \| `high` | Default `medium`                                          |
| `status`       | `pending` \| `completed` \| `cancelled` | A new follow-up is always `pending`           |
| `reminderDate` | date                        | On or before `dueDate`                                    |
| `completedAt`  | date                        | Set by completing; cannot be sent                         |

Also stored: `completedBy`, `createdBy`. Responses add `related: { type, id, label }` - what the
follow-up is about - or `null` if that record has since been deleted.

### Relationships

```text
Activity ── typeId ─▶ ActivityType
         ── companyId ─▶ Company    contactId ─▶ Contact    leadId ─▶ Lead    opportunityId ─▶ Opportunity
         ── assignedTo, createdBy ─▶ User
FollowUp ── (relatedType, relatedId) ─▶ Company | Contact | Lead | Opportunity
         ── assignedTo, completedBy, createdBy ─▶ User
```

Rules for an activity's related records:

- **At least one** of `companyId`, `contactId`, `leadId`, `opportunityId` is required (422).
- **Every id must point at an existing record** (400, naming the field). Deleted records count as
  not existing.
- **One company.** A contact, lead and opportunity each belong to a company; records from
  different companies cannot be combined (400).
- **The company is filled in.** When `companyId` is not sent it is taken from the contact, lead
  or opportunity, so an activity logged on a lead also appears on that lead's company.
- On update the relations are re-checked as a whole, and the last one cannot be removed.

Rules for a follow-up's related record: `relatedType` and `relatedId` are both required and must
agree - a company's id stated as a lead is refused (400). On update they are sent together.

Which activities each page shows:

| Page        | Query                             | Shows                                                    |
| ----------- | --------------------------------- | -------------------------------------------------------- |
| Company     | `GET /activities?companyId=`      | Everything about the company, including activities on its contacts, leads and opportunities |
| Contact     | `GET /activities?contactId=`      | Activities involving that contact                        |
| Lead        | `GET /activities?leadId=`         | Activities on that lead                                  |
| Opportunity | `GET /activities?opportunityId=`  | Activities on that opportunity                           |

### Status and completion

- An **activity** can be logged as already done (`"status": "completed"`, optionally with
  `completedAt`) or planned (`pending`, with a `dueDate`). Status and `completedAt` always agree:
  completing sets the time (now, if not given), sending `completedAt` alone marks it completed,
  and returning to `pending` or `cancelled` clears it.
- A **follow-up** is completed with `PATCH /followups/:id/complete` (no body). It records who
  completed it and when; completing it again changes nothing.
- `PATCH /followups/:id/reschedule` `{ "dueDate", "reminderDate"? }` moves a **pending**
  follow-up; a completed or cancelled one returns 409 and must be reopened first
  (`PUT` with `"status": "pending"`). If the reminder is not sent and would fall after the new
  due date, it is dropped.
- Follow-ups have no delete endpoint: cancel with `PUT` and `"status": "cancelled"`.
- `overdue=true` on either list returns what is still pending past its due date.

### List query parameters

`GET /activities`: `page`, `limit`, `search` (subject, description), `companyId`, `contactId`,
`leadId`, `opportunityId`, `typeId`, `status`, `priority`, `assignedTo`, `dueFrom`, `dueTo`,
`overdue`, `sortBy` (`createdAt` default, `updatedAt`, `dueDate`, `completedAt`, `subject`),
`sortOrder` (`desc` default).

`GET /followups`: `page`, `limit`, `search` (title, description), `relatedType`, `relatedId`,
`assignedTo`, `status`, `priority`, `dueFrom`, `dueTo`, `overdue`, `sortBy` (`dueDate` default,
`createdAt`, `updatedAt`, `title`), `sortOrder` (`asc` default: soonest due first).

Invalid values return 422.

### Permissions

| Permission               | Allows                                         |
| ------------------------ | ---------------------------------------------- |
| `activities.read`        | View activities                                |
| `activities.create`      | Log and plan activities                        |
| `activities.update`      | Edit and complete activities                   |
| `activities.delete`      | Delete activities                              |
| `activities.manageTypes` | Add, edit and delete activity types            |
| `followups.read`         | View follow-ups                                |
| `followups.create`       | Create follow-ups                              |
| `followups.update`       | Edit, complete, reschedule, cancel and reopen  |

These are separate from the permissions on the record itself: seeing a lead's activities needs
`leads.read` to open the lead and `activities.read` to see the list.

### Examples

```bash
# Types the form offers
curl "$API/activity-types?isActive=true" -H "Authorization: Bearer $TOKEN"

# Log a completed call on a lead (the lead's company is filled in)
curl -X POST "$API/activities" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"typeId":"<type id>","subject":"<subject>","leadId":"<lead id>","status":"completed"}'

# Plan a meeting with a contact
curl -X POST "$API/activities" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"typeId":"<type id>","subject":"<subject>","contactId":"<contact id>","dueDate":"2027-01-15T10:00:00.000Z","priority":"high"}'

# Everything about a company; then mark one done
curl "$API/activities?companyId=<company id>" -H "Authorization: Bearer $TOKEN"
curl -X PUT "$API/activities/<id>" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"completed"}'

# Follow-up on a lead; reschedule; complete
curl -X POST "$API/followups" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"<what to do>","relatedType":"lead","relatedId":"<lead id>","dueDate":"2027-02-01T10:00:00.000Z"}'
curl -X PATCH "$API/followups/<id>/reschedule" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"dueDate":"2027-03-01T10:00:00.000Z"}'
curl -X PATCH "$API/followups/<id>/complete" -H "Authorization: Bearer $TOKEN"

# My overdue follow-ups
curl "$API/followups?assignedTo=<my user id>&overdue=true" -H "Authorization: Bearer $TOKEN"
```

An id that is not a real record:

```json
{
  "success": false,
  "message": "Related record not found: lead",
  "errors": [{ "field": "leadId", "message": "Related record not found: lead" }]
}
```

### Frontend components

All in `client/src/components/`, usable on any page:

```jsx
<ActivityTimeline related={{ leadId: lead.id }} />          // list + "Log activity", edit, mark done, delete
<ActivityForm related={{ contactId }} onSaved={close} onCancel={close} />
<FollowUpDialog relatedType="lead" relatedId={lead.id} onClose={close} />            // add
<FollowUpDialog followUp={followUp} mode="reschedule" onClose={close} />             // or "edit"
<FollowUpList relatedType="company" relatedId={company.id} />                        // list + actions
<RecordEngagement type="contact" id={contact.id} />         // ActivityTimeline + FollowUpList together
```

`related` takes any of `companyId`, `contactId`, `leadId`, `opportunityId`. Buttons follow the
`activities.*` and `followups.*` permissions.

Where they appear today:

| Page                 | Shows                                                        |
| -------------------- | ------------------------------------------------------------ |
| `/companies/:id`     | The Activities tab: activities and follow-ups                |
| `/contacts/:id`      | Activities and follow-ups below the contact's details        |
| `/leads/:id`         | The Activities tab and the Follow-ups tab                    |
| `/opportunities/:id` | The Activities tab and the Follow-ups tab                    |

## Products

What the business sells: physical products and services alike. A service is simply a product
whose unit is something like an hour.

### Database model

**Product**

| Field            | Type                          | Notes                                                    |
| ---------------- | ----------------------------- | -------------------------------------------------------- |
| `sku`            | string, unique, immutable     | Generated or supplied (see [SKU](#sku)); stored in upper case |
| `name`           | string, required              | 2-200 characters                                         |
| `description`    | string                        | Up to 5000 characters                                    |
| `categoryId`     | ObjectId -> `ProductCategory` |                                                          |
| `unitId`         | ObjectId -> `Unit`            |                                                          |
| `basePrice`      | number, required              | Selling price before tax; 0 or more                      |
| `costPrice`      | number                        | What it costs you; 0 or more                             |
| `taxId`          | ObjectId -> `Tax`             |                                                          |
| `status`         | `active` \| `inactive`        | Default `active`                                         |
| `image`          | string                        | `http(s)` URL (no file upload)                           |
| `organizationId` | ObjectId -> `Organization`    |                                                          |
| `createdBy`      | ObjectId -> `User`            | Set by the server                                        |
| `createdAt`, `updatedAt` | date                  | Maintained automatically                                 |

Responses expand `category`, `unit`, `tax`, `organization` and `createdByUser`. Products are
soft-deleted.

**Catalogue lists** - all managed by administrators; nothing is seeded or built into the code:

| Model             | Own field                     | Notes                                               |
| ----------------- | ----------------------------- | --------------------------------------------------- |
| `ProductCategory` | `skuPrefix` (optional)        | 1-10 letters or digits; prefix of SKUs generated for its products |
| `Unit`            | `symbol` (required, unique)   | e.g. `kg`; shown next to quantities and prices      |
| `Tax`             | `rate` (required)             | A percentage from 0 to 100; 18 means 18%            |

Each also has `name` (unique regardless of case), `description`, `sortOrder` and `isActive`.

### Relationships

```text
Product ── categoryId ─▶ ProductCategory    unitId ─▶ Unit    taxId ─▶ Tax
        ── organizationId ─▶ Organization   createdBy ─▶ User
```

- Category, unit, tax and organization must exist and be **active** when they are set. A product
  keeps one that is deactivated later.
- A category, unit or tax that products use **cannot be deleted** (409) - only deactivated, which
  stops it being offered for new products.

### SKU

The SKU is decided when the product is created and never changes.

- **Generated** when `sku` is omitted or empty: `<prefix>-<number>`, e.g. `PRD-000001`. The
  prefix is the category's `skuPrefix` if it has one (`ELEC-000002`), otherwise
  `PRODUCT_SKU_PREFIX`; the number is padded to `PRODUCT_SKU_DIGITS` and comes from one atomic
  counter shared by all products, so concurrent creates never collide. Numbers already taken by
  a hand-entered SKU are skipped.
- **Validated** when `sku` is sent: 2-40 characters - letters, digits, dot, dash, underscore -
  starting with a letter or digit. It is trimmed and stored in upper case, and must be unique
  (409, naming `sku`). Uniqueness is also enforced by a database index, so of several
  simultaneous requests for the same SKU exactly one succeeds.
- **Never reused:** a deleted product's SKU stays taken.
- **Fixed:** `PUT` rejects `sku` (422). Moving a product to another category does not change it.
- `GET /products/sku-check?sku=<value>` returns `{ sku, available }` - the SKU as it would be
  stored and whether it is free. The product form calls it when you leave the SKU field.

### List query parameters

`GET /products?page=1&limit=20&search=&categoryId=&status=&minPrice=&maxPrice=&sortBy=createdAt&sortOrder=desc`

| Parameter   | Values                                                                        | Default     |
| ----------- | ----------------------------------------------------------------------------- | ----------- |
| `page`, `limit` | `limit` 1-100                                                             | `1`, `20`   |
| `search`    | Every word must match SKU, name or description                                | -           |
| `categoryId` | Category id                                                                  | -           |
| `status`    | `active`, `inactive`                                                          | -           |
| `minPrice`, `maxPrice` | Bounds on `basePrice`, both inclusive; either may be given alone   | -           |
| `unitId`, `taxId`, `organizationId` | Ids                                                   | -           |
| `sortBy`    | `sku`, `name`, `basePrice`, `costPrice`, `status`, `createdAt`, `updatedAt`   | `createdAt` |
| `sortOrder` | `asc`, `desc`                                                                 | `desc`      |

Invalid values return 422, including `minPrice` greater than `maxPrice`.

### Product selectors in other modules

Later modules (quotations, orders, ...) must not list products themselves. They use:

- **API:** `GET /products/options?search=<text>&limit=20` returns active products as
  `{ id, sku, name, basePrice, status, unit, tax }` - enough to choose a product and price a
  line. `?id=<id>` returns one product, including an inactive one that is already on a record.
- **Component:** `<ProductSelect value={productId} onChange={(id, product) => ...} />`
  (`client/src/components/products/ProductSelect.jsx`). It loads the first matches when opened
  and searches on the server as the user types, so it works however many products exist.

A module that needs the picker adds its own permission to the `authorize(...)` list on
`/products/options` in `server/src/routes/product.routes.js`.

### Permissions

| Permission               | Allows                                       |
| ------------------------ | -------------------------------------------- |
| `products.read`          | List and view products; use the picker       |
| `products.create`        | Create products                              |
| `products.update`        | Edit products                                |
| `products.delete`        | Delete products                              |
| `products.manageCatalog` | Add, edit and delete categories, units, taxes |

Reading the catalogue lists needs `products.manageCatalog` or any of `products.read`,
`products.create`, `products.update`.

### Examples

```bash
# Catalogue lists
curl -X POST "$API/product-categories" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"<name>","skuPrefix":"<PREFIX>"}'
curl -X POST "$API/units" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"<name>","symbol":"<symbol>"}'
curl -X POST "$API/taxes" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"<name>","rate":<percent>}'

# Create a product - SKU generated
curl -X POST "$API/products" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"<name>","basePrice":1499.99,"categoryId":"<category id>","unitId":"<unit id>","taxId":"<tax id>"}'

# Create a product - your own SKU
curl -X POST "$API/products" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"<name>","sku":"<sku>","basePrice":450}'

# Is a SKU free?
curl "$API/products/sku-check?sku=<sku>" -H "Authorization: Bearer $TOKEN"

# List: active products in a category priced 400-2000, cheapest first
curl "$API/products?categoryId=<category id>&status=active&minPrice=400&maxPrice=2000&sortBy=basePrice&sortOrder=asc" \
  -H "Authorization: Bearer $TOKEN"

# Get, update, delete
curl "$API/products/<id>" -H "Authorization: Bearer $TOKEN"
curl -X PUT "$API/products/<id>" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"basePrice":1599,"costPrice":null,"status":"inactive"}'
curl -X DELETE "$API/products/<id>" -H "Authorization: Bearer $TOKEN"

# Options for a product picker
curl "$API/products/options?search=<text>" -H "Authorization: Bearer $TOKEN"
```

Product in a response:

```json
{
  "id": "<id>",
  "sku": "ELEC-000002",
  "name": "<name>",
  "basePrice": 1499.99,
  "costPrice": 900,
  "status": "active",
  "categoryId": "<category id>",
  "category": { "id": "<category id>", "name": "<category>", "skuPrefix": "ELEC", "isActive": true },
  "unitId": "<unit id>",
  "unit": { "id": "<unit id>", "name": "<unit>", "symbol": "<symbol>", "isActive": true },
  "taxId": "<tax id>",
  "tax": { "id": "<tax id>", "name": "<tax>", "rate": 18, "isActive": true },
  "createdBy": "<user id>",
  "createdAt": "<ISO date>",
  "updatedAt": "<ISO date>"
}
```

A SKU that is taken:

```json
{
  "success": false,
  "message": "This SKU is already in use",
  "errors": [{ "field": "sku", "message": "This SKU is already in use" }]
}
```

### Screens

| Route                | Needs                               | What it shows                                        |
| -------------------- | ----------------------------------- | ---------------------------------------------------- |
| `/products`          | `products.read`                     | DataGrid with server-side paging and sorting, search, and category, status and price-range filters |
| `/products/new`      | `products.create`                   | The form. SKU blank = generated; a typed SKU is checked when you leave the field |
| `/products/:id`      | `products.read`                     | Details, with price including tax and margin         |
| `/products/:id/edit` | `products.read` + `products.update` | The same form, with the SKU shown as fixed           |
| `/categories`, `/units`, `/taxes` | `products.manageCatalog` | A DataGrid each: search, add, edit, activate or deactivate, delete |

Category, unit and tax dropdowns on the product form load from the API (active values only).

## Pipelines and opportunities

An opportunity is a deal with a company, moving through the stages of a **pipeline**. Pipelines
and their stages are data: administrators create, rename, reorder and remove them, and the Kanban
board at `/opportunities` draws whatever the database holds. No stage or pipeline name appears in
the server's logic or anywhere in the client.

### Database model

**Pipeline** (`server/src/models/Pipeline.js`)

| Field         | Type / rule                          | Notes                                              |
| ------------- | ------------------------------------ | -------------------------------------------------- |
| `name`        | string, 2-80, required               | Unique regardless of case                          |
| `description` | string, max 300                      |                                                    |
| `isDefault`   | boolean                              | Exactly one pipeline is the default                |
| `status`      | `active` \| `inactive`              | Inactive pipelines keep their opportunities but take no new ones |
| `createdBy`   | ObjectId -> `User`                   | Set by the server                                  |

List responses add `stageCount` and `opportunityCount`.

**PipelineStage** (`server/src/models/PipelineStage.js`)

| Field         | Type / rule                          | Notes                                              |
| ------------- | ------------------------------------ | -------------------------------------------------- |
| `pipelineId`  | ObjectId -> `Pipeline`, required     | Cannot be changed afterwards                       |
| `name`        | string, 2-60, required               | Unique within its pipeline, regardless of case     |
| `description` | string, max 300                      |                                                    |
| `order`       | number                               | Position on the board, 1..n. Set by the server; changed only by `PATCH /pipeline-stages/reorder` |
| `probability` | integer 0-100, required              | Percent chance of winning, given to opportunities entering the stage |
| `color`       | hex colour, optional                 | The column's accent                                |
| `type`        | `open` \| `won` \| `lost`, default `open` | What reaching the stage **means** - see below |
| `status`      | `active` \| `inactive`              | Inactive stages keep their opportunities but cannot be moved into |

**Opportunity** (`server/src/models/Opportunity.js`)

| Field               | Type / rule                              | Notes                                         |
| ------------------- | ---------------------------------------- | --------------------------------------------- |
| `opportunityNumber` | string, unique                           | Generated by the server (`OPP-000001`); never accepted from clients |
| `name`              | string, 2-200, required                  |                                               |
| `companyId`         | ObjectId -> `Company`, required          | Must exist                                    |
| `contactId`         | ObjectId -> `Contact`                    | Must belong to the company                    |
| `leadId`            | ObjectId -> `Lead`                       | Set by lead conversion only                   |
| `pipelineId`        | ObjectId -> `Pipeline`, required         | Chosen on create (default: the default pipeline); fixed afterwards |
| `stageId`           | ObjectId -> `PipelineStage`, required    | Changed only by `PATCH /opportunities/:id/stage` |
| `estimatedValue`    | number >= 0                              |                                               |
| `probability`       | integer 0-100                            | Taken from the stage on entering it; may be adjusted by hand in between |
| `expectedCloseDate` | date                                     |                                               |
| `assignedTo`        | ObjectId -> `User`                       | Changed only by `PATCH /opportunities/:id/assign` |
| `priorityId`        | ObjectId -> `LeadPriority`               | The administrator-managed priority list shared with leads; exposed as `priority` |
| `status`            | `open` \| `won` \| `lost`              | Never set directly: follows the stage's `type` |
| `closedAt`          | date                                     | When it entered a won or lost stage           |
| `notes`             | string, max 5000                         |                                               |
| `createdBy`         | ObjectId -> `User`                       | Set by the server                             |

Opportunities created by lead conversion also carry the lead's `sourceId` and `organizationId`.
Responses expand `company`, `contact`, `lead`, `pipeline`, `stage`, `source`, `priority`,
`organization`, `assignedToUser` and `createdByUser`. Deleting is a soft delete.

### Relationships

```text
Pipeline ──< PipelineStage          (a stage belongs to one pipeline; deleting a pipeline deletes its stages)
Pipeline ──< Opportunity >── PipelineStage
Company ──< Opportunity >── Contact
Lead ── opportunityId ──▶ Opportunity      (Opportunity.leadId points back)
Opportunity ──< Activity, FollowUp, TimelineEvent
```

- A stage or pipeline that holds opportunities cannot be deleted (409) - deactivate it instead.
- A company, contact or priority that opportunities point to cannot be deleted (409).
- Converting a lead creates its opportunity in a pipeline stage (see [Conversion](#conversion)).

### Stages are data

Nothing in the code knows a stage by name. What code needs to know - "is this deal closed, and
how?" - is the stage's `type`: `open`, `won` or `lost`. You can have any number of stages of each
type, called anything.

- An opportunity's `status` always equals the `type` of the stage it is in. Moving into a won or
  lost stage closes it (`closedAt`); moving back to an open stage reopens it.
- Changing a stage's `type` changes the status of the opportunities currently in it.
- **Order** is owned by the server. A new stage goes to the end; `PATCH /pipeline-stages/reorder`
  takes the pipeline's complete list of stage ids in the new order (422 unless it lists every
  stage exactly once); deleting a stage closes the gap.

**The default pipeline.** Exactly one pipeline is the default. The first pipeline created becomes
it; sending `isDefault: true` moves it. It cannot be switched off, deactivated, or deleted while
other pipelines exist (409).

**Seed.** On a new database one pipeline is created **once** (`server/src/seeds/pipeline.seed.js`:
"Sales Pipeline" with Qualification, Needs Analysis, Proposal, Negotiation, Closed Won, Closed
Lost), by `npm run seed` or the first API start. After that it is yours: stages you rename or
delete are never brought back.

### Moving between stages

`PATCH /opportunities/:id/stage` with `{ "stageId": "<id>" }` is what a drag and drop sends.
**The server validates the target stage**; the board only suggests where a card may go.

| Target stage                               | Result                                  |
| ------------------------------------------ | --------------------------------------- |
| Does not exist                             | 400, error names `stageId`              |
| Belongs to another pipeline                | 400 "This stage does not belong to the pipeline" |
| Is inactive                                | 400 "This stage is inactive"            |
| Not a valid id / missing                   | 422                                     |
| The stage it is already in                 | 200, nothing changes, nothing recorded  |
| An active stage of its own pipeline        | 200: stage, probability and status updated; a `stage_changed` event is added to the timeline |

A refused move changes nothing. An opportunity cannot be moved to another pipeline.

**Starting stage on create.** `pipelineId` and `stageId` are both optional: with neither, the
first active stage of the default pipeline; with only a pipeline, its first active stage; with
only a stage, that stage's pipeline. The stage must be active, belong to the pipeline, and the
pipeline must be active (400 otherwise).

**Assignment** works as for leads: anyone creating an opportunity may assign it to themselves;
choosing someone else, or reassigning later, needs `opportunities.assign`.

### The board

`GET /opportunities/board` returns one pipeline as columns - what the Kanban screen draws:

```json
{
  "pipeline": { "id": "<id>", "name": "<name>", "isDefault": true },
  "columns": [
    {
      "stage": { "id": "<id>", "name": "<name>", "order": 1, "probability": 10, "color": "#1976d2", "type": "open", "status": "active" },
      "total": 12,
      "totalValue": 480000,
      "opportunities": [ { "id": "<id>", "opportunityNumber": "OPP-000007", "name": "<name>", "company": { "name": "<name>" } } ]
    }
  ]
}
```

| Parameter    | Notes                                                          |
| ------------ | -------------------------------------------------------------- |
| `pipelineId` | Omitted: the default pipeline                                  |
| `limit`      | Cards per column, 1-100 (default 20). Most recently changed first |
| `search`     | Every word must match number, name or notes                    |
| `assignedTo`, `companyId`, `priorityId` | Narrow the board                    |

`total` and `totalValue` are real aggregates over **all** matching opportunities in the stage, not
just the cards returned, and filters narrow them too. Inactive stages are included (they may
still hold opportunities). With no pipeline at all the response is `{ "pipeline": null, "columns": [] }`.

### List query parameters

`GET /opportunities`

| Parameter   | Notes                                                                 |
| ----------- | --------------------------------------------------------------------- |
| `page`, `limit` | `limit` 1-100 (default 20)                                      |
| `search`    | Every word must match number, name or notes                           |
| `pipelineId`, `stageId`, `status`, `assignedTo`, `companyId`, `contactId`, `priorityId`, `leadId` | Exact filters |
| `sortBy`    | `opportunityNumber`, `name`, `estimatedValue`, `probability`, `expectedCloseDate`, `status`, `createdAt` (default), `updatedAt` |
| `sortOrder` | `asc` or `desc` (default)                                             |

Anything else is rejected with 422.

### Permissions

| Permission             | Allows                                                             |
| ---------------------- | ------------------------------------------------------------------ |
| `opportunities.read`   | The board, the list, an opportunity and its timeline               |
| `opportunities.create` | Create opportunities                                               |
| `opportunities.update` | Edit opportunities and move them between stages                    |
| `opportunities.delete` | Delete opportunities                                               |
| `opportunities.assign` | Assign opportunities to other users                                |
| `pipelines.manage`     | Create, edit, reorder and delete pipelines and stages              |

Pipelines and stages can be **read** by anyone holding `pipelines.manage`, any of
`opportunities.read` / `.create` / `.update`, or `leads.convert` - the board and the forms need them.
Like all permissions these are rows in MongoDB, granted to roles on the Roles screen.

### Examples

```bash
# Pipelines and their stages
curl "http://localhost:5000/api/v1/pipelines?status=active" -H "Authorization: Bearer <accessToken>"
curl -X POST http://localhost:5000/api/v1/pipelines -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" -d '{"name":"Renewals","description":"Yearly renewals"}'
curl -X POST http://localhost:5000/api/v1/pipeline-stages -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"pipelineId":"<pipelineId>","name":"Reminder sent","probability":30,"color":"#1976d2"}'
curl "http://localhost:5000/api/v1/pipeline-stages?pipelineId=<pipelineId>" -H "Authorization: Bearer <accessToken>"

# Reorder: every stage of the pipeline, in the new order
curl -X PATCH http://localhost:5000/api/v1/pipeline-stages/reorder -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" -d '{"pipelineId":"<pipelineId>","stageIds":["<stageB>","<stageA>"]}'

# Create an opportunity (name and companyId are required)
curl -X POST http://localhost:5000/api/v1/opportunities -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Managed services","companyId":"<companyId>","estimatedValue":250000,"expectedCloseDate":"2030-03-31"}'

# The Kanban board, then move a card and assign it
curl "http://localhost:5000/api/v1/opportunities/board?pipelineId=<pipelineId>&limit=50" -H "Authorization: Bearer <accessToken>"
curl -X PATCH http://localhost:5000/api/v1/opportunities/<id>/stage -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" -d '{"stageId":"<stageId>"}'
curl -X PATCH http://localhost:5000/api/v1/opportunities/<id>/assign -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" -d '{"assignedTo":"<userId>"}'

# List won opportunities of a company, largest first; history of one
curl "http://localhost:5000/api/v1/opportunities?companyId=<companyId>&status=won&sortBy=estimatedValue" -H "Authorization: Bearer <accessToken>"
curl "http://localhost:5000/api/v1/opportunities/<id>/timeline" -H "Authorization: Bearer <accessToken>"
```

A refused move:

```json
{
  "success": false,
  "message": "This stage does not belong to the pipeline",
  "errors": [{ "field": "stageId", "message": "This stage does not belong to the pipeline" }]
}
```

### Screens

| Route                     | Needs                                         | What it shows                                  |
| ------------------------- | --------------------------------------------- | ---------------------------------------------- |
| `/opportunities`          | `opportunities.read`                          | The Kanban board: one column per stage of the chosen pipeline, with each column's count and value. Pipeline picker, search and owner filter (kept in the URL) |
| `/opportunities/new`      | `opportunities.create`                        | The form. Pipeline and stage are optional (default pipeline, first stage). Accepts `?companyId=` and `?pipelineId=` |
| `/opportunities/:id`      | `opportunities.read`                          | Details, a stage selector, Assign, and Activities, Follow-ups and Timeline tabs |
| `/opportunities/:id/edit` | `opportunities.read` + `opportunities.update` | The same form, without stage and assignment    |
| `/pipelines`              | `pipelines.manage`                            | Pipelines on the left; the selected pipeline's stages with add, edit, delete and move earlier / later |

**The Kanban board** (`client/src/components/opportunities/KanbanBoard.jsx`):

- Columns, their order, names, colours, probabilities and totals all come from
  `GET /opportunities/board`. Add a stage on `/pipelines` and the board has another column.
- **Drag and drop**: with `opportunities.update`, a card can be dragged to another column. The
  card moves at once and the move is sent to the API; if the API refuses it, the card goes back
  and the reason is shown. Columns of inactive stages do not accept drops.
- The same move is available from each card's menu ("Move to ..."), which lists the other active
  stages - for keyboards and for touch screens, where HTML drag and drop is unreliable.
- A column shows up to 50 cards (100 after "Show more"); its count and value always cover every
  opportunity in the stage, and it says "Showing 50 of N" when there are more.

The company page's **Opportunities** tab lists that company's opportunities with an
"Add opportunity" button, and a converted lead links to its opportunity.

## Quotations

A quotation offers products to a company at stated prices. **Every amount on it is calculated by
the server** from the products in the database; a client sends only which products, how many, and
any price override or discount.

### Database model

**Quotation** (`server/src/models/Quotation.js`)

| Field                | Type / rule                                | Notes                                         |
| -------------------- | ------------------------------------------ | --------------------------------------------- |
| `quotationNumber`    | string, unique                             | Generated (`QUO-000001`, see `QUOTATION_NUMBER_*`); never accepted from clients |
| `companyId`          | ObjectId -> `Company`, required            | The customer                                  |
| `contactId`          | ObjectId -> `Contact`                      | Must belong to the company                    |
| `opportunityId`      | ObjectId -> `Opportunity`                  | Must belong to the company                    |
| `quotationDate`      | date, required                             | Default: today                                |
| `validUntil`         | date, not before `quotationDate`           | Default: date + the profile's validity days   |
| `items[]`            | 1-200 lines                                | See below                                     |
| `discountPercent`    | 0-100                                      | Overall discount on the subtotal, before tax  |
| `subtotal`, `discount`, `tax`, `grandTotal` | numbers                  | **Calculated by the server only**             |
| `notes`, `termsAndConditions` | string, max 5000                    | Terms default from the company profile        |
| `statusId`           | ObjectId -> `QuotationStatus`, required    | Default: the default status                   |
| `sentAt`, `sentTo`, `sentBy` | set by `POST /:id/send`                    |                                               |
| `createdBy`          | ObjectId -> `User`                         | Set by the server                             |

**Quotation item**

| Field             | From                                  |
| ----------------- | ------------------------------------- |
| `productId`       | Client (an active product)            |
| `description`     | Client, optional; printed under the name |
| `quantity`        | Client, more than 0                   |
| `unitPrice`       | Client, optional - default the product's `basePrice` |
| `discountPercent` | Client, 0-100, default 0              |
| `name`, `sku`, `unit`, `taxName`, `taxRate` | **Copied from the product and its tax** when the line is written |
| `discount`, `tax`, `total` | **Calculated**                          |

Product details are copied onto the line so a quotation keeps saying what was offered, at what
price and tax, even after the product changes. Responses expand `company`, `contact`,
`opportunity`, `status`, `sentByUser` and `createdByUser`. Deleting is a soft delete; numbers of
deleted quotations are never reused.

### How totals are calculated

The single implementation is `server/src/services/quotationTotals.js`; create, update and
`POST /quotations/calculate` all go through it.

```text
per line:   gross    = quantity x unitPrice
            discount = gross x line discount %
            total    = gross - discount                    (before tax)
quotation:  subtotal = sum of line totals
            discount = subtotal x overall discount %
            tax      = sum of (line total less its share of the overall discount) x line tax rate
            grandTotal = subtotal - discount + tax
```

Every amount is rounded half-up to 2 decimals as it is produced, so printed figures always add up.

**What the server never trusts.** `subtotal`, `discount`, `tax` and `grandTotal` - and a line's `name`,
`sku`, `unit`, `taxName`, `taxRate`, `discount`, `tax` and `total` - are dropped from every request
unread. The tax rate always comes from the product's tax in the database. A product that is
unknown, or inactive, is refused (400 naming `items.<n>.productId`); a product already on a
quotation stays allowed on that quotation after it is deactivated.

**Updates.** Sending `items` replaces every line and re-reads the products. Sending only
`discountPercent` recalculates from the stored lines at the prices and tax rates they were quoted
at. Other edits leave the money alone.

### Statuses

Quotation statuses are an administrator-managed list (`/quotation-statuses`, the Settings screen),
seeded once with Draft, Sent, Accepted, Rejected and Expired. Each has a fixed **category** -
`draft`, `sent`, `accepted`, `rejected`, `expired` - which is what the code relies on, never the name:

- New quotations take the default status.
- An **accepted** or **rejected** quotation cannot be edited (409) until its status is changed back.
- Sending a **draft** moves it to the first active **sent** status.
- A status that quotations use can be deactivated but not deleted.

### Company profile

The details printed on the PDF - our name, address, GST/PAN, phone, email, website, currency and
payment details - live in one MongoDB document edited on **Company profile**
(`/settings/company`, `GET/PUT /api/v1/settings/company`, permission `settings.manage`). Nothing about
the business is written in code. It also holds the defaults for new quotations: validity days
(default 30) and terms and conditions. PDFs and emails are refused (409) until the profile has a
name.

### PDF

`POST /quotations/:id/pdf` answers with the file itself (`application/pdf`,
`Content-Disposition: attachment; filename="QUO-000001.pdf"`) instead of the JSON envelope. Errors
still use the envelope. The A4 layout (`server/src/services/quotationPdf.service.js`, built with
pdfkit) has our details and the quotation number and dates at the top, the customer and contact,
the lines with quantity, unit price, discount, tax rate and amount, the totals, notes, terms and
payment details, and "page n of m" footers. Long quotations continue onto further pages with the
table heading repeated.

### Sending

`POST /quotations/:id/send` with optional `to`, `subject`, `message` emails the quotation with the PDF
attached - to `to`, else the contact's email, else the company's. The sender is `MAIL_FROM` or the
profile's email.

Email needs `SMTP_URL`. **Without it nothing is emailed**: the quotation is still marked as sent
(so the timeline and status reflect a quotation delivered some other way), and the response says
so - `data.email.delivered` is `false` with a reason, and the message reads "Email is not
configured, so nothing was emailed". If the mail server refuses the message the API answers 502
and the quotation is not marked as sent.

### List query parameters

`GET /quotations`

| Parameter         | Notes                                                              |
| ----------------- | ------------------------------------------------------------------ |
| `page`, `limit`     | `limit` 1-100 (default 20)                                   |
| `search`          | Every word must match number, product name / SKU, or notes         |
| `statusId`, `companyId`, `contactId`, `opportunityId`, `createdBy` | Exact filters |
| `statusCategory`  | `draft`, `sent`, `accepted`, `rejected`, `expired` - by meaning, whatever the status is called |
| `dateFrom`, `dateTo` | Quotation date range, both inclusive                             |
| `sortBy`          | `quotationNumber`, `quotationDate`, `validUntil`, `grandTotal`, `createdAt` (default), `updatedAt` |
| `sortOrder`       | `asc` or `desc` (default)                                          |

### Permissions

| Permission                  | Allows                                                    |
| --------------------------- | --------------------------------------------------------- |
| `quotations.read`           | List and view quotations, their timeline, and download the PDF |
| `quotations.create`         | Create quotations (and preview totals)                    |
| `quotations.update`         | Edit quotations and change their status                   |
| `quotations.delete`         | Delete quotations                                         |
| `quotations.send`           | Send quotations                                           |
| `quotations.manageStatuses` | Manage the quotation status list                          |
| `settings.manage`           | Edit the company profile                                  |

The builder's pickers work with quotation permissions alone: `/companies/options`,
`/contacts/options`, `/opportunities/options` (new in this module), `/products/options`,
`/quotation-statuses` and `GET /settings/company` accept `quotations.create` / `.update`.

### Examples

```bash
# Our details, printed on the PDF (once)
curl -X PUT http://localhost:5000/api/v1/settings/company -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" -d '{"name":"<your company>","email":"sales@example.com","currency":"INR"}'

# Preview totals without saving
curl -X POST http://localhost:5000/api/v1/quotations/calculate -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" -d '{"items":[{"productId":"<productId>","quantity":2}],"discountPercent":5}'

# Create - only products, quantities and optional overrides are sent
curl -X POST http://localhost:5000/api/v1/quotations -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"companyId":"<companyId>","contactId":"<contactId>","items":[{"productId":"<productId>","quantity":2,"discountPercent":10}]}'

# Download the PDF, send it, accept it
curl -X POST http://localhost:5000/api/v1/quotations/<id>/pdf -H "Authorization: Bearer <accessToken>" -o QUO-000001.pdf
curl -X POST http://localhost:5000/api/v1/quotations/<id>/send -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" -d '{"to":"buyer@example.com"}'
curl -X PATCH http://localhost:5000/api/v1/quotations/<id>/status -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" -d '{"statusId":"<accepted status id>"}'
```

Create response (abridged):

```json
{
  "success": true,
  "message": "Quotation created successfully",
  "data": {
    "quotation": {
      "id": "<id>", "quotationNumber": "QUO-000001", "companyId": "<id>", "statusId": "<id>",
      "items": [{ "productId": "<id>", "name": "<from product>", "sku": "<from product>", "quantity": 2, "unitPrice": 1000,
                  "discountPercent": 10, "discount": 200, "taxRate": 18, "tax": 324, "total": 1800 }],
      "subtotal": 1800, "discountPercent": 0, "discount": 0, "tax": 324, "grandTotal": 2124,
      "status": { "name": "<status>", "category": "draft" }
    }
  }
}
```

### Screens

| Route                   | Needs                                         | What it shows                                  |
| ----------------------- | --------------------------------------------- | ---------------------------------------------- |
| `/quotations`           | `quotations.read`                             | DataGrid with server-side paging and sorting; search, status, customer and date-range filters (kept in the URL) |
| `/quotations/new`       | `quotations.create`                           | The builder. Accepts `?companyId=` and `?opportunityId=` (an opportunity's page has a "New quotation" button) |
| `/quotations/:id`       | `quotations.read`                             | Lines, totals, terms; status selector, Edit, PDF, Send, Delete; Timeline tab |
| `/quotations/:id/edit`  | `quotations.read` + `quotations.update`       | The builder; refused for accepted or rejected quotations |
| `/settings/application` | `settings.manage`                             | Application settings; the company details are its first tab (`/settings/company` opens the same screen) |
| `/settings`             | `quotations.manageStatuses` (or the other list permissions) | A "Quotation statuses" tab        |

**The builder.** Customer, contact, opportunity, products and status are all pickers fed by the
API (contacts and opportunities are those of the chosen customer). Each line has a product,
quantity, unit price (pre-filled from the product), discount % and description. As lines change,
the builder asks `POST /quotations/calculate` (debounced) and shows the server's tax, line amounts
and totals - it never calculates them itself, and never sends them when saving.

The company page's **Quotations** tab lists that company's quotations with an "Add quotation"
button.

## Orders

An order is a confirmed sale. It is normally created from an **accepted quotation**, whose
customer, lines and totals it copies exactly as the customer accepted them; it can also be entered
directly, priced by the server like a quotation.

### Database model

**Order** (`server/src/models/Order.js`)

| Field              | Type / rule                              | Notes                                         |
| ------------------ | ---------------------------------------- | --------------------------------------------- |
| `orderNumber`      | string, unique                           | Generated (`ORD-000001`, see `ORDER_NUMBER_*`); never accepted from clients |
| `quotationId`      | ObjectId -> `Quotation`                  | The quotation it was created from; fixed once set |
| `companyId`        | ObjectId -> `Company`, required          | From the quotation, or given; fixed afterwards |
| `contactId`        | ObjectId -> `Contact`                    | Must belong to the company                    |
| `items[]`          | 1-200 lines                              | The same line shape as quotations (product details copied, amounts calculated) |
| `subtotal`, `discount`, `tax`, `grandTotal` | numbers                | Copied from the quotation, or **calculated by the server** - never taken from a client |
| `orderDate`        | date, required                           | Default: today                                |
| `deliveryDate`     | date, not before `orderDate`             |                                               |
| `statusId`         | ObjectId -> `OrderStatus`, required      | Default: the default status                   |
| `assignedTo`       | ObjectId -> `User`                       | An active user                                |
| `notes`            | string, max 5000                         | Default from the quotation                    |
| `createdBy`        | ObjectId -> `User`                       | Set by the server                             |

`Quotation.orderId` points back at the order. Responses expand `quotation`, `company`, `contact`,
`status`, `assignedToUser` and `createdByUser`. Deleting is a soft delete; numbers are never reused.

### Creating an order from a quotation

`POST /orders/from-quotation/:quotationId` (or `POST /orders` with `quotationId` in the body). The body
may carry `companyId`, `orderDate`, `deliveryDate`, `statusId`, `assignedTo` and `notes`; lines and money
come from the quotation only (sending `items` is a 422).

The backend verifies, in this order:

| Check                                          | Refused with                             |
| ---------------------------------------------- | ---------------------------------------- |
| The quotation exists (and is not deleted)      | 404                                      |
| It belongs to the company, when `companyId` is sent | 400 "This quotation belongs to another company" |
| It is accepted (its status's category is `accepted`) | 409 "Only an accepted quotation can be turned into an order" |
| No order has been generated from it yet       | 409 "An order has already been created from this quotation" |

**Duplicates are impossible, not just unlikely.** After the checks, the quotation is *claimed* with
one atomic update - "set `orderId` where `orderId` is still empty" - before the order is written. Of
any number of simultaneous requests only one gets the claim; the rest get the 409. If anything
fails after the claim, it is released so the quotation can be tried again. (Tested with five
requests at once: one order.)

The order copies the quotation's lines, prices, tax rates and totals as accepted, even if a
product's price has changed since. Deleting an order releases its quotation, so a new order can
be made from it; a quotation that has an order cannot be deleted (409).

### Direct orders and edits

`POST /orders` without `quotationId` needs `companyId` and `items`; lines are priced from the products
exactly as quotations are (`server/src/services/lineItems.service.js`), and calculated fields sent
by a client are dropped unread.

`PUT /orders/:id` changes the fields sent: `contactId`, `orderDate`, `deliveryDate`, `assignedTo`,
`notes`, and `items` / `discountPercent` (which reprice the order). The customer, the source
quotation and the status cannot be changed here (422).

### Statuses

An administrator-managed list (`/order-statuses`, the Settings screen), seeded once with New,
Confirmed, Processing, Shipped, Delivered and Cancelled. Each has a fixed **category** - `open`,
`in_progress`, `completed`, `cancelled` - which is what the code relies on. New orders take the default
status. A **completed** or **cancelled** order cannot be edited (409) until its status is changed
back. A status that orders use can be deactivated but not deleted.

### List query parameters

`GET /orders`

| Parameter        | Notes                                                               |
| ---------------- | ------------------------------------------------------------------- |
| `page`, `limit`    | `limit` 1-100 (default 20)                                    |
| `search`         | Every word must match number, product name / SKU, or notes          |
| `statusId`, `companyId`, `contactId`, `quotationId`, `assignedTo` | Exact filters |
| `statusCategory` | `open`, `in_progress`, `completed`, `cancelled`                     |
| `dateFrom`, `dateTo` | Order date range, both inclusive                                  |
| `sortBy`         | `orderNumber`, `orderDate`, `deliveryDate`, `grandTotal`, `createdAt` (default), `updatedAt` |
| `sortOrder`      | `asc` or `desc` (default)                                           |

### Permissions

| Permission              | Allows                                                    |
| ----------------------- | --------------------------------------------------------- |
| `orders.read`           | List and view orders and their timeline                   |
| `orders.create`         | Create orders, including from accepted quotations         |
| `orders.update`         | Edit orders and change their status                       |
| `orders.delete`         | Delete orders                                             |
| `orders.manageStatuses` | Manage the order status list                              |

### Examples

```bash
# Turn an accepted quotation into an order
curl -X POST http://localhost:5000/api/v1/orders/from-quotation/<quotationId> -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" -d '{"companyId":"<companyId>","deliveryDate":"2031-01-31"}'

# The same quotation again -> 409 "An order has already been created from this quotation"

# Move it along; list open and in-progress work for one customer
curl -X PATCH http://localhost:5000/api/v1/orders/<id>/status -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" -d '{"statusId":"<status id>"}'
curl "http://localhost:5000/api/v1/orders?companyId=<companyId>&statusCategory=in_progress" -H "Authorization: Bearer <accessToken>"
```

### Screens

| Route          | Needs                    | What it shows                                                   |
| -------------- | ------------------------ | --------------------------------------------------------------- |
| `/orders`      | `orders.read`            | DataGrid with server-side paging and sorting; search, status, customer and date-range filters (kept in the URL) |
| `/orders/:id`  | `orders.read`            | Customer, source quotation, dates, lines and totals; status selector, Edit (dates, contact, assignee, notes), Delete; Timeline tab |
| `/quotations/:id` | `orders.create`       | An accepted quotation without an order shows **Create order** (order date, delivery date, status, assignee, notes); one with an order links to it |
| `/settings`    | `orders.manageStatuses`  | An "Order statuses" tab                                         |

The company page's **Orders** tab lists that company's orders.

## Customers

A customer is a company we sell to. The Customers module adds a 360-degree view of everything
about that company, **without duplicating it**.

### No duplication

A customer is a thin record that **references** existing records:

```text
Customer ──companyId──────▶ Company          (name, address, tax numbers, industry... live here only)
         ──primaryContactId─▶ Contact
         ──firstOrderId─────▶ Order           (the order that made it a customer)
         ──accountManagerId─▶ User
```

It stores only what is specific to being a customer: `customerNumber` (generated,
`CUST-000001`, see `CUSTOMER_NUMBER_*`), `status` (`active` | `inactive`), `customerSince`,
`notes`. Company details are never copied - renaming the company shows on the customer at once -
and sending them to the customer API is refused (422). One customer per company (a unique index,
so two simultaneous requests cannot make two).

**How a company becomes a customer:**

- **Automatically, with its first order** (from a quotation or direct). The customer references
  that order, starts on its order date, and takes the company's assigned user as account manager.
  This never fails the order itself.
- **By hand**, with `POST /customers` or **Add customer** (also on the company page).
- **Once, on upgrade:** at the first start after this module was added, every company that already
  had orders became a customer, referencing its first order (`backfillCustomers`, also run by
  `npm run seed`). It does not run again, so a customer an administrator removes is not
  brought back - until that company's next order.

**Removing** a customer (`DELETE /customers/:id`) removes only the designation: the company and all
its contacts, quotations and orders stay. While a company is a customer it cannot be deleted, nor
can a contact who is a customer's primary contact (409).

### The 360-degree view

`GET /customers/:id/summary` returns, in the order the page shows them, every section with a real
count from the database, and figures aggregated there too:

```json
{
  "customer": { "id": "<id>", "customerNumber": "CUST-000001", "company": { "name": "<from the company>" } },
  "sections": [
    { "key": "contacts", "label": "Contacts", "available": true, "count": 3 },
    { "key": "activities", "label": "Activities", "available": true, "count": 12 },
    { "key": "opportunities", "label": "Opportunities", "available": true, "count": 2 },
    { "key": "quotations", "label": "Quotations", "available": true, "count": 4 },
    { "key": "orders", "label": "Orders", "available": true, "count": 3 },
    { "key": "projects", "label": "Projects", "available": false, "count": null },
    { "key": "tickets", "label": "Tickets", "available": false, "count": null },
    { "key": "payments", "label": "Payments", "available": true, "count": 4 },
    { "key": "contracts", "label": "Contracts", "available": true, "count": 1 },
    { "key": "documents", "label": "Documents", "available": true, "count": 2 },
    { "key": "timeline", "label": "Timeline", "available": true, "count": 18 }
  ],
  "metrics": {
    "orders": { "orderCount": 2, "orderValue": 125000, "lastOrderDate": "<date>", "openOpportunities": 1,
                "byCategory": { "open": { "count": 1, "value": 25000 }, "cancelled": { "count": 1, "value": 9000 } } },
    "quotations": { "byCategory": { "accepted": { "count": 3, "value": 134000 } }, "openValue": 5000 },
    "opportunities": { "open": { "count": 1, "value": 50000 }, "won": { "count": 2, "value": 90000 }, "lost": { "count": 0, "value": 0 } },
    "activities": { "total": 12, "pending": 3, "overdue": 1 }
  }
}
```

- Every section has a real count now; Documents counts the files attached to the company.
- Order value and order count leave out cancelled orders. The quotations' `openValue` is drafts
  plus sent quotations.
- Each tab's records come from that module's own API, filtered by the customer's company:
  `/contacts?companyId=`, `/activities?companyId=` (and follow-ups), `/opportunities?companyId=`,
  `/quotations?companyId=`, `/orders?companyId=`. A tab needs that module's read permission.
- `GET /customers/:id/timeline` merges the customer's own history with its company's.

### List query parameters

`GET /customers` - each row carries `stats` (`orderCount`, `orderValue`, `lastOrderDate`,
`openOpportunities`) aggregated by the API for the customers on that page.

| Parameter        | Notes                                                               |
| ---------------- | ------------------------------------------------------------------- |
| `page`, `limit`    | `limit` 1-100 (default 20)                                    |
| `search`         | Every word must match the customer number, or the company's name, legal name, code, email, phone or city |
| `status`         | `active` or `inactive`                                              |
| `accountManagerId`, `companyId` | Exact filters                                         |
| `industryId`, `companyTypeId`, `organizationId` | The company's classification     |
| `sinceFrom`, `sinceTo` | Customer-since range, both inclusive                            |
| `sortBy`         | `name` (the company's, default), `customerNumber`, `customerSince`, `createdAt`, `updatedAt` |
| `sortOrder`      | `asc` (default) or `desc`                                           |

The search and the company filters run in one MongoDB aggregation that joins the company, so the
page and total are correct however many customers there are.

### Permissions

| Permission         | Allows                                                     |
| ------------------ | ---------------------------------------------------------- |
| `customers.read`   | The customer list, a customer, its summary and timeline    |
| `customers.create` | Make a company a customer by hand                          |
| `customers.update` | Edit primary contact, account manager, status, since, notes |
| `customers.delete` | Remove the customer designation                            |

### Examples

```bash
# Active customers in Pune, by name
curl "http://localhost:5000/api/v1/customers?search=pune&status=active&sortBy=name" -H "Authorization: Bearer <accessToken>"

# Make a company a customer by hand
curl -X POST http://localhost:5000/api/v1/customers -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" -d '{"companyId":"<companyId>","primaryContactId":"<contactId>"}'

# The 360-degree view, then its history
curl http://localhost:5000/api/v1/customers/<id>/summary -H "Authorization: Bearer <accessToken>"
curl http://localhost:5000/api/v1/customers/<id>/timeline -H "Authorization: Bearer <accessToken>"
```

### Screens

| Route             | Needs              | What it shows                                                    |
| ----------------- | ------------------ | ---------------------------------------------------------------- |
| `/customers`      | `customers.read`   | DataGrid with server-side paging and sorting; search, status, industry and account-manager filters (kept in the URL); order count, value and last order per row, from the API; Add customer |
| `/customers/:id`  | `customers.read`   | Header, then tabs Overview, Contacts, Activities, Opportunities, Quotations, Orders, Projects, Tickets, Payments, Contracts, Documents, Timeline - with the API's counts. Overview shows the API's figures, the customer fields and the company's details. Edit, Remove |
| `/companies/:id`  | `customers.read`   | A "Customer CUST-..." button, or "Add as customer"               |

## Projects and tasks

A project is work delivered for a company - usually after an order - broken into **tasks** and
**milestones** and carried out by a **team**.

### Database model

**Project** (`server/src/models/Project.js`)

| Field              | Type / rule                                | Notes                                         |
| ------------------ | ------------------------------------------ | --------------------------------------------- |
| `projectNumber`    | string, unique                             | Generated (`PRJ-000001`, see `PROJECT_NUMBER_*`); never accepted from clients |
| `name`             | string, 2-200, required                    |                                               |
| `companyId`        | ObjectId -> `Company`, required            | Fixed once the project exists                 |
| `customerId`       | ObjectId -> `Customer`                     | **The company's customer record, found by the server**; if sent, it must be that company's |
| `orderId`          | ObjectId -> `Order`                        | Must be the same company's order              |
| `description`, `notes` | string, max 5000                       |                                               |
| `startDate`, `expectedEndDate`, `actualEndDate` | dates      | End dates not before the start                |
| `statusId`         | ObjectId -> `ProjectStatus`, required      | Default: the default status                   |
| `priorityId`       | ObjectId -> `LeadPriority`                 | The administrator-managed priority list shared across the CRM; default: its default |
| `projectManagerId` | ObjectId -> `User`                         | An active user                                |
| `teamMembers[]`    | ObjectIds -> `User`                        | Active users, no repeats. Responses also give the people as `team` |
| `budget`           | number >= 0                                |                                               |
| `createdBy`        | ObjectId -> `User`                         | Set by the server                             |

**ProjectTask** (`server/src/models/ProjectTask.js`): `projectId`, `title` (required), `description`,
`milestoneId` (a milestone of the same project), `statusId` (-> `TaskStatus`, default: the default),
`priorityId`, `assignedTo` (**the project manager or a team member** - anyone else is 400),
`startDate`, `dueDate` (not before the start), `completedAt` (set by the server when the task enters
a "done" status, cleared when it leaves), `estimatedHours`. Soft delete.

**Milestone** (`server/src/models/Milestone.js`): `projectId`, `name`, `description`, `dueDate`,
`completedAt` (send `completed: true` / `false`). A milestone that tasks use cannot be deleted (409).

### Statuses and priorities are data

Two administrator-managed lists, seeded once and edited in **Settings**:

| List            | Endpoint               | Categories (what code relies on)                         | Seeded names |
| --------------- | ---------------------- | -------------------------------------------------------- | ------------ |
| Project statuses | `/project-statuses` | `not_started`, `active`, `on_hold`, `completed`, `cancelled` | Planned, In Progress, On Hold, Completed, Cancelled |
| Task statuses    | `/task-statuses`    | `todo`, `in_progress`, `done`, `cancelled`         | To Do, In Progress, In Review, Done, Cancelled |

- Entering a **completed** project status sets `actualEndDate` if it is empty (today, but not before
  the start date).
- **Progress** = done tasks / (all tasks - cancelled tasks), worked out in the database; `null` while
  there are no tasks.
- Priorities for projects and tasks are the shared list at `/lead-priorities` (also used by leads
  and opportunities), so there is one place to manage them.

### The project page

`GET /projects/:id/summary` returns the project, its sections and figures:

```json
{
  "project": { "id": "<id>", "projectNumber": "PRJ-000001", "stats": { "totalTasks": 5, "doneTasks": 2, "openTasks": 3, "overdueTasks": 1, "progress": 40 } },
  "sections": [
    { "key": "tasks", "label": "Tasks", "available": true, "count": 5 },
    { "key": "milestones", "label": "Milestones", "available": true, "count": 2 },
    { "key": "team", "label": "Team", "available": true, "count": 3 },
    { "key": "activities", "label": "Activities", "available": true, "count": 4 },
    { "key": "documents", "label": "Documents", "available": false, "count": null },
    { "key": "tickets", "label": "Tickets", "available": false, "count": null },
    { "key": "timeline", "label": "Timeline", "available": true, "count": 12 }
  ],
  "metrics": {
    "tasks": { "totalTasks": 5, "doneTasks": 2, "openTasks": 3, "overdueTasks": 1, "progress": 40, "estimatedHours": 64 },
    "milestones": { "total": 2, "completed": 1, "overdue": 0 },
    "daysRemaining": 38
  }
}
```

Documents lists the files attached to the project; Tickets lists the tickets linked to it.
The **timeline** records the project's own changes and what happened to its tasks and milestones
("Task "Survey" changed: Status To Do -> Done"). **Activities and follow-ups** can now be about a
project (`projectId`, `relatedType: project`) - the company is filled in from it.

### APIs

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/projects` | `projects.read` | List (search, filters, sort, paginate); each with task `stats` |
| POST | `/projects` | `projects.create` | Create |
| GET | `/projects/:id` | `projects.read` | One project |
| GET | `/projects/:id/summary` | `projects.read` | Sections with real counts, and figures |
| GET | `/projects/:id/timeline` | `projects.read` | History, including tasks and milestones |
| PUT | `/projects/:id` | `projects.update` | Update (team, status, dates, ...); the company is fixed |
| DELETE | `/projects/:id` | `projects.delete` | Delete (soft) |
| GET | `/projects/:id/tasks` | `projects.read` | Tasks (status, category, assignee, milestone, overdue, search, sort) |
| POST | `/projects/:id/tasks` | `projects.manageTasks` | Add a task |
| PUT | `/projects/:id/tasks/:taskId` | `projects.manageTasks` | Update a task |
| DELETE | `/projects/:id/tasks/:taskId` | `projects.manageTasks` | Delete (soft) a task |
| GET / POST | `/projects/:id/milestones` | read: `projects.read`; add: `projects.manageTasks` | Milestones, each with task counts |
| PUT / DELETE | `/projects/:id/milestones/:milestoneId` | `projects.manageTasks` | Update / delete a milestone |
| GET / POST / PUT / DELETE | `/project-statuses`, `/task-statuses` | read: any `projects.*`; change: `projects.manageStatuses` | The status lists |
| GET | `/orders/options` | `orders.read` or `projects.create` / `.update` | Orders for pickers (`?companyId`) |

`GET /projects` parameters: `page`, `limit`, `search` (number, name, description, notes), `statusId`,
`statusCategory`, `priorityId`, `companyId`, `customerId`, `orderId`, `projectManagerId`, `memberId`
(manager or team member), `sortBy` (`projectNumber`, `name`, `startDate`, `expectedEndDate`, `budget`,
`createdAt`, `updatedAt`), `sortOrder`.

### Permissions

| Permission                 | Allows                                                 |
| -------------------------- | ------------------------------------------------------ |
| `projects.read`            | Projects, their tasks, milestones, summary and timeline |
| `projects.create`          | Create projects                                        |
| `projects.update`          | Edit projects, including the team and status           |
| `projects.delete`          | Delete projects                                        |
| `projects.manageTasks`     | Add, edit and delete tasks and milestones              |
| `projects.manageStatuses`  | Manage the project and task status lists               |

### Examples

```bash
curl -X POST http://localhost:5000/api/v1/projects -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"name":"Office fit-out","companyId":"<companyId>","orderId":"<orderId>","projectManagerId":"<userId>","teamMembers":["<userId>"]}'
curl -X POST http://localhost:5000/api/v1/projects/<id>/tasks -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"title":"Site survey","assignedTo":"<userId>","dueDate":"2031-01-20"}'
curl "http://localhost:5000/api/v1/projects/<id>/tasks?overdue=true" -H "Authorization: Bearer <accessToken>"
curl http://localhost:5000/api/v1/projects/<id>/summary -H "Authorization: Bearer <accessToken>"
```

### Screens

| Route            | Needs            | What it shows                                                     |
| ---------------- | ---------------- | ----------------------------------------------------------------- |
| `/projects`      | `projects.read`  | DataGrid with server-side paging and sorting; search, status, priority and "manager or member" filters; progress bar and open tasks per row from the API; New project |
| `/projects/:id`  | `projects.read`  | Tabs Overview (figures, company, customer, order, dates, budget), Tasks (filters; status changed in place; add / edit / delete), Milestones (task counts; mark reached), Team (edit with `projects.update`), Activities (activities and follow-ups), Documents, Tickets, Timeline |

Company and customer pages have a **Projects** tab too.

## Support tickets

A ticket is a support request from a company. It carries a **conversation**: replies, internal
notes and every change to the ticket, as one feed.

### Database model

**Ticket** (`server/src/models/Ticket.js`)

| Field          | Type / rule                                   | Notes                                         |
| -------------- | --------------------------------------------- | --------------------------------------------- |
| `ticketNumber` | string, unique                                | Generated (`TKT-000001`, see `TICKET_NUMBER_*`); never accepted from clients |
| `companyId`    | ObjectId -> `Company`, required               | Fixed once the ticket exists                  |
| `contactId`    | ObjectId -> `Contact`                         | Who raised it; must work at the company       |
| `customerId`   | ObjectId -> `Customer`                        | **The company's customer record, found by the server**; never sent |
| `projectId`    | ObjectId -> `Project`                         | Optional; must be the same company's (it shows on the project's Tickets tab) |
| `subject`      | string, 3-200, required                       |                                               |
| `description`  | string, max 10000                             | What was reported                             |
| `categoryId`   | ObjectId -> `TicketCategory`                  | Optional                                      |
| `priorityId`   | ObjectId -> `TicketPriority`                  | Default: the default priority                 |
| `statusId`     | ObjectId -> `TicketStatus`, required          | Default: the default status                   |
| `assignedTo`   | ObjectId -> `User`                            | Changed with `PATCH /:id/assign`             |
| `attachments[]` | files                                        | `fileName`, `mimeType`, `size`, `messageId` (the reply or note it came with), `internal`, `uploadedBy`, `uploadedAt` |
| `resolvedAt`, `closedAt` | dates                                | Set by the server from the status (below)     |
| `replyCount`, `lastActivityAt` | kept by the server             | For lists                                     |
| `createdBy`    | ObjectId -> `User`                            | Set by the server                             |

**TicketMessage** (`server/src/models/TicketMessage.js`): `ticketId`, `type` (`reply` | `internal_note`),
`body`, `authorId`, `createdAt`. Append-only.

### Categories, priorities and statuses are data

Three administrator-managed lists, seeded once and edited in **Settings** (`tickets.manageSettings`):

| List       | Endpoint              | Extra fields                     | Seeded |
| ---------- | --------------------- | -------------------------------- | ------ |
| Categories | `/ticket-categories` | colour                           | General Enquiry, Technical Issue, Billing, Delivery, Feature Request |
| Priorities | `/ticket-priorities` | `level` (higher = more urgent), colour, default | Low, Medium (default), High, Urgent |
| Statuses   | `/ticket-statuses`   | `category`, colour, default        | New (default), In Progress, Waiting on Customer, Resolved, Closed |

A status's **category** - `open`, `in_progress`, `waiting`, `resolved`, `closed` - is what the code relies on:

- Entering a **resolved** status records `resolvedAt`; entering **closed** records `closedAt` (and
  `resolvedAt` if it was never resolved). Going back to an open, in-progress or waiting status clears both.
- A **closed** ticket refuses replies (409) until its status is changed back; internal notes are
  still allowed.

### Conversation

`GET /tickets/:id/conversation` returns the ticket, the files that came with it, and one feed, oldest
first:

```json
{
  "ticket": { "id": "<id>", "ticketNumber": "TKT-000001", "subject": "Printer offline", "status": { "category": "in_progress" } },
  "attachments": [{ "id": "<id>", "fileName": "error.log", "mimeType": "text/plain", "size": 2048 }],
  "items": [
    { "kind": "event", "action": "created", "actor": { "fullName": "<name>" }, "createdAt": "<date>" },
    { "kind": "message", "type": "reply", "body": "Please restart it.", "author": { "fullName": "<name>" }, "attachments": [] },
    { "kind": "event", "action": "status_changed", "changes": [{ "label": "Status", "from": "New", "to": "In Progress" }] },
    { "kind": "message", "type": "internal_note", "body": "Vendor case 123", "attachments": [{ "fileName": "vendor.pdf", "internal": true }] }
  ],
  "counts": { "replies": 1, "internalNotes": 1, "events": 2 }
}
```

Replies are the conversation with the customer; **internal notes** are for staff, shown set apart
in the app, and files added with them are marked `internal`. Replies are recorded in the CRM - they
are not emailed to the contact.

### Attachments

`POST /tickets`, `POST /:id/replies` and `POST /:id/internal-notes` accept **multipart/form-data**, with
files in the `attachments` field (JSON still works without files).

- Files are checked before anything is written: size (`UPLOAD_MAX_FILE_MB`, default 10 -> 413), count
  (`UPLOAD_MAX_FILES`, default 5 -> 400) and type (`UPLOAD_ALLOWED_TYPES`, default images, PDF, text,
  CSV, ZIP, Word and Excel -> 415). A request that is refused leaves no file behind.
- They are stored under `UPLOAD_DIR` (default `server/uploads`, ignored by git) with **random names**;
  the name a client sent is kept only as data, never used as a path.
- `GET /tickets/:id/attachments/:attachmentId` downloads one - signed-in users with `tickets.read`
  only, and only through its own ticket.

### Assignment

Anyone with `tickets.update` may **take** an unassigned ticket or let go of their own; giving a
ticket to someone else (on create or later) needs `tickets.assign`.

### List and counts

`GET /tickets`: `page`, `limit`, `search` (number, subject, description), `statusId`, `statusCategory`,
`openOnly` (not resolved or closed), `priorityId`, `categoryId`, `assignedTo`, `unassigned`, `companyId`,
`contactId`, `customerId`, `projectId`, `sortBy` (`ticketNumber`, `subject`, `createdAt`, `updatedAt`,
`lastActivityAt` - default), `sortOrder`.

`GET /tickets/stats` (optionally `?assignedTo=`): counts by status category, open tickets nobody has
taken, and the total - aggregated in the database.

### APIs

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/tickets` | `tickets.read` | List |
| GET | `/tickets/stats` | `tickets.read` | Queue counts |
| POST | `/tickets` | `tickets.create` | Open a ticket (JSON or multipart with files) |
| GET | `/tickets/:id` | `tickets.read` | One ticket |
| PUT | `/tickets/:id` | `tickets.update` | Edit subject, description, contact, project, category, priority |
| DELETE | `/tickets/:id` | `tickets.delete` | Delete (soft); files stay on disk |
| PATCH | `/tickets/:id/assign` | `tickets.assign`, or `tickets.update` for yourself | Assign or unassign |
| PATCH | `/tickets/:id/status` | `tickets.update` | Change status |
| POST | `/tickets/:id/replies` | `tickets.reply` | Add a reply (with files) |
| POST | `/tickets/:id/internal-notes` | `tickets.addInternalNote` | Add an internal note (with files) |
| GET | `/tickets/:id/conversation` | `tickets.read` | Replies, notes and events as one feed |
| GET | `/tickets/:id/attachments/:attachmentId` | `tickets.read` | Download a file |
| GET / POST / PUT / DELETE | `/ticket-categories`, `/ticket-priorities`, `/ticket-statuses` | read: any `tickets.*`; change: `tickets.manageSettings` | The three lists |

### Examples

```bash
# Open a ticket with a file
curl -X POST http://localhost:5000/api/v1/tickets -H "Authorization: Bearer <accessToken>" \
  -F companyId=<companyId> -F subject="Printer offline" -F description="Since Monday" -F attachments=@error.log

# Reply, add a note, see the conversation, download a file
curl -X POST http://localhost:5000/api/v1/tickets/<id>/replies -H "Authorization: Bearer <accessToken>" \
  -F body="Please try the new driver" -F attachments=@driver.zip
curl -X POST http://localhost:5000/api/v1/tickets/<id>/internal-notes -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" -d '{"body":"Escalated to the vendor"}'
curl http://localhost:5000/api/v1/tickets/<id>/conversation -H "Authorization: Bearer <accessToken>"
curl -OJ http://localhost:5000/api/v1/tickets/<id>/attachments/<attachmentId> -H "Authorization: Bearer <accessToken>"
```

### Screens

| Route          | Needs          | What it shows                                                      |
| -------------- | -------------- | ------------------------------------------------------------------ |
| `/tickets`     | `tickets.read` | Counts by status from the API (click to filter); queue (all / assigned to me / unassigned), status, priority and category filters, search; DataGrid with server-side paging and sorting; New ticket (with files) |
| `/tickets/:id` | `tickets.read` | The **conversation**: what was reported, then replies, highlighted internal notes and change lines in order, each with its files (click to download); a composer with Reply and Internal note tabs (by permission) and file attachments. Beside it: status, assignee (or "Take it"), company, contact, customer, project, dates |

Company, customer and project pages have a **Tickets** tab; activities can be about a ticket.

## Contracts (AMC)

A contract is a service or maintenance agreement (AMC) with a company, for a period and an amount.
The server reminds the person responsible before it ends, and marks it expired once it has.

### Database model

**Contract** (`server/src/models/Contract.js`)

| Field            | Type / rule                              | Notes                                         |
| ---------------- | ---------------------------------------- | --------------------------------------------- |
| `contractNumber` | string, unique                           | Generated (`CON-000001`, see `CONTRACT_NUMBER_*`); never accepted from clients |
| `companyId`      | ObjectId -> `Company`, required          | Fixed once the contract exists                |
| `customerId`     | ObjectId -> `Customer`                   | **The company's customer record, found by the server**; never sent |
| `contractTypeId` | ObjectId -> `ContractType`               | Optional                                      |
| `startDate`      | date, required                           | Stored as a calendar day                      |
| `endDate`        | date, required, not before `startDate`   | What reminders and expiry are measured from   |
| `amount`         | number >= 0, required                    | The value for the whole term, rounded to 2 decimals |
| `billingCycleId` | ObjectId -> `BillingCycle`               | Default: the default cycle. (The spec's `billingCycle`, stored as a reference so the list stays data) |
| `statusId`       | ObjectId -> `ContractStatus`, required   | Default: the default status; changed with `PATCH /:id/status` |
| `assignedTo`     | ObjectId -> `User`                       | Receives the reminders                        |
| `renewalDate`    | date, not before `startDate`             | Optional: when to take up renewal             |
| `description`    | string, max 5000                         |                                               |
| `createdBy`      | ObjectId -> `User`                       | Set by the server                             |

Every contract in a response also carries **`daysToEnd`** (negative once it has ended), worked out
by the server - the screens never calculate it.

**ContractReminder** (`server/src/models/ContractReminder.js`): one row per reminder sent -
`contractId`, `daysBefore`, `endDate`, `daysLeft`, `recipientId`, `followUpId`, `emailedAt` or
`emailError`. Unique on contract + period + end date.

### Types, statuses, billing cycles and reminder periods are data

Four administrator-managed lists, seeded once and edited in **Settings** (`contracts.manageSettings`):

| List             | Endpoint                      | Extra fields                       | Seeded |
| ---------------- | ----------------------------- | ---------------------------------- | ------ |
| Contract types   | `/contract-types`            | colour                             | Annual Maintenance (AMC), Comprehensive AMC, Support Plan, Warranty Extension |
| Contract statuses | `/contract-statuses`        | `category`, colour, default        | Draft, Active (default), Expired, Renewed, Cancelled |
| Billing cycles   | `/billing-cycles`            | `months` per cycle (empty = one-time), default | Monthly, Quarterly, Half-yearly, Yearly (default), One-time |
| Reminder periods | `/contract-reminder-periods` | `daysBefore` (0-365, unique)       | 30, 15 and 7 days before |

A status's **category** - `draft`, `active`, `expired`, `renewed`, `cancelled` - is what the code relies
on, never its name: only **active** contracts are reminded about and expired automatically.

### Automatic expiry reminders

**When** reminders go out is the *Contract reminder periods* list - there is no 30 / 15 / 7 in the
code. Add "60 days before", change 7 to 10, or deactivate a period, and the next check follows it.

The check (`server/src/services/contractReminder.service.js`) runs when the server starts and then
every `CONTRACT_REMINDER_INTERVAL_MINUTES` (default 60; 0 = off). `POST /contracts/reminders/run`
runs it on demand. Each run:

1. **Expires**: active contracts whose end date has passed move to the first active status meaning
   "expired" (recorded on the timeline as done automatically). With no such status, nothing moves.
2. **Reminds**: for each active contract ending within the longest active period, the *smallest
   period that covers the days left* is due. With periods 30 / 15 / 7, a contract gets one reminder
   when it comes within 30 days, one within 15 and one within 7. A contract created 10 days before
   its end gets only the 15-day one (then the 7-day one) - not three at once.

A reminder is:

- a **follow-up** about the contract for `assignedTo` (or, if nobody is assigned, whoever created
  it), due on the end date - it shows in their follow-ups and on the contract page;
- an **email** to that person when email is configured (`SMTP_*`); if not, or if it fails, the
  reason is stored on the reminder and everything else still happens;
- a line on the contract's **timeline**.

Each reminder is claimed in the database before it is sent (unique on contract + period + end
date), so it goes out **once**, however often the check runs and on however many servers.

- Changing a contract's **end date** (a renewal) cancels its pending reminder follow-ups and starts
  a new round for the new date.
- Moving a contract out of an active status, or deleting it, cancels its pending reminder
  follow-ups.

### List and counts

`GET /contracts`: `page`, `limit`, `search` (number, description), `statusId`, `statusCategory`,
`contractTypeId`, `billingCycleId`, `assignedTo`, `companyId`, `customerId`, `expiringWithin` (active
contracts ending within N days), `endFrom`, `endTo`, `sortBy` (`contractNumber`, `startDate`,
`endDate` - default, `renewalDate`, `amount`, `createdAt`, `updatedAt`), `sortOrder`.

`GET /contracts/stats` (optionally `?companyId=`, `?assignedTo=`), aggregated in the database:

```json
{
  "byCategory": { "draft": { "count": 1, "value": 90000 }, "active": { "count": 5, "value": 489000 }, "expired": { "count": 1, "value": 54000 }, "renewed": { "count": 0, "value": 0 }, "cancelled": { "count": 0, "value": 0 } },
  "total": 7,
  "expiringSoon": { "withinDays": 30, "count": 3, "value": 243000 },
  "pastEndDate": 0
}
```

`expiringSoon.withinDays` is the longest active reminder period (null when none is active).

### APIs

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/contracts` | `contracts.read` | List |
| GET | `/contracts/stats` | `contracts.read` | Counts, values, expiring soon |
| POST | `/contracts` | `contracts.create` | Create |
| GET | `/contracts/:id` | `contracts.read` | One contract |
| PUT | `/contracts/:id` | `contracts.update` | Edit (not the company or the status) |
| DELETE | `/contracts/:id` | `contracts.delete` | Delete (soft) |
| PATCH | `/contracts/:id/status` | `contracts.update` | Change status |
| GET | `/contracts/:id/reminders` | `contracts.read` | Reminders sent for it |
| GET | `/contracts/:id/timeline` | `contracts.read` | History |
| POST | `/contracts/reminders/run` | `contracts.manageSettings` | Run the expiry check now |
| GET / POST / PUT / DELETE | `/contract-types`, `/contract-statuses`, `/billing-cycles`, `/contract-reminder-periods` | read: any `contracts.*`; change: `contracts.manageSettings` | The four lists |

Reminder follow-ups: `GET /followups?relatedType=contract&relatedId=<id>`. Activities can be about
a contract (`contractId`).

### Examples

```bash
# Create a contract
curl -X POST http://localhost:5000/api/v1/contracts -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"companyId":"<companyId>","startDate":"2026-11-01","endDate":"2027-10-31","amount":120000,"assignedTo":"<userId>"}'

# Remind 45 days before as well
curl -X POST http://localhost:5000/api/v1/contract-reminder-periods -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" -d '{"name":"45 days before","daysBefore":45}'

# Run the check now, then see what was sent
curl -X POST http://localhost:5000/api/v1/contracts/reminders/run -H "Authorization: Bearer <accessToken>"
curl http://localhost:5000/api/v1/contracts/<id>/reminders -H "Authorization: Bearer <accessToken>"
```

### Screens

| Route            | Needs            | What it shows                                                    |
| ---------------- | ---------------- | ---------------------------------------------------------------- |
| `/contracts`     | `contracts.read` | Counts by status from the API (click to filter) and "Expiring within N days" (N from the API); search, status, type and billing-cycle filters, "assigned to me"; DataGrid with server-side paging and sorting; New contract; Run reminder check (`contracts.manageSettings`) |
| `/contracts/:id` | `contracts.read` | Header with status (changed in place), type and "Ends in N days"; tabs Overview, Reminders (what was sent, to whom, emailed or why not), Activities & follow-ups, Timeline; Edit, Delete |

Company and customer pages have a **Contracts** tab. The four lists are tabs under **Settings**.

## Payment tracking

A payment record is an amount to collect from a company - an invoice - and how much of it has been
received so far.

### Database model

**Payment** (`server/src/models/Payment.js`)

| Field             | Type / rule                            | Notes                                         |
| ----------------- | -------------------------------------- | --------------------------------------------- |
| `invoiceNumber`   | string, unique, fixed once set         | Entered (the number from your accounting system) or, if left out, generated (`INV-000001`, see `INVOICE_NUMBER_*`) |
| `companyId`       | ObjectId -> `Company`, required        | Fixed once the payment exists                 |
| `customerId`      | ObjectId -> `Customer`                 | **The company's customer record, found by the server**; never sent |
| `orderId`         | ObjectId -> `Order`                    | Optional; must be the same company's          |
| `amount`          | number > 0, required                   | What is to be collected                       |
| `paidAmount`      | number >= 0, default 0                 | What has been received                        |
| `remainingAmount` | number                                 | **Always calculated by the server**: `amount - paidAmount`, never below 0. A request that sends it is refused (422) |
| `dueDate`         | date                                   | What "overdue" is measured from               |
| `paymentDate`     | date                                   | When money was last received; set to today when money is recorded without a date, cleared when nothing is paid |
| `paymentMethodId` | ObjectId -> `PaymentMethod`            | Optional                                      |
| `statusId`        | ObjectId -> `PaymentStatus`, required  | **Follows the amounts** (below)               |
| `notes`           | string, max 5000                       |                                               |
| `createdBy`       | ObjectId -> `User`                     | Set by the server                             |

Every payment in a response also carries `isOverdue`, `daysOverdue` and `overpaidAmount`, worked out
by the server.

### Methods and statuses are data

Two administrator-managed lists, seeded once and edited in **Settings** (`payments.manageSettings`):

| List     | Endpoint             | Extra fields            | Seeded |
| -------- | -------------------- | ----------------------- | ------ |
| Methods  | `/payment-methods`  | colour                  | Bank Transfer, UPI, Cheque, Cash, Card |
| Statuses | `/payment-statuses` | `category` (required), colour | Unpaid, Partially Paid, Paid, Cancelled |

A status's **category** - `unpaid`, `partially_paid`, `paid`, `cancelled` - is what the code relies on.

### What the server calculates

Nothing about money is taken from the client's arithmetic:

- **`remainingAmount`** = `amount - paidAmount` (rounded to 2 decimals), on every create and update.
- **The status** is set from the amounts: nothing paid -> the first active *unpaid* status; part ->
  *partially paid*; everything -> *paid*. A `statusId` in a request matters only to **cancel**
  (a status of category `cancelled`), to **re-open** (any other status - the server then sets the
  one the amounts call for), or to choose between several statuses of the category that applies.
- **Money received** can be sent as `receivedAmount` on `PUT`: the server adds it to `paidAmount`
  and dates it today (or `paymentDate`). `paidAmount` sets the total instead, for corrections.
  Sending both is refused.
- **Overdue** is not a status. A payment is overdue when it is not paid in full, not cancelled,
  and its `dueDate` is before today - decided when it is read, so nothing has to run overnight.

### No overpayment unless configured

With the default `PAYMENT_ALLOW_OVERPAYMENT=false`:

- `paidAmount` may not exceed `amount` - on create, on update, when adding `receivedAmount`, and when
  lowering `amount` below what was already paid (422, naming the field).
- The payments of one **order** (cancelled ones aside) may not add up to more than the order's
  grand total (422 on `amount`, saying how much is still to invoice).

Set `PAYMENT_ALLOW_OVERPAYMENT=true` to allow both (advances, extra charges). `remainingAmount` then
stops at 0 and the excess is reported as `overpaidAmount`.

An order that has payments cannot be deleted (409).

### List, filters and totals

`GET /payments`: `page`, `limit`, `search` (invoice number, notes), **`state`** (`paid` | `partially_paid` |
`unpaid` | `overdue` | `cancelled`), `statusId`, `paymentMethodId`, `companyId`, `customerId`, `orderId`,
`dueFrom`, `dueTo`, `sortBy` (`invoiceNumber`, `amount`, `paidAmount`, `remainingAmount`, `dueDate`,
`paymentDate`, `createdAt` - default, `updatedAt`), `sortOrder`.

`GET /payments/stats` (optionally `?companyId=`, `?customerId=`, `?orderId=`), aggregated in the database:

```json
{
  "byCategory": {
    "unpaid": { "count": 3, "amount": 128300, "paid": 0, "remaining": 128300 },
    "partially_paid": { "count": 3, "amount": 204750.5, "paid": 85550.2, "remaining": 119200.3 },
    "paid": { "count": 2, "amount": 285000, "paid": 285000, "remaining": 0 },
    "cancelled": { "count": 0, "amount": 0, "paid": 0, "remaining": 0 }
  },
  "overdue": { "count": 3, "remaining": 146250 },
  "totals": { "count": 8, "amount": 618050.5, "paid": 370550.2, "outstanding": 247500.3 },
  "order": { "id": "<id>", "orderNumber": "ORD-000001", "grandTotal": 2360, "invoiced": 1000, "toInvoice": 1360 }
}
```

Cancelled payments are left out of `totals`. `order` appears only with `?orderId=`.

### APIs

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/payments` | `payments.read` | List, with the `state` filter |
| GET | `/payments/stats` | `payments.read` | Totals by state, overdue, outstanding |
| POST | `/payments` | `payments.create` | Create |
| GET | `/payments/:id` | `payments.read` | One payment |
| PUT | `/payments/:id` | `payments.update` | Edit, record money received, cancel or re-open |
| DELETE | `/payments/:id` | `payments.delete` | Delete (soft); the invoice number stays taken |
| GET | `/payments/:id/timeline` | `payments.read` | Every change, with before and after values |
| GET / POST / PUT / DELETE | `/payment-methods`, `/payment-statuses` | read: any `payments.*`; change: `payments.manageSettings` | The two lists |

### Examples

```bash
# An invoice of 1000 for an order, due on a date
curl -X POST http://localhost:5000/api/v1/payments -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"companyId":"<companyId>","orderId":"<orderId>","amount":1000,"dueDate":"2026-11-15"}'

# 400 received: the server makes it paid 400, remaining 600, "partially paid"
curl -X PUT http://localhost:5000/api/v1/payments/<id> -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" -d '{"receivedAmount":400,"paymentMethodId":"<methodId>"}'

# What is overdue, and the totals
curl "http://localhost:5000/api/v1/payments?state=overdue" -H "Authorization: Bearer <accessToken>"
curl http://localhost:5000/api/v1/payments/stats -H "Authorization: Bearer <accessToken>"
```

### Screens

| Route           | Needs           | What it shows                                                      |
| --------------- | --------------- | ------------------------------------------------------------------ |
| `/payments`     | `payments.read` | Four filter cards - **Paid, Partially paid, Unpaid, Overdue** - each with the API's count and sum (click to filter); outstanding total; search, company and method filters; DataGrid with server-side paging and sorting; New payment |
| `/payments/:id` | `payments.read` | Amount, Paid and Remaining as returned by the API, "Overdue by N days", details and Timeline; Record payment (sends only the amount received), Edit, Cancel payment / Re-open, Delete |

Company and customer pages have a **Payments** tab, and the order page a **Payments** tab that also
shows the order total and how much of it is still to invoice. No screen has a "remaining" input.

## Document management

Files can be attached to a **company, contact, lead, opportunity, quotation, order, project,
ticket, contract or payment**. The file goes to object storage; MongoDB holds only its details.

### Database model

**Document** (`server/src/models/Document.js`)

| Field        | Type / rule                   | Notes                                              |
| ------------ | ----------------------------- | -------------------------------------------------- |
| `fileName`   | string, max 255               | The name it was uploaded with, cleaned (no path, no control characters). Data only - never used as a path |
| `fileUrl`    | string (computed)             | **The API's own download route**, `/api/v1/documents/<id>/download`. It needs the Bearer token like any other request. A storage address is never handed out |
| `fileType`   | string                        | MIME type                                          |
| `fileSize`   | number                        | Bytes                                              |
| `entityType` | one of the ten kinds above    | Fixed once uploaded                                |
| `entityId`   | ObjectId                      | The record; must exist when uploading              |
| `uploadedBy` | ObjectId -> `User`            | The signed-in user; never sent                     |
| `createdAt`  | date                          |                                                    |
| `storageKey`, `storageDriver` | strings        | Where the file is. **Never sent to clients**       |

Lists also return `entity: { type, id, label }` - what the document belongs to - and
`uploadedByUser`.

### Storage

`STORAGE_DRIVER` chooses where files are kept (`server/src/services/storage.service.js`):

| Driver  | What it is | Settings |
| ------- | ---------- | -------- |
| `s3`    | Any **S3-compatible object store**: AWS S3, MinIO, Cloudflare R2, DigitalOcean Spaces. Use this in production | `S3_BUCKET` (required), `S3_REGION`, `S3_ENDPOINT` (non-AWS stores), `S3_FORCE_PATH_STYLE` (MinIO), `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY` (omit both to use the machine's own role), `S3_KEY_PREFIX` |
| `local` | The `UPLOAD_DIR` folder on the server (default `server/uploads`, ignored by git). **The default, for development** | `UPLOAD_DIR` |

- Keep the bucket **private**. The API streams every download itself after checking the user, so
  nothing in the bucket needs to be public and no link can be passed around.
- Objects are stored as `documents/<entityType>/<entityId>/<random uuid>.<ext>`.
- Ticket attachments use the same storage.
- Switching driver does not move existing files: each document remembers which driver stored
  it, but only the configured one is read. Copy the files across before switching.

To try object storage locally with MinIO:

```bash
docker run -p 9000:9000 -e MINIO_ROOT_USER=minio -e MINIO_ROOT_PASSWORD=<a-password> minio/minio server /data
# create a bucket called "crm" in the MinIO console, then in server/.env:
# STORAGE_DRIVER=s3  S3_BUCKET=crm  S3_ENDPOINT=http://localhost:9000  S3_FORCE_PATH_STYLE=true
# S3_ACCESS_KEY_ID=minio  S3_SECRET_ACCESS_KEY=<a-password>
```

### What is validated

Everything is checked **before anything is stored**; a refused request leaves nothing behind, and
one bad file refuses the whole request.

| Check | Rule | Refused with |
| ----- | ---- | ------------ |
| **File type** | The MIME type must be in `UPLOAD_ALLOWED_TYPES` (default: images, PDF, text, CSV, ZIP, Word, Excel) | 415 |
| **Content** | The file must *look like* its type: a PDF starts with `%PDF-`, a PNG / JPEG / GIF / WebP has its signature, Word / Excel / ZIP have theirs, and text files contain no binary. The type a client sends proves nothing | 415 |
| **Extension** | Programs and pages (`.exe`, `.bat`, `.js`, `.html`, `.svg`, ...) are never accepted, whatever type they are sent as | 415 |
| **File size** | At most `UPLOAD_MAX_FILE_MB` (default 10); not empty | 413 / 400 |
| **Count** | At most `UPLOAD_MAX_FILES` per request (default 5); at least one | 400 |
| **Record** | `entityType` must be one of the ten kinds and `entityId` an existing record | 422 / 400 |

### Authorization

Two things are needed for every operation:

1. A **documents permission** - `documents.read` (list, details, download), `documents.create`
   (upload), `documents.delete` (delete anyone's).
2. **Access to the record** the document belongs to - `companies.read` for a company's documents,
   `quotations.read` for a quotation's, `payments.read` for a payment's, and so on. Without it the
   answer is 403, whatever documents permissions the user holds.

- The list without `entityType` returns only documents of the kinds of record the user may see.
- **Deleting:** anyone with `documents.create` can delete what they uploaded themselves; someone
  else's needs `documents.delete`. The file is removed from storage with the record.
- Downloads are sent as attachments (`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`,
  not cached), so a browser never renders an uploaded file as a page.
- Uploads and deletions are written to the record's timeline.

### APIs

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| POST | `/documents` | `documents.create` + the record | Upload. `multipart/form-data`: `entityType`, `entityId`, one or more files in `files` |
| GET | `/documents` | `documents.read` (+ the record) | List. `entityType` + `entityId` for one record; `search` (file name), `uploadedBy`, `page`, `limit`, `sortBy` (`fileName`, `fileSize`, `fileType`, `createdAt` - default), `sortOrder` |
| GET | `/documents/:id` | `documents.read` + the record | The details of one document |
| GET | `/documents/:id/download` | `documents.read` + the record | The file itself (what `fileUrl` points to) |
| DELETE | `/documents/:id` | own upload: `documents.create`; any: `documents.delete` | Delete the record and the file |
| GET | `/documents/config` | `documents.read` or `documents.create` | The upload rules: `{ field, maxFileBytes, maxFiles, allowedTypes, entityTypes }` |

### Examples

```bash
# Attach two files to a quotation
curl -X POST http://localhost:5000/api/v1/documents -H "Authorization: Bearer <accessToken>" \
  -F entityType=quotation -F entityId=<quotationId> -F files=@purchase-order.pdf -F files=@site-photo.png

# The documents of that quotation, then download one
curl "http://localhost:5000/api/v1/documents?entityType=quotation&entityId=<quotationId>" -H "Authorization: Bearer <accessToken>"
curl -OJ http://localhost:5000/api/v1/documents/<id>/download -H "Authorization: Bearer <accessToken>"
```

```json
{
  "success": true,
  "message": "Document(s) uploaded successfully",
  "data": {
    "documents": [
      {
        "id": "<id>",
        "fileName": "purchase-order.pdf",
        "fileUrl": "/api/v1/documents/<id>/download",
        "fileType": "application/pdf",
        "fileSize": 48213,
        "entityType": "quotation",
        "entityId": "<quotationId>",
        "entity": { "type": "quotation", "id": "<quotationId>", "label": "QUO-000007" },
        "uploadedBy": "<userId>",
        "uploadedByUser": { "id": "<userId>", "fullName": "<name>" },
        "createdAt": "<date>"
      }
    ]
  }
}
```

### Reusable components

Both are in `client/src/components/documents/`.

**`FileUploader`** - picks files (button or drag and drop), shows what was picked, and uploads.
It knows nothing about documents, so it can be used for any upload:

```jsx
<FileUploader
  rules={{ maxFileBytes, maxFiles, allowedTypes }}   // optional; shown, and pre-checked before sending
  onUpload={(files, { onProgress }) => promise}      // cleared when it resolves; its error shown when it rejects
/>
```

**`DocumentList`** - the documents of one record, with upload (a `FileUploader` fed with the
API's rules), download and delete, each shown by permission:

```jsx
<DocumentList entityType="quotation" entityId={quotation.id} />
<DocumentList />   {/* everything the user may see, with a "Belongs to" column and no uploader */}
```

### Screens

A **Documents** tab (a card, on the contact and ticket pages) on all ten record pages - company,
contact, lead, opportunity, quotation, order, project, ticket, contract, payment - plus the
customer page, which shows its company's documents. `/documents` (`documents.read`) lists every
document the user may see, searchable by file name.

## Notifications

Each user has their own notifications: things assigned to them or needing their attention. They
are produced by business events, stored, shown under the bell in the top bar, and pushed to open
browsers in real time over Socket.IO.

### Database model

**Notification** (`server/src/models/Notification.js`)

| Field        | Type / rule                 | Notes                                                |
| ------------ | --------------------------- | ---------------------------------------------------- |
| `userId`     | ObjectId -> `User`, required | Who it is for. One notification, one user          |
| `type`       | string                      | The event (table below)                              |
| `title`      | string, max 200             |                                                      |
| `message`    | string, max 1000            |                                                      |
| `entityType` | string                      | The kind of record to open (`lead`, `ticket`, `payment`, ...) |
| `entityId`   | ObjectId                    | That record's id                                     |
| `isRead`     | boolean, default false      | `readAt` is recorded with it                         |
| `createdAt`  | date                        |                                                      |

### Events and who is told

**No recipient is written in code.** Each one is read from the record the event is about:

| Type | When | Who is told (from the record) |
| ---- | ---- | ----------------------------- |
| `lead_assigned` | A lead is assigned (`PATCH /leads/:id/assign`, or created already assigned) | The lead's `assignedTo` |
| `ticket_assigned` | A ticket is assigned (`PATCH /tickets/:id/assign`, or opened already assigned) | The ticket's `assignedTo` |
| `quotation_status_changed` | A quotation's status changes (including draft -> sent on sending) | The quotation's `createdBy`, and the `assignedTo` of its opportunity |
| `follow_up_due` | A pending follow-up reaches its reminder date - or, without one, its due date | The follow-up's `assignedTo` |
| `payment_overdue` | A payment not paid in full passes its due date | The payment's `createdBy`, the customer's `accountManagerId`, the order's `assignedTo` |
| `contract_expiring` | A contract expiry reminder goes out (see [Contracts (AMC)](#contracts-amc)) | The contract's `assignedTo`, else its `createdBy` |

Rules that apply to all of them (`notifyUsers` in `server/src/services/notification.service.js`):

- **Whoever caused the event is not notified** about it - taking a lead yourself tells nobody.
- A person named twice (creator and account manager, say) is told once. Users who are not
  active are skipped.
- A notification never blocks the action it describes: if creating it fails, the failure is
  logged and the request carries on.

**Events found by the clock.** A follow-up coming due and a payment becoming overdue are not caused
by a request. The server looks for them when it starts and then every
`NOTIFICATION_CHECK_INTERVAL_MINUTES` (default 15; 0 = off). Each is notified **once per due date**:
running the check again, or on several servers, sends nothing twice; moving the due date is a new
event; and a notification the user deleted does not come back.

To add an event, call `notifyUsers({ recipients, exclude: actor, type, title, message, entityType, entityId })`
in the service where it happens, with recipients taken from the record, and add the type to
`NOTIFICATION_TYPE`.

### Real time (Socket.IO)

Socket.IO runs on the same server and port as the API (path `/socket.io`).

```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:5000', { auth: { token: accessToken } });
socket.on('notification:new', ({ notification, unreadCount }) => { /* ... */ });
```

- The connection is **authenticated with the access token**, checked exactly as for an API
  request (signature, expiry, not revoked, user active). Without a good token it is refused.
- Each connection joins one room - its user's - and the server only emits to that room. A client
  cannot subscribe to anyone else's notifications.
- Open connections are re-checked every few minutes: after sign-out, a password or role change,
  or deactivation, the connection is dropped.
- Browser origins must be listed in `CORS_ORIGIN`, as for the API.
- **Real time is a convenience, not a dependency.** The web app also re-fetches the unread count
  every minute, so the bell is right even where WebSockets are blocked.

### APIs

All four need only a token (no permission), and act on the caller's own notifications. Another
user's notification answers **404**.

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/notifications` | List, newest first. `page`, `limit`, `isRead` (`false` = unread only), `type`. Returns `notifications`, `unreadCount`, `pagination` |
| PATCH | `/notifications/:id/read` | Mark one as read. Returns it and the new `unreadCount` |
| PATCH | `/notifications/read-all` | Mark all as read. Returns `{ updated, unreadCount: 0 }` |
| DELETE | `/notifications/:id` | Delete one |

```json
{
  "success": true,
  "message": "Notifications retrieved",
  "data": {
    "notifications": [
      {
        "id": "<id>",
        "userId": "<userId>",
        "type": "lead_assigned",
        "title": "Lead assigned to you",
        "message": "LEAD-000007 - Office fit-out was assigned to you by Ada Admin",
        "entityType": "lead",
        "entityId": "<leadId>",
        "isRead": false,
        "createdAt": "<date>"
      }
    ],
    "unreadCount": 1,
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

### Screens

- **The bell** in the top bar, for every signed-in user: the unread count from the API, and the
  latest notifications in a popover. Clicking one marks it read and opens its record; there is
  Mark all as read, a delete cross on each, and View all. A notification arriving in real time
  updates the count and shows a short message at the bottom of the screen.
- **`/notifications`**: all of them, with an All / Unread switch and paging.

## Dashboard

The first screen after signing in, for users with `dashboard.read`. Every tile and chart shows
what one of five endpoints returns for the chosen period; nothing is calculated in the browser and
no value is written in the code.

### Endpoints

All take the same filters and answer with the period and scope they cover.

| Endpoint | Also needs | What it returns |
| -------- | ---------- | --------------- |
| `GET /dashboard/summary` | - | The eleven headline metrics |
| `GET /dashboard/sales` | `orders.read` | Monthly sales, salesperson performance, product performance |
| `GET /dashboard/leads` | `leads.read` | Leads by source, leads by status, totals |
| `GET /dashboard/opportunities` | `opportunities.read` | The open pipeline by stage; won and lost in the period (`?pipelineId=`) |
| `GET /dashboard/activities` | `activities.read` | Activities by type and by person; follow-ups |

### Period

`?period=` - calendar periods are the **current** one, in UTC:

| Value | Covers |
| ----- | ------ |
| `today` | Today |
| `week` | Monday to Sunday of this week |
| `month` (default) | This calendar month |
| `quarter` | This calendar quarter |
| `year` | This calendar year |
| `custom` | `&from=YYYY-MM-DD&to=YYYY-MM-DD`, both days included; at most 3660 days. Without both dates: 422 |

### RBAC and organization scope

**RBAC.** `dashboard.read` opens the dashboard. Each section also needs the permission to read the
module it reports on (table above), and in `/summary` a metric whose module the user cannot read
comes back as `{ "available": false }` - never as a zero. The screen leaves those tiles and
sections out and does not request them.

**Scope** decides whose records are counted, and is returned in every response:

| `scope.type` | Who | What is counted |
| ------------ | --- | --------------- |
| `all` | Users with `dashboard.viewAll` | Everything. They may pass `?organizationId=` to look at one organization (`scope.organizations` lists them) |
| `organization` | Users with an organization on their user record | Only that organization. Asking for another one is refused (403) |
| `own` | Users with neither | Only records assigned to them |

A user's organization is set on the user form (`organizationId` on `POST / PUT /users`). A record
belongs to an organization directly (leads, opportunities), through its company (orders,
customers, tickets, payments, activities), or - for follow-ups, which have no company - through
the person it is assigned to. In `own` scope "assigned to them" means the lead's, opportunity's,
order's, ticket's, activity's or follow-up's assignee, the customer's account manager, and the
payment's creator.

### Metrics (`/dashboard/summary`)

| Metric | Definition | Period applies |
| ------ | ---------- | -------------- |
| `totalLeads` | All leads | No - all time |
| `newLeads` | Leads created in the period | Yes |
| `qualifiedLeads` | Of the leads created in the period, those now in a status marked **"counts as qualified"** | Yes |
| `openOpportunities` | Opportunities in an open stage | No - now |
| `pipelineValue` | Sum of their estimated value | No - now |
| `wonValue` / `lostValue` | Estimated value (and `count`) of deals won / lost in the period, by closing date | Yes |
| `customers` | Customers, with `new` (customer since a date in the period) | `new` only |
| `pendingFollowUps` | Pending follow-ups, with `overdue` | No - now |
| `openTickets` | Tickets in an open, in-progress or waiting status, with `unassigned` | No - now |
| `pendingPayments` | Payments not paid in full: count, `amount` outstanding, `overdue`, `overdueAmount` | No - now |

**"Qualified" is data.** Lead statuses have a *Counts as a qualified lead* switch in Settings (the
`isQualified` field on `/lead-statuses`). The seed marks Qualified, Proposal Sent, Negotiation and
Won; databases seeded earlier get the same marks once, at the next start. No status name is
referred to in code.

```json
{
  "period": { "key": "month", "from": "2026-10-01", "to": "2026-10-31" },
  "scope": { "type": "all", "organization": null, "organizations": [{ "id": "<id>", "name": "Head Office" }] },
  "generatedAt": "<date>",
  "metrics": {
    "totalLeads": { "available": true, "value": 137 },
    "newLeads": { "available": true, "value": 21 },
    "qualifiedLeads": { "available": true, "value": 9 },
    "openOpportunities": { "available": true, "value": 17 },
    "pipelineValue": { "available": true, "value": 845000 },
    "wonValue": { "available": true, "value": 240000, "count": 3 },
    "lostValue": { "available": true, "value": 60000, "count": 1 },
    "customers": { "available": true, "value": 44, "new": 2 },
    "pendingFollowUps": { "available": true, "value": 13, "overdue": 5 },
    "openTickets": { "available": true, "value": 8, "unassigned": 4 },
    "pendingPayments": { "available": false }
  }
}
```

### Charts

| Chart | Endpoint | What is plotted |
| ----- | -------- | --------------- |
| Leads by source | `/leads` -> `bySource` | Leads created in the period per source ("No source" included) |
| Leads by status | `/leads` -> `byStatus` | The same leads by their current status, in the configured order |
| Opportunity pipeline | `/opportunities` -> `stages` | Value of the open deals in each open stage, in board order (count and probability-weighted value in the table) |
| Monthly sales | `/sales` -> `monthlySales` | Order value per month for the 12 months ending with the period's last month (the whole range if a custom one is longer; 36 at most). Cancelled orders excluded |
| Salesperson performance | `/sales` -> `salespeople` | Order value in the period by the order's assignee, top 10 (order count, deals won and won value in the table) |
| Product performance | `/sales` -> `products` | Revenue before tax in the period by product, top 10 (quantity and order count in the table) |

Two more come with the activities endpoint: activities by type and by person.

### Screen

`/` for users with `dashboard.read` (others keep the welcome page).

- **Filters in one row**: Today, This week, This month, This quarter, This year, Custom (two date
  fields); an Organization selector for users who see all organizations; a Pipeline selector when
  there is more than one. Every tile and chart is fetched for the same filters.
- **Tiles** for the available metrics, each linking to its module.
- **Charts** drawn with MUI X Charts (`@mui/x-charts`): single-series bar charts with the value at
  the tip and a tooltip on hover. Each card has a **table view** of the same rows, so nothing is
  reachable only by hovering.
- **It keeps itself current**: everything is fetched again every minute and when the window is
  focused again; the header shows when the figures were produced, with a Refresh button. While
  new figures load, the previous ones stay on screen, dimmed.

## Reporting

Eleven reports, each computed by the database and returned a page at a time. The browser never
receives a collection to work on: filtering, searching, sorting, paging and totals all happen in
one aggregation pipeline per request.

### Reports

| Report (`key`) | Rows | Date range applies to | Its filters | Totals |
| -------------- | ---- | --------------------- | ----------- | ------ |
| Leads (`leads`) | One per lead | created (default), expected close, converted | status, source, priority, assigned to, company | estimated value |
| Sales (`sales`) | Order value **added up** by `groupBy`: month (default), salesperson or company. Cancelled orders left out | order date | group by, salesperson, company | orders, subtotal, tax, sales |
| Opportunities (`opportunities`) | One per opportunity, with weighted value | created, closed, expected close | state, pipeline, stage, assigned to, company | estimated and weighted value |
| Customers (`customers`) | One per customer, with orders and order value | customer since | status, account manager, company | orders, order value |
| Products (`products`) | One per product **sold**: quantity, revenue, tax, average price - from order lines. Cancelled orders left out | order date | category, salesperson, company | quantity, revenue, tax |
| Quotations (`quotations`) | One per quotation | quotation date, valid until, created | status, prepared by, company | subtotal, tax, grand total |
| Orders (`orders`) | One per order, cancelled included | order date, delivery date, created | status, assigned to, company | subtotal, tax, grand total |
| Payments (`payments`) | One per payment, with an Overdue column | recorded, due date, payment date | state (incl. overdue), method, company | amount, paid, remaining |
| Tickets (`tickets`) | One per ticket | opened, resolved, closed | status, priority, category, assigned to, company | - |
| Contracts (`contracts`) | One per contract | end date, start date, renewal date | status, type, billing cycle, assigned to, company | amount |
| Activities (`activities`) | One per activity | logged, due, completed | type, status, assigned to, company | - |

### What every report supports

| | Parameter | Notes |
| - | --------- | ----- |
| **Date range** | `from`, `to`, `dateField` | Both days included; either end may be left open. `dateField` picks which of the report's dates the range applies to (default: the first) |
| **Search** | `search` | Every word must appear in one of the report's text columns - including joined ones such as the company name |
| **Filters** | the report's own keys | Checked against the report: a bad id or a value the report does not offer is a 422 naming the field |
| **Sorting** | `sortBy`, `sortOrder` | Any column of the report, case-insensitively; an unknown column is a 422 |
| **Pagination** | `page`, `limit` (max 100) | `totals` and `pagination.total` cover every matching row, not just the page |

### Permissions and scope

- `reports.read` opens reporting; each report **also** needs the permission to read its module
  (`leads.read` for Leads, `orders.read` for Sales, Products and Orders, ...). `GET /reports` lists only
  the reports the user can run.
- `reports.export` is needed to export.
- **Scope** is the same as the dashboard's: with `reports.viewAll` everything (optionally
  `?organizationId=`); otherwise the user's own organization; with no organization, only records
  assigned to them. The response says which (`scope`).

### APIs

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/reports` | `reports.read` | The reports this user can run: columns (`key`, `label`, `type`), date fields, filters with their options, totals, default sort; plus `exportFormats` and `exportMaxRows` |
| GET | `/reports/:key` | `reports.read` + module | One page: `report`, `applied`, `scope`, `rows`, `totals`, `pagination`, `generatedAt` |
| GET | `/reports/:key/export` | + `reports.export` | The same report as a file: `?format=csv` (default) \| `xlsx` \| `pdf`, with the same parameters (no paging) |

```bash
# Leads created this year mentioning "office", biggest first, five at a time
curl "http://localhost:5000/api/v1/reports/leads?from=2026-01-01&to=2026-12-31&search=office&sortBy=estimatedValue&sortOrder=desc&page=1&limit=5" \
  -H "Authorization: Bearer <accessToken>"

# Sales by salesperson, as an Excel file
curl -OJ "http://localhost:5000/api/v1/reports/sales/export?format=xlsx&groupBy=salesperson" -H "Authorization: Bearer <accessToken>"
```

```json
{
  "report": { "key": "sales", "title": "Sales", "columns": [{ "key": "group", "label": "Group", "type": "text" }, { "key": "grandTotal", "label": "Sales", "type": "money" }] },
  "applied": { "dateField": "orderDate", "from": null, "to": null, "search": "", "filters": { "groupBy": "company" }, "sortBy": "grandTotal", "sortOrder": "desc" },
  "scope": { "type": "all", "organization": null, "organizations": [] },
  "rows": [{ "id": "<id>", "group": "Acme Industries", "orderCount": 2, "subtotal": 2200, "tax": 396, "grandTotal": 2596, "averageOrderValue": 1298 }],
  "totals": { "orderCount": 3, "subtotal": 2800, "tax": 504, "grandTotal": 3304 },
  "pagination": { "page": 1, "limit": 20, "total": 2, "totalPages": 1 },
  "generatedAt": "<date>"
}
```

### Export

All three formats are built by the server from the same pipeline as the report, with the same
range, search, filters and sort.

| Format | What you get |
| ------ | ------------ |
| **CSV** | UTF-8 with a byte-order mark (so Excel reads accents correctly), CRLF lines, quoting where needed. Dates as `YYYY-MM-DD`, amounts with two decimals and no grouping. A text cell that a spreadsheet would run as a formula (starting with `=` `+` `-` `@`) is prefixed with `'` |
| **Excel** (`.xlsx`) | A bold, frozen header row; real numbers and dates (so they sort and sum); column widths; a bold Total row |
| **PDF** | Landscape A4: your company name (from Company profile), what the report covers, who generated it and when; a table whose header repeats on every page, with columns sized to their content; totals; page numbers. Long text is cut with an ellipsis rather than wrapped |

- **Row limit.** An export holds at most `REPORT_EXPORT_MAX_ROWS` rows (default 10000). When more
  match, the file holds the first ones in the chosen order, and says so: the `X-Report-Rows`,
  `X-Report-Total-Rows` and `X-Report-Truncated` headers on every export, a line at the top of the
  PDF, and a message in the app.
- File names: `<key>-report-<date>.<format>`.

### Adding a report

A report is one entry in `server/src/services/report.definitions.js`: where it starts, the
aggregation stages that produce its rows, its columns, date fields, filters and totals. The API,
the validation, the three exports and the screen all follow from the definition - the web app
knows no report by name and builds each one from `GET /reports`.

### Screen

`/reports` and `/reports/:key` (`reports.read`): a tab per report the user can run; a filter row (the
date field when there is a choice, From and To, Search, and the report's own filters as the API
describes them); the totals; a DataGrid with server-side sorting and paging; CSV, Excel and PDF
buttons for users with `reports.export`.

## Audit logs

Who did what, to which record, when and from where. Written automatically for every request that
changes something; read-only afterwards.

### How entries are written

One piece of middleware (`server/src/middleware/audit.js`) sits in front of **every** route, so no
module has to remember to audit and a new module is covered the day it is added.

For each request that changes something (`POST`, `PUT`, `PATCH`, `DELETE`) and succeeds:

1. Before the request runs, the record it is about is read as it is.
2. After the response has gone out, the record is read again.
3. One entry is stored: for an update, **only the fields that differ** (`oldData` / `newData`); for a
   create, the new record; for a delete, the record that was removed.

The entry is written after the response, so auditing never slows a request down, and a failure
to write one is logged as an error without failing the request it describes.

### What is tracked

| Action | When |
| ------ | ---- |
| `CREATE` | A record is created (`POST`) - including a user registering |
| `UPDATE` | A record is changed (`PUT` / `PATCH`), or something is added to it (a ticket reply, a project task, a document) |
| `DELETE` | A record is deleted |
| `LOGIN` | Someone signs in - **and every failed attempt** (`success: false`, no user) |
| `LOGOUT` | Someone signs out |
| `ASSIGN` | `PATCH .../assign` on a lead, opportunity or ticket |
| `STATUS_CHANGE` | `PATCH .../status` or `.../stage` |
| `PASSWORD_CHANGE` | A user changes their password, or an administrator resets someone's - failed attempts included |
| `PERMISSION_CHANGE` | A role's permissions are changed, or a user is given a different role |

Not recorded: reading (`GET`), requests that were refused (validation errors, missing permission) other
than sign-in and password attempts, token renewal, price previews, and a user marking their own
notifications as read.

### Model

**AuditLog** (`server/src/models/AuditLog.js`)

| Field            | Notes                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| `userId`         | Who did it. Empty for a failed sign-in                                   |
| `organizationId` | The organization that user belonged to at the time                       |
| `action`         | One of the nine above                                                    |
| `entityType`     | The kind of record: `company`, `lead`, `quotation`, `user`, `role`, `leadStatus`, ...      |
| `entityId`       | Which one                                                                |
| `oldData`        | Before: the changed fields (update) or the whole record (delete)         |
| `newData`        | After: the changed fields (update) or the new record (create)            |
| `ipAddress`      | From the request (honours `TRUST_PROXY` behind a reverse proxy)          |
| `userAgent`      | The browser or client, at most 500 characters                            |
| `timestamp`      | When                                                                     |
| `method`, `path`, `statusCode`, `success` | The request that did it and how it ended; `success: false` is a refused attempt |

### Secrets are never stored

- **Password changes and resets keep no data at all** - only who, whom and when.
- **Sign-ins keep only the email** that was used, never the password.
- Records are read with their secret fields excluded (a user's password hash and refresh-token
  hash are never loaded), and every stored object is passed through a filter that replaces any
  field whose name suggests a secret (`password`, `token`, `secret`, `hash`, `authorization`, `apiKey`, ...)
  with `[REDACTED]`, at any depth.
- The `Authorization` header and request bodies of sign-in and password requests are never stored.
- Long values are cut, and an entry larger than 32 KB keeps the list of fields instead of their
  content.

### Entries cannot be changed

There is no API to create, edit or delete an entry, and the model itself refuses every update
and delete (`updateOne`, `deleteMany`, saving a loaded entry, ...) - so application code cannot do it
by accident either. Someone with direct access to the database still can; restrict that access.

### APIs

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/audit-logs` | `audit.read` | The log, newest first. The list leaves out `oldData` / `newData` |
| GET | `/audit-logs/:id` | `audit.read` | One entry in full |
| GET | `/audit-logs/filters` | `audit.read` | The actions, and the kinds of record present in what you can see |

Filters on `GET /audit-logs`:

| Filter | Parameter |
| ------ | --------- |
| **User** | `userId` |
| **Action** | `action` (one of the nine) |
| **Entity** | `entityType`, and `entityId` for the history of one record |
| **Date range** | `from`, `to` (both days included) |
| Also | `success` (`false` = refused attempts), `search` (an IP address or part of a path), `page`, `limit`, `sortOrder` |

**Only authorized users.** `audit.read` is needed to read anything. With `audit.viewAll` every entry
is visible; without it, a reader sees the entries of their own organization, or - with no
organization - only their own actions. An entry outside that answers 404.

```json
{
  "id": "<id>",
  "userId": "<userId>",
  "user": { "id": "<userId>", "fullName": "Ada Admin", "email": "ada@example.com" },
  "action": "UPDATE",
  "entityType": "company",
  "entityId": "<companyId>",
  "oldData": { "city": "Pune" },
  "newData": { "city": "Mumbai" },
  "ipAddress": "203.0.113.7",
  "userAgent": "Mozilla/5.0 ...",
  "method": "PUT",
  "path": "/api/v1/companies/<companyId>",
  "statusCode": 200,
  "success": true,
  "timestamp": "<date>"
}
```

### Screen

`/audit-logs` (`audit.read`): filters for user, action, kind of record, date range, result and a search
by IP address or path; a DataGrid, newest first, with refused attempts highlighted; **View** opens
one entry with a Field / Before / After table and a link to the record.

> **Environment variables that are now defaults.** The number prefixes (`*_PREFIX`),
> `PAYMENT_ALLOW_OVERPAYMENT`, `UPLOAD_MAX_FILE_MB`, `UPLOAD_MAX_FILES`, `UPLOAD_ALLOWED_TYPES`,
> `MAIL_FROM` and `ALLOW_PUBLIC_REGISTRATION` still work, as the starting value of the matching
> setting. Once a setting is saved in the app, the app's value wins.

## Application settings

What an administrator can change without touching the server: stored in MongoDB, edited on
**Application settings**, and applied to the very next request - no restart.

### How it works

- One document (`AppSettings`) holds the values that were changed; the company's own details
  stay in the company profile. `GET /settings` serves both as one object of eight groups.
- **Every setting has a default: what the server environment (`.env`) says.** A fresh
  installation therefore behaves exactly as its `.env` describes; saving a setting overrides
  it; clearing it (`""` or `null`) goes back to the default.
- The values are read on almost every request, so each server keeps them in memory for 15
  seconds. Saving refreshes that copy at once on the server that saved; another server follows
  within 15 seconds.
- **No secret is a setting.** The mail server address and password, storage keys, token secrets
  and the database address stay in the environment. They are never stored in the settings and
  never returned by the API.
- Every change is recorded in the [audit log](#audit-logs).

### The settings

| Group | Setting | What it does | Default |
| ----- | ------- | ------------ | ------- |
| **company** | `name`, `legalName`, `address`, `city`, `state`, `country`, `postalCode`, `phone`, `email`, `website`, `gstNumber`, `panNumber`, `bankDetails` | Printed on quotations and report PDFs | empty |
| | `logo` | An https address of an image; shown in the app header | none |
| | `currency` | 3-letter code shown next to amounts on documents and key screens | none |
| **crm** | `timezone` | IANA name (`Asia/Kolkata`); the zone times are **shown** in | each person's own |
| | `dateFormat` | `locale`, `DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`, `DD MMM YYYY` | `locale` (each person's browser) |
| | `companyPrefix`, `leadPrefix`, `opportunityPrefix`, `customerPrefix`, `projectPrefix`, `ticketPrefix`, `contractPrefix` | Prefix of the next generated number | the `*_PREFIX` variables |
| **sales** | `orderPrefix`, `invoicePrefix` | Prefix of the next order / invoice number | `ORDER_NUMBER_PREFIX`, `INVOICE_NUMBER_PREFIX` |
| | `defaultTaxId` | The tax a new product gets when none is chosen | none |
| | `allowOverpayment` | Pay more than is outstanding; invoice an order beyond its total | `PAYMENT_ALLOW_OVERPAYMENT` |
| **quotation** | `quotationPrefix` | Prefix of the next quotation number | `QUOTATION_NUMBER_PREFIX` |
| | `validityDays`, `terms` | Defaults of a new quotation | 30, empty |
| | `emailSubject`, `emailMessage` | Wording of the email a quotation is sent with. Placeholders: `{{quotationNumber}}`, `{{companyName}}`, `{{contactName}}`, `{{greeting}}` | a standard text |
| **notifications** | `disabledTypes` | Notification types that are switched off for everyone | none |
| | `contractReminderEmails` | Whether contract expiry reminders are also emailed (the follow-up and the notification are created either way) | on |
| **email** | `fromName`, `fromAddress`, `replyTo` | Who outgoing email is from | `MAIL_FROM`, else the company's email |
| **documents** | `maxFileMb`, `maxFiles`, `allowedTypes` | What may be uploaded (documents and ticket attachments); applies to the next upload | the `UPLOAD_*` variables |
| **security** | `allowPublicRegistration` | Whether anyone may call `POST /auth/register` | `ALLOW_PUBLIC_REGISTRATION` |
| | `passwordMinLength` | 8-64; checked wherever a password is set from then on | 8 |

A number prefix applies to the **next** record: existing numbers are never rewritten, and the
running number carries on (`LEAD-000007` is followed by `ENQ-000008`). When contract reminders go
out is not here but in Settings -> Contract reminder periods, because it is a list.

### APIs

| Method | Path | Auth | Description |
| ------ | ---- | ---- | ----------- |
| GET | `/settings` | any signed-in user | With `settings.manage`: all eight groups, and `meta` (the choices the screen offers, whether a mail server is configured, which storage is in use). Otherwise only what screens need to display things: `company.name`, `company.logo`, `company.currency`, `crm.timezone`, `crm.dateFormat`, `documents` |
| PUT | `/settings` | `settings.manage` | Any of the groups, each with any of its fields. Only what is sent changes; `""` or `null` restores the default. Returns the settings as now in force |
| GET / PUT | `/settings/company` | as before | The company profile on its own (the quotation builder reads its defaults here) |

**Only authorized users can modify settings**: `PUT` needs `settings.manage`. Values are
validated (a prefix is 1-10 letters or digits, a time zone must be one the server knows, a logo
must be an http(s) address, file types must look like MIME types, ...); an error names the group
and field, e.g. `crm.timezone`. Fields that are not settings are ignored, never stored.

```bash
curl -X PUT http://localhost:5000/api/v1/settings -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d '{"company":{"name":"Example Trading Co.","currency":"INR"},"crm":{"timezone":"Asia/Kolkata","dateFormat":"DD/MM/YYYY","leadPrefix":"ENQ"}}'
```

```json
{
  "settings": {
    "company": { "name": "Example Trading Co.", "currency": "INR", "logo": "" },
    "crm": { "timezone": "Asia/Kolkata", "dateFormat": "DD/MM/YYYY", "leadPrefix": "ENQ", "ticketPrefix": "TKT" },
    "sales": { "orderPrefix": "ORD", "invoicePrefix": "INV", "defaultTaxId": null, "allowOverpayment": false },
    "quotation": { "quotationPrefix": "QUO", "validityDays": 30, "terms": "", "emailSubject": "...", "emailMessage": "..." },
    "notifications": { "disabledTypes": [], "contractReminderEmails": true },
    "email": { "fromName": "", "fromAddress": "", "replyTo": "" },
    "documents": { "maxFileMb": 10, "maxFiles": 5, "allowedTypes": ["image/*", "application/pdf"] },
    "security": { "allowPublicRegistration": true, "passwordMinLength": 8 },
    "updatedAt": "<date>"
  },
  "editable": true,
  "meta": { "dateFormats": ["locale", "DD/MM/YYYY"], "notificationTypes": ["lead_assigned"], "emailConfigured": false, "storageDriver": "local" }
}
```

### In the web app

Nothing about these values is written in React:

- The layout fetches `GET /settings` once per session and waits for it before showing a page.
  The **date format, time zone and currency** are applied to the shared formatters
  (`client/src/utils/format.js`), so every date on every screen follows them; the header shows the
  company's **name and logo**.
- Upload forms take their limits from the API.
- **Application settings** (`/settings/application`, permission `settings.manage`) has a tab per
  group. Each tab shows the values the API returned, is saved on its own, and sends only the
  fields that were changed. The time-zone list is the browser's own; taxes and notification types
  come from the API. The Email tab says when no mail server is configured.

## Global search

One box in the top bar finds companies, contacts, leads, opportunities, quotations, orders,
projects, tickets and contracts.

```text
GET /api/v1/search?q=<text>&limit=<per category>
```

| Parameter | Rules | Meaning |
| --------- | ----- | ------- |
| `q` | required, 2-100 characters | Words, or a record number |
| `limit` | 1-20, default 5 | Results **per category** |

```json
{
  "success": true,
  "message": "Search results retrieved",
  "data": {
    "companies": [{ "id": "...", "type": "company", "title": "Acme Industries", "subtitle": "CMP-000001 · Pune" }],
    "contacts": [{ "id": "...", "type": "contact", "title": "Asha Rao", "subtitle": "Purchase Head · Acme Industries · asha.rao@acme.example" }],
    "leads": [],
    "opportunities": [],
    "quotations": [{ "id": "...", "type": "quotation", "title": "QT-000003", "subtitle": "Acme Industries · Sent" }],
    "orders": [],
    "projects": [],
    "tickets": [],
    "contracts": []
  }
}
```

All nine lists are always present. Every result has the same four fields, and its page is
`/<category>/<id>`. Within a category the most recently changed records come first.

### What matches

Every word typed must be the **beginning of a word** of the record, in any order and any case;
accents are ignored.

| Typed | Finds |
| ----- | ----- |
| `acme pu` | Acme Industries in Pune |
| `rack` | "Warehouse racking" (lead), "Racking installation" (project), ... |
| `LD-000012`, `ld 12`, `12` | Lead LD-000012 |
| `9876543210`, `98765 43210`, `+91-98765-43210` | The company or contact with that phone number |
| `asha`, `rao`, `acme.example` | The contact asha.rao@acme.example |
| `cking` | Nothing - the middle of a word is not searched |

| Category | Searched fields |
| -------- | --------------- |
| Companies | code, name, legal name, email, phone, GST number, PAN, city |
| Contacts | first and last name, email, phones, designation |
| Leads | number, title, tags |
| Opportunities | number, name |
| Projects | number, name |
| Tickets | number, subject |
| Quotations, orders, contracts | number - and they are also found by their **company's name** |

Long text (descriptions, notes) is not searched here; the search box of each list screen still
searches it.

### Strategy: an index, not a scan

- Each of the nine models has a `searchKeys` field: the lower-cased words of its searchable
  fields (`server/src/utils/searchKeys.js`), written by a save hook
  (`server/src/models/shared/searchable.js`) and covered by an index.
- A search is, per category, one query: "a key begins with each word", limited to `limit`
  records. A begins-with match is answered from the index, so the database never reads the whole
  collection, and the API never loads records to filter them itself. A test checks the query
  plan for this.
- The categories are queried in parallel; only the few fields a result shows are read.
- `searchKeys` is internal: it is never returned by any endpoint.
- Records that existed before this module get their keys when the server starts (logged as
  "Global search: N existing record(s) indexed"). The same step picks up records written
  straight to the database.

### Permissions and scope

Any signed-in user may call the endpoint; there is no permission for searching itself.

- **RBAC**: a category is searched only if the user's role may read that module
  (`companies.read`, `contacts.read`, `leads.read`, ...). Otherwise its list is empty.
- **Organization**: the same three scopes as the dashboard.

| Who | Finds |
| --- | ----- |
| Users with `search.viewAll` (administrators have it) | Everything |
| Users with an organization on their user record | That organization's records: its companies, and whatever belongs to them; leads and opportunities marked with the organization |
| Users with neither | Their own: records assigned to them, companies they are responsible for and those companies' contacts, projects they manage or are on the team of, quotations they created |

### In the web app

The box is in the top bar on every page (`client/src/components/search/GlobalSearch.jsx`).
It asks the API once typing pauses and there are at least two characters, shows the results under
a heading per category, and opens the record when one is chosen - with the mouse, or the arrow
keys and Enter. **Ctrl+K** puts the cursor in the box. Nothing is filtered in the browser.

### Limits

- Begins-with only: `dustries` does not find "Acme Industries".
- Each category shows its most recent `limit` matches and there is no "next page": narrow the
  search, or use the list screen.
- Contacts are not found by their company's name; search the company and open its Contacts tab.
- The list screens (`GET /leads` and so on) are not narrowed by organization - only global
  search, the dashboard, reports and the audit log are.

## Design system, preferences and languages

The web app has one design system, and each user can make it their own. The details are in
[docs/UI_UX.md](UI_UX.md), [docs/THEMING.md](THEMING.md) and [docs/I18N.md](I18N.md).

| | |
| --- | --- |
| **Theme** | `client/src/theme/`: colours, typography, spacing, shadows and component overrides in one place. Eight colour themes (Professional Blue, Enterprise Indigo, Emerald, Ocean, Purple, Slate, Warm, High Contrast); adding one is an entry in `colors.js` |
| **Mode** | Light, Dark or System, from the palette button in the top bar |
| **Text size** | Small, Medium, Large, Extra large - changes the typography tokens, not the browser zoom |
| **Languages** | English, ଓଡ଼ିଆ, हिन्दी (`client/src/i18n/`); dates and numbers follow the language |
| **Shell** | Grouped sidebar built from permissions - expanded and resizable, collapsed to icons, or a drawer on small screens; top bar with search, Create, notifications, help, language, theme and account |
| **Search / commands** | Ctrl+K: records from the API, plus the pages a user may open and the records they may create |
| **Tables** | One shared table: column show / hide, order and width, density, full screen, CSV of what is shown, quick view, cards on a phone, filters in a drawer |
| **Dashboard** | Widgets can be moved, resized, hidden and reset; charts go full screen and download as CSV |
| **Branding** | Application settings → Branding: the default theme, the sign-in page logo and the browser tab icon |

### User preferences

Theme, mode, language, text size, sidebar width and state, table density, table columns and the
dashboard layout belong to the user. They are kept in the browser and, when signed in, in the
user's account:

```bash
curl http://localhost:5000/api/v1/auth/preferences -H "Authorization: Bearer <accessToken>"

# Merge: only the keys sent change; null puts one back to its default
curl -X PUT http://localhost:5000/api/v1/auth/preferences -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" -d '{"theme":"emerald","themeMode":"dark","language":"hi"}'
```

- Any signed-in user reads and writes **their own** preferences only; no permission is involved,
  because nothing but that user's own screen depends on them.
- The server checks the shape (`server/src/validators/preference.validator.js`) and stores them
  on the user (`preferences`, never returned with the user record). Saving them does not touch
  the user's `updatedAt` and is not written to the audit log.
- If the API cannot be reached the web app keeps working from the browser's copy.

### What changed in the API

Only additions - no existing endpoint, response or rule changed:

- `GET / PUT /auth/preferences` (above).
- `GET /settings/public` - no token; the company's name and logo and the branding, for the sign-in page.
- A `branding` group in `GET / PUT /settings`: `theme`, `loginLogo`, `favicon`.

### Known limits

- Column pinning and drag-to-reorder of column headers need the paid MUI X Pro DataGrid; columns
  are reordered from the Columns panel instead.
- Forms were not regrouped into sections or steppers, there is no draft autosave, and date fields
  are the browser's own.
- Text inside detail pages, forms and module dialogs is not translated yet; the shell, list pages,
  tables, sign-in and error pages are. The Odia and Hindi wording has not been reviewed by a
  native speaker.
- Bulk actions exist for leads only.

## Postman usage

1. In Postman choose **Import** and select both files in `postman/`:
   `CRM.postman_collection.json` and `CRM.postman_environment.json`.
2. Select the **CRM** environment (top-right).
3. Run **System -> Health Check**. Its tests assert the status code and response body.

**Authentication folder.** Fill in `userFirstName`, `userLastName`, `userEmail`, `userPassword`
(and `newPassword` before Change Password) in the environment, then run the requests in order:

| Request          | What its script does                                                     |
| ---------------- | ------------------------------------------------------------------------ |
| Register         | Saves `userId`                                                           |
| Login            | Saves `accessToken`, `refreshToken`                                      |
| Get Current User | Checks the returned user's email matches `userEmail`                     |
| Refresh Token    | Sends `{{refreshToken}}`, saves the new `accessToken` and `refreshToken` |
| Change Password  | Saves the new tokens, moves `newPassword` into `userPassword`            |
| Logout           | Clears `accessToken` and `refreshToken`                                  |

The collection applies `Bearer {{accessToken}}` to every request by default, so after Login all
protected requests are authorized automatically; public requests opt out.

**Users folder.** Log in as an administrator first: set `userEmail` / `userPassword` to the account
made with `create:admin` and run Login. Set `managedUserPassword` (the password given to the user
you create), then run the requests in order:

| Request         | Notes                                                                        |
| --------------- | ---------------------------------------------------------------------------- |
| List Users      | Search and filter parameters are included, disabled; tick them to use them   |
| Create User     | Name and email are generated by Postman; **saves the new id to `userId`**    |
| Get User        | Uses `{{userId}}`                                                            |
| Update User     | Uses `{{userId}}`                                                            |
| Change Status   | Sends `inactive`; edit the body to `active` to re-enable                     |
| Reset Password  | Sets `{{managedUserPassword}}`                                               |
| Delete User     | Clears `userId`                                                              |

**Roles & Permissions folder.** Log in as a user whose role grants `roles.*` (the `create:admin`
account), then run in order:

| Request            | Notes                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| List Roles         | Search and status parameters are included, disabled                       |
| Create Role        | Name is generated per send; **saves the new id to `roleId`**              |
| Get Role           | Uses `{{roleId}}`                                                         |
| Update Role        | Uses `{{roleId}}`                                                         |
| Assign Permissions | Sends permission keys; its test checks the role holds exactly those       |
| List Permissions   | The catalogue; `module` and `search` parameters are included, disabled    |
| Delete Role        | Clears `roleId`                                                           |

To give a user the role you created, run Create Role, then add `"roleId": "{{roleId}}"` to the
Create User or Update User body before running Delete Role.

**Companies folder.** Log in as a user whose role grants `companies.*`, then run in order:

| Request | Notes                                                                             |
| ------- | --------------------------------------------------------------------------------- |
| List    | Search, filter and sort parameters are included; the filters are disabled         |
| Create  | Values are generated per send; **saves the new id to `companyId`**; its test checks the server generated a code |
| Get     | Uses `{{companyId}}`                                                              |
| Update  | Uses `{{companyId}}`                                                              |
| Delete  | Clears `companyId`                                                                |

To set an industry, type or organization, run the matching Create request in Reference Data first
and add e.g. `"industryId": "{{industryId}}"` to the Create body.

**Contacts folder.** A contact needs a company, so run Companies -> Create first (it fills
`companyId`). Then run in order:

| Request | Notes                                                                             |
| ------- | --------------------------------------------------------------------------------- |
| List    | `companyId`, `status` and `search` parameters are included, disabled              |
| Create  | Sends `{{companyId}}`; values are generated per send; **saves the new id to `contactId`** |
| Get     | Uses `{{contactId}}`; its test checks the company is returned                     |
| Update  | Uses `{{contactId}}`                                                              |
| Delete  | Clears `contactId`                                                                |

Run Contacts -> Delete before Companies -> Delete: a company with contacts cannot be deleted.

**Lead Configuration folder.** Log in as a user whose role grants `leadConfig.manage`. It has one
sub-folder each for Lead Sources, Lead Statuses and Lead Priorities, and each contains the same
four requests:

| Request | Notes                                                                                   |
| ------- | --------------------------------------------------------------------------------------- |
| List    | Shows the seeded and added values. `isActive` and `search` parameters are included, disabled |
| Create  | Name is generated per send; **saves the new id** to `leadSourceId`, `leadStatusId` or `leadPriorityId` |
| Update  | Uses the saved id                                                                       |
| Delete  | Uses the saved id, then clears it                                                       |

Run `npm run seed` in `server/` (or start the server once) to have the initial values to list.

**Leads folder.** Log in as a user whose role grants `leads.*`, then run the requests in order.
Create Lead **saves the new id to `leadId`**, which every other request uses.

| Request                     | Notes                                                                    |
| --------------------------- | ------------------------------------------------------------------------ |
| List Leads                  | All filters are included, disabled                                       |
| Create Lead                 | Saves `leadId`; checks the server generated the number and applied the default status |
| Get Lead, Update Lead       | Use `{{leadId}}`                                                         |
| Assign Lead                 | Assigns to `{{currentUserId}}`, which Login and Get Current User save    |
| Change Status               | A pre-request script picks a non-default open status into `nextLeadStatusId` |
| Get Timeline                | Shows everything the requests above did                                  |
| Preview Conversion (dry run) | Reports what Convert would do; changes nothing                          |
| Convert Lead                | Saves `opportunityId`, `companyId` and `contactId` from the result       |
| Delete Lead                 | Clears `leadId`                                                          |

**Activities folder.** Needs a company: run Companies -> Create first (it fills `companyId`).

| Request                                       | Notes                                                    |
| --------------------------------------------- | -------------------------------------------------------- |
| List Activity Types                           | Saves the first active type's id to `activityTypeId`     |
| Create Activity Type                          | Adds a type (name generated per send)                    |
| List Activities                               | Filters for each related record are included, disabled   |
| Create Activity                               | Saves `activityId`; checks the company and type are expanded |
| Create Activity - unknown company (expect 400) | Relationship check: the error names `companyId`         |
| Create Activity - no related record (expect 422) | Relationship check: at least one record is required   |
| Update Activity                               | Completes it; checks the completion time is recorded     |
| Delete Activity                               | Clears `activityId`                                      |

**Follow-ups folder.** Also needs `companyId`.

| Request                                          | Notes                                                 |
| ------------------------------------------------ | ----------------------------------------------------- |
| List Follow-ups                                  | Filters are included, disabled                        |
| Create Follow-up                                 | Saves `followUpId`; checks `related` describes the company |
| Create Follow-up - wrong related type (expect 400) | Relationship check: a company's id stated as a lead |
| Update Follow-up                                 | Uses `{{followUpId}}`                                 |
| Reschedule Follow-up                             | Checks the new due date                               |
| Complete Follow-up                               | Checks it is marked completed                         |

**Pipelines, Pipeline Stages and Opportunities folders.** Log in as a user whose role grants
`pipelines.manage` and `opportunities.*`, and have a company (`companyId`). Run the three folders
in this order, each top to bottom:

| Request                                         | Notes                                                    |
| ----------------------------------------------- | -------------------------------------------------------- |
| Pipelines -> Create Pipeline                    | **Saves `pipelineId`**                                   |
| Pipelines -> Get / Update Pipeline              | Use `{{pipelineId}}`                                     |
| Pipelines -> Create Spare Pipeline, Delete Pipeline | Delete removes the spare one (`sparePipelineId`), so `pipelineId` stays usable |
| Pipeline Stages -> Create Stage                 | **Saves `stageId`**                                      |
| Pipeline Stages -> Create Second Stage          | Saves `nextStageId` - somewhere for the opportunity to move to |
| Pipeline Stages -> Update Stage, Reorder Stages | Reorder swaps the two stages and checks the order returned |
| Pipeline Stages -> Create Spare Stage, Delete Stage | Delete removes the spare one (`spareStageId`)        |
| Opportunities -> Create Opportunity             | **Saves `opportunityId`**; checks the number was generated and the stage and probability were set |
| Opportunities -> Get / Update Opportunity       | Use `{{opportunityId}}`; Update checks the stage is untouched |
| Opportunities -> Board (Kanban)                 | Checks every column has `stage`, `total`, `totalValue`, `opportunities` |
| Opportunities -> Move Opportunity (change stage) | Moves to `{{nextStageId}}`; checks the probability followed the stage |
| Opportunities -> Move Opportunity - unknown stage (expect 400) | Target validation: the error names `stageId` |
| Opportunities -> Assign Opportunity             | Assigns to `{{currentUserId}}`                           |
| Opportunities -> Opportunity Timeline           | Checks the stage change was recorded                     |
| Opportunities -> Delete Opportunity             | Clears `opportunityId`                                   |

**Preferences folder.** Any signed-in user. Get Preferences, two updates (appearance; tables and
dashboard) that show merging, an invalid value that expects 422, a reset with `null`, and a
request without a token that expects 401. The Settings folder gained **Get Public Settings** (no
token) and **Update Settings - branding**.

**Search folder.** Any signed-in user. Set `searchTerm` in the environment to something in your
data (it starts as `acme`). Search, the same with 20 results per category, a term nothing
matches (every list empty), a one-letter term that expects 422, and a request without a token
that expects 401. The tests check that all nine lists are present.

**Settings folder.** Log in as a user whose role grants `settings.manage`. Get Settings, then one
update per pair of groups, an invalid value that expects 422, and a last request that puts what
was changed back to its defaults. **These requests change real settings** - the company name
set by "Update Settings - company" stays; change it back in the app if you need to.

**Audit Logs folder.** Log in as a user whose role grants `audit.read` (an administrator also
has `audit.viewAll`). Anything you ran before - logging in is enough - is already in the log.
Audit Log Filters, then List Audit Logs (saves `auditLogId`) and one request per filter: by user,
by action, by entity, by date range. Get Audit Log shows one entry with its before and after.
The last request tries to delete an entry and expects 404.

**Reports folder.** Log in as a user whose role grants `reports.read`, `reports.export` and the
modules to report on. List Reports shows what each report accepts; then one request per report
(its filters are in the query, switched off - enable the ones you want), a worked example with
range, search, sort and paging, an "expect 422", and three exports (CSV, Excel, PDF) - use
"Send and Download" to save the file. They change nothing.

**Dashboard folder.** Log in as a user whose role grants `dashboard.read` and the modules to
report on (an administrator has all). Eight GET requests: the summary for several periods, then
sales, leads, opportunities and activities. Change `period` in the query, or enable `from` / `to`
with `period=custom`, or `organizationId`. They need no ids and change nothing.

**Notifications folder.** Needs only a token. Notifications are for the people a record names,
not for whoever caused the event, so a single user gets few: the quickest is Payments -> Create
Payment (it is already overdue) and then the next check - or a restart of the API, which runs
the check at once. List Notifications saves the first id as `notificationId`; Mark Notification
Read and Delete Notification use it and skip their checks while it is empty.

**Documents folder.** Log in as a user whose role grants `documents.*` and `companies.read`, and
have `companyId`. **Upload Document needs a file chosen by hand**: open it, go to Body ->
form-data and pick a file in the `files` row (Postman cannot keep a file in a collection). Its
test saves `documentId`; Get, Download and Delete then use it (they skip their checks while
`documentId` is empty). Use "Send and Download" on Download Document to save the file.

**Payments folder.** Log in as a user whose role grants `payments.*`, and have `companyId`. Run top
to bottom: List Payment Methods saves `paymentMethodId`; Create Payment makes an invoice of 1000
that was due 5 days ago and saves `paymentId`. The folder then receives 400, tries to overpay
(expects 422), checks the Overdue / Partially Paid / Unpaid / Paid lists around receiving the
rest, cancels, and deletes. The two "expect 422" requests assume the server default
`PAYMENT_ALLOW_OVERPAYMENT=false`.

**Contracts folder.** Log in as a user whose role grants `contracts.*` (and `followups.read` for
the follow-ups request), and have `companyId`. Run top to bottom: Create Contract sets its dates
relative to today (it ends in 30 days) and saves `contractId`; the Change Status requests pick a
"draft" and an "active" status into `contractStatusId`; Run Reminder Check then sends the reminder
that List Contract Reminders expects (with the seeded 30-day period - if you removed every period
of 30 days or more, that test fails by design). Delete Contract clears `contractId`.

**Tickets folder.** Log in as a user whose role grants `tickets.*`, and have `companyId`. Run top to
bottom: Create Ticket saves `ticketId`; the two Change Status requests pick an "in progress" and a
"closed" status into `ticketStatusId`. "Add Reply (with optional file)" is multipart: enable its
`attachments` row and choose a file to upload one - its test then saves `ticketAttachmentId` for
Download Attachment. "Add Reply - closed ticket" expects 409. Delete Ticket clears the variables.

**Projects folder.** Log in as a user whose role grants `projects.*`, and have `companyId`. Run top
to bottom: Create Project saves `projectId`, Create Milestone `milestoneId`, Create Task `taskId`;
Update Task - mark done picks a "done" status into `doneTaskStatusId` and the Project Summary test
then checks progress is 100%. "Create Task - assignee not on the team" expects 400. Delete Task,
Delete Milestone and Delete Project clear the variables.

**Customers folder.** Log in as a user whose role grants `customers.*`. Run top to bottom:

| Request                                         | Notes                                                    |
| ----------------------------------------------- | -------------------------------------------------------- |
| Setup - Create Company                          | A fresh company, saved to `customerCompanyId`            |
| List Customers                                  | Every filter is included, disabled; checks each row has `stats` |
| Create Customer                                 | **Saves `customerId`**; checks the number and the company reference |
| Create Customer - already a customer (expect 409) | One customer per company                              |
| Get Customer, Get Customer Summary (360)        | The summary test checks every section is reported and unbuilt ones have no count |
| Update Customer, Customer Timeline              | The timeline holds customer and company events           |
| Delete Customer                                 | Clears `customerId`; the company stays                   |

**Orders folder.** Log in as a user whose role grants `orders.*` and `quotations.*`, and have
`companyId` and `productId`. Run top to bottom - it makes its own accepted quotation:

| Request                                              | Notes                                                    |
| ---------------------------------------------------- | -------------------------------------------------------- |
| Setup - Create Quotation                             | Saves `orderQuotationId`                                 |
| Create Order - quotation not accepted (expect 409)   | A draft cannot become an order                           |
| Setup - Accept Quotation                             | A pre-request script picks an "accepted" status          |
| List Order Statuses, List Orders                     | Every list filter is included, disabled                  |
| Create Order From Quotation                          | **Saves `orderId`**; checks it is linked to the quotation |
| Create Order From Quotation - again (expect 409)     | Duplicate prevention                                     |
| Create Order From Quotation - unknown quotation (expect 404) | The quotation must exist                         |
| Create Order (direct)                                | Saves `directOrderId`; checks the totals add up          |
| Get / Update Order                                   | Update changes the delivery date                         |
| Change Status                                        | A pre-request script picks a "completed" status          |
| Update Order - locked (expect 409)                   | A completed order cannot be edited                       |
| Order Timeline                                       | Checks creation and the status change were recorded      |
| Delete Order, Delete Direct Order                    | Clear `orderId` and `directOrderId`                      |

**Quotations folder.** Log in as a user whose role grants `quotations.*` and `settings.manage`,
and have `companyId`, `productId` (a product with a tax shows tax on the totals) and, optionally,
`contactId` (of that company - otherwise remove it from the Create body). Run top to bottom:

| Request                                        | Notes                                                    |
| ---------------------------------------------- | -------------------------------------------------------- |
| List Quotation Statuses                        | Saves the default status to `quotationStatusId`          |
| Get / Update Company Profile                   | Update fills in the details printed on the PDF (needed before Download PDF) |
| List Quotations                                | Every filter is included, disabled                       |
| Calculate (preview totals)                     | Checks grand total = subtotal - discount + tax           |
| Create Quotation                               | **Saves `quotationId`** (and `quotationNumber`); checks the totals are the server's and add up |
| Create Quotation - totals sent are ignored     | Sends a fake grand total of 1; checks it was not used, then deletes that quotation |
| Get / Update Quotation                         | Update replaces the lines and checks the recalculated subtotal |
| Download PDF                                   | Checks `application/pdf` and the file name. Use "Save response to a file" to look at it |
| Send Quotation                                 | Without `SMTP_URL` the response says nothing was emailed |
| Change Status                                  | A pre-request script picks an "accepted" status into `nextQuotationStatusId` |
| Update Quotation - locked (expect 409)         | An accepted quotation cannot be edited                   |
| Quotation Timeline                             | Checks the send and the status change were recorded      |
| Delete Quotation                               | Clears `quotationId`                                     |

Reorder Stages expects the pipeline to have exactly the two stages created above; if you have run
Create Stage more than once, list every stage id in its body.

To relate an activity or follow-up to a lead, contact or opportunity instead, use `leadId` /
`contactId` / `opportunityId` (or `"relatedType": "lead"`, `"relatedId": "{{leadId}}"`).

**Products folder.** Log in as a user whose role grants `products.*`. Nothing is seeded, so start
with the Catalogue sub-folder.

| Request                                        | Notes                                                    |
| ---------------------------------------------- | -------------------------------------------------------- |
| Catalogue -> Categories / Units / Taxes        | List, Create, Update, Delete for each. Create saves `productCategoryId`, `unitId`, `taxId` |
| List Products                                  | Search, category, status and price-range parameters are included, disabled |
| Create Product                                 | Uses the three catalogue ids; **saves `productId`** (and `productSku`); checks the server generated the SKU |
| Create Product - duplicate SKU (expect 409)    | SKU validation: the error names `sku`                    |
| Check SKU                                      | Reports the SKU just created as unavailable              |
| Get Product, Update Product                    | Use `{{productId}}`; Update checks the SKU is unchanged  |
| Product Options                                | What product pickers use                                 |
| Delete Product                                 | Clears `productId`                                       |

Run the Catalogue Create requests first and its Delete requests last: a category, unit or tax
that a product uses cannot be deleted.

To see duplicate prevention: run Create Lead and Convert Lead, then Create Lead and Convert Lead
again. The first conversion reports the company and contact as `created`; the second reports both
as `matched`, and no second company or contact exists.

**Reference Data folder.** List Departments saves the first department's id to `departmentId`.
List / Create Industry, Company Type and Organization save an id to `industryId`,
`companyTypeId` and `organizationId`.

Environment variables: `baseUrl`, `accessToken`, `refreshToken`, `userFirstName`, `userLastName`,
`userEmail`, `userPassword`, `newPassword`, `managedUserPassword`, `userId`, `roleId`,
`departmentId`, `companyId`, `organizationId`, `companyTypeId`, `industryId`, `contactId`,
`leadSourceId`, `leadStatusId`, `leadPriorityId`, `leadId`, `activityTypeId`, `activityId`, `followUpId`,
`nextLeadStatusId`, `currentUserId`, `productId`, `productSku`, `productCategoryId`, `unitId`,
`taxId`, `pipelineId`, `sparePipelineId`, `stageId`, `nextStageId`, `spareStageId`, `opportunityId`, `quotationId`, `quotationNumber`, `quotationStatusId`, `nextQuotationStatusId`, `orderId`, `directOrderId`, `orderQuotationId`, `acceptedQuotationStatusId`, `nextOrderStatusId`, `customerCompanyId`, `projectId`, `milestoneId`, `taskId`, `doneTaskStatusId`, `ticketAttachmentId`, `ticketStatusId`, `contractStatusId`, `paymentId`, `paymentMethodId`, `paymentStatusId`, `paymentDueDate`, `documentId`, `notificationId`, `auditLogId`, `contractStartDate`, `contractEndDate`, `contractRenewalDate`, `customerId`, `projectId`, `ticketId`,
`contractId`.

Only `baseUrl` ships with a value. The ID variables are filled in as later modules add requests.

Do not commit real tokens or passwords in the Postman files. Keep them in Postman's
"current value" column, which is not exported.

## Security

- **HTTP headers:** Helmet defaults; `X-Powered-By` removed.
- **CORS:** allow-list from `CORS_ORIGIN`; other browser origins get a 403.
- **Rate limiting:** per-IP limit on everything under `/api/v1`. Set `TRUST_PROXY` correctly when
  deploying behind a proxy, or all clients will share one limit.
- **Input validation:** Joi schemas strip unknown fields before a controller runs; request bodies
  are capped at 1 MB.
- **Secrets:** read from environment variables and validated at startup; JWT secrets must be at
  least 32 characters; `.env` files are git-ignored.
- **JWT:** HS256 pinned on verification, separate secrets for access and refresh tokens, and a
  token `type` claim so one cannot be used as the other. Short-lived access tokens, single-use
  rotating refresh tokens stored only as a hash, and immediate revocation on logout and password
  change (see [JWT flow](#jwt-flow)).
- **Passwords:** hashed with bcrypt; cost set by `BCRYPT_SALT_ROUNDS`. Strength rules enforced on
  register and change-password.
- **Login protection:** failed logins are rate limited per IP; unknown email and wrong password
  return the same message and take the same time, so accounts cannot be enumerated.
- **Registration:** closed to the public in production by default.
- **Authorization:** permission checks on every protected route, resolved from the user's role in
  the database on each request (never from the token or the request body), plus rules that
  prevent privilege escalation through user management (see [Permissions](#permissions)) and
  role management (see [Roles and permissions](#roles-and-permissions-rbac)).
- **Search input** is escaped before use in a database pattern; sort fields are allow-listed.
- **Sensitive fields:** password and token hashes are excluded from queries by default and
  stripped from every serialized user.
- **Errors:** stack traces and internal messages are never returned in production.
- **Logs:** authorization headers, cookies, passwords and tokens are redacted.

Known limitations:

- The refresh token is kept in `localStorage`, which a successful XSS attack could read. Rotation
  and server-side revocation limit the damage, but an `httpOnly` cookie would remove the exposure;
  that requires changing the API contract (the token would no longer be in the response body).
- The login rate limit is kept in process memory, so it resets on restart and is not shared
  between multiple API instances. Use a shared store (e.g. Redis) when scaling out.
- One active session per user (see [JWT flow](#jwt-flow)).
- There is no forgot-password / email flow yet.
- Departments are read-only: there is no API or screen to create them yet, so the department
  dropdown is empty until that module lands.
- The permission catalogue is read-only in the app (`GET /permissions`); new permissions come from
  the seed file, because a permission only means something once a route asks for it.
- Which role is the default, and which is full-access, is set by the seed and cannot be changed
  from the app.
- There is no Export feature yet, so there is no Export button to gate; when one is added it is
  wrapped in `<PermissionGate>` like the others.
- Each authenticated request makes one extra database round trip to load the role's permissions.
  That is the cost of changes applying instantly; add a short-lived cache if it ever shows up in
  profiling.
- Industries, company types and organizations can be listed and added, but not yet renamed,
  deactivated or deleted through the API.
- `organizationId` records which of your organizations owns an account. It does not isolate data
  between organizations: this is not multi-tenancy.
- An opportunity stays in the pipeline it was created in; it cannot be moved to another pipeline.
- The board shows at most 100 cards per stage (counts and values are always complete). There is
  no separate table view of opportunities; `GET /opportunities` provides the paginated list.
- Cards in a column are ordered by last change; they cannot be ordered by hand within a stage.
- Board drag and drop uses the browser's native drag events, which touch screens do not fire
  reliably; each card's "Move to ..." menu does the same thing there.
- Opportunities carry no products or line items yet; those arrive with Quotations.
- Stages are reordered with move earlier / later buttons on `/pipelines`, not by dragging.
- Lead conversion is not wrapped in a database transaction (see [Conversion](#conversion)): a
  failure part-way can leave a newly created company behind, which a retry then reuses.
- Duplicate matching compares values exactly apart from case and surrounding spaces. Phone
  numbers written differently ("+91 98765 43210" vs "9876543210") do not match.
- Amounts are plain numbers in one implied currency; there is no currency field.
- No categories, units or taxes are seeded: add them on `/categories`, `/units` and `/taxes`
  before (or while) creating products.
- Products have one price and one tax each, in one implied currency: no price lists, tiers,
  discounts, multiple taxes or stock levels. There is no separate "service" flag.
- Product `image` is a URL; there is no upload.
- `reminderDate` is stored and shown, but nothing sends a reminder: there is no notification or
  email system yet.
- There is no cross-record "my activities" or "my follow-ups" screen; the API supports it
  (`?assignedTo=`, `?overdue=true`) but activities and follow-ups are shown on each record's page.
- Ticket replies are stored in the CRM, not emailed to the contact, and customers cannot reply
  by email or through a portal: every message is written by a CRM user.
- Tickets have no SLA (response or resolution deadlines) and no automatic status changes.
- Contract reminders go to CRM users (a follow-up and an email), not to the customer. There is
  no in-app notification bell: the reminder appears in the follow-up lists.
- Contract dates are calendar days in UTC; "today" for reminders and expiry is the UTC date, so
  a reminder can appear a few hours early or late relative to local midnight.
- The reminder check runs inside the API process. If the API is stopped, reminders wait until
  it starts again (the check runs at start-up); a reminder whose period was passed entirely
  while it was down is replaced by the next smaller period.
- A contract has no line items, no invoices and no automatic renewal: renewing means changing
  the end date (or creating a new contract and marking the old one renewed). The billing
  cycle is recorded but nothing is billed from it yet (Payments module).
- Contracts have no file attachments (Documents module).
- A payment record keeps one running total: `paidAmount`, the last `paymentDate` and the last
  `paymentMethodId`. Individual receipts are not separate records - each one is on the
  timeline with its before and after values, but there is no receipt number or receipt list.
- Payments are not invoices in the tax sense: no PDF, no tax breakdown, no numbering rules per
  financial year, no emailing to the customer, and no link to contracts or billing cycles yet.
- One currency throughout; no payment gateway. Money is recorded by a CRM user.
- "Overdue" uses the UTC date. Nobody is notified when a payment becomes overdue.
- `PAYMENT_ALLOW_OVERPAYMENT` applies to the whole system, not per customer. An overpayment is
  shown, but not carried forward as credit to another invoice.
- A deleted payment keeps its invoice number reserved.
- The S3 driver is covered by tests against a stand-in client, and the whole upload / download
  / delete flow by tests on the local driver. It has **not been run against a real bucket**:
  do one upload and download after configuring yours.
- Files pass through the API in memory, in both directions on upload and as a stream on
  download: fine for documents up to the 10 MB default, not for very large files. There are no
  direct-to-bucket (presigned) uploads.
- Content checks recognise file signatures; they are not a virus scan.
- Documents have no versions, folders, descriptions or previews, and cannot be moved to another
  record. Deleting a record does not delete its documents; they stay listed as belonging to a
  deleted record.
- Deleting a document removes it for good - there is no recycle bin.
- A customer has no documents of its own: its Documents tab shows its company's.
- Notifications cover six events. Others (an opportunity or task assigned, a ticket reply, an
  order status change) are not notified yet; adding one is a single `notifyUsers` call.
- Notifications are in-app only: no email, SMS or browser push, and no per-user settings to
  switch a type off.
- "Follow-up due" and "payment overdue" appear at the next check, so up to
  `NOTIFICATION_CHECK_INTERVAL_MINUTES` after the moment itself. A payment that stays overdue
  is notified once, not daily.
- With several API servers, real-time delivery reaches only the browsers connected to the
  server that handled the event (there is no shared Socket.IO adapter); the others catch up
  within a minute through the periodic fetch.
- Old notifications are kept until their owner deletes them; there is no automatic clean-up.
- Dashboard periods are calendar periods in UTC (so "today" turns over at UTC midnight), and
  there is no "previous period" comparison or trend arrow on the tiles.
- The dashboard refreshes every minute rather than being pushed changes; a figure can be up
  to a minute old. Figures are computed on each request, with no caching - fine for thousands
  of records per module, worth revisiting for millions.
- Won and lost values use the opportunity's estimated value; sales figures use order totals.
  All amounts are in one implied currency.
- Organization scope covers the dashboard only. Lists and detail pages elsewhere are still
  governed by permissions alone, not by organization.
- A user belongs to one organization at most; there is no hierarchy of organizations.
- The time zone and date format settings change how dates are **shown**. What counts as
  "today" on the server - overdue payments, contract expiry, dashboard periods - is still the
  UTC date.
- The currency code is shown on documents and on the main money figures (quotation and order
  totals, payments, contracts); lists and reports show plain numbers. There is one currency.
- The logo is an address of an image hosted elsewhere, not an upload, and is not printed on
  PDFs.
- The digits of generated numbers, the intervals of the background checks, token lifetimes,
  rate limits, the mail server and the storage driver are still set in the environment.
- The password setting is a minimum length only; the other rules (upper and lower case, a
  digit, a symbol) are fixed. A longer minimum does not affect passwords already set.
- Settings are system-wide: there are none per organization or per user.
- With several API servers, a change reaches the others within 15 seconds, not instantly.
- The audit log is kept for ever: there is no retention period, archive or export. On a busy
  system it is the fastest-growing collection - plan for it.
- An audit entry is written just after the response, so if the server stops in that instant
  the entry is lost; and work done outside a request - the contract reminder check, the
  notification check, seed scripts - is not audited (it is on the records' own timelines).
- Changes made to something attached to a record (a project task, a ticket reply) are logged
  against the parent record with what was sent, not as a before / after of the attachment.
- Ids in `oldData` / `newData` are stored as ids, not names, and bulk operations are one entry.
- Reading is not audited: the log does not show who viewed or exported what.
- Reports are fixed definitions: users cannot add columns, build their own report or save a
  set of filters; there are no scheduled or emailed reports.
- A report is computed on every request. Search and sorting run over the joined rows, which
  is fine for tens of thousands of records per module and would need indexes or pre-computed
  tables beyond that.
- Exports are built in memory and capped (`REPORT_EXPORT_MAX_ROWS`); a larger export has to be
  split with filters. PDF cuts long text rather than wrapping it.
- Report dates are UTC calendar days; statuses such as an opportunity's state appear as stored
  (`open`, `won`). Amounts are in one implied currency.
- The Products report lists products that were sold in the range; products with no sales do
  not appear.
- The dashboard layout is fixed: tiles and charts cannot be rearranged or hidden per user, and
  there is no export.
- Attachments and documents are kept in the configured storage (`STORAGE_DRIVER`). With `local`
  they are on the server's disk (`UPLOAD_DIR`): back that folder up with the database, and use
  `s3` if the API runs on more than one server. Files are not virus
  scanned. Deleting a ticket keeps its files.
- Only people with `projects.manageTasks` can change tasks: a team member without it cannot
  update the status of their own task.
- Removing someone from a project team leaves the tasks already assigned to them as they are.
- There is no time tracking (only estimated hours), no task dependencies and no Gantt view.
- Activity and follow-up priority is a fixed low / medium / high scale, unlike lead priorities,
  which are configurable.
- Lead configuration values are reordered by editing each value's Position number; there is no
  drag-and-drop.
- Contacts have no change timeline of their own yet, and contact changes are not shown on the
  company timeline.
- Quotations carry one implied currency (the profile's `currency` is only printed); there is no
  exchange rate or multi-currency support.
- Tax is one rate per product, applied to the line after discounts; there is no split into
  CGST/SGST/IGST, no tax-inclusive pricing and no rounding-off line.
- Quotation statuses do not change by themselves: nothing marks a quotation "expired" when
  `validUntil` passes.
- Sending needs `SMTP_URL`; without it the quotation is only marked as sent. Emails are plain
  text with the PDF attached, sent while the request waits (no queue or retry).
- The PDF has no logo and uses the built-in Helvetica font, which cannot print characters outside
  Latin-1 (for example the rupee sign or non-Latin scripts); amounts are printed with the
  currency code instead.
- Quotations have no revisions: editing changes the quotation in place (the timeline records
  what changed).
- An order is fulfilled as a whole: there are no partial deliveries, shipments, stock movements
  or invoices yet, and statuses do not change by themselves.
- The order screen edits dates, contact, assignee and notes; changing an order's lines is
  possible through `PUT /orders/:id` but has no screen. There is no screen for direct orders either
  (`POST /orders` without a quotation).
- Customer list figures cover the customers on the current page; the list cannot be sorted by
  order value or last order yet.
- GST and PAN validation assumes Indian formats.
- The "assign to" picker loads up to 100 active users.
- `profileImage` is a URL; there is no image upload.
- User search uses case-insensitive pattern matching, which does not use an index. Fine for
  thousands of users; revisit (text index or a search service) for much larger sets.

## Future modules

Planned on top of this foundation, each adding its own models, validators, services, routes,
screens and Postman requests:

1. Departments
2. Saved and scheduled reports, period comparisons
3. More notification events and channels (email, per-user preferences)
