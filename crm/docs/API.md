# API

A versioned REST API over JSON. Base URL: `http://localhost:5000/api/v1` in
development.

## Conventions

**Every response has one shape.**

```json
{ "success": true,  "message": "Lead created successfully", "data": { "lead": { } } }
{ "success": false, "message": "Validation failed", "errors": [{ "field": "title", "message": "title is required" }] }
```

| Status | Meaning |
| ------ | ------- |
| 200 / 201 | Done / created |
| 400 | The request makes no sense as sent (a referenced record does not exist, a file is missing) |
| 401 | No token, or it is invalid or expired |
| 403 | Signed in, but the role does not allow this |
| 404 | No such record (or it was deleted) |
| 409 | Refused by a business rule: a duplicate, a record still in use, an order already created from this quotation |
| 422 | Validation failed; `errors` names each field |
| 429 | Too many requests |
| 500 | Unexpected; details are in the server log, never in the response |

**Authentication.** `Authorization: Bearer <accessToken>` on everything except
`/health`, `/auth/login`, `/auth/register`, `/auth/refresh-token` and
`/settings/public`.

**Lists.** `GET /<resource>` takes:

| Parameter | Meaning |
| --------- | ------- |
| `page`, `limit` | Paging. `limit` is capped (100) |
| `search` | Words to look for; every word must match |
| `sortBy`, `sortOrder` | A sortable field, `asc` or `desc` |
| filters | Per resource: `statusId`, `companyId`, `assignedTo`, date ranges, … |

and returns `{ <resource>: [...], pagination: { page, limit, total, totalPages } }`.
Searching, filtering, sorting and paging all happen in the database.

**Writing.** `POST` creates; `PUT` changes only the fields sent; `PATCH` is
used for one-purpose changes (`/status`, `/stage`, `/assign`); `DELETE` is a
soft delete. Fields the server owns - record numbers, totals, remaining
amounts, timestamps - are never accepted from the client. Unknown fields are
ignored.

**Ids** are MongoDB ObjectIds (24 hex characters). References come back as the
id (`companyId`) and, when loaded, as an object beside it (`company`).

**Dates** are ISO 8601 in UTC.

## Endpoints

All 267 routes, by resource. For what each one needs and returns, see
[MODULES.md](MODULES.md); for the permission each one checks, [RBAC.md](RBAC.md).
The Postman collection has a request - with tests - for every one of them.

