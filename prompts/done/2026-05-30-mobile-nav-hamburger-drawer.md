---
name: 2026-05-30-mobile-nav-hamburger-drawer
status: completed
created: 2026-05-30
model: sonnet            # opus = research/planning, sonnet = coding
completed: 2026-05-30
result: MobileNavContext + useMediaQuery + AppShell wrap + Sidebar off-canvas drawer + TopBar hamburger button; desktop layout unchanged; build passes
---

# Task: Mobile hamburger nav — off-canvas sidebar drawer (issue #52)

On small phones the always-visible sidebar eats most of the viewport, and the
`/at-range` page is nearly off-screen as a result. Make the sidebar collapse into a
hamburger-triggered off-canvas drawer below the `md` (768px) breakpoint; the desktop
layout (≥768px) stays exactly as it is. This frees full content width on phones, which
the issue author expects will also fix the At Range cramping.

GitHub issue: #52 ("Mobile mode needs some work."). Author confirmed in a comment:
"I think the range view might get fixed if we can hide the nav."

## Before you start

- Read `CLAUDE.md` (frontend stack: React + Tailwind + Vite; commit/changelog rules).
- Call `run_pipeline` first per the vexp rules — do NOT grep/glob to explore.
- Tailwind uses **default breakpoints**; `md` = 768px. No custom `screens` override.
- Key files (already located during planning):
  - `frontend/src/components/layout/AppShell.tsx` — flex row: `<Sidebar/>` + `<main>`. Used by 18 pages.
  - `frontend/src/components/layout/Sidebar.tsx` — the nav (`<aside>`, `w-60`/`w-16`, `shrink-0`).
  - `frontend/src/components/layout/TopBar.tsx` — rendered **per-page inside `<main>`**, NOT by AppShell. Used by 18 pages.
  - `frontend/src/pages/AtRangePage.tsx` — the cramped page; should need **no changes** once the nav is off-canvas (verify only).
  - `frontend/src/contexts/ThemeContext.tsx` — reference for the `window.matchMedia` pattern already used in this repo.

## Working tree check

Before making any edits, run `git status --porcelain` and cross-reference the files
this plan modifies (the four layout files + one new context/hook file). If any have
uncommitted changes, list them and ask the user before touching them. Surface
unrelated dirty files once as awareness; don't block. This prompt file is exempt.

## Why a context is needed (don't skip this)

The hamburger button belongs in `TopBar`, but the drawer open/close state and the
drawer itself live in `Sidebar`. `TopBar` and `Sidebar` are rendered in separate
subtrees (TopBar is rendered per-page inside `<main>`, Sidebar by AppShell) — they
cannot share state by props without editing all 18 pages. Use a small React context
provided by `AppShell` so neither the 18 page call sites nor the `TopBar`/`AppShell`
prop signatures change.

## What to do

1. **New file `frontend/src/components/layout/MobileNavContext.tsx`:**
   - Export a context with `{ open: boolean; openNav: () => void; closeNav: () => void; toggleNav: () => void }`.
   - Export a `MobileNavProvider` that holds the `open` state (default `false`).
   - Export a `useMobileNav()` hook that reads the context (throw or return a safe
     default if used outside the provider — match how `useAuth`/theme hooks behave in
     this repo).

2. **New hook `frontend/src/hooks/useMediaQuery.ts`** (or colocate if the repo
   prefers): `useMediaQuery(query: string): boolean` using `window.matchMedia` with an
   `addEventListener('change', …)` subscription and SSR-safe initial read. Mirror the
   `ThemeContext.tsx` matchMedia usage. This is needed so the desktop-only `collapsed`
   width logic does not hide labels inside the mobile drawer.

3. **`AppShell.tsx`:**
   - Wrap the existing flex container in `<MobileNavProvider>`.
   - No structural change to the `flex h-screen` row otherwise; Sidebar handles its own
     mobile positioning. (The backdrop is rendered by Sidebar — see step 4.)

