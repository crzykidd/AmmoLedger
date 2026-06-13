---
name: 2026-06-12-frontend-robustness
status: done
created: 2026-06-12
model: sonnet
completed: 2026-06-13
result: All 4 items implemented. (1) Global 401 handler in client.ts + AuthContext: hard redirect via window.location.replace, exempts auth endpoints. (2) Zod refines on qty_remaining (non-negative integer), gr_oz (non-negative), cost_per_round (non-negative) in AmmoFormPanel. (3) formatBackendError threaded into BulkEditPanel, InventoryTable, QuickArchivePopover, ExpendDialog, InventoryCardList. (4) localStorage enum reads validated with allowlists in ThemeContext, AmmoPage (groupBy/sortKey/sortDir), DashboardPage (caliberView). Both npm run typecheck and npm run build pass clean.
---

# Task: Frontend robustness — session-expiry handling, validation, error surfacing

No XSS and the typecheck is clean; these are correctness/UX gaps found in the audit.

## Before you start

- Read `frontend/src/api/client.ts` (`request` ~14–22, `credentials: 'include'` ~9),
  `frontend/src/contexts/AuthContext.tsx` (only fetches `/me` once at mount),
  `frontend/src/contexts/ThemeContext.tsx` (~27,30 unvalidated `localStorage` casts),
  `frontend/src/components/inventory/AmmoFormPanel.tsx` (~73–124),
  `frontend/src/components/inventory/BulkEditPanel.tsx` (~156–158), and the other swallowed
  error handlers noted below.
- Run `cd frontend && npm run typecheck` first to confirm a clean baseline; run it again at
  the end.

## Working tree check

Run `git status --porcelain`, cross-reference the files below, ask before touching dirty
ones. This prompt file is exempt.

## What to do

1. **Global 401/403 handling** (Medium — the top frontend item). `ApiClient.request` throws
   a generic `ApiError` without inspecting status, and `AuthContext` never re-checks auth
   after mount, so an expired session leaves the user on a dead page (stale `user` in memory,
   `ProtectedRoute` still renders, every request silently fails). Make the client expose the
   HTTP status on the thrown error (if it doesn't already), and on `401` clear auth
   state / redirect to `/login` (via a global handler — e.g. React Query `onError`, or an
   auth-state reset the client can trigger). Keep it from looping on the login/`/me` calls
   themselves.
2. **Numeric validation in the ammo form** (Low). `AmmoFormPanel.tsx` types `qty_remaining`,
   `gr_oz`, `cost_per_round` as bare `z.string().optional()`; `toNum` only rejects `NaN`, so
   negative/fractional values reach the API (`qty_original` is correctly
   `z.number().int().min(1)`). Add Zod `.refine` numeric rules: non-negative, and integer
   where the field is a round count. Match the existing validation/error-display style.
3. **Surface backend errors instead of swallowing them** (Low). Several handlers show a
   static toast and discard the server detail: `BulkEditPanel.tsx:156–158`,
   `InventoryTable.tsx:317`, `QuickArchivePopover.tsx:48`, `ExpendDialog.tsx:120`,
   `InventoryCardList.tsx:62`. Route these through the existing `formatBackendError(e)`
   helper (as most other mutations already do) so the user sees which field/value was
   rejected.
4. **Validate `localStorage`/enum reads** (Low). `ThemeContext.tsx:27,30` and
   `AmmoPage.tsx:203,208,211` (group-by / sort-key / sort-dir), plus
   `dashboard_caliber_view` / `dashboard_stats_scope`, cast `localStorage` strings to enums
   with no membership check — a stale value after an enum rename becomes live invalid state
   (theme falls through and is applied as a CSS class). Add an allowlist check on read with a
   fallback to the default. (The JSON-based parsers in `FirearmsListPage.tsx:66–75`,
   `types/index.ts:107`, and `QuickExpendPopover` are already try/catch-guarded — leave
   them.)

## Conventions to honor

- Match surrounding component idioms (the `cn()` helper, existing toast/error patterns,
  Zod schema style). Don't introduce new state libraries.
- `npm run typecheck` must stay clean. Add a CHANGELOG `[Unreleased]` **Fixed** entry for
  the session-expiry handling.

## When done

Per `prompts/TEMPLATE.md`: update frontmatter, `git mv` to `done/`/`failed/`, record any
non-obvious decision in `docs/decisions.md`, and (spawned agent) prepare the tree and report
the proposed ONE commit back — no commit, no push. Suggested message:
`fix: handle session expiry, validate ammo-form numbers, surface backend errors`.