| Resource | Routes |
| -------- | ------ |
| `/activities` | `GET POST /activities`<br>`PUT DELETE /activities/:id` |
| `/activity-types` | `GET POST /activity-types`<br>`PUT DELETE /activity-types/:id` |
| `/audit-logs` | `GET /audit-logs`<br>`GET /audit-logs/:id`<br>`GET /audit-logs/filters` |
| `/auth` | `POST /auth/change-password`<br>`POST /auth/login`<br>`POST /auth/logout`<br>`GET /auth/me`<br>`GET PUT /auth/preferences`<br>`POST /auth/refresh-token`<br>`POST /auth/register` |
| `/billing-cycles` | `GET POST /billing-cycles`<br>`PUT DELETE /billing-cycles/:id` |
| `/companies` | `GET POST /companies`<br>`GET PUT DELETE /companies/:id`<br>`GET /companies/:id/sections`<br>`GET /companies/:id/timeline`<br>`GET /companies/options` |
| `/company-types` | `GET POST /company-types` |
| `/contacts` | `GET POST /contacts`<br>`GET PUT DELETE /contacts/:id`<br>`GET /contacts/options` |
| `/contract-reminder-periods` | `GET POST /contract-reminder-periods`<br>`PUT DELETE /contract-reminder-periods/:id` |
| `/contract-statuses` | `GET POST /contract-statuses`<br>`PUT DELETE /contract-statuses/:id` |
| `/contract-types` | `GET POST /contract-types`<br>`PUT DELETE /contract-types/:id` |
| `/contracts` | `GET POST /contracts`<br>`GET PUT DELETE /contracts/:id`<br>`GET /contracts/:id/reminders`<br>`PATCH /contracts/:id/status`<br>`GET /contracts/:id/timeline`<br>`POST /contracts/reminders/run`<br>`GET /contracts/stats` |
| `/customers` | `GET POST /customers`<br>`GET PUT DELETE /customers/:id`<br>`GET /customers/:id/summary`<br>`GET /customers/:id/timeline` |
| `/dashboard` | `GET /dashboard/activities`<br>`GET /dashboard/leads`<br>`GET /dashboard/opportunities`<br>`GET /dashboard/sales`<br>`GET /dashboard/summary` |
| `/departments` | `GET /departments` |
| `/documents` | `GET POST /documents`<br>`GET PATCH DELETE /documents/:id`<br>`GET /documents/:id/download[?version=N]`<br>`GET POST /documents/:id/versions`<br>`POST /documents/:id/versions/:version/restore`<br>`GET /documents/config` - see [DOCUMENTS.md](DOCUMENTS.md) |
| `/scraper` | `GET /scraper/stats`<br>`GET POST /scraper/jobs`, `GET DELETE /scraper/jobs/:id`, `POST /scraper/jobs/:id/cancel`, `.../rerun`<br>`GET /scraper/pages`<br>`GET /scraper/records`, `/records/ids`, `/records/export`, `GET PATCH /scraper/records/:id`, `POST /scraper/records/recheck`<br>`POST /scraper/import/preview`, `POST /scraper/import` - see [SCRAPER.md](SCRAPER.md) |
| `/document-types`, `/document-statuses` | `GET POST /...`<br>`PUT DELETE /.../:id` |
| `/followups` | `GET POST /followups`<br>`PUT /followups/:id`<br>`PATCH /followups/:id/complete`<br>`PATCH /followups/:id/reschedule` |
| `/health` | `GET /health` |
| `/industries` | `GET POST /industries` |
| `/lead-priorities` | `GET POST /lead-priorities`<br>`PUT DELETE /lead-priorities/:id` |
| `/lead-sources` | `GET POST /lead-sources`<br>`PUT DELETE /lead-sources/:id` |
| `/lead-statuses` | `GET POST /lead-statuses`<br>`PUT DELETE /lead-statuses/:id` |
| `/leads` | `GET POST /leads`<br>`GET PUT DELETE /leads/:id`<br>`PATCH /leads/:id/assign`<br>`POST /leads/:id/convert`<br>`PATCH /leads/:id/status`<br>`GET /leads/:id/timeline` |
| `/notifications` | `GET /notifications`<br>`DELETE /notifications/:id`<br>`PATCH /notifications/:id/read`<br>`PATCH /notifications/read-all` |
| `/opportunities` | `GET POST /opportunities`<br>`GET PUT DELETE /opportunities/:id`<br>`PATCH /opportunities/:id/assign`<br>`PATCH /opportunities/:id/stage`<br>`GET /opportunities/:id/timeline`<br>`GET /opportunities/board`<br>`GET /opportunities/options` |
| `/order-statuses` | `GET POST /order-statuses`<br>`PUT DELETE /order-statuses/:id` |
| `/orders` | `GET POST /orders`<br>`GET PUT DELETE /orders/:id`<br>`PATCH /orders/:id/status`<br>`GET /orders/:id/timeline`<br>`POST /orders/from-quotation/:id`<br>`GET /orders/options` |
| `/organizations` | `GET POST /organizations` |
| `/payment-methods` | `GET POST /payment-methods`<br>`PUT DELETE /payment-methods/:id` |
| `/payment-statuses` | `GET POST /payment-statuses`<br>`PUT DELETE /payment-statuses/:id` |
| `/payments` | `GET POST /payments`<br>`GET PUT DELETE /payments/:id`<br>`GET /payments/:id/timeline`<br>`GET /payments/stats` |
| `/permissions` | `GET /permissions` |
| `/pipeline-stages` | `GET POST /pipeline-stages`<br>`PUT DELETE /pipeline-stages/:id`<br>`PATCH /pipeline-stages/reorder` |
| `/pipelines` | `GET POST /pipelines`<br>`GET PUT DELETE /pipelines/:id` |
| `/product-categories` | `GET POST /product-categories`<br>`PUT DELETE /product-categories/:id` |
| `/products` | `GET POST /products`<br>`GET PUT DELETE /products/:id`<br>`GET /products/options`<br>`GET /products/sku-check` |
| `/project-statuses` | `GET POST /project-statuses`<br>`PUT DELETE /project-statuses/:id` |
| `/projects` | `GET POST /projects`<br>`GET PUT DELETE /projects/:id`<br>`GET POST /projects/:id/milestones`<br>`PUT DELETE /projects/:id/milestones/:id`<br>`GET /projects/:id/summary`<br>`GET POST /projects/:id/tasks`<br>`PUT DELETE /projects/:id/tasks/:id`<br>`GET /projects/:id/timeline` |
| `/quotation-statuses` | `GET POST /quotation-statuses`<br>`PUT DELETE /quotation-statuses/:id` |
| `/quotations` | `GET POST /quotations`<br>`GET PUT DELETE /quotations/:id`<br>`POST /quotations/:id/pdf`<br>`POST /quotations/:id/send`<br>`PATCH /quotations/:id/status`<br>`GET /quotations/:id/timeline`<br>`POST /quotations/calculate` |
| `/reports` | `GET /reports`<br>`GET /reports/:id`<br>`GET /reports/:id/export` |
| `/roles` | `GET POST /roles`<br>`GET PUT DELETE /roles/:id`<br>`PUT /roles/:id/permissions` |
| `/search` | `GET /search` |
| `/settings` | `GET PUT /settings`<br>`GET PUT /settings/company`<br>`GET /settings/public` |
| `/task-statuses` | `GET POST /task-statuses`<br>`PUT DELETE /task-statuses/:id` |
| `/taxes` | `GET POST /taxes`<br>`PUT DELETE /taxes/:id` |
| `/ticket-categories` | `GET POST /ticket-categories`<br>`PUT DELETE /ticket-categories/:id` |
| `/ticket-priorities` | `GET POST /ticket-priorities`<br>`PUT DELETE /ticket-priorities/:id` |
| `/ticket-statuses` | `GET POST /ticket-statuses`<br>`PUT DELETE /ticket-statuses/:id` |
| `/tickets` | `GET POST /tickets`<br>`GET PUT DELETE /tickets/:id`<br>`PATCH /tickets/:id/assign`<br>`GET /tickets/:id/attachments/:id`<br>`GET /tickets/:id/conversation`<br>`POST /tickets/:id/internal-notes`<br>`POST /tickets/:id/replies`<br>`PATCH /tickets/:id/status`<br>`GET /tickets/stats` |
| `/units` | `GET POST /units`<br>`PUT DELETE /units/:id` |
| `/users` | `GET POST /users`<br>`GET PUT DELETE /users/:id`<br>`PATCH /users/:id/reset-password`<br>`PATCH /users/:id/status`<br>`GET /users/options` |