4. **`Sidebar.tsx`:**
   - Consume `useMobileNav()` for `open` / `closeNav`.
   - Add `const isDesktop = useMediaQuery('(min-width: 768px)')`. Compute
     `const effectiveCollapsed = isDesktop && collapsed` and use `effectiveCollapsed`
     **everywhere the current `collapsed` boolean gates label rendering / widths** so the
     mobile drawer is always full-width with labels, regardless of the saved desktop
     collapse preference. Keep persisting the user's desktop `collapsed` choice as-is.
   - Make the `<aside>` responsive:
     - Mobile (default): `fixed inset-y-0 left-0 z-40` + `transition-transform`, slide
       via `-translate-x-full` (closed) / `translate-x-0` (open) driven by `open`.
     - Desktop: `md:static md:z-auto md:translate-x-0` so it returns to the normal
       in-flow `shrink-0` column with the existing collapse behavior.
     - On mobile force the expanded width (`w-60`); apply the `w-16` collapsed width
       only at `md:` (e.g. width classes gated so collapsed only narrows on desktop).
   - Render a backdrop: a `fixed inset-0 bg-black/50 z-30 md:hidden` element shown only
     when `open`, clicking it calls `closeNav()`.
   - **Auto-close on navigation:** `useEffect(() => closeNav(), [location.pathname])`
     so tapping a nav link closes the drawer on mobile. (No-op on desktop since the
     drawer isn't visible.)
   - Hide the bottom desktop **Collapse** toggle button on mobile (`hidden md:flex`) —
     collapsing makes no sense for a drawer.

5. **`TopBar.tsx`:**
   - Add a hamburger button (lucide `Menu` icon) as the first child of the header,
     `md:hidden`, that calls `toggleNav()` from `useMobileNav()`. Give it an
     `aria-label="Open navigation"` and adequate tap target (≥44px).
   - Keep the existing title/subtitle/actions layout intact at `md:`+.

6. **Verify At Range:** with the drawer closed on a narrow viewport, confirm
   `/at-range` now uses full width and the keypad / result cards are no longer clipped.
   Do NOT add page-specific width hacks unless something is still clipped after the nav
   fix — the goal is for the layout fix to resolve it.

## Conventions to honor

- Match the existing Tailwind/className idioms in `Sidebar.tsx` (uses `cn()` from
  `@/lib/utils`, dark/light variants, `border-border`, `bg-gold/20`, etc.).
- TypeScript throughout; follow the import-alias style (`@/…`).
- Accessibility: backdrop dismiss, `aria-label` on the hamburger, focus stays usable.
  Optional but nice: trap/return focus and close on `Escape` — only if low-risk.
- Per `CLAUDE.md`: this is a user-facing change → add a **Changed** (or **Fixed**)
  entry to `CHANGELOG.md` `[Unreleased]` in user-facing language, and update
  `README.md` / `docs/PRD.md` if they describe the nav/mobile behavior. Doc updates
  ship in the **same commit** as the code.
- Commit prefix: `fix:` (mobile layout bug) — or `feat:` if you frame the hamburger as
  a new feature; pick one and be consistent. No `Co-authored-by:` trailers. Work on
  `dev`. Never push to `main`.

## Test / sanity

- `cd frontend && npm run build` (and `npm run lint` if configured) must pass.
- Manually check (or use `/run`): narrow viewport (<768px) shows hamburger, drawer
  slides in/out, backdrop closes it, nav link closes it; ≥768px is byte-for-byte the
  old behavior including the collapse toggle and saved collapse preference.

## When done

1. Update this file's frontmatter: `status` (completed/failed), `completed` (date),
   `result` (one line).
2. `git mv` this file into `prompts/done/` (success) or `prompts/failed/` (failure).
3. Record any non-obvious decisions in `docs/decisions.md` (newest at top) — e.g. the
   context-over-props choice and the `md` breakpoint.
4. Propose ONE commit covering the modified files (including the prompt move). Present
   the file list + one-line message and ask `commit these as "<message>"? (y/n)`. On
   `y`, stage those specific paths and commit on `dev`. Never `git add -A`. Never push.
