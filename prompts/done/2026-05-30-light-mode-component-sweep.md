---
name: 2026-05-30-light-mode-component-sweep
status: completed
created: 2026-05-30
model: sonnet            # coding-heavy sweep; token design is specced below
completed: 2026-05-30
result: >
  Implemented shadcn-style HSL token layer in index.css + tailwind.config.js.
  Fixed input.tsx, button.tsx outline/ghost, ThemeModePicker override,
  Sidebar, UserProfileDrawer, TasksPage, LoginPage, SetupPage, ResetPage,
  RegisterPage. Dark mode pixel-identical. TypeScript clean.
  accentColor (amber/ranger-green/steel-blue/carbon-gray) still persisted but unwired.
---

# Task: Make light mode legible — semantic token layer + component sweep (#51)

The Light / Dark / Follow-system picker shipped (commit `e16a776`), but **light mode is
unreadable**: components hardcode dark-only utilities (`text-white`, `bg-navy*`,
`border-white/*`, `text-gold*`), so when the `.dark` class is removed the app paints
white-on-light. Reported symptoms: the **nav/sidebar**, **Scheduled Tasks page**,
**Backup & Restore page**, **Thresholds**, and **form text generally** are all white and
invisible in light mode.

This task introduces a **semantic design-token layer** (CSS variables for `:root` and
`.dark`, wired into Tailwind) and migrates components off the hardcoded dark utilities so
**every page and every form honors the active theme in both modes**. Closes **#51**.

**Hard guarantee — dark mode stays pixel-identical to today.** The `.dark` token values
must equal the exact palette in use now (navy `#0D1821` surfaces, white text, `white/10`
borders, gold accents). You are adding a *light* palette and rewiring components to read
tokens; you are not restyling dark mode.

