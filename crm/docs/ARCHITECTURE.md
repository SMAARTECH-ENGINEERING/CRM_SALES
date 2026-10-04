# Architecture

A React single-page app talking to a versioned REST API over JSON, with MongoDB
behind it. Two deployable parts - `client/` (static files) and `server/` (a
Node process) - in one repository.

```text
Browser ── React SPA (Vite build, Material UI)
   │   HTTPS, JSON, Bearer token            WebSocket (Socket.IO): notifications
   ▼
Express API  /api/v1
   helmet → cors → compression → json → rate limit → audit → routes
   route: authenticate → requirePermission → validate → service
   │
   ├── MongoDB (Mongoose)         records, lists, settings, audit log
   ├── File storage               local folder, or S3-compatible object storage
   ├── Mail (SMTP, optional)      quotations, contract reminders
   └── Background jobs            contract reminders, due / overdue notifications
```

## Server (`server/src`)

| Layer | Folder | Responsibility |
| ----- | ------ | -------------- |
| Entry | `server.js` | Connects to MongoDB, loads the permission catalogue and first-run lists, starts the HTTP server, the WebSocket and the jobs, shuts down cleanly |
| App | `app.js` | The Express app and its middleware; no network or database side effects, so tests import it directly |
| Routes | `routes/` | One router per resource. A route names its permission, validates the request and calls a service |
| Validators | `validators/` | Joi schemas. Unknown fields are dropped; the cleaned values are on `req.validated` |
| Services | `services/` | All business rules: numbering, totals, status transitions, duplicate checks, scope, notifications. Routes hold no logic |
| Models | `models/` | Mongoose schemas, indexes, soft delete, the JSON shape sent to clients |
| Middleware | `middleware/` | `authenticate`, `requirePermission` / `authorize`, `validate`, `rateLimiter`, `audit`, `errorHandler`, `notFound` |
| Jobs | `jobs/` | Timers started only by `server.js`; each is idempotent |
| Realtime | `realtime/socket.js` | Socket.IO: authenticated by the same JWT, one room per user |
| Config | `config/` | Environment validation (the server refuses to start with a bad `.env`), logger, database |
| Seeds | `seeds/` | The permission catalogue and the first-run values of the administrator-managed lists - the only place such values are written down |

### A request, step by step

1. `helmet`, `cors`, `compression`, body parsing (1 MB limit).
2. `apiLimiter` - per-IP request limit.
3. `audit` - notes what the request will change; writes the audit entry after the response.
4. The route: `authenticate` (verifies the access token, loads the user and their role from the database) → `requirePermission('leads.update')` → `validate({ body, query, params })` → the service.
5. The service returns data; the route sends `{ success, message, data }`.
6. Anything thrown becomes `{ success: false, message, errors }` in `errorHandler`. Stack traces are logged, never sent.

### Rules that hold everywhere

- **Nothing about the business is hardcoded.** Statuses, priorities, sources, stages, categories, taxes, units and number prefixes are data, managed by administrators. Code depends only on each status's *category* (for example `won`, `paid`, `closed`) - a small fixed vocabulary in `constants/`.
- **Roles are data.** No role name appears in code. Routes ask for a permission key; which roles hold it is in the database.
- **The server calculates.** Totals, tax, remaining amounts, progress, record numbers and dashboard figures are worked out by the API. The client never sends them and never computes them.
- **Soft delete.** Records are hidden with `deletedAt`, not destroyed, so references stay valid.
- **One response shape** for every endpoint.

## Client (`client/src`)

| Folder | Responsibility |
| ------ | -------------- |
| `api/` | Axios client (token handling, refresh on 401, one error shape) and one module of functions per resource |
| `hooks/` | TanStack Query hooks per resource: caching, refetching, invalidation after a change |
| `pages/` | Route-level screens |
| `components/` | Reusable UI; `components/ui/` is the shared component library (shell, table, filters, states) |
| `context/` | The session (`AuthContext`), user preferences, toasts |
| `theme/` | The design system: colours, typography, spacing, component overrides |
| `i18n/` | Languages |
| `routes/` | The route table, lazy-loaded pages, permission guards |
| `utils/` | Formatting, permission key names, token storage |

Server state lives in TanStack Query, never in component state copied by hand.
Forms use React Hook Form with Yup. Every screen has a loading, an error and an
empty state. What a user may not do is not shown - and the API refuses it anyway.

## Scope: who sees which records

- **Module access** is RBAC: a permission per action per module.
- **Organization scope** applies to the dashboard, reports, global search and the audit log: a user with the module's `viewAll` permission sees everything; a user with an organization sees that organization's records; a user with neither sees their own.
- List endpoints (`GET /leads` and so on) are limited by permission only - see "Known limits" in the README.

## Background work

| Job | Interval | What it does |
| --- | -------- | ------------ |
| Contract reminders | `CONTRACT_REMINDER_INTERVAL_MINUTES` | Expires ended contracts; creates a follow-up, a notification and (optionally) an email at each configured reminder period |
| Notifications | `NOTIFICATION_CHECK_INTERVAL_MINUTES` | Follow-ups due, payments overdue, contracts expiring |

Both claim their work with a unique key, so two servers - or a restart - never notify twice.

## More

- [DATABASE.md](DATABASE.md) - collections, relationships, indexes
- [API.md](API.md) - conventions and every endpoint
- [RBAC.md](RBAC.md) - roles, permissions, scope
- [DEPLOYMENT.md](DEPLOYMENT.md) - production setup
- [TESTING.md](TESTING.md) - what is tested and how to run it
- [MODULES.md](MODULES.md) - each module in detail: models, rules, endpoints, examples
- [UI_UX.md](UI_UX.md), [THEMING.md](THEMING.md), [I18N.md](I18N.md) - the web app
