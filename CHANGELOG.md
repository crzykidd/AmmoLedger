# Changelog

<!-- markdownlint-disable MD024 -->

All notable changes to AmmoLedger are documented here.  
Format: [Keep a Changelog](https://keepachangelog.com)  
Versioning: [Semantic Versioning](https://semver.org)

---

## [Unreleased]

### Changed

- README now displays logo and badges at top of page

### Fixed

- Removed unused `require_auth` import in `expenditure.py` that caused ruff lint failure in CI
- Replaced `alembic check` in CI with `alembic heads` + `alembic current` to avoid SQLite/SQLModel TEXT vs AutoString false positives
- Updated `actions/setup-python` from v5 to v6 in CI workflow

### Added

- `legacy_id` field on ammo boxes for import compatibility with existing tracking systems
- Split box tracking fields: `split_from_id`, `is_archived`, `archive_reason`
- Expenditure log `log_type` field (expend / split / adjust) and `related_ids` for split audit trails
- Invitations table for token-based user registration
- Password history table for reuse prevention
- Notifications table for in-app and channel-based alerts
- Database indexes for search and filter performance (sub-200ms at 10,000 records)
- `show_archived` query param on `GET /ammo` to include archived boxes
- `search` query param on `GET /ammo` for combined product_name + legacy_id partial match
- `version.py` as single source of truth for app version (`0.1.0`)
- Version logged on startup (`AmmoLedger v0.1.0 starting...`)
- Current version stored in app_settings on every startup; upgrade detected and logged
- Extended `config.yaml` with security (registration mode, invite expiry, password policy), notification (Discord webhook, email, low-stock threshold) settings
- Config validation for all new settings (URL format, registration enum, password policy integers)
- Docker health checks on backend (`GET /health`) and frontend services
- `VERSION` build arg baked into Docker images; exposed as `APP_VERSION` env var
- Image cleanup jobs in GitHub Actions after each push (keeps 5 untagged versions minimum)
- YAML validation step in CI pipeline for `defaults.yaml` and `config.template.yaml`
- Alembic migration consistency check in CI pipeline
- `GET /system/health` endpoint with database connectivity check (no auth required)
- `GET /system/version` endpoint returning current and latest version info
- `data/backups/` and `data/uploads/` directories tracked via `.gitkeep` files
- `.dockerignore` at repo root to reduce image build context
- `docs/INSTALL.md` quick-start installation guide

### Changed

- README restructured to separate end user and developer instructions
- Added one-line Docker Compose pull install method for end users
- Added upgrade instructions and backup folder explanation to README

### Security

- Docker containers now run as non-root user (`appuser`)
- Ports bound to `127.0.0.1` in `docker-compose.yml` — not exposed on all interfaces
- `SESSION_SECRET` reads from environment variable with a dev-only default

---

## [0.1.0] - 2026-04-25

### Added

- Initial project structure with Docker Compose
- FastAPI backend with SQLite database via SQLModel
- Alembic database migrations with automatic startup apply
- Full data model: users, ammo_box, expenditure_log, storage, and all lookup tables
- Session-based authentication with bcrypt password hashing
- RBAC with Admin, Member, and Read-Only roles
- Ammo inventory CRUD API with shared/private ownership model
- Expenditure logging with round deduction and user attribution
- Lookup table API for calibers, manufacturers, types, categories, dealers, containers, locations
- Versioned YAML seed data with smart case-insensitive sync
- App settings table for persistent application state
- Config validation on startup with dev vs production mode behavior
- GitHub Actions CI/CD with GHCR 3-tier image publishing
- MIT License
