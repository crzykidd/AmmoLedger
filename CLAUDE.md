# AmmoLedger — Claude Code Instructions

## Always

- After any change that affects architecture, dependencies, or
  configuration, update docs/PRD.md and README.md accordingly
- After completing a phase, update README.md with what has been built
- Never leave PRD or README out of sync with the codebase

## Commit style

- feat: new feature
- chore: config, tooling, maintenance
- fix: bug fix
- docs: documentation only changes

## Stack

- Backend: Python + FastAPI + SQLModel + Alembic
- Frontend: React + Tailwind + Vite
- Database: SQLite
- Container: Docker Compose
  - `docker-compose.yml` — production (GHCR images, named volume)
  - `docker-compose.dev.yml` — development (build from source, volume mounts for live reload)

## Where things live

Backend (`backend/`, flat package — run with `backend/` on `sys.path`, imports are
bare like `from models import X`, never `from backend.models`):
- `main.py` — FastAPI app, startup/shutdown, router registration, `/system/*` endpoints
- `models.py` — **the data-model source of truth.** All SQLModel table definitions
  (~37 tables) and their FKs live here. To understand the schema, read this file — do
  not maintain a separate schema doc (it would go stale against migrations).
- `schemas/` — Pydantic API-contract schemas, split per domain (see convention below)
- `routers/` — HTTP endpoints, one module per domain (ammo, firearms, backup, lookups,
  range_sessions, products, importer, …). Visibility/`_check_write` helpers are
  per-router by design (see Firearms Domain Conventions).
- `utils/` — cross-cutting services (config, logging, rbac, scheduler, seeds,
  version_check, community_sync, image_search)
- `database.py` — engine, session, migrations runner, WAL pragma listener, stat-heal
- `migrations/versions/` — active Alembic chain (starts at the v0.1.9 squash);
  `migrations/archive/` is pre-squash reference only, NOT in the chain. Don't read
  archive/ unless investigating pre-release history.

Frontend (`frontend/src/`):
- `pages/` — route-level screens (one per URL); `components/` — reusable pieces grouped
  by domain (inventory, firearms, range, …); `lib/utils.ts` — the `cn()` helper imported
  almost everywhere; `types/index.ts` — shared TS types; `contexts/` + `hooks/` — app
  state (theme, mobile-nav)

## schemas/ package convention (v0.3.10+)

Pydantic schemas live per-domain under `backend/schemas/`, re-exported through
`schemas/__init__.py`. Two rules for agents:
- **Import from the submodule**, not a catch-all: `from schemas.ammo import AmmoBoxRead`.
  (`from schemas import AmmoBoxRead` still resolves via the re-export shim, but the
  submodule import is cheaper to read and states intent.)
- **A new schema goes in its domain module** (`schemas/ammo.py`, `schemas/firearms.py`,
  `schemas/lookups.py`, `schemas/products.py`, `schemas/range.py`, `schemas/users.py`,
  `schemas/thresholds.py`, `schemas/system.py`). Shared base (`_OrmBase`, the `_Date`
  alias, `_NAIVE_ISO_RE`) lives in `schemas/_base.py` — don't duplicate it. Do NOT
  recreate a single mega `schemas.py`; that monolith was deliberately split.

## Run / Test / Migrate / Lint

All backend commands run from `backend/`.

- **Backend tests:** startup events fire during `TestClient`, so a migrated file DB and
  data-dir env vars are required (conftest overrides the route session but not the startup
  engine). Full invocation from `backend/`:
  ```
  D="$TMPDIR/aldata" && mkdir -p "$D/backups" "$D/uploads" && rm -f "$D/app.db"
  DATABASE_URL="sqlite:///$D/app.db" alembic upgrade head
  CONFIG_PATH="$D/config.yaml" DEFAULTS_PATH="$PWD/defaults.yaml" \
    BACKUP_PATH="$D/backups" UPLOADS_PATH="$D/uploads" \
    DATABASE_URL="sqlite:///$D/app.db" python -m pytest
  ```
  (The `python -m` form puts `backend/` on the path so flat imports resolve; bare `pytest`
  from the repo root fails on `from main import app`.)
  Single file: set the same env vars, then `python -m pytest tests/test_firearms.py`.
  **Note:** `test_firearm_photos.py::test_zip_restore_rejects_path_traversal` is a
  pre-existing failure (stale assertion) — unrelated to most changes.
