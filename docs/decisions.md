# Decisions

Append-only record of non-obvious engineering decisions for AmmoLedger — approaches
chosen, alternatives rejected, and workarounds. Newest entry at the top. Part of the
[handoff-prompt-workflow](https://gitea.crzynet.com/crzynet/homelab-configs/src/branch/main/standards/handoff-prompt-workflow/README.md)
standard (see `standards.md`).

---

## 2026-07-02 — Upgraded code-checkin-and-pr to v1.2.0 (CI test suite + CodeQL SAST)

Prompt: `prompts/done/2026-07-02-upgrade-code-checkin-standard.md`

Bumped the `code-checkin-and-pr` pin 1.1.0 → 1.2.0, which adds two required PR checks on
top of the prior five: a **test suite** and **static analysis / code scanning (SAST)**.

- **Backend test suite → `test-backend` job in `ci.yml`.** The startup events fire during
  `TestClient`, and conftest only overrides the route session (not the startup engine), so
  the job replicates the CLAUDE.md local invocation: migrated file DB + `CONFIG_PATH` /
  `DEFAULTS_PATH` / `BACKUP_PATH` / `UPLOADS_PATH` / `DATABASE_URL` env vars, then
  `alembic upgrade head`, then `python -m pytest`. pytest is already in
  `backend/requirements.txt`, so no new dependency file.
- **Frontend exempt.** The frontend has no test suite (no vitest, no test files), and the
  standard exempts a repo with no suite until it adds one. The PR image-build in
  `docker-publish.yml` already proves the frontend compiles, so no standalone frontend CI
  job was added. (An optional `tsc --noEmit` typecheck job could be added later if wanted.)
- **Fixed one stale test rather than deselecting it.** `test_zip_restore_rejects_path_traversal`
  asserted the rejection detail contained `"unsafe"`, but `_sanitize_zip_entry_name` rejects
  `..` entries with `"Parent-directory escape in zip: ..."` (HTTP 400, before extraction).
  The security behaviour is correct; only the assertion was stale. Changed it to check for
  `"escape"` so the suite runs green as a required check. NB: backend deps are not installed
  in the authoring sandbox, so the suite could not be run here — the `test-backend` CI job is
  the verification.
- **SAST → CodeQL** (`.github/workflows/codeql.yml`), analyzing `python` +
  `javascript-typescript` on push/PR/weekly. The gate is that the scan completes; findings
  surface in Security → Code scanning for triage and do not fail the check, matching the
  standard. CodeQL is free on public GitHub repos. The action is pinned to the release commit
  SHA `c35d1b16…` (`codeql-bundle-v2.25.6`), matching the repo's SHA-pinning convention.
- **Branch protection is a manual follow-up.** The new `test-backend` and CodeQL analyze
  jobs must be added to `main`'s required status checks in branch protection — this needs
  repo admin and can only be done after the jobs have run at least once on a PR (GitHub only
  lets you require checks it has seen). Until then the workflows run but don't gate merges.

The per-session operational-rules snippet is unchanged 1.1.0→1.2.0, so `CLAUDE.md`'s "Code
check-in (operational rules)" block was left untouched.

## 2026-07-02 — Upgraded release-prep-and-cut to v1.1.0 (summarize-on-archive)

Prompt: `prompts/done/2026-07-02-upgrade-release-prep-standard.md`

Bumped the `release-prep-and-cut` pin 1.0.0 → 1.1.0. The only behavioural delta is the
changelog archive rule: **summarize-on-archive** replaces move-and-link. When a new
minor/major fires the archive trigger, the active `CHANGELOG.md` keeps a condensed
`## [<version>] — <date> (summary)` block (one bullet per major feature/fix + a
`[full notes](...)` deep link) in place of each archived minor, and every closed minor
still in the active file is archived in one pass. Re-implemented in
`.claude/commands/release-prep.md` (Step 3) and the two `CLAUDE.md` changelog
descriptions. The per-session operational-rules snippet is unchanged between the two
versions, so `CLAUDE.md`'s "Release process (operational rules)" block was left untouched.

- **Did not retrofit the already-archived minors.** 0.3.x / 0.2.x / 0.1.x were moved out
  wholesale under the old move-and-link rule and currently have no summary block in the
  active file. Rewriting shipped changelog history is churn with little value, so they are
  left as index links only. The new rule applies going forward — the next minor bump
  (0.5.0) will summarize 0.4.x. If a complete active-file history is ever wanted, the
  retrofit can be done as a separate docs pass.

## 2026-07-02 — De-adopted the repo-sandbox-permissions standard

The AmmoLedger working copy now lives on a dedicated dev host with a lowered risk
profile, so OS-level command confinement is no longer worth its friction. De-adopting
`repo-sandbox-permissions` (was pinned v1.0.0, local-only scope, adopted 2026-05-29).

Back-out was minimal because the standard is config-driven and was wired local-only:
- The `sandbox` block was removed from `.claude/settings.local.json`. That file is
  gitignored and untracked, so the removal is not a committed change — the remaining
  `permissions.allow` `Read(...)` entries there are unrelated manual allows, not the
  standard's `Read(**)/Edit(**)/Write(**)` globs.
- `.claude/settings.json` (the committed, team-shared file) never carried the sandbox
  block, so nothing to strip there.
- The standard ships no `CLAUDE-snippet.md`, so there was no operational-rules block in
  `CLAUDE.md` to remove (confirmed: no sandbox references in `CLAUDE.md`).
- The `.gitignore` entry for `.claude/settings.local.json` is left in place — keeping a
  personal local-settings file untracked is general hygiene, independent of this standard.
- `standards.md` row flipped to de-adopted; the 2026-05-29 adoption entry below is kept
  as history.

With the sandbox off, bash commands fall back to the normal permission prompts — the
confinement guarantee is gone, which is the accepted trade for a trusted dedicated host.
Host runtime deps (`bwrap` + `socat`) teardown is out of scope for this app repo.

## 2026-06-13 — Global 401 handler uses window.location.replace, not React Router navigate

Prompt: `prompts/done/2026-06-12-frontend-robustness.md`

- **Hard redirect chosen over React Router navigate for session-expiry 401.** `AuthProvider`
  is mounted outside `BrowserRouter` in `App.tsx`, so `useNavigate` is not available in
  `AuthContext`. Three alternatives were considered: (1) move `BrowserRouter` outside
  `AuthProvider` (restructures the tree, touches App.tsx and potentially many consumers);
  (2) thread a navigate ref from a child component back up to AuthContext via callback
  (couples a route component to the auth provider); (3) use `window.location.replace('/login')`
  directly. Option 3 was chosen: a hard redirect is appropriate for session expiry because
  the in-memory React state is stale anyway, and a full reload produces a clean slate without
  needing to carefully reset every stateful component. The performance cost (one extra page
  load) only occurs on actual session expiry, not during normal operation.

- **Auth endpoints exempted from 401 handler via prefix list.** `/auth/me`, `/auth/login`,
  `/auth/setup`, `/auth/register`, and `/auth/reset` are legitimately called when the user
  is not authenticated (initial probe, login submit, first-run, password-reset flows). Without
  the exemption, every page load by an unauthenticated user would trigger a redirect loop
  (`/me` → 401 → redirect to /login → /me again). The exempt list lives in `client.ts`
  alongside the handler so they are maintained together.

---

## 2026-06-13 — nginx static build replaces Vite dev server in production; single-ingress preserved

Prompt: `prompts/done/2026-06-12-harden-deployment-and-ci.md`

- **Static build (nginx) chosen over dev server for production.** The Vite dev server
  (`npm run dev`) ran in production with `allowedHosts: true`, disabling Vite's
  DNS-rebinding protection and exposing a dev-only code path (HMR websocket, source maps,
  unoptimised modules) to the network. The fix is a two-stage Dockerfile: a `builder` stage
  that runs `npm ci` + `npm run build` to produce `dist/`, and a `prod` stage based on
  `nginx:1.27-alpine` that serves the built bundle. The `dev` target stage preserves the
  prior Vite dev-server behaviour for `docker-compose.dev.yml`.

- **Single-ingress topology preserved (nginx proxies /api; backend stays unexposed).**
  The Vite dev proxy forwarded `/api/*` → `http://backend:8000` (stripping the `/api`
  prefix). The nginx `location /api/` block does the same with `proxy_pass
  ${AL_BACKEND_URL}/`. `AL_BACKEND_URL` is expanded at container start via nginx's
  built-in `envsubst` template support (`/etc/nginx/templates/*.template`). The backend
  has no published ports in `docker-compose.yml`; this nginx is the sole ingress point.
  An existing Traefik (or other proxy) router pointed at frontend:5173 requires no
  reconfiguration.

- **HSTS intentionally omitted from nginx.** TLS is terminated at the edge (Traefik).
  Adding `Strict-Transport-Security` in nginx would produce duplicate or contradictory
  headers if the edge also sets it, and would be wrong if the operator uses HTTP-only
  internally. HSTS belongs at the Traefik layer where TLS context is known.

- **CSP is permissive for img-src (allows https:).** The FindImageDialog component
  renders `thumbnail_url` values returned by the Brave image-search API directly in
  `<img src>`. These are arbitrary external HTTPS URLs; restricting them would break
  the Find Image feature. `img-src 'self' data: blob: https:` is the minimum that
  supports both local asset images and the image-search thumbnails. All other sources
  (`script-src`, `connect-src`, `font-src`) are restricted to `'self'`.

- **`unsafe-inline` in script-src and style-src.** The built `index.html` contains an
  inline theme-detection script (sets `dark` class before first paint to prevent flash);
  removing it would require a nonce-based CSP infrastructure not worth the complexity for
  a self-hosted SPA. Tailwind injects inline styles at runtime. Both are `'self'`-origin
  code (bundled by Vite), so the risk profile is low.

- **nginx listens on 5173, port mapping stays 5173:5173.** Rather than the nginx-default
  port 80, the production frontend serves on 5173 — the same port the previous Vite
  dev-server image used — so the *container* port is unchanged, not just the host port.
  This makes the dev-server→nginx swap fully drop-in for an upstream Traefik router
  regardless of how it discovers the service (published host port, docker-provider
  auto-detect, or an explicit `loadbalancer.server.port=5173` label). Chosen over port 80
  specifically because the operator runs Traefik and required zero proxy reconfiguration.

- **GitHub Actions pinned to commit SHAs for all jobs with `packages: write`.** Mutable
  major-version tags (`@v5`, `@v6`) could be re-pointed to malicious code by a supply-
  chain compromise. Jobs that hold `packages: write` can push to GHCR, making them the
  highest-risk targets. All six third-party actions in `docker-publish.yml` (two jobs
  with `packages: write`) and CI actions in `ci.yml` are now pinned. SHAs were resolved
  via `git ls-remote` on 2026-06-13.

---

## 2026-06-13 — firearm_photos excluded from JSON export (zip-only); import token consumed post-commit

Prompt: `prompts/done/2026-06-12-fix-data-integrity-cleanstate-and-export.md`

- **`firearm_photos` excluded from JSON export by design (comment added, not rows added).**
  A JSON backup carries no binary blobs, so exporting `firearm_photos` rows without the
  accompanying image files would create broken photo references on restore. Zip backup
  already includes the full SQLite DB (which carries all photo rows) plus the image
  directories. Adding `firearm_photos` to `_EXPORT_TABLES` would export metadata with no
  recoverable images, which is worse than having no metadata (the user would see broken
  photo thumbnails). The exclusion comment in `backup.py` now makes this explicit so a
  future reader does not treat it as an oversight.

- **`_consume_token` moved to after all `import_db` commits.**
  The token was previously consumed before the `with Session(engine)` insert block. If any
  commit in that block failed, the token was spent but no rows were written — leaving a
  dead-token state requiring manual re-validation. Moving the consume call to after the
  `with` block exits successfully ensures the token is only spent once the data is durable.
  The risk of replay (user sends same validated token twice if the response is lost) is
  mitigated by the fact that the next call would re-issue a fresh validation token via
  `/import/validate` anyway — a second `/import/confirm` with the same token would fail
  validation (`_validate_token` raises 400 if the token row is already absent).

- **`_recalculate_firearm_clean_state` added to `_apply_session_line` (not direct `+=`).**
  The apply path was the only place in the codebase that modified `rounds_since_clean`
  without going through the recalc. The direct `+= rounds_fired` is mathematically
  equivalent when no cleaning is logged, but diverges when a cleaning has been recorded:
  the recalc computes `rounds_lifetime - last_cleaning.rounds_at_event`, which is the
  source of truth. Making apply symmetric with reversal removes the only divergence path.

---

## 2026-06-12 — must_change_password server-side enforcement and constant-time token compare

Prompt: `prompts/done/2026-06-12-fix-auth-enforcement-gaps.md`

- **Enforcement added to `require_auth` (not a new dependency).** Adding a separate
  `require_auth_password_changed` dependency that callers opt into would leave gaps —
  any route using the base `require_auth` would silently bypass the gate. Enforcing in
  `require_auth` itself ensures every protected route inherits the check automatically,
  including those wrapped by `require_role`.

- **Whitelist is path-based, checked against `request.url.path`.** The three allowed
  paths (`/users/me/change-password`, `/auth/me`, `/auth/logout`) are the minimal set
  needed to complete the password-change flow without locking the user out. The
  `/auth/me` entry is required because `AuthContext.fetchMe()` polls it after the
  password change to refresh `must_change_password` back to `false`; without it the
  frontend would be unable to confirm success.

- **`secrets.compare_digest` guard uses `or ""` to coerce None to empty string.**
  `compare_digest` requires two non-None strings; the `or ""` coercion replaces the
  old `""` default so a null/missing key in `config.yaml` never reaches the digest
  call. The outer `if config_token:` guard short-circuits before `compare_digest` runs
  in that case anyway, providing defense in depth.

---

## 2026-06-12 — SSRF guard, upload caps, product read-only gate

Prompt: `prompts/done/2026-06-12-fix-ssrf-upload-limits-product-rbac.md`

- **SSRF guard placed in `backend/utils/ssrf_guard.py` as a reusable module.**
  Only the user-supplied-URL path (`preview_product_image`) needs this guard; the
  operator-controlled or hardcoded outbound callers (`image_search`, `community_sync`,
  `version_check`) were left unchanged per the prompt's explicit scope boundary.

- **Redirect re-validation uses httpx `event_hooks` on the response, not a manual
  redirect loop.** `follow_redirects=True` is kept so httpx handles the mechanics;
  the `_on_response` hook fires after each response before the follow, giving us the
  `Location` to validate without reimplementing redirect following ourselves. The hook
  raises `HTTPException(422)` which httpx propagates out of the `stream()` context.

- **Upload cap set to 10 MB for all CSV and photo uploads.**
  `firearm_photos.py` already defined `MAX_UPLOAD_BYTES = 10 MB` in its utility module;
  the same value was chosen for CSV importers so all upload paths share one consistent
  limit. The constant is defined in `importer.py` and reused via import in
  `firearms_importer.py` and `firearm_photos.py` (router).

- **`_read_upload_capped` lives in `importer.py` and is imported by the other routers.**
  It's a shared upload-read helper; placing it in `importer.py` (where `MAX_UPLOAD_BYTES`
  is already defined) avoids a new utility file for a narrow helper. `firearms_importer.py`
  already imports several helpers from `importer.py`, so this adds naturally to that pattern.

