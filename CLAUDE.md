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

Current release: v0.1.9 (2026-05-05)

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
- **Additive JSON import is gated behind an informational warning modal in the UI.** The mode itself is broken-by-design for cross-installation merge (foreign keys are not remapped, primary key collisions silently skip). The modal warns users off the dangerous path. Do not remove or weaken the modal until the v0.3.0 merge rework lands. Do not add "next available ID" hints or any guidance that suggests users can manually rewrite the JSON — that path leads to silent data corruption.

## Git Rules

- Do NOT add "Co-authored-by" lines to commit messages
