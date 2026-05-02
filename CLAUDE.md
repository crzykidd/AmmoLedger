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

## Project Documentation

- Full PRD is at docs/PRD.md — read this before starting any phase
- README.md is at the root — keep it current with what has been built
- Commit docs changes in the same commit as the code changes they describe

## Build Status

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
- Phase 8 — Sidebar + UI polish: IN PROGRESS
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
- Phase 9 — Notifications: NOT STARTED
- Phase 10 — Polish + mobile optimization: NOT STARTED

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