- **Backend lint (matches CI):** `ruff check backend/` — pinned `ruff==0.4.4`, rule set
  `E4/E7/E9/F` (see `backend/ruff.toml`).
- **Migrate to head:** `cd backend && alembic upgrade head`. Check head/current:
  `alembic heads && alembic current`. (CI does NOT run `alembic check` — SQLite +
  SQLModel emits TEXT-vs-AutoString false positives; it verifies upgrade-to-head instead.)
- **Frontend build / typecheck:** `cd frontend && npm run build` (runs `tsc -b && vite
  build`); type-only check: `npm run typecheck` (`tsc --noEmit`). Dev server: `npm run dev`.
- **Full dev stack:** `docker compose -f docker-compose.dev.yml up -d --build`.
  Validate compose (matches CI): `docker compose config --quiet`.

CI (`.github/workflows/ci.yml`) runs: backend lint, YAML validation, migrate-to-head,
and `docker compose config`. **CI does not run the test suite or frontend build** — run
those locally before opening a PR.

## Configuration

- Settings live in `/data/config.yaml` (mounted from the `ammoledger_data` volume)
- `AL_*` environment variables override any config.yaml value (ENV always wins)
- `AL_SESSION_SECRET` alone is sufficient to start without a config.yaml file
- Full ENV reference: `docs/INSTALL.md` → Configuration Options → Environment Variable Reference
- Config template with all options and comments: `backend/config.template.yaml`

## Standards

- This project adopts one or more crzynet standards. The in-repo source of truth
  for which ones (and at which pinned versions) is `standards.md` at the repo root.
- Read `standards.md` on session start whenever the work could touch anything the
  standards govern (releases, commits/PRs).

## Code Context

- Read relevant source files before making changes — don't assume structure.
- The codebase is ~170 files / ~49K LOC with a clean tree-shaped import topology;
  ripgrep + Read traverses it cheaply. Start from the "Where things live" map above.

<!--
Source: standards/code-checkin-and-pr @ v1.1.0 (crzynet/homelab-configs).
Pasted verbatim per the standard. Full why-and-how:
https://gitea.crzynet.com/crzynet/homelab-configs/src/branch/main/standards/code-checkin-and-pr/README.md
-->

## Code check-in (operational rules)

This project adopts the `code-checkin-and-pr` standard. The full why-and-how lives at
the source above; the rules below are the per-session do/don'ts a coding agent must
honor by default:

- **Never push directly to `main`.** `main` is protected. All changes land via a pull
  request from `dev` → `main`, and only when every required check is green.
- **Day-to-day work happens on `dev`** (or a short-lived branch off `dev`). Push to
  `dev` freely.
- **Commit message prefixes are required** — Conventional-Commits style:
  - `feat:` — new user-facing feature
  - `fix:` — bug fix
  - `chore:` — config, tooling, dependencies, maintenance
  - `docs:` — documentation-only changes
- **Do not add `Co-authored-by:` trailers** unless the user explicitly asks.
- **Doc updates ship in the same commit as the code they describe** — never as a
  follow-up commit.
- **Never bypass hooks** (no `--no-verify`, `--no-gpg-sign`, etc.) unless the user
  explicitly asks. If a hook fails, fix the underlying issue.
- **Stable releases are tagged from `main` only.** Don't tag from `dev`.

If you're unsure whether an action would violate one of the above, stop and ask before
acting.

