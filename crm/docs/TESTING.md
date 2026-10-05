# Testing

Four layers, each run with one command from the repository root.

| Command | What it runs | Needs |
| ------- | ------------ | ----- |
| `npm run lint` | ESLint on server and client | - |
| `npm test` | Server tests, then client tests | MongoDB running locally |
| `npm run test:e2e` | The whole business workflow through a real server | MongoDB |
| `npm run test:postman` | Every request in the Postman collection, with its test scripts, through a real server | MongoDB; installs Newman on first run |

None of them touches the database in `server/.env`: each uses a database of
its own and removes it afterwards.

## Server tests (`server/tests`)

`node:test` with `supertest`: requests go through the real Express app -
routing, validation, authentication, permissions, services, MongoDB.

```bash
npm run test:server
node --test server/tests/leads.test.js      # one file
```

- One file per module, each with its own database (`crm_test_<module>`), so
  files run in parallel without touching each other.
- Covered per module: the happy path, validation, authentication, permissions
  (what a role without the permission is refused), business rules (duplicates,
  status transitions, totals, soft delete), and what must never be returned
  (password hashes, storage keys, secrets).
- Email is switched off; rate limiting is off; the audit trail is off except in
  its own test.

## Client tests (`client/src/**/*.test.jsx`)

Vitest with Testing Library, in jsdom. The API modules are mocked, so a test
states what the API returns and asserts what the screen shows and what it sends
back.

```bash
npm run test:client
npx vitest run src/pages/LeadsPage.test.jsx   # one file (from client/)
```

- Test data uses deliberately unusual values, so a test can only pass if the
  screen shows what the API returned - not something written into the component.
- Covered: permission-driven navigation and buttons, forms and what they send,
  server-side paging, the shared table (columns, order, density, selection),
  the dashboard and its layout, search and commands, preferences, themes
  (including contrast in every theme and mode) and the completeness of the
  three languages.
- Document tools (`client/src/features/documents/lib/documentTools.test.js`,
  run in Node, no browser): page ranges, print layout (paper, copies, header),
  Excel written and read back with formulas, formatting, merges and sizes,
  CSV, spreadsheets drawn onto PDF pages, tables found in PDF text and amounts
  read as numbers, the PDF editor's model (wrapping, turning pages), and the
  edited PDF it saves (page order, rotation, comments). The actions menu,
  rename and version history are tested as screens. The editors themselves
  (drawing on a canvas) were checked in a real browser.
- Workers are capped at four (`client/vite.config.js`): one per core starves
  them on a machine that is also running the app.

## The workflow, end to end (`server/scripts/e2e-workflow.js`)

Starts a server on its own port and database and walks the business path
through the HTTP API, checking each result:

```text
seed admin → login → create user → assign role → company → contact → lead →
assign lead → follow-up → opportunity → move through the pipeline → quotation →
accept → order → customer → project → task → ticket → AMC → payment →
notification → dashboard → reports → audit log
```

then what must not be possible: a role without the permission, no token, a bad
token, an invalid request, reading a deleted record, an unknown origin - and
that security headers and rate-limit headers are sent and the server logged no
error.

```bash
npm run test:e2e
```

## The Postman collection (`postman/run-collection.js`)

Runs `CRM.postman_collection.json` from top to bottom with Newman against a
fresh server: every endpoint, with the assertions in each request's test
script, and the ids passed from one request to the next exactly as in the
Postman app.

```bash
npm run test:postman
npm run test:postman -- --folder Leads
npm run test:postman -- --verbose
```

## Linting

ESLint with the recommended rules plus a few that catch real mistakes (unused
names, `==`, hooks used wrongly). Formatting is left alone.

```bash
npm run lint
```

## Looking at the screens

The automated tests do not look at pixels. To check layout by eye, run the app
(`npm run dev`) and use the browser's device toolbar at 1440, 768 and 390 px
wide, in light and dark, and in each language.

## Before a release

```bash
npm run lint && npm test && npm run test:e2e && npm run test:postman && npm run build
```

## Adding tests

- **A new endpoint:** add cases to the module's file in `server/tests/` -
  success, validation, permission - and a request with a test script to the
  Postman collection.
- **A new screen:** a `*.test.jsx` beside it, mocking the API module, asserting
  what is shown and what is sent.
- **A new language or theme:** nothing to add - `client/src/theme/theme.test.js`
  already checks every language for missing keys and every theme for contrast.