- **Product `_check_write` read-only check inserted before the owner check.**
  The `read_only` guard fires first (consistent with how ammo and firearms domains order
  their guards) so the ownership check is never evaluated for read-only users — a demoted
  user sees a clear "Read-only users cannot modify products" message rather than an
  ownership error.

---

## 2026-06-12 — Session secret / cookie hardening: boot-time config read

Prompt: `prompts/done/2026-06-12-fix-session-secret-and-cookie-hardening.md`

- **`get_config()` is called at module load to read the session secret, not inside `on_startup`.**
  `SessionMiddleware` must be attached to the ASGI app object at import time (before the startup
  event fires), so we need the secret available before `on_startup` runs. `get_config()` does a
  single file read + ENV override application without side effects (unlike `load_and_validate_config`
  which writes files, runs migrations, etc.) — safe to call at module load. Storing the resolved
  result in `_boot_config` avoids a second file read at startup.

- **`_DEFAULT_SECRET` is imported from `config.py` rather than duplicating the string literal.**
  The same constant is already used in `validate_config` to detect the placeholder. A single source
  of truth means both checks stay in sync if the default ever changes.

- **In development mode, the default/missing secret is a warning, not a fatal exit.**
  Production (`app.env: production`) raises `SystemExit(1)` so a container can never boot silently
  with a forgeable key. Development mode logs a loud warning and falls back to the placeholder so
  developers can run the app with no config without being blocked. This mirrors the existing pattern
  in `load_and_validate_config` for other config errors.

