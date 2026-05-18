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

## Configuration

- Settings live in `/data/config.yaml` (mounted from the `ammoledger_data` volume)
- `AL_*` environment variables override any config.yaml value (ENV always wins)
- `AL_SESSION_SECRET` alone is sufficient to start without a config.yaml file
- Full ENV reference: `docs/INSTALL.md` → Configuration Options → Environment Variable Reference
- Config template with all options and comments: `backend/config.template.yaml`

## Code Context

- Always use vexp index when available for
  file lookups and understanding the codebase
- Read relevant source files before making
  changes — don't assume structure

## Project Documentation

- Full PRD is at docs/PRD.md — read this before starting any phase
- README.md is at the root — keep it current with what has been built
- Commit docs changes in the same commit as the code changes they describe

## Build Status

Current release target: v0.3.0 (firearms + range sessions; tag from main once dev → main lands)
Last shipped public release: v0.2.3 (2026-05-09)

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

## Database Rules

- **All SQLite backup/copy operations must use `sqlite3.Connection.backup()`, not `shutil.copy*`** — WAL mode stores recent writes in a `.db-wal` sidecar that `shutil.copy2` silently misses. Applies to `trigger_backup` and `trigger_pre_import_backup`.
- **FK columns added in a migration must have their index added in the same migration** — migrations 0012/0017/0018 were shipped without FK indexes; 0021 cleaned these up. Don't repeat this pattern.
- **Use `PRAGMA optimize` for routine query planner refreshes — not bare `ANALYZE`** — `PRAGMA optimize` only re-analyzes tables with stale statistics; bare `ANALYZE` rescans everything and is slower. The `db_optimize` task and all ad-hoc pre-backup/post-import calls use `PRAGMA optimize`.
- **`db_vacuum` is opt-in only** — VACUUM needs ~2× DB size in free disk and holds an exclusive write lock. Both maintenance tasks (`db_optimize`, `db_vacuum`) have `requires_exclusive: True` to prevent overlap with backups.
- **Squash policy.** Do not squash migrations again after v0.1.9. Once public users exist, every migration that ships becomes part of someone's upgrade path. The v0.1.9 squash was a one-time pre-release cleanup.
- **JSON export coverage.** `_EXPORT_TABLES` in `routers/backup.py` is the source of truth for which tables are included in JSON export and import. When adding a new table, decide explicitly whether it belongs in the export (user data → yes; operational telemetry, short-lived tokens, or seed-managed config → no) and add a comment in the list. Forgetting is a silent data-loss bug on restore.
- **Additive JSON import has been removed (v0.2.1).** Full replace is the only restore mode. The additive path was broken-by-design for cross-installation merge: colliding user rows were skipped while their child rows still inserted, pointing at whoever held the ID on the target. Closes issue #10. A proper row-level merge (Tier C from #10) is not planned for v0.3.0 — do not re-introduce additive mode or any guidance that implies users can manually rewrite IDs to work around it.
- **JSON import schema validation** — both `/backup/import/preview` and `/backup/import/commit` reject exports whose `schema_migration` does not exactly match the current Alembic head. A TODO comment at the validation site marks where future relaxation should land once migration `0002+` ships.

## Firearms Domain Conventions (v0.3.0+)

- **Visibility helpers are per-router by design.** `_visibility_filter`, `_get_visible_*`, and `_check_write` exist as private helpers in `routers/ammo.py`, `routers/firearms.py`, and `routers/range_sessions.py`. They share a shape (admin sees all; member sees own + shared; read-only sees shared only) but operate on different models with different ownership rules — copy and adapt the pattern per new router rather than refactoring into a shared base. Cross-router imports are limited to the visibility *check* helpers (`_get_visible_box`, `_get_visible_firearm`) when one domain needs to enforce another's access rules (range sessions check both ammo box and firearm visibility per line).
- **Range sessions deduct ammo through `expenditure_log` exclusively.** When a range session line is created or PATCH'd, ammo is deducted by writing an `ExpenditureLog` row tagged with `range_session_line_id`, NOT by directly mutating `ammo_box.qty_remaining` outside the log. Reversal queries on the link to undo the deduction. Don't add a parallel deduction path for new range/firearm features — extend the existing one.
- **Firearm log mutations always recompute denormalized state.** Any insert / update / delete on `firearm_log` MUST be followed by `_recalculate_firearm_clean_state(firearm, db)` and a `db.add(firearm)` before commit. The denormalized `last_cleaned_at` and `rounds_since_clean` fields on `firearms` are derived from the full `firearm_log` history; if you skip the recalc the snapshot drifts silently. Backdated edits and deletions are the common case for drift.

## Git Rules

- Do NOT add "Co-authored-by" lines to commit messages
