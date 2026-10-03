# UI and UX

How the web app is put together, what a user can customise, and how to build a
new screen so that it matches the rest. See also [THEMING.md](THEMING.md) and
[I18N.md](I18N.md).

Everything is Material UI (`@mui/material`, `@mui/icons-material`,
`@mui/x-data-grid`, `@mui/x-charts`). No other UI framework is used.

## The shell

`components/ui/AppShell.jsx` frames every signed-in page.

- **Top bar** (`Topbar`): sidebar toggle, company name and logo, search,
  **+ Create**, notifications, help (keyboard shortcuts), language, theme, account.
  On a phone, help / language / theme move into the account's Preferences and
  Create becomes a floating button.
- **Sidebar** (`Sidebar`): grouped navigation - Sales, Customers, Operations,
  Finance, Catalogue, Insights, Administration. Entries and whole groups appear
  only if the user's permissions allow them (`layouts/navigation.js` is the one
  list; `useNavigation` filters it).
  - **Expanded**, and **resizable**: drag its right edge (220–420 px, default
    280; double-click resets; arrow keys work too). The limits are in
    `theme/spacing.js`.
  - **Collapsed**: icons only, each with a tooltip.
  - **Phone / small tablet**: a drawer opened from the top bar.
- **Breadcrumbs** (`AutoBreadcrumbs`): every page below a section shows
  `Dashboard / Section / Record`. They are worked out from the address and the
  navigation, and the last step is the page's own heading - a new page gets
  them without any code.
- A "Skip to content" link is the first thing the keyboard reaches.

## Search and command palette

The search box is both (`components/search/GlobalSearch.jsx`). **Ctrl+K** (⌘K)
focuses it from anywhere.

- Empty: lists the pages the user may open ("Go to") and the records they may
  create ("Create").
- Typing: matching commands, plus records from `GET /api/v1/search`, grouped
  by kind. Arrow keys move, Enter opens.

Commands come from the same navigation list, so they respect permissions.

## Keyboard shortcuts

Defined in one place, `hooks/useShortcuts.js`, and listed in the help dialog (`?`).

| Keys | Action |
| ---- | ------ |
| Ctrl/⌘ + K | Search, or jump to a page |
| Alt + N | Open the Create menu |
| ? | Show keyboard shortcuts |
| Ctrl/⌘ + \ | Collapse or expand the sidebar |
| Esc | Close a dialog, drawer, menu or full-screen table |
| ↑ ↓, Enter | Move through results or a menu, open the highlighted item |

Creating a record is Alt+N, not Ctrl+N: a web page cannot take Ctrl+N from the browser.

## User preferences

What a user can set, where, and where it is kept:

| Preference | Where it is changed |
| ---------- | ------------------- |
| Colour theme, light / dark / system, text size | Palette button in the top bar, or account → Preferences |
| Language | Globe button, or Preferences |
| Table density | Any table's toolbar, or Preferences |
| Sidebar width, collapsed or expanded | Drag the edge; the toggle in the top bar |
| Table columns: shown, order, width | Each table's Columns button; drag a column edge |
| Dashboard: widgets shown, order, width | Dashboard → Customize |

`context/PreferencesContext.jsx` holds them. They are saved in the browser
(`localStorage`, key `crm.preferences`) so they apply before sign-in and when
the API cannot be reached, and - for a signed-in user - in their account, so
they follow them to another device:

```text
GET /api/v1/auth/preferences        the signed-in user's preferences
PUT /api/v1/auth/preferences        merges the keys sent; null resets one
```

After sign-in the account's copy wins over the browser's. Preferences never
affect permissions or data; the server only checks their shape. "Reset to
defaults" (Preferences) clears all of them.

## Tables

Every list uses `components/ui/AdvancedDataTable.jsx` (a wrapper around MUI DataGrid):

```jsx
<AdvancedDataTable
  tableId="leads"                       // names the table; its columns are saved under this
  rows={rows} columns={columns} loading={isFetching}
  {...serverPaging(params, updateParams, data?.pagination)}
  {...serverSorting(params, updateParams)}
  rowHref={(row) => `/leads/${row.id}`} // enables quick view and phone cards
  toolbar={<FilterBar activeCount={n}>…</FilterBar>}
  bulkActions={({ ids, clear }) => <LeadBulkActions ids={ids} clear={clear} />}
  emptyState={<EmptyState dense filtered={hasFilters} />}
/>
```

What the user gets:

- **Search, sort, paging** - done by the API (server-side).
- **Filters** - `FilterBar`: the search stays on the page; a Filters button
  (showing how many are in use) opens the rest in a drawer on the right, or a
  sheet from the bottom on a phone.
- **Columns** - show / hide and reorder from the Columns button; **resize** by
  dragging a column's edge. All three are saved per user and per table.
- **Density** - Compact, Standard, Comfortable; saved.
- **Full screen** - and back with the button or Esc.
- **Export** - downloads the rows shown as CSV. (Reports have their own
  CSV / Excel / PDF export, done by the server.)
- **Quick view** - the eye at the start of a row opens the record's fields in
  a drawer, with "Open full page".