- **`https_only` is inferred from `base_url` scheme, not a separate config knob.**
  Adding yet another boolean to config was rejected as unnecessary complexity. If your public URL
  starts with `https://`, your cookies should be HTTPS-only — deriving it is always correct and
  requires no operator action.

- **CORS: dev origin is included alongside the configured base_url in non-production mode.**
  When `app.env != "production"` and a custom `base_url` is set, both the custom origin and
  `http://localhost:5173` are allowed. This lets developers point a config at a staging URL without
  breaking the local Vite dev server. In production, only the configured URL is allowed.

---

## 2026-06-04 — Backup/restore compat: implementation non-obvious calls

Implementing `docs/prd/backup-restore-compat.md` (prompt: `prompts/done/2026-06-04-backup-restore-compat.md`).

- **`JSON_RESTORE_ADDITIVE_SINCE = "0001"` uses the revision *ID*, not the filename slug.**
  Alembic stores `"0001"` in `alembic_version.version_num`; the `.py` filename slug
  (`"0001_initial_schema"`) is not a valid revision ID and would cause
  `script.get_revision()` to raise → false `not_ancestor` rejection. Constants and tests
  must use the bare IDs (`"0001"`, `"0004"`), never the slugs.

- **`_classify_schema_migration` ignores the live DB's `cur_migration` and reads the
  Alembic script head directly** (`script.get_current_head()`). The parameter exists so
  callers can log the DB state, not because the classifier uses it for comparison. This
  is intentional — the compatibility decision is "does this export fit the scripts we
  shipped?" not "does it fit whatever the running DB happens to be at?"