<!--
Source: standards/release-prep-and-cut @ v1.0.0 (crzynet/homelab-configs).
Pasted verbatim per the standard. Full why-and-how:
https://gitea.crzynet.com/crzynet/homelab-configs/src/branch/main/standards/release-prep-and-cut/README.md
-->

## Release process (operational rules)

This project adopts the `release-prep-and-cut` standard. The full why-and-how
lives at the source above; the rules below are the per-session do/don'ts a
coding agent must honor by default:

- **The version is stored BARE in the source-of-truth file** — no `v` prefix
  anywhere in code. The `v` prefix is added in exactly one place: the git tag
  and matching GitHub release name. Don't add it to README badges, CHANGELOG
  headers, in-code image tags, or anywhere else.
- **`CHANGELOG.md` is the single source of truth for release notes.** The PR
  description (set by `/release-prep`) and the GitHub release body (set by
  `/release-cut`) reuse the **same section verbatim**. Never author release
  notes twice.
- **One commit per release prep.** Version bump + changelog roll + every doc
  sync ship in a single `chore(release): prepare v<version>` commit. No
  `Co-authored-by:` trailers.
- **Never re-tag.** If `v<version>` already exists as a local tag, a remote
  tag, or a GitHub release, STOP. Never delete-and-recreate; never `--force`.
  Pick the next version instead.
- **`/release-cut` only after the PR has merged and CI is green.** The
  publish-to-`main` workflow must have already pushed `:latest` images to the
  registry before `/release-cut` runs. If you cannot confirm both — STOP and
  tell the user to wait.
- **The release tag is the only thing the cut command writes to `main`.** Both
  the prep commit and any follow-up docs commit land on `dev` and reach `main`
  only via PR. Never push directly to `main` as part of a release.

If you're unsure whether an action would violate one of the above, stop and
ask before acting.

## Handoff prompts