The administrator-managed lists (`/lead-sources`, `/lead-statuses`,
`/lead-priorities`, `/activity-types`, `/quotation-statuses`,
`/order-statuses`, `/project-statuses`, `/task-statuses`,
`/ticket-categories`, `/ticket-priorities`, `/ticket-statuses`,
`/contract-types`, `/contract-statuses`, `/billing-cycles`,
`/contract-reminder-periods`, `/payment-methods`, `/payment-statuses`,
`/product-categories`, `/units`, `/taxes`) all work the same way: `GET` the
list, `POST` an entry, `PUT /:id`, `DELETE /:id`. An entry still used by
records cannot be deleted - deactivate it (`isActive: false`).

## Real time

Socket.IO on the API's own port. Connect with the access token
(`auth: { token }`); the server puts the connection in the user's own room and
emits `notification` when one is created for them. The same notifications are
always available from `GET /notifications`.

## Trying it

```bash
curl -X POST http://localhost:5000/api/v1/auth/login -H "Content-Type: application/json" \
  -d '{"email":"you@yourcompany.com","password":"<password>"}'

curl "http://localhost:5000/api/v1/leads?page=1&limit=20&search=flow" -H "Authorization: Bearer <accessToken>"
```

Or import `postman/CRM.postman_collection.json` and
`postman/CRM.postman_environment.json` - see the README.