- **`backup_format_version` validation lives in `_parse_import_json`**, not in the
  classifier — it is a container-format check, not a schema check. An unknown format
  is a 400 from parse, not a `rejected` verdict from classification.

- **Zip `MANIFEST.json`** is written by `_backup_to_zip` and treated as informational on
  restore. The `.db` inside the zip carries all schema info via `alembic_version`; the
  manifest just gives clients an envelope-level format version without opening SQLite.

---

## 2026-06-04 — Restore compatibility is keyed on schema head, not app version

Issue #14 asked to "relax the strict `schema_migration` equality check." Investigating it
surfaced a better framing, committed as a design doc at `docs/prd/backup-restore-compat.md`
(handoff: `prompts/2026-06-04-backup-restore-compat.md`). Key decisions:

- **The restore compatibility key stays the Alembic migration head, not the app version.**
  This already delivers "any vXXX–vYYY with the same schema just works" for free — migrations
  stopped at `0004` (shipped v0.3.0), so all of v0.3.0–v0.3.10 sit at head `0004` and their
  JSON exports are already interchangeable under the existing strict check. We do NOT add an
  app-version compatibility band.
- **Replace equal-or-reject with a classification:** `clean` (equal) / `older_compatible`
  (older, ancestor-of-head, at/above a vetted additive-since floor → restore *with disclosure*
  of which tables go empty and which columns default, behind an explicit confirm) / `rejected`
  (below floor, not an ancestor, newer/descendant, or unknown). Reuses the existing
  `_classify_db_revision` graph-walk.
- **Additive-since floor is a static, vetted constant** (`JSON_RESTORE_ADDITIVE_SINCE`), not
  dynamic detection — whether a past migration was additive is not reliably introspectable.
  Policy: a new column on an *existing* table must be nullable or have a server default, or the
  migration moves the floor up to itself.
- **Add `backup_format_version`** to the container, decoupled from `schema_migration`, so the
  file envelope/zip layout can evolve independently of the DB schema.
- **The `.db`/`.zip` snapshot restore (which already auto-migrates a `behind` backup to head)
  is the recommended path for crossing schema versions;** JSON restore discloses-and-defaults.
- Rejected: closing #14 as won't-fix, and JSON cross-installation row-level merge (issue #10 —
  no safe answer). #14 stays open, repointed at the design doc, closed when the work lands.

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