**Out of scope:** mobile/hamburger nav and Range-mode small-screen overflow — that's a
separate issue (**#52**), do NOT touch it here. Also out of scope: wiring up the
persisted-but-unused `accentColor` (4 accents) — note it in the handoff `result` as
remaining work; don't build the accent picker.

## Before you start

- Read `standards.md` and the operational-rules blocks in `CLAUDE.md`
  (`code-checkin-and-pr`, `vexp-context-engine`). Call `run_pipeline` first; don't
  grep/glob while the vexp daemon is healthy. **Re-read the real files before editing —
  trust the source over this prompt's summary.**
- Dev stack: `docker compose -f docker-compose.dev.yml up` (frontend on
  `http://localhost:5173`, hot-reload). The frontend container runs as the `node` user
  (uid 1000) — see `docs/decisions.md` (2026-05-30) if you hit bind-mount EACCES.
- Frontend gate: `cd frontend && npm run typecheck` (CI does not build the frontend; no
  frontend lint job exists).
- **Test in BOTH modes** using the new picker in the gear-icon profile drawer. Have the
  dev server open and flip Light ⇄ Dark on every page you touch.

## Working tree check

Before editing, run `git status --porcelain` and cross-reference the files this plan
touches. If any are already dirty, list them and ask before proceeding. Expected repo
noise to surface once (not blocking): untracked dotfiles, `vexp.toml`,
`.github/copilot-instructions.md`. This prompt file is exempt.

## Context — verified 2026-05-30 (re-read to confirm)

- `frontend/src/index.css` is **only** the three `@tailwind` directives — no `:root`, no
  variables. This is where the token layer goes.
- `frontend/src/tailwind.config.js` has `darkMode: 'class'` and `theme.extend.colors`
  defines just `navy: '#0D1821'`, `gold: '#B8962E'`, `gold-light: '#D4AF5A'`. No
  semantic colors.
- There is a shadcn-style primitive layer at `frontend/src/components/ui/`:
  `input.tsx`, `select.tsx`, `textarea.tsx`, `card.tsx`, `dialog.tsx`, `table.tsx`,
  `popover.tsx`, `sheet.tsx`, `button.tsx`, `badge.tsx`, `alert.tsx`,
  `alert-dialog.tsx`, `calendar.tsx`, `switch.tsx`, `skeleton.tsx`, `toaster.tsx`,
  `LookupCombobox.tsx`, `password-strength.tsx`. **Fixing these primitives is the
  highest-leverage step** — they propagate to every page, including all form inputs.
- Hardcoded-utility census (occurrences, ~43 files): `text-white` ×230,
  `text-white/NN` ×78, `text-gold*` ×109, `border-white/*` ×37, `bg-navy*` ×8.
- Worst offenders by count: `pages/admin/TasksPage.tsx` (39),
  `components/UserProfileDrawer.tsx` (27), `components/layout/Sidebar.tsx` (18),
  `pages/admin/BackupPage.tsx` (13), `pages/admin/LookupsPage.tsx` (9),
  `pages/ImportPage.tsx` (9), `pages/auth/LoginPage.tsx` (8) … then range/firearms/auth
  pages at 5–6 each.
- `frontend/src/components/ThemeModePicker.tsx:19` itself hardcodes
  `bg-white/5 border-white/10 text-white` — fix it too.

## What to do

### 1. Add the semantic token layer (`index.css`)

In `frontend/src/index.css`, under `@tailwind base;`, add a `@layer base` block defining
CSS custom properties on `:root` (light) and `.dark` (dark). Use the shadcn convention
(HSL triplets, e.g. `--background: 210 30% 10%;`) so values compose with Tailwind's
opacity modifiers. Define at minimum:

`--background` / `--foreground`, `--card` / `--card-foreground`,
`--popover` / `--popover-foreground`, `--muted` / `--muted-foreground`,
`--border`, `--input`, `--ring`, `--primary` / `--primary-foreground`,
`--accent` / `--accent-foreground`, `--destructive` / `--destructive-foreground`.

- **`.dark` values must reproduce today's look exactly:** `--background` = navy
  `#0D1821`, `--foreground` = white, `--card`/`--popover` = the slightly-lighter navy
  surfaces currently in use, `--border`/`--input` = today's `white/10`, `--primary` =
  gold `#B8962E`. Convert each to HSL. Pull a screenshot of dark mode BEFORE you start so
  you can diff pixel-for-pixel after.
- **`:root` (light) values** are the new palette: near-white background, dark slate
  foreground, subtle gray borders, gold (or `gold-light`) primary that reads on light.
  Aim for legible, not final-polished — but no white-on-white and no invisible borders.
- Also set a sensible base on `body` (`bg-background text-foreground`) so unstyled
  surfaces follow the theme.

### 2. Wire tokens into Tailwind (`tailwind.config.js`)

Extend `theme.extend.colors` so utilities resolve the variables, e.g.
`background: 'hsl(var(--background) / <alpha-value>)'`, and the same for `foreground`,
`card` (+ `card-foreground` via nested or `DEFAULT`/`foreground`), `popover`, `muted`,
`border`, `input`, `ring`, `primary`, `accent`, `destructive`. Keep the existing
`navy`/`gold`/`gold-light` entries (still referenced in dark token math and a few
deliberate spots). After this, `bg-background`, `text-foreground`,
`text-muted-foreground`, `border-border`, `bg-card`, `text-primary` all work.

### 3. Migrate the shared `components/ui/` primitives FIRST

Rewrite each primitive to read tokens instead of hardcoded dark utilities. This is where
the "form text is white" bug lives — prioritize `input.tsx`, `select.tsx`,
`textarea.tsx`, `LookupCombobox.tsx`, then `card.tsx`, `dialog.tsx`, `popover.tsx`,
`sheet.tsx`, `table.tsx`, `button.tsx`, `badge.tsx`, `alert.tsx`. Typical mapping:

| Hardcoded today              | Token utility                          |
|------------------------------|----------------------------------------|
| `text-white`                 | `text-foreground`                      |
| `text-white/60`–`/70`        | `text-muted-foreground`                |
| `bg-navy`, `bg-navy/…`       | `bg-background` or `bg-card` (by role) |
| `border-white/10`            | `border-border`                        |
| `bg-white/5` (input fill)    | `bg-input` / `bg-background`           |
| `text-gold`, `text-gold*`    | `text-primary`                         |
| placeholder white            | `placeholder:text-muted-foreground`    |

After the primitives, the many pages that compose them improve for free; re-test and only
then sweep the page-level hardcoded utilities.

### 4. Sweep pages — high-offender order, NOT blind find-replace

Work top-down by census: `TasksPage` → `UserProfileDrawer` → `Sidebar` →
`BackupPage` → `LookupsPage`/thresholds → `ImportPage` → auth pages
(`LoginPage`/`SetupPage`/`ResetPage`) → firearms/range pages → everything remaining
(`grep -rl 'text-white\|bg-navy\|border-white\|text-gold' src --include='*.tsx'` until the
list is empty of *theme-relevant* hits). Also fix `ThemeModePicker.tsx:19`.

**Judgment required — keep intentionally-white text white.** Some `text-white` is correct
in BOTH modes because it sits on a permanently-dark surface: `PhotoLightbox.tsx` (white
controls over the dark image overlay / `bg-black/40`), white text on a colored/`destructive`
badge or button, gold-on-navy logo lockups. Do NOT convert those to `text-foreground` —
they'd vanish on their dark backdrop. Convert only utilities whose background also changes
with the theme. When unsure, flip to light mode and look.

### 5. Verify every page in both modes

Walk these in Light and Dark, confirming text is legible, inputs show typed text + visible
borders, and dark is unchanged from the pre-work screenshots: Dashboard, Inventory
(list + Add/Edit box form + quick-expend), At-Range, Firearms list/detail, Range sessions
list/detail, Import (+ flows), Backup & Restore, Scheduled Tasks, Lookups, Thresholds /
caliber drawer, Users + invitations, Profile + the gear drawer, Login / Setup / Reset,
Help, About. Forms are the headline fix — exercise real inputs/selects/textareas.

### 6. Docs (same commit)

- `CHANGELOG.md` `### Added`/`### Fixed` under `[Unreleased]`, user-facing: e.g.
  *"Light mode is now fully legible — the sidebar, forms, and every page honor your chosen
  appearance."*
- `docs/PRD.md` revision-history row (date + one line).
- `docs/decisions.md` (newest at top): record the token-layer approach (shadcn HSL vars),
  that dark values were pinned to the prior palette for pixel-parity, and the
  intentionally-white exceptions list.

## Conventions to honor

- Do NOT change the theme engine, the storage key (`ammologger_theme`), the `Theme` type,
  or the default (`system`). UI/styling only.
- Dark mode pixel-identical — diff against pre-work screenshots before committing.
- No blind `sed`/global replace — the white-on-dark exceptions (§4) will break.
- TypeScript strict — `npm run typecheck` clean before finishing.
- Do not touch mobile/hamburger or Range small-screen layout (#52).

## Definition of done

- Every page and form is legible in Light mode; no white-on-light text, no invisible
  inputs/borders. Dark mode is visually unchanged from today.
- `grep -rn 'text-white\|bg-navy\|border-white\|text-gold' frontend/src --include='*.tsx'`
  returns only the deliberate dark-surface exceptions (each justifiable).
- `npm run typecheck` passes.
- CHANGELOG + PRD + decisions updated.

## When done

1. Update this file's frontmatter: `status: completed`/`failed`, `completed` date,
   one-line `result` (note token approach + any pages deferred + accentColor still unwired).
2. `git mv` this file into `prompts/done/` (success) or `prompts/failed/` (failure).
3. Record non-obvious decisions in `docs/decisions.md` (token system, exceptions).
4. Propose ONE commit covering the files this session modified (including the prompt
   move). Per `code-checkin-and-pr`: branch `dev`, never `main`; prefix `fix:` (or
   `feat:` if you prefer — it's user-facing legibility); no `Co-authored-by:`. Present the
   file list + one-line message and ask `commit these as "<message>"? (y/n)`. Stage
   specific paths only — never `git add -A`. Never push.

## Follow-on (not this prompt)

- **#52 mobile:** hamburger the right-side nav on small phones; fix Range mode overflowing
  off-screen on narrow viewports. Separate handoff.
- **Accent color:** `accentColor` (amber / ranger-green / steel-blue / carbon-gray) is
  persisted but unused. A later prompt can wire it into the `--primary`/`--accent` tokens
  and add an accent picker — or remove the dead state.
