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
- Phase 3 — Ammo CRUD API: NOT STARTED
- Phase 4 — Frontend basics: NOT STARTED
- Phase 5 — Dashboard: NOT STARTED
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