- **Bulk actions** - where a page provides them, rows can be selected. Leads:
  assign, change status, delete - each shown only if the user's role allows it,
  and each lead is checked again by the API.
- **On a phone** - rows become cards (title, then label / value lines) instead
  of a wide table.
- Loading shows a skeleton; no rows shows an empty state that says whether
  nothing exists yet or a filter found nothing.

Not available: **column pinning** and drag-to-reorder of column headers. In MUI
X these belong to the paid Pro edition of the DataGrid; this app uses the free
edition. Reordering is done from the Columns panel instead.

## Dashboard

`pages/DashboardPage.jsx` defines the widgets (each with a default width);
`components/dashboard/DashboardGrid.jsx` lays them out on a 12-column grid in
the user's arrangement.

**Customize** switches to arranging mode. Each widget can then be:

- **moved** - drag it by its handle, or use the earlier / later arrows;
- **resized** - drag its right edge (it snaps to columns), use the arrow keys
  on that edge, or pick Small / Medium / Large / Full width;
- **hidden** - and shown again from "Customize dashboard", which lists every widget;
- **reset** - back to the default arrangement.

The arrangement is saved with the user's preferences. A widget the user is not
allowed to see is not offered, and keeps its saved place for when it is.

Each chart card can be switched between chart and table (and, where it makes
sense, bar / donut or column / line / area), opened **full screen**, and its
rows **downloaded as CSV**. All figures come from the dashboard API.

## Building a page

```jsx
<Stack spacing={2}>
  <PageHeader title={t('pages.x.title')} subtitle={t('pages.x.subtitle')}
              actions={<Button variant="contained">{t('pages.x.new')}</Button>} />
  {error && <ErrorState error={error} onRetry={refetch} />}
  <AdvancedDataTable … />
</Stack>
```

The component library is `components/ui/` (`index.js` lists it):

| Component | Use |
| --------- | --- |
| `PageHeader`, `Breadcrumbs` | Title, subtitle, back button, actions (primary action last, top right) |
| `AdvancedDataTable`, `FilterBar`, `FilterDrawer` | Lists |
| `EmptyState`, `ErrorState`, `LoadingState`, `ErrorPage` | Nothing to show, failed to load, loading (skeletons), 401 / 403 / 404 / 500 |
| `StatusChip`, `PriorityChip` | A state with colour, icon and text |
| `ConfirmDialog`, `FormDialog` | Confirmation of dangerous actions; a form in a dialog |
| `EntityDrawer`, `QuickView` | Secondary tasks in a side panel |
| `StatCard`, `ChartCard`, `ResizableWidget` | Dashboard pieces |
| `ActivityTimeline` | A record's history |
| `AppShell`, `Sidebar`, `Topbar`, `UserMenu`, `QuickCreate`, `ThemeSelector`, `LanguageSelector`, `GlobalSearch` / `CommandPalette`, `NotificationCenter` | The shell |

Rules:

- Words come from `t()`; colours, sizes and spacing from the theme.
- Business data comes from the API - never a hardcoded name, status or figure.
- Every icon-only button has a tooltip and an `aria-label`.
- What a user may not do is not shown, and the API refuses it anyway.

## Responsive behaviour

| Width | Layout |
| ----- | ------ |
| ≥ 900 px (laptop, desktop) | Sidebar always visible (expanded or collapsed); tables as grids |
| 600–899 px (tablet) | Sidebar as a drawer; tables as grids, scrolling sideways only if they must |
| < 600 px (phone) | Sidebar as a drawer; tables as cards; filters in a bottom sheet; Create as a floating button |

## Accessibility

- Keyboard: everything is reachable and operable without a pointer, including
  the sidebar's resize edge, dashboard arranging, table columns and the search.
- Focus is always visible; dialogs and drawers trap and return focus (MUI).
- Icon-only buttons are labelled; status is never colour alone.
- Text and primary colours meet contrast targets in every theme and mode
  (checked by `theme.test.js`); a High Contrast theme is available.
- Motion is reduced for people who ask their system for that.

## What was checked, and how

Automated tests cover the shell's permission filtering, search and commands,
the user menu, the table (columns, order, density, full screen, selection,
empty states), the filter bar, the dashboard layout, the themes (including
contrast), the preferences and the three languages' completeness.

Screens were also opened in a real browser (Edge) and inspected at 1440×900,
768×1024 and 390×844, in light and dark, in several themes and in all three
languages - for the sign-in page, the dashboard (including arranging mode),
list pages, a detail page, the filter drawer, quick view, the theme picker and
the 404 page. Not every module's detail page and form was inspected at every
size.

## Not done in this pass

- Forms have not been regrouped into sections or steppers, and there is no
  autosave of drafts.
- `@mui/x-date-pickers` is not used; date fields are the browser's own.
- Detail pages keep their existing layout (they gained breadcrumbs and the new
  theme, not resizable panels or a redesigned timeline).
- The notification popover has no tabs (All / Unread / Mentions …); the
  Notifications page has All and Unread.
- Bulk actions exist for leads only.
- Module-specific text inside detail pages, forms and dialogs is still English
  (see I18N.md).