This project adopts the
[`handoff-prompt-workflow`](https://gitea.crzynet.com/crzynet/homelab-configs/src/branch/main/standards/handoff-prompt-workflow/README.md)
standard (soft pointer — see `standards.md`). Scoped work that warrants a fresh session
is written as a handoff prompt in `prompts/` (start from `prompts/TEMPLATE.md`); the
live `prompts/` dir is the pending queue, and finished prompts `git mv` into
`prompts/done/` or `prompts/failed/`. Non-obvious decisions go in `docs/decisions.md`
(newest at top). Read the linked standard for the full plan → decide → execute →
document flow; don't restate it here.

## Project Documentation

- Full PRD is at docs/PRD.md — read this before starting any phase
- README.md is at the root — keep it current with what has been built
- Commit docs changes in the same commit as the code changes they describe

## Build Status

Current release target: v0.3.10 (mobile hamburger nav drawer #52; full light-mode legibility + Light/Dark/Follow-system mode picker #51; configurable app timezone for scheduled jobs #43; Read-Only CSV-import security fix #12)
Last shipped public release: v0.3.10 (2026-05-30)

> **Migration history starts at v0.1.9.** Migrations 0001–0022 were squashed into a single `0001_initial_schema.py` before the first public release. The originals are archived in `backend/migrations/archive/` for reference only — they are not part of the active migration chain. New migrations from v0.1.9 forward build incrementally on top of the squashed schema.

- Phase 1 — Alembic + schema: COMPLETE
- Phase 2 — Auth + RBAC + YAML seeds: COMPLETE
- Phase 3 — Ammo CRUD API: COMPLETE
- Phase 4 — Frontend core: COMPLETE
  - 4.1 — Login + first run setup
  - 4.2 — Dashboard
  - 4.3 — Inventory list with expandable rows
  - 4.4 — Add/edit ammo box form
  - 4.5 — Quick expend popover
  - 4.6 — User management UI
  - 4.7 — Invitations
  - 4.8 — Stock thresholds
  - 4.9 — Profile page
- Phase 5 — Backup & Restore: COMPLETE
- Phase 6 — CSV Import: COMPLETE
- Phase 7 — User management UI: COMPLETE (merged into Phase 4)
- Phase 8 — Sidebar + UI polish: COMPLETE
  - 8.1 — Full sidebar logo: COMPLETE
  - 8.2 — About page: COMPLETE
  - 8.3 — Profile slide-out drawer: COMPLETE
  - 8.4 — Getting started wizard fixes: COMPLETE
  - 8.5 — Version display: COMPLETE
  - 8.6 — Inventory Group By and column filters: COMPLETE
  - 8.7 — Three-tier threshold system, dashboard low stock by caliber/location, import ownership toggle: COMPLETE
  - 8.8 — Bulk select and edit: COMPLETE
  - 8.9 — Password reset (admin-generated links + config token self-recovery): COMPLETE
  - 8.10 — Help page with searchable FAQ and contextual HelpTip tooltips: COMPLETE
  - 8.11 — Merge invitations into Users page, remove separate Invitations page: COMPLETE
- Phase 8.12 — Product catalog with images, auto-generate, and Add Box auto-fill: COMPLETE
- Phase 8.13 — Admin Tasks page with job registry, execution history, and Run Now: COMPLETE
- Phase 8.14 — Community-maintained lookup tables synced from GitHub: COMPLETE
- Phase 8.15 — Unified threshold system — server-side caliber totals, admin-only writes: COMPLETE
- Phase 8.16 — Caliber threshold drawer, dashboard By Caliber toggle (Mix/Stock views): COMPLETE
- Phase 8.17 — Inventory UX: quick-expend Crosshair icon, archive confirmation popover with user-supplied reason, unarchive action: COMPLETE
- Phase 8.18 — At Range mode: mobile-optimized /at-range page with on-screen keypad, ±1 steppers, tap-to-expend rows; Box ID added to inventory search field selector; sidebar reorganized (Import → Settings): COMPLETE
- Phase 8.19 — Inventory UX fixes: Remaining cell is now static (Crosshair icon is sole expend trigger); ArchiveRestore icon styled amber; "Show Empty" and "Archived" checkboxes replaced by three-state Empty/Status filter dropdowns with localStorage persistence: COMPLETE
- Phase 8.20 — At Range polish: fixed-width layout (min-w-0/break-words on result cards); quick-expend preset list updated to [1, 10, 20, 30, 50] plus up to 2 session-recent counts from sessionStorage; notes field prefilled from last-submitted value across popover invocations (sessionStorage, cleared on tab close): COMPLETE
- Phase 8.21 — Import success breakdown with active/archived count + deep-link to archived view; dashboard Total Boxes stat card + Current/All scope toggle (localStorage-persisted); inventory page emptyFilter/statusFilter URL deep-link params; archive_reason="imported" for CSV-imported archived boxes: COMPLETE
- Phase 8.22 — Dev-build version check: About page compares GIT_SHA against dev branch tip via GitHub compare API; stable builds keep /releases/latest comparison; both paths cached 24h and refreshed by scheduled task and Check Now button; version-check logic consolidated in backend/utils/version_check.py: COMPLETE
- Split Box (v0.3.0): POST /ammo/{id}/split endpoint; SplitBoxDialog three-pane UI (form/preview/labeling); Group By "Split Parent"; split-aware lifetime totals (split_from_id IS NULL to prevent double-counting); labeling re-open from parent expanded-row history: COMPLETE
- Split Box P5/P6 QA fixes and UX additions: GET /ammo/split-parents endpoint; SplitParentDetailsDialog (info icon on Group By "Split Parent" headers); Sort By toolbar dropdown (6 options + asc/desc toggle, localStorage-persisted); Purchase Date + Updated Date in expanded inventory rows; child notes pre-populated "[Split YYYY-MM-DD] Split from #N"; list_ammo includes any box with children regardless of filters; SplitBoxDialog success/review panes modal-locked; preview row labels changed from "Box 1/2" to "1./2." with disclaimer; Total Boxes (lifetime) counts all records (Total Rounds/Value still root-only): COMPLETE
- Firearms P5 (v0.3.0) — cross-cutting integration: real Sessions tab on /firearms/:id with per-firearm rounds totals (powered by new `rounds_for_filter_firearm` field on `RangeSessionListItem` when `GET /range-sessions?firearm_id=` is set); Recent Range Sessions dashboard widget; Firearms Needing Service dashboard widget (overdue + due-soon, with Log Cleaning quick-action); Dashboard Quick Actions row (Log Range Day, Add Firearm, Add Ammo Box; hidden for read-only); `GET /firearms?cleaning_status=` accepts comma-separated values: COMPLETE
- Firearms P6 (v0.3.0) — closing-the-loop polish: firearms CSV export at `GET /firearms/export/csv` with Export button on Firearms list page; range sessions CSV export at `GET /range-sessions/export/csv` (denormalized, one row per line) with Export button on Range page; CHANGELOG consolidated into themed v0.3.0 release block (Added — Firearms tracking / Range sessions / Dashboard / Lookups & admin / Exports; Changed; Database migrations; Deferred); README "What's New" + Features + Roadmap + Upgrading sections updated; PRD §10.1/10.2/10.3 version annotations updated to "(v0.3.0 — shipped)" and §10.8 Deferred subsection added: COMPLETE
- Phase L1 — Legal Owners (trusts/LLCs + recurring filings): DESIGN COMMITTED — see `docs/prd/legal-owners.md`
- Phase L2 — Licenses (carry permits, NFA stamps, reciprocity): DESIGN COMMITTED — depends on L1; see `docs/prd/licenses.md`
- Phase 9 — Notifications: NOT STARTED
- Phase 10 — Polish + mobile optimization: NOT STARTED
- v0.1.9 — Migration squash (COMPLETE): 22 migrations collapsed into single initial schema; CHANGELOG split; HISTORY.md created
- v0.2.0 — DB optimization (COMPLETE, shipped in v0.1.9): WAL mode + PRAGMA config, FK indexes, N+1 fixes in products and thresholds endpoints, WAL-safe backup API, db_vacuum task (disabled by default), ANALYZE → PRAGMA optimize

## Git Workflow

- Work on `dev` branch for all changes
- Push to dev freely — builds `:dev` images
- When ready to release:
  - Create PR `dev` → `main` on GitHub
  - Merge after CI passes
  - Tag release from `main`
- Never push directly to `main`
- Do NOT add Co-authored-by to commits

## Release Process

- Push to `dev` — GitHub Actions builds and pushes `:dev` and `:sha-<short>` images to GHCR
- Push to `main` (via PR from dev) — GitHub Actions builds and pushes `:latest` and `:sha-<short>` images
- When the build is stable and ready to ship:
  1. GitHub → Releases → Draft new release
  2. Create a new tag in `v1.0.0` format
  3. Publish the release
  4. GitHub Actions builds and pushes `:latest`, `:1.0.0`, and `:1` to GHCR
- **Archive trigger (new minor only):** when cutting the first release of a new minor (e.g. `0.4.0`), before tagging: move the entire previous minor series out of `CHANGELOG.md` into a new `docs/CHANGELOG-<prev-minor>.x.md`, prepend a link in the "Archived releases" index, and confirm the active file is back to `[Unreleased]` + the new current minor. Patch releases within a minor (`0.3.6`, etc.) do **not** trigger archiving.

## URL Structure (Production Target)

- / → React frontend
- /api/ → FastAPI backend
- /api/docs → Swagger UI (FastAPI auto-generated)
- Reverse proxy handles routing — Nginx or Cloudflare Tunnel

## Documentation Updates

- Always update docs/PRD.md when architecture or features change
- Always update the Revision History table in docs/PRD.md
  with the current date and a brief description of what changed
- Always update README.md when setup or usage changes
- Include doc updates in the same commit as the code changes

## Changelog Process

- CHANGELOG.md lives at repo root
- Follow Keep a Changelog format (keepachangelog.com)
- Add entries to [Unreleased] section as features are built during each phase
- User-facing language only — describe what changed for the user
- Categories: Added, Changed, Fixed, Security, Deprecated, Removed
- On release: move [Unreleased] to new version section with today's date
- GitHub release body = that version's CHANGELOG section (single source of truth)
- In-app About page fetches release notes from GitHub Releases API
- **Rolling per-minor archive:** the active `CHANGELOG.md` holds only `[Unreleased]` plus the current minor series (e.g. all `0.3.x` while shipping any 0.3.x release).
- Each older minor series lives in `docs/CHANGELOG-<MAJOR>.<MINOR>.x.md` (one file per minor), newest-first within the file.
- The root file ends with an "Archived releases" index linking each archive; when a new archive is created, prepend a line to the index.

## Database Rules

- **All SQLite backup/copy operations must use `sqlite3.Connection.backup()`, not `shutil.copy*`** — WAL mode stores recent writes in a `.db-wal` sidecar that `shutil.copy2` silently misses. Applies to `trigger_backup` and `trigger_pre_import_backup`.
- **Never `shutil.move` a SQLite file that still has a live WAL — checkpoint + `journal_mode=DELETE` first.** A file in WAL mode keeps recent committed pages in a `-wal` sidecar; moving only the main `.db` strands those pages and leaves `sqlite_master` pointing at rootpages that no longer exist (observed: `malformed database schema (sqlite_stat1) - invalid rootpage` on the first schema-touching query, e.g. login). Masked on ext4 by rename + fsync ordering, fatal on Docker Desktop bind mounts. The helper is `_checkpoint_and_unwal()` in `backend/routers/backup.py` — it runs `PRAGMA wal_checkpoint(TRUNCATE)` then `PRAGMA journal_mode=DELETE`, leaving a single self-contained file. `_finalize_restored_db()` checkpoints both before and after stripping stats; `_assert_no_wal_sidecar()` runs immediately before each `shutil.move` as a belt-and-suspenders guard. Live-runtime DB still uses WAL — the pragma listener in `database.py` flips it back on the next app connect.
- **Never `ANALYZE` in the restore path.** Absent stats is the only state proven to boot clean on weak-fsync filesystems; SQLite regenerates `sqlite_stat1` lazily at runtime via `PRAGMA optimize`. Running `ANALYZE` immediately before a file move was the original source of the dangling-rootpage bug — it allocated fresh stat pages into the WAL that then got stranded. Applies to both restore and full-replace JSON import. Recovery procedure for an already-corrupted DB is documented in `docs/RECOVERY.md`; startup auto-repair lives in `database.heal_dangling_stats()`.
- **Never place a restored SQLite DB with `shutil.move` — use the durable-swap helper.** `shutil.move` falls back to a non-fsync copy + delete across filesystems, which on weak-fsync mounts (Docker Desktop bind mounts on Windows) leaves a partially-flushed file: the app reopens it before pages are durable and gets `database disk image is malformed`. `_durable_replace()` in `backend/routers/backup.py` stages a copy in the destination's *own* directory (guaranteed same FS), fsyncs the file, fsyncs the directory, `os.replace`s into place, then fsyncs the directory again before the caller reopens the DB. Both `_restore_sqlite_impl` and `_restore_zip_impl` use it. The photos directory `shutil.move` is left as-is (not a live SQLite DB).
- **Server-side restore reuses the single upload-restore code path.** `POST /backup/restore/server` reads bytes from disk via the existing `_backup_file_path` sanitizer/containment helper, then calls `_restore_zip_impl` / `_restore_sqlite_impl` exactly as the upload handler does. Do NOT refactor the restore impls to take a path — that would fork the security-sensitive zip-extraction logic. One restore code path, two entry points.
- **FK columns added in a migration must have their index added in the same migration** — migrations 0012/0017/0018 were shipped without FK indexes; 0021 cleaned these up. Don't repeat this pattern.
- **Use `PRAGMA optimize` for routine query planner refreshes — not bare `ANALYZE`** — `PRAGMA optimize` only re-analyzes tables with stale statistics; bare `ANALYZE` rescans everything and is slower. The `db_optimize` task and all ad-hoc pre-backup/post-import calls use `PRAGMA optimize`.
- **`db_vacuum` is opt-in only** — VACUUM needs ~2× DB size in free disk and holds an exclusive write lock. Both maintenance tasks (`db_optimize`, `db_vacuum`) have `requires_exclusive: True` to prevent overlap with backups.
- **Squash policy.** Do not squash migrations again after v0.1.9. Once public users exist, every migration that ships becomes part of someone's upgrade path. The v0.1.9 squash was a one-time pre-release cleanup.
- **JSON export coverage.** `_EXPORT_TABLES` in `routers/backup.py` is the source of truth for which tables are included in JSON export and import. When adding a new table, decide explicitly whether it belongs in the export (user data → yes; operational telemetry, short-lived tokens, or seed-managed config → no) and add a comment in the list. Forgetting is a silent data-loss bug on restore.
- **Additive JSON import has been removed (v0.2.1).** Full replace is the only restore mode. The additive path was broken-by-design for cross-installation merge: colliding user rows were skipped while their child rows still inserted, pointing at whoever held the ID on the target. Closes issue #10. A proper row-level merge (Tier C from #10) is not planned for v0.3.0 — do not re-introduce additive mode or any guidance that implies users can manually rewrite IDs to work around it.
- **JSON import schema classification** — `_classify_schema_migration()` in `routers/backup.py` replaces the old equality check. Outcomes: `clean` (exact match), `older_compatible` (known ancestor at or above `JSON_RESTORE_ADDITIVE_SINCE`), or `rejected` (newer, unknown, or below floor). Preview always returns the verdict; commit accepts `older_compatible` only with `confirm_older=True`. See `docs/prd/backup-restore-compat.md` for the full design.
- **New migrations that add a column to an existing table must make it nullable or give it a server default** — or bump `JSON_RESTORE_ADDITIVE_SINCE` (in `routers/backup.py`) to the new migration ID in the same commit. If a NOT NULL column without a default is added to an existing table, older exports can no longer be inserted and must be rejected. The floor is the oldest revision ID (e.g. `"0001"`) from which a JSON export is known additive-safe into the current head. See `docs/prd/backup-restore-compat.md §5.2`.
- **Every restore path rotates image directories to `<name>.old` snapshots before placing new contents (v0.3.8+).** Source of truth: `_IMAGE_DIR_NAMES = ("firearm_photos", "products")` in `backend/routers/backup.py` and the `_image_dir_specs() / _rotate_image_dir_to_old() / _place_or_empty() / _capture_image_snapshot_status()` helpers next to it. Zip restore moves the extracted directories into place after the durable DB swap; `.db` restore and JSON full-import create empty directories (those formats carry no image data, so leaving prior contents live would surface stray photos belonging to the previous install whenever a restored row references a matching filename). Each restore deletes the previous `.old` first — the system keeps exactly one snapshot generation, not a chain. Snapshots persist on disk until discarded via `POST /backup/restore-snapshots/discard` (the Backup page surfaces a banner for any non-empty `.old` directory via `GET /backup/restore-snapshots`). When adding a new image directory under `UPLOADS_PATH` that participates in backup/restore: append the directory name to `_IMAGE_DIR_NAMES` and the bundling + rotation flow picks it up. Do NOT add ad-hoc per-directory blanking logic to the restore impls — extending the tuple is the contract. Documented in `docs/PRD.md` §11.9.
- **Restore / import endpoints log in a uniform `actor / source / outcome` shape.** Every restore and import path (`_restore_sqlite_impl`, `_restore_zip_impl`, `import_commit`) emits start, completion, and failure log lines that carry the triggering admin's username (`actor=`), the source filename (`source=`, sanitized via `log_safe`), and either a substantive outcome on success (`restored database and N firearm photo(s)` / `imported N record(s) across M table(s)`) or `stage=<stage> | error=<exc>` on failure. The impls own all start/complete/failure logging — endpoints just pass `actor` and `source`. New restore/import entry points must follow the same shape so an aborted restore is never silent.

## Logging

- **`get_logger()` is self-healing — startup-time config does not survive uvicorn `--reload`.** Container CMD is plain `uvicorn main:app --reload` (no `--log-config`). An in-worker probe at request time proved that even after our startup hook ran, `routers.backup.disabled == True` and root had only a default `StreamHandler(stderr)` at NOTSET — uvicorn's reload worker re-applies a logging config AFTER our startup event that disables existing loggers and strips our handler. So configuring at startup alone is unreliable: the repair must run at the point loggers are obtained. `backend/utils/logging.py::get_logger()` therefore (a) ensures root has our single named `ammoledger_stdout` formatted handler exactly once via `_ensure_root_handler()`, and (b) clears `.disabled` and fixes `.propagate` on the returned logger. Idempotent and called on every fetch. `configure_logging()` (alias `setup_logging` / `reapply_logging`) additionally walks `logging.Logger.manager.loggerDict` re-enabling every existing logger and re-quiets `uvicorn.access` / `apscheduler` / `sqlalchemy.engine`. **Critical pattern for request handlers that must log reliably:** fetch the logger INSIDE the handler with `logger = get_logger(__name__)` so the repair runs in the request, not just at startup. The hot-path restore/import handlers in `backend/routers/backup.py` (`_restore_sqlite_impl`, `_restore_zip_impl`, `import_commit`) do exactly this. Do not rely on a module-level `logger = get_logger(__name__)` surviving uvicorn `--reload`, do not re-introduce a `--log-config` YAML (reload worker semantics make it unreliable), and do not paper over silent log loss with `print()`. New code: `get_logger(__name__)` and trust the self-heal.

## Firearms Domain Conventions (v0.3.0+)

- **Visibility helpers are per-router by design.** `_visibility_filter`, `_get_visible_*`, and `_check_write` exist as private helpers in `routers/ammo.py`, `routers/firearms.py`, and `routers/range_sessions.py`. They share a shape (admin sees all; member sees own + shared; read-only sees shared only) but operate on different models with different ownership rules — copy and adapt the pattern per new router rather than refactoring into a shared base. Cross-router imports are limited to the visibility *check* helpers (`_get_visible_box`, `_get_visible_firearm`) when one domain needs to enforce another's access rules (range sessions check both ammo box and firearm visibility per line).
- **Range sessions deduct ammo through `expenditure_log` exclusively.** When a range session line is created or PATCH'd, ammo is deducted by writing an `ExpenditureLog` row tagged with `range_session_line_id`, NOT by directly mutating `ammo_box.qty_remaining` outside the log. Reversal queries on the link to undo the deduction. Don't add a parallel deduction path for new range/firearm features — extend the existing one.
- **Firearm log mutations always recompute denormalized state.** Any insert / update / delete on `firearm_log` MUST be followed by `_recalculate_firearm_clean_state(firearm, db)` and a `db.add(firearm)` before commit. The denormalized `last_cleaned_at` and `rounds_since_clean` fields on `firearms` are derived from the full `firearm_log` history; if you skip the recalc the snapshot drifts silently. Backdated edits and deletions are the common case for drift.

## Git Rules

- Do NOT add "Co-authored-by" lines to commit messages
