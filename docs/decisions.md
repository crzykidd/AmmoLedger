# Decisions

Append-only record of non-obvious engineering decisions for AmmoLedger — approaches
chosen, alternatives rejected, and workarounds. Newest entry at the top. Part of the
[handoff-prompt-workflow](https://gitea.crzynet.com/crzynet/homelab-configs/src/branch/main/standards/handoff-prompt-workflow/README.md)
standard (see `standards.md`).

---

## 2026-06-03 — PRD §2 Version Roadmap uses a Shipped/Planned Status column

The §2 table previously labelled every feature with fictional `v1.0` / `v2.0` / `v3.0`
milestones that never mapped to a real release — the project actually shipped
`v0.1.9 → v0.3.10`. During the v0.3.10 docs true-up the `Version` column was renamed to
`Status` and rewritten as `Shipped (<version>)` / `Planned`: the core auth/ammo/backup
set is `Shipped (v0.1.9)` (the first public release that bundled them), Split Box /
Restock / Firearms Registry / Range Sessions / Cleaning Reminders are `Shipped (v0.3.0)`,
and unbuilt items (Notifications, Label Printing, Target Photo Uploads, Session Sharing,
Reporting, Cost Analytics, Accessories Module) are `Planned`. Chosen over preserving the
old milestone labels because they read as release tags that never existed; "shipped vs
planned" is the only distinction the roadmap can state faithfully. Cross-checked against
the §10.1/§10.2/§10.3 "(v0.3.0 — shipped)" headings and §10.8 Deferred.

---

## 2026-06-01 — De-adopted the vexp-context-engine standard

vexp is being sunset homelab-wide (the `vexp-context-engine` standard is now deprecated at
v3.0.0 and rewritten as a removal guide). It wired the repo so an agent preferred its
graph-RAG context engine over `grep`/`glob`/`cat`, behind a `PreToolUse` guard hook — but
in practice the standing tax (Ansible-provisioned host install, a guard that fought the
agent's normal tools, a per-host verification pass) outweighed the context-quality win.

De-adoption (not migration — vexp rules were not replaced with anything): removed the
`.claude/hooks/vexp-guard.sh` guard, the `mcp__vexp__*` allows and `PreToolUse` entry from
`.claude/settings.json`, the "Context search (operational rules)" CLAUDE-snippet from
`CLAUDE.md`, the vexp ignore block + `!.claude/hooks/` un-ignore from `.gitignore`, and the
`.vexpignore` / `.vexp/` / `vexp.toml` index+config artifacts. `standards.md` row flipped to
sunset. Code-context search reverts to ripgrep + Read (the "Code Context" / "Where things
live" map in `CLAUDE.md` already covers this).

Host teardown is deliberately **not** done from this app repo — the dev-host vexp install
(`vexp-cli`, `~/.local/share/vexp`, the `vexp.service` user unit + CUDA drop-in) is removed
by the `ansible` `devworkstation` role's opt-in `--tags vexp_teardown` task, kept out of the
default play so a routine run never uninstalls vexp mid-session.

## 2026-05-31 — CLAUDE.md orientation sections; test-invocation correction

### `models.py` as the schema authority

Pointed agents at `models.py` as the single source of truth for the data model (all ~37
SQLModel tables and their FKs). A separate data-model doc was rejected: it would
immediately drift against migrations and add maintenance overhead for zero gain — the file
itself is readable and already authoritative.

### Test command: startup events fire inside TestClient

Documenting `cd backend && python -m pytest` as the test invocation (the conftest.py
header says "no startup events") and sanity-running it surfaced a real discrepancy:
`TestClient` as a context manager (`with TestClient(app) as c`) does fire FastAPI
startup events. The startup hook writes to `/data/.write_test` and queries `app_settings`
on the real `DATABASE_URL` engine — neither exists in a bare shell. The correct
invocation requires a migrated file DB and data-dir env vars (see the auto-memory note
and the updated `## Run / Test / Migrate / Lint` section). The conftest comment is
aspirationally wrong; corrected in CLAUDE.md rather than in conftest to avoid silently
misleading agents on CI behavior.

## 2026-05-31 — Split `backend/schemas.py` into a per-domain `schemas/` package

### Why

`backend/schemas.py` had grown to 1,417 LOC / 102 Pydantic classes in one file, so every
backend task that touched any schema pulled the whole module into context. Split into
`backend/schemas/` (a `_base` module + 8 per-domain modules + a re-exporting `__init__`)
to cut the per-task token footprint (context-engine ROI audit). Pure restructuring — no
field, validator, config, or behavioral change. Classes were copied verbatim; only file
location changed.

### Drop-in contract — `from schemas import X` must keep working

`__init__.py` star-imports all 8 domain modules, each of which declares an explicit
`__all__` of its public class names. The package `__all__` is the union. Every existing
`from schemas import <Class>` resolves unchanged.

### Re-exported the incidental stdlib/typing/pydantic leaks (deliberate)

The old flat module leaked 11 non-class names into its namespace (`json`, `re`, `date`,
`datetime`, `List`, `Optional`, `BaseModel`, `ConfigDict`, `field_validator`,
`model_serializer`, plus `annotations` from the future-import). Nothing in the codebase
imports them *from* `schemas`, but to keep `dir(schemas)` a strict superset of the old
public surface we re-export them from `__init__` (listed in `__all__`, marked `# noqa`).
Exact bit-for-bit `dir()` parity is impossible — importing the 8 submodules binds their
names as package attributes — so the accepted contract is "every old public name still
present" (verified: 0 missing; the only additions are the 8 submodule names).

### `_validate_mfr_types` is re-exported but kept out of `__all__`

`routers/lookups.py` does `from schemas import _validate_mfr_types` (a private helper).
Star-import won't carry a `_`-prefixed name, so `__init__` imports it explicitly
(`from .lookups import _validate_mfr_types  # noqa`) to preserve that one consumer,
without adding it to the public `__all__`.

### `_Date` alias stays in `_base`

The `_Date = date` alias (and its comment) moves to `_base` and is imported by
`schemas/range.py` for `RangeSessionUpdate.date` — it works around PEP-563 annotation
shadowing when a field is literally named `date`. Other date-typed fields use plain
`date`; only a field *named* `date` with a default needs the alias.

### Verification

Public-API parity (all old names present), `import main` smoke, `ruff 0.4.4` clean, and
the backend pytest suite (221 passed; the lone failure is the pre-existing
`test_zip_restore_rejects_path_traversal` stale-assertion, unrelated to this change).

---

## 2026-05-30 — Mobile hamburger nav drawer (#52)

### Context over props for cross-subtree state

`TopBar` (rendered per-page inside `<main>`) and `Sidebar` (rendered by `AppShell`) are
in separate React subtrees. Wiring open/close state via props would require touching all
18 page call sites. Instead a `MobileNavProvider` is added to `AppShell` — both
`TopBar` and `Sidebar` consume `useMobileNav()`. No page call sites change.

### `effectiveCollapsed` vs raw `collapsed`

The user's desktop collapse preference is stored in localStorage. On mobile the drawer
must always render full-width with labels regardless. Rather than ignoring the stored value,
`effectiveCollapsed = isDesktop && collapsed` is computed: the preference is preserved for
desktop but silently ignored on mobile. When the user resizes back to desktop, their
preference is still intact.

### `md` breakpoint = 768 px (Tailwind default, no custom override)

The same breakpoint already used throughout the app. No custom `screens` config.

### Collapse toggle hidden on mobile (`hidden md:flex`)

The toggle button collapses the desktop sidebar to an icon strip. That concept doesn't
apply to a slide-in drawer (it would collapse to nothing). Hidden on mobile; desktop
behavior unchanged.

---

## 2026-05-30 — Light mode: semantic token layer + component sweep (#51)

### Token layer approach

Used the shadcn-style HSL triplet convention — CSS custom properties as bare HSL values
(e.g. `--background: 207 43% 9%`) so Tailwind's `/ <alpha-value>` opacity modifier composes
with them. Properties defined on `:root` (light) and `.dark`, wired into `tailwind.config.js`
`theme.extend.colors`. New utilities: `bg-background`, `text-foreground`, `bg-card`,
`text-muted-foreground`, `border-border`, `bg-muted`, `text-primary`, etc.

### Dark mode pinning

The `.dark` token values were pinned to the exact current palette for pixel-parity:
`--background: 207 43% 9%` (navy `#0D1821`), `--foreground: 0 0% 100%` (white),
`--card: 207 28% 14%` (white/5 on navy), `--border: 207 20% 18%` (white/10 on navy),
`--muted-foreground: 0 0% 60%` (white/60), `--primary: 45 60% 45%` (gold `#B8962E`).

### Intentionally-white exceptions (do not convert)

These `text-white` usages must stay white because they sit on permanently-dark surfaces:
- `PhotoLightbox.tsx` — white controls on `bg-black/40` dark overlay behind photos
- `UserProfileDrawer.tsx` avatar initials — white text inside `bg-gold` circle
- `Sidebar.tsx` pending-datasets badge — `bg-amber-500 text-white`
- Any `bg-red-*`, `bg-amber-*`, `bg-green-*`, or other solid colored button — white on color
- `toaster.tsx` destructive toast — `bg-red-600 text-white`
- `FirearmPhotoManager.tsx` drag handle — positioned absolutely over photo, `drop-shadow`

### Sidebar / drawer / auth page approach

- Sidebar: `bg-white dark:bg-navy` with token-based text/border. Light = white sidebar with
  dark text; dark = navy sidebar pixel-identical to before. Conditional logos:
  `logo-full-light.png` in light mode, `logo-full-dark.png` in dark mode.
- UserProfileDrawer: `bg-card` (dark = slightly lighter navy; light = white) with token text.
  Removed inline Input overrides that were dark-only; Input component defaults handle both modes.
- Auth pages (Login/Setup/Reset/Register): `bg-background` replaces `bg-navy`; the token
  resolves to navy in dark mode (identical visual) and near-white in light mode.
  Conditional logo rendering throughout.

### Remaining work (not in this PR)

- `accentColor` (`amber` / `ranger-green` / `steel-blue` / `carbon-gray`) is persisted in
  localStorage but nothing reads it. A later PR can wire it into `--primary`/`--accent` tokens
  and add an accent picker UI.

---

## 2026-05-30 — Theme mode picker: implementation choices

- **Picker placed in `UserProfileDrawer`** (gear-icon surface in sidebar footer). `ProfilePage` at `/settings/profile` exists but has no persistent nav link — it is only reachable via the must-change-password redirect — so the drawer is the only surface users reliably reach. Confirms the planning recommendation in the preceding entry.
- **No-FOUC boot script added** to `frontend/index.html` `<head>`. The theme context applies `dark` in a post-mount `useEffect`; without the script a `system`-mode user on a dark OS sees a brief white flash. The inline script reads `ammologger_theme` from `localStorage`, checks `matchMedia` for `system`, and sets `classList` before first paint — consistent with `resolveTheme()` in `ThemeContext.tsx`.

---

## 2026-05-30 — Light-mode strategy: picker first, then component sweeps (#51)

Planning decision for fixing the broken light mode (#51). Verified current state
(2026-05-30): the theme **engine is already complete** in `src/contexts/ThemeContext.tsx`
(consumed via `src/hooks/useTheme.ts`, mounted in `App.tsx`). It defines
`type Theme = 'light' | 'dark' | 'system'`, **defaults to `system`**, persists per
browser under localStorage key **`ammologger_theme`** (legacy name, underscore), resolves
`system` via `matchMedia`, **subscribes to live OS theme changes** (with cleanup), and
toggles the `dark` class on `document.documentElement`. It also carries an unused
`accentColor` (default `amber`, key `ammologger_accent`) that no CSS reads. **But nothing
in the UI consumes the context** — a repo-wide search found zero `useTheme`/`setTheme`
callers and no "Appearance"/"Follow system" control — so the engine is wired but dormant
and the app always runs in default `system`. Separately, there is **no semantic-token
layer**: `index.css` is just the three `@tailwind` directives and `tailwind.config.js`
(`darkMode: 'class'`) only defines `navy`/`gold`/`gold-light`; components hardcode dark
utilities (`text-white`, `bg-navy*`, `border-white/*`). So #51 is really two problems:
(a) no picker UI, and (b) no token layer, so light mode is illegible.

- **Chosen sequencing:** ship the **picker UI first**
  (`prompts/2026-05-30-theme-mode-picker.md`) — a Light/Dark/Follow-system control wired
  to the existing `setTheme`, surfaced in the settings UI (the gear-icon
  `UserProfileDrawer` is the de-facto settings surface; `ProfilePage` at
  `/settings/profile` exists but may not be nav-linked). Only then write the
  component-restyle prompts. Rationale: you cannot iterate on light-mode fixes without a
  way to switch into light mode on demand; the picker is test tooling that unblocks
  everything else.
- **Add UI only — do not touch the engine:** the provider, `system` mode, default, live
  listener, storage key, and `.dark` toggle all already work. The prompt adds a picker
  (and an optional no-FOUC boot script, since the theme currently applies in a
  post-mount `useEffect`); it must not change `Theme`, the default, or the storage key.
- **Per-browser, not per-account:** appearance stays the existing localStorage preference
  (`ammologger_theme`); no backend, no user-row column, no migration.
- **Strict scope split:** the picker prompt keeps dark mode pixel-identical and is
  forbidden from re-theming components; light mode is allowed to look broken after it
  lands. The actual restyle — establishing semantic tokens and migrating hardcoded dark
  utilities, sidebar/nav first per the #51 report — is deferred to follow-up prompts
  written after manual testing reveals the worst offenders. The dormant `accentColor` is
  decided during that token work (wire it up + add an accent picker, or remove it).
- **Rejected — fix styling and add the picker in one pass:** too large to review safely
  and you'd be restyling blind. Splitting gives a small, verifiable first PR and a
  tester-driven punch list for the rest.

> Process note: earlier drafts of this entry and the prompt were written from corrupted
> tool reads that fabricated file contents (variously claimed no provider existed, a
> token layer that isn't there, and that `system` mode / the live listener were missing).
> Corrected against clean, self-consistent re-reads of the actual source before
> committing.

## 2026-05-30 — Dev frontend container runs as the `node` user (uid 1000)

`Dockerfile.frontend` created a custom `appuser` via `adduser`, which landed on **uid
1001** because the `node:20-slim` base image already occupies uid 1000. In dev,
`docker-compose.dev.yml` bind-mounts `./frontend:/app`, so `/app`'s ownership is the
host directory's (uid 1000 / the project-wide PUID default), not the image's. The
build-time `chown appuser /app` is masked by the mount. Result: `appuser` (1001) could
not write Vite's `vite.config.ts.timestamp-*.mjs` temp file into the bind-mounted
`/app`, and the dev server crash-looped with `EACCES`.

- **Chosen:** reuse the base image's built-in `node` user (uid/gid 1000) — `USER node`
  and `chown node:node` on `/app`, `/app/node_modules`, `/app/node_modules/.vite`. uid
  1000 matches the typical host developer and the PUID/PGID=1000 default used elsewhere
  in this project, so the container can write the bind-mounted dir.
- **Rejected — compose `user: "1000:1000"` override only:** fixes the `/app` write but
  the anonymous `node_modules` volume (pre-chowned to appuser 1001 in the image) still
  rejects the `.vite` cache write — just moves the EACCES. The Dockerfile fix makes the
  volume node-owned at the source.
- **Operational note:** because the `node_modules` anonymous volume persists across
  recreates, applying this needs `docker compose -f docker-compose.dev.yml up -d --build
  --renew-anon-volumes frontend` once so the volume re-initializes from the new image.
- **Portability caveat:** this assumes the dev host user is uid 1000. A fully
  host-agnostic version would use a PUID/PGID gosu entrypoint like the backend; deferred
  as out of scope. Dockerfile.frontend is the dev image only (CMD `npm run dev`); prod
  ships prebuilt GHCR images, so this doesn't affect production.

## 2026-05-29 — Scheduled-job timezone via `app.timezone` (#43)

Daily task/backup schedules (`interval_value` `"HH:MM"`) were fired by an
`APScheduler.BackgroundScheduler()` with no explicit timezone, so they ran in the
container's local zone (UTC). The Tasks UI then converted that to the *browser's* zone
for display but left the edit field expecting the raw UTC value — display and edit
disagreed.

- **Chosen:** a single `app.timezone` config key (env `AL_TIMEZONE`, default `TZ` env →
  `UTC`) passed to `BackgroundScheduler(timezone=ZoneInfo(...))`. One zone governs every
  cron job (tasks *and* `scheduled_backup`). The frontend learns it from a new
  `timezone` field on `/system/version` and shows/accepts daily times in that zone,
  labelled — so display and edit finally agree.
- **`next_run_at` stored as naive UTC** (`_to_utc_naive()` converts the aware run-time
  before stripping tzinfo) rather than naive-in-scheduler-zone. Keeps it an absolute
  instant consistent with the app's other naive-UTC timestamps; a no-op when the zone is
  UTC, correct when it isn't.
- **Rejected — rely on the Docker `TZ` env alone:** `tzlocal` would pick it up for
  APScheduler, but the frontend still needs the value to label/parse, and a first-class
  config key is overrideable independently of the OS and validated (IANA name) by
  `validate_config`. `TZ` is honored as the default source, not the only lever.
- **Default stays `UTC`** so existing deployments are behavior-identical; honoring a
  local zone is opt-in.
- **Not addressed (pre-existing, out of scope):** the frontend parses naive-UTC
  timestamp strings with `new Date(...)`, which treats them as browser-local. Relative
  displays ("in 5 hours") are tolerant of this; a proper app-wide UTC-parse convention
  is a separate change.

## 2026-05-29 — Adopted four crzynet standards

Formalized adoption of `code-checkin-and-pr` (v1.1.0), `release-prep-and-cut` (v1.0.0),
`handoff-prompt-workflow` (v1.5.0), and `repo-sandbox-permissions` (v1.0.0), joining the
already-pinned `vexp-context-engine` (v1.0.1).

- **code-checkin-and-pr** was de-facto present in prose; CI already implements all five
  required checks (the PR-only image-build verification lives in `docker-publish.yml`,
  not `ci.yml`) plus the registry-retention policy. No CI changes were needed — only the
  verbatim `CLAUDE-snippet.md` paste and formalization in `standards.md`.
- **repo-sandbox-permissions** adopted at **local-only** scope: the sandbox block lives
  in `.claude/settings.local.json` (already gitignored), not the committed
  `.claude/settings.json`. Stack registries wired for Python + Node (this is a
  FastAPI + React repo).
