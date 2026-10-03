# CRM Client

React + Vite + Material UI web client. See the [root README](../README.md) for the full setup guide.

## Quick start

```bash
npm install
cp .env.example .env   # Windows PowerShell: Copy-Item .env.example .env
npm run dev            # http://localhost:5173
```

## Scripts

| Command           | Purpose                              |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the Vite dev server            |
| `npm run build`   | Production build into `dist/`        |
| `npm run preview` | Serve the production build locally   |
| `npm test`        | Run the component tests              |

## Layout

| Folder           | Responsibility                                                     |
| ---------------- | ------------------------------------------------------------------ |
| `src/api`        | Axios instance, TanStack Query client, one `*.api.js` per resource |
| `src/hooks`      | Query / mutation hooks and other reusable hooks                    |
| `src/context`    | React context providers (auth session)                             |
| `src/routes`     | Route table                                                        |
| `src/layouts`    | Page shells                                                        |
| `src/pages`      | Route-level screens                                                |
| `src/components` | Reusable UI                                                        |
| `src/theme`      | Material UI theme                                                  |
| `src/utils`      | Environment access, token storage, helpers                         |

## Conventions

- All HTTP calls go through `src/api/axiosClient.js`. It attaches the access token, unwraps the
  API envelope (`{ success, message, data }`), and rejects with an `ApiError`
  (`message`, `status`, `errors`).
- Auth: `useAuth()` returns `{ user, isAuthenticated, isLoading, error, login, logout }`. Routes
  nested under `<ProtectedRoute>` in `src/routes/AppRoutes.jsx` require a signed-in user; anyone
  else is sent to `/login`. Token refresh and 401 handling happen inside the Axios client, so
  pages never deal with tokens.
- Permissions come from the API as `user.permissions` (keys resolved from the database); the
  client never checks role names.
  - `<PermissionGate permission="leads.create">` (or `permission={[...]}` for all, `anyOf={[...]}`
    for any, optional `fallback`) wraps anything that should be hidden.
  - `<RequirePermission>` guards a group of routes with the same props.
  - `usePermission()` gives `can(key)`, `canAny(keys)` and `covers(role)` for logic.
  - Sidebar entries and the permission each needs are listed in `src/layouts/navigation.js`.
  - `src/utils/permissions.js` only names the keys the UI refers to, to catch typos.
  These shape the UI only; the API enforces access.
- Pickers load their options from the API and are reusable across modules: `CompanySelect`,
  `ContactSelect`, `UserSelect`, `ProductSelect` (server-side search), and `LeadConfigSelect` for
  any administrator-managed list (lead sources/statuses/priorities, activity types, product
  categories, units, taxes). None of them contains a list of values.
- Pipelines and stages come from `usePipelines()` and `usePipelineStages(pipelineId)`
  (`src/hooks/usePipelines.js`). `<KanbanBoard columns onMove canMove />`
  (`src/components/opportunities`) draws whatever columns it is given; the move itself is
  `useOpportunityMutations().move`, which updates the board at once and rolls back if the API
  refuses the stage.
- `OpportunitySelect` (a company's opportunities, from `GET /opportunities/options`) joins the
  other pickers. The quotation builder (`src/pages/QuotationFormPage.jsx`) shows totals only from
  `useQuotationCalculation`, i.e. the server.
- File downloads: request with `responseType: 'blob'` and save with `saveBlob`
  (`src/hooks/useQuotations.js`). The Axios client turns a failed blob response back into the
  usual `ApiError`.
- Tests: `npm test` (Vitest + Testing Library). `src/test/renderWithProviders.jsx` renders a
  component as a signed-in user holding a given list of permissions.
- Feedback: `useNotify()` gives `success(message)` / `error(message)` snackbars.
- Server state lives in TanStack Query; components use hooks from `src/hooks` rather than calling
  the API directly.
- Configuration is read through `src/utils/env.js`, never `import.meta.env` directly.
- Forms use React Hook Form with Yup schemas (`@hookform/resolvers/yup`).
