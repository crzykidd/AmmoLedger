---
name: 2026-05-30-theme-mode-picker
status: completed
created: 2026-05-30
model: sonnet
completed: 2026-05-30
result: Picker placed in UserProfileDrawer (Appearance section); no-FOUC boot script added to index.html; dark mode pixel-identical, typecheck clean.
---

# Task: Add a theme mode picker UI (Light / Dark / Follow system)

The theme **engine already exists and works** — it supports Light / Dark / Follow-system,
defaults to Follow-system, persists per browser, listens for live OS theme changes, and
toggles the `dark` class. The only missing piece is that **nothing in the UI ever calls
it**: there is no picker, so a user can't change the mode. This task adds that picker and
wires it to the existing context. It is prerequisite tooling for the light-mode polish
work (#51): once a tester can switch modes on demand, the follow-up prompts can fix the
broken light-mode styling.

**Scope boundary (read first):** this prompt adds only the *picker UI* (and optionally a
no-FOUC boot script). It does **not** fix how the app looks in light mode and does **not**
re-theme components or add a design-token layer — that is the #51 follow-up. After this
lands, light mode will still look broken; that's expected. Dark mode must stay
**pixel-identical to today**.

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

## Working tree check

Before editing, run `git status --porcelain` and cross-reference the files this plan
touches. If any are already dirty, list them and ask before proceeding. Expected repo
noise to surface once (not blocking): untracked dotfiles like `.zprofile`, and possibly
`.claude/hooks/vexp-guard.sh` / `.github/copilot-instructions.md`. This prompt file is
exempt.

## Context — current theme system (verified 2026-05-30; re-read to confirm)

`frontend/src/contexts/ThemeContext.tsx` is the source of truth and is **already
complete**:

```ts
export type Theme = 'light' | 'dark' | 'system'
export type AccentColor = 'amber' | 'ranger-green' | 'steel-blue' | 'carbon-gray'
// ThemeContextType: { theme, accentColor, setTheme, setAccentColor }
const STORAGE_THEME  = 'ammologger_theme'    // note: "ammologger" + underscore
const STORAGE_ACCENT = 'ammologger_accent'
```

- `theme` defaults to `'system'` (reads `localStorage[STORAGE_THEME]`, falls back to
  `'system'`). `resolveTheme()` maps `system` → the OS preference.
- A `useEffect([theme])` toggles `document.documentElement.classList` `dark`, persists to
  localStorage, and — when `theme === 'system'` — subscribes to
  `matchMedia('(prefers-color-scheme: dark)')` `change` for live updates (with cleanup).
- `frontend/src/hooks/useTheme.ts` re-exports `useTheme` from the context (throws outside
  the provider). `frontend/src/App.tsx` already wraps the tree in `<ThemeProvider>`.
- **Nothing consumes it.** A repo-wide search found no component calling `useTheme` /
  `setTheme` / `setAccentColor`, and no "Appearance" / "Follow system" UI. So the engine
  is wired but dormant; the app effectively always runs in default `system`.
- `accentColor` exists (default `amber`) but **is not applied to anything** (no CSS reads
  it). Out of scope here — see "Follow-on".
- Why light mode is broken (NOT this task): `frontend/src/index.css` is just the three
  `@tailwind` directives and `tailwind.config.js` (`darkMode: 'class'`) only defines
  `navy`/`gold` — there is no semantic-token layer, and components hardcode dark
  utilities (`text-white`, `bg-navy*`, `border-white/*`). That's #51.
- Settings surfaces today (pick where the picker goes — see step 2):
  - `frontend/src/components/UserProfileDrawer.tsx` — the slide-out opened by the gear
    icon in `Sidebar.tsx` (`setProfileOpen`). This is the surface a user actually reaches
    from anywhere. Currently: avatar, account info, change-password form. No theme UI.
  - `frontend/src/pages/settings/ProfilePage.tsx` — a full page at route
    `/settings/profile`. ⚠️ Verify it's linked in the nav; it may only be reachable via
    the must-change-password redirect.

## What to do

1. **Picker component.** Add `frontend/src/components/ThemeModePicker.tsx` using the
   project's shadcn `Select` (`@/components/ui/select`) or a small segmented control —
   match the surrounding UI. Three options bound to `useTheme()` `theme` / `setTheme`:
   - `light` → "Light", `dark` → "Dark", `system` → "Follow system".
   - Use lucide icons `Sun` / `Moon` / `Monitor`.
   - No new state/storage — `setTheme` already persists and applies. Just call it.
2. **Surface it (per the planning decision: the settings surface).** Add an "Appearance"
   section rendering `ThemeModePicker`. **Recommended placement: the
   `UserProfileDrawer`** (it's the gear-icon surface users actually reach). If you instead
   use `ProfilePage`, confirm/add a nav link so it's reachable. Match the host's section
   styling. (The user asked for "a settings page"; the drawer is the de-facto settings
   entry point — note your final choice in the handoff `result`.)
3. **No-FOUC boot (recommended).** The theme is applied in a `useEffect` after mount, so
   a wrong-palette flash is possible on load. Add a tiny dependency-free inline
   `<script>` in `frontend/index.html` `<head>` that reads `ammologger_theme` (treating
   unset/`system` via `matchMedia`) and sets `document.documentElement.classList` before
   first paint. Keep it consistent with `resolveTheme` in the context.
4. **Docs.** CHANGELOG `### Added` under `[Unreleased]` (user-facing: "Choose Light,
   Dark, or Follow-system appearance from your profile; remembered per browser"). Add a
   `docs/PRD.md` revision-history row. State in both that full light-mode visual polish is
   tracked separately (#51) — this ships the switch, not the finished light theme.

## Conventions to honor

- Do NOT change the storage key (`ammologger_theme`), the `Theme` type, or the default
  (`system`) — the engine is correct; you're only adding UI (+ optional boot script).
- Dark mode stays pixel-identical to today; light mode is allowed to look broken.
- TypeScript strict — `npm run typecheck` clean before finishing.
- Keep the diff tight: picker component + one settings-surface edit + optional
  index.html boot script + docs. No component re-theming, no token layer, no accent UI.

## Definition of done / manual test

- Appearance picker shows Light / Dark / Follow system; the current value reflects
  `theme`; changing it takes effect immediately and persists across reload (per browser).
- Light → `.dark` removed (UI looks rough — acceptable). Dark → `.dark` applied, looks
  exactly like today. Follow system → matches OS, and flipping the OS theme live-updates
  the app without reload (already handled by the context).
- No flash of the wrong theme on initial load (if the boot script is added).
- `npm run typecheck` passes.

## When done

1. Update this file's frontmatter: `status: completed`/`failed`, `completed` date,
   one-line `result` (include where you placed the picker).
2. `git mv` this file into `prompts/done/` (success) or `prompts/failed/` (failure).
3. Record non-obvious decisions in `docs/decisions.md` (e.g. drawer vs. ProfilePage
   placement, whether you added the boot script).
4. Propose ONE commit covering the files this session modified (including the prompt
   move). Per `code-checkin-and-pr`: branch `dev`, never `main`; prefix `feat:`; no
   `Co-authored-by:`. Present the file list + one-line message and ask
   `commit these as "<message>"? (y/n)`. Stage specific paths only — never `git add -A`.
   Never push.

## Follow-on (not this prompt)

- **#51 light-mode polish:** introduce a semantic-token layer (CSS variables for
  `background`/`foreground`/`card`/`border`/`muted`/… for `:root` and `.dark`, wired into
  `tailwind.config.js`), then migrate components off hardcoded dark utilities
  (`text-white`, `bg-navy*`, `border-white/*`, `text-white/NN`) so light mode is legible.
  Sidebar/nav (the specific #51 complaint) is the top priority. Write these after manual
  testing with the new picker reveals the worst offenders.
- **Accent color:** `accentColor` is persisted but unused. A later prompt could either
  wire it into the token layer (so the 4 accents actually recolor the UI) and add an
  accent picker, or remove the dead state. Decide during the #51 token work.
