# Changelog

All notable changes to AmmoLedger are documented here.  
Format: [Keep a Changelog](https://keepachangelog.com)  
Versioning: [Semantic Versioning](https://semver.org)

---

## [Unreleased]

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

---

<!-- markdownlint-disable MD024 -->

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
