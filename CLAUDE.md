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

## Project Documentation

- Full PRD is at docs/PRD.md — read this before starting any phase
- README.md is at the root — keep it current with what has been built
- Commit docs changes in the same commit as the code changes they describe

## Build Status

- Phase 1 — Alembic + schema: COMPLETE
- Pre-Phase 2 — Data directory structure: COMPLETE
- Pre-Phase 2 — CI/CD and licensing: COMPLETE
- Phase 2 — Auth + RBAC + YAML seeds: COMPLETE
- Phase 3 — Ammo CRUD API: COMPLETE
- Schema update — product_name + clean lookup defaults: COMPLETE
- Schema update — versioned defaults sync, app_settings table: COMPLETE
- PRD update — CSV import validation spec: COMPLETE
- PRD update — label printing expanded, product_name on form: COMPLETE
- Config validation: COMPLETE
- PRD v1.1 — invitation system and password requirements: COMPLETE
- PRD v2.0 — comprehensive spec complete: COMPLETE
- PRD v2.1 — dual backup strategy documented: COMPLETE
- CHANGELOG.md created: COMPLETE
- Schema catchup — migrations 0004-0009: COMPLETE
- Config and version catchup: COMPLETE
- Infrastructure cleanup pre-Phase 4: COMPLETE
- Phase 4.1 — Frontend shell (router, auth, AppShell, login/setup pages): COMPLETE
- Phase 4.2 — Inventory page (table, cards, form panel, delete dialog, RBAC): COMPLETE
- Phase 4.3 — Expenditure logging (Log Use dialog, toast notifications): COMPLETE
- Phase 4.4 — Stock thresholds, alerts, caliber summary, settings page: COMPLETE
- Phase 4.5 — Dashboard (stats, caliber breakdown, low stock, recent activity, getting started): COMPLETE
- Phase 4.6 — User management (invites, registration, profile, admin user management): COMPLETE
- PRD v2.3 — inventory row redesign and QuickExpendPopover spec: COMPLETE
- Phase 4 — Frontend basics: IN PROGRESS
- Phase 5 — Dashboard: COMPLETE (shipped as Phase 4.5)
- Phase 6 — Backup system: NOT STARTED
- Phase 7 — User management UI: NOT STARTED

## Release Process

- Commit and push freely to `main` — GitHub Actions automatically builds and pushes
  `:dev` and `:sha-<short>` images to GHCR
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
