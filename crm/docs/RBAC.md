# Roles and permissions (RBAC)

Access is decided by **permissions**, grouped into **roles**. Both are data.

## The model

```text
User ──► Role ──► Permission  (key: "<module>.<action>", e.g. leads.assign)
```

- **Permission** - one thing that can be done. The catalogue is defined by the
  code (`server/src/seeds/rbac.seed.js`) and loaded into the database at start,
  because a permission only means something if a route checks it.
- **Role** - a name and a set of permissions, created and edited by
  administrators on the Roles screen. No role name appears anywhere in the code.
- **User** - has exactly one role.

Two roles exist after the first start, recognised by a flag, not by name:

| Flag | Meaning |
| ---- | ------- |
| `isSuperAdmin` | Holds every permission, including ones added later |
| `isDefault` | Given to users created without a role; holds no permissions until an administrator grants some |

They can be renamed freely.

## How a request is authorized

1. `authenticate` verifies the access token and loads the user **and their role
   with its permissions from the database** - on every request. Nothing about
   access is read from the token.
2. `requirePermission('leads.update')` (all listed keys) or `authorize(...)`
   (any one) allows or answers 403.
3. Services apply the finer rules: a user may only assign a role that carries
   no more access than their own; a document may be read only by someone who
   may read the record it belongs to.

A change to a role takes effect on the user's next request. An inactive role
grants nothing. A deactivated or deleted user's tokens stop working at once.

Every permission key the code asks for is checked against the catalogue at
start; a typo is reported in the log instead of silently denying everyone.

## The catalogue

| Module | Actions |
| ------ | ------- |
| `users` | read, create, update, changeStatus, resetPassword, delete, assignRole |
| `roles` | read, create, update, delete, assignPermissions |
| `permissions` | read |
| `companies` | read, create, update, delete, manageLookups |
| `contacts` | read, create, update, delete |
| `leads` | read, create, update, delete, assign, convert |
| `leadConfig` | manage |
| `activities` | read, create, update, delete, manageTypes |
| `followups` | read, create, update |
| `products` | read, create, update, delete, manageCatalog |
| `pipelines` | manage |
| `opportunities` | read, create, update, delete, assign |
| `quotations` | read, create, update, delete, send, manageStatuses |
| `orders` | read, create, update, delete, manageStatuses |
| `customers` | read, create, update, delete |
| `projects` | read, create, update, delete, manageTasks, manageStatuses |
| `tickets` | read, create, update, delete, assign, reply, addInternalNote, manageSettings |
| `contracts` | read, create, update, delete, manageSettings |
| `payments` | read, create, update, delete, manageSettings |
| `documents` | read, create, delete |
| `dashboard` | read, viewAll |
| `reports` | read, export, viewAll |
| `audit` | read, viewAll |
| `search` | viewAll |
| `settings` | manage |

Notifications and a user's own preferences need no permission: each user only
ever reads and changes their own.

## Scope

Beyond "may this user read leads at all", four areas also limit *which* records:

| Area | Permission that lifts the limit |
| ---- | ------------------------------- |
| Dashboard | `dashboard.viewAll` |
| Reports | `reports.viewAll` |
| Global search | `search.viewAll` |
| Audit log | `audit.viewAll` |

Without it: a user with an organization sees that organization's records; a
user with neither sees only their own.

## In the web app

The API returns the signed-in user's permission keys. The app uses them to
decide what to show - navigation entries, buttons, the Create menu, bulk
actions - through `<PermissionGate>` and `usePermission()`. That is tidiness,
not security: the API checks every request again.

A 403 from the API makes the app reload the user's permissions, so the screen
catches up with a role that was just changed.

## Adding a permission

1. Add it to `PERMISSION_SEED` in `server/src/seeds/rbac.seed.js`.
2. Guard the route: `requirePermission('<module>.<action>')`.
3. Add its name to `client/src/utils/permissions.js` and gate the UI.

It is inserted on the next start and can then be granted on the Roles screen.

## Creating the first administrator

```bash
cd server
ADMIN_PASSWORD='<a strong password>' npm run create:admin -- --first-name Ada --last-name Admin --email ada@yourcompany.com
```

The password is read from the environment so it never appears in shell history
or in the process list.
