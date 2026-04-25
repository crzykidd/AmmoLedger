# AmmoLedger — Product Requirements Document

**Version:** 1.1 — Working Draft  
**Date:** April 2026  
**Status:** In Review

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | April 2026 | Initial draft |
| 0.2 | April 2026 | Added RBAC, backup system, reverse proxy recommendations, accessories roadmap, reporting |
| 0.3 | April 2026 | Refined ownership model (shared vs private), unified model across ammo/firearms/accessories, added Alembic migration strategy |
| 0.3.1 | April 2026 | Pre-Phase 2: /data volume structure, config.yaml auto-generation on first startup, defaults.yaml YAML seed file, backup/uploads dirs |
| 0.3.2 | April 2026 | Pre-Phase 2: GitHub Actions CI/CD (ruff lint, compose validate), GHCR 3-tier image publishing (dev/sha/latest), MIT license, Node.js 24 actions |
| 0.3.3 | April 2026 | Pre-Phase 2: Pinned Docker base image versions (python:3.12.9-slim-bookworm, node:20.19.1-slim, nginx:1.27-alpine) |
| 0.3.4 | April 2026 | Phase 2: Login/logout, first-run admin setup, signed session cookies, RBAC roles (admin/member/readonly), YAML seed sync on startup |
| 0.4 | April 2026 | Phase 3: Ammo CRUD API with RBAC visibility filter, expenditure logging with round deduction, 7 lookup table routes (calibers, manufacturers, types, categories, dealers, containers, locations) |
| 0.5 | April 2026 | Added product_name field to ammo_box; expanded caliber list to 22 entries; expanded manufacturer list to 44 entries; product_name partial-match filter on GET /ammo; CSV import column spec updated |
| 0.6 | April 2026 | Versioned defaults sync system: app_settings table, version field in defaults.yaml, sync config flags (sync_on_startup, update_existing, allow_removal), smart case-insensitive upsert logic |
| 0.7 | April 2026 | Added detailed CSV import spec: two-step validation flow, fuzzy matching rules, pre-import backup requirement, import config flags |
| 0.8 | April 2026 | Expanded label printing spec — configurable fields, Avery sizes, QR code with mobile expend flow. Added product_name to add ammo form spec. |
| 0.9 | April 2026 | Added config.yaml validation spec — presence, type, value, and warning checks; dev vs production mode behavior; missing config first-run flow |
| 1.0 | April 2026 | Version milestone — all Phase 1–3 backend specs complete and committed |
| 1.1 | April 2026 | Added invitation system spec (§4.4, §6.10, §9.5 updates) and password requirements spec (§4.5, §6.11, §9.6 updates) |

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Version Roadmap](#2-version-roadmap)
3. [Ownership Model](#3-ownership-model)
4. [Authentication](#4-authentication)
5. [Multi-User Architecture & RBAC](#5-multi-user-architecture--rbac)
6. [Data Model](#6-data-model)
7. [Database Migrations](#7-database-migrations)
8. [YAML Seed Data](#8-yaml-seed-data)
9. [Feature Specifications — v1.0](#9-feature-specifications--v10)
10. [Future Feature Specifications](#10-future-feature-specifications)
11. [Database Backup](#11-database-backup)
12. [Reverse Proxy, SSL & External Access](#12-reverse-proxy-ssl--external-access)
13. [Technical Stack](#13-technical-stack)
14. [Non-Functional Requirements](#14-non-functional-requirements)
15. [Open Questions](#15-open-questions)

---

## 1. Product Overview

AmmoLedger is a self-hosted web application for tracking personal ammunition inventory. It is designed for firearm owners — individuals and families — who want accurate, private, offline-capable tracking of their ammo on and off the range, without relying on cloud services or subscriptions.

> **Goal:** Keep ammo counts accurate across purchases, storage locations, and range sessions. Your data lives on your hardware, under your control.

### 1.1 Target Users

- Individuals tracking personal ammo inventory
- Families sharing a common ammo pool while also managing personal stashes
- Hunters managing caliber-specific inventory across seasons
- Competitive shooters tracking round counts and costs per caliber

### 1.2 Design Principles

- **Self-hosted first** — runs in Docker with no external dependencies or cloud accounts
- **Private by default** — all data stays on the user's own hardware
- **Family-ready** — shared inventory model with attributed usage; every action is traceable to a person
- **Low friction** — common tasks (add ammo, log usage) take under 10 seconds
- **Extensible defaults** — calibers, manufacturers, and types ship from a YAML seed file the community can contribute to via pull request
- **Mobile-friendly** — usable at the range on a phone
- **Migration-safe** — every schema change is versioned; upgrades are automatic and reversible

---

## 2. Version Roadmap

| Feature | Description | Version |
|---------|-------------|---------|
| Authentication & First Run | Login, first-run setup, config-based password reset | v1.0 |
| Multi-User Accounts | User management UI; RBAC roles enforced from day one | v1.0 |
| RBAC — Admin / Member / Read-Only | Role-based permission enforcement on all API routes | v1.0 |
| Shared Ownership Model | is_shared flag on ammo boxes; attributed expenditure logging | v1.0 |
| Ammo Inventory | Full CRUD for ammo boxes with all tracked fields | v1.0 |
| Storage — Containers & Locations | Containers and locations; optional assignment to boxes | v1.0 |
| Round Expenditure | Quick-log rounds used; deducts from box quantity | v1.0 |
| Usage History | Timestamped log of all expenditures with user attribution | v1.0 |
| Search & Filter | Filter by caliber, container, location; live summary stats | v1.0 |
| CSV Import | Import from standardized AmmoLedger CSV template | v1.0 |
| YAML Seed Data | Lookup tables seeded from YAML; auto-synced on startup | v1.0 |
| Overview Dashboard | Stats: total rounds, caliber breakdown, value, low stock alerts | v1.0 |
| DB Backup — Manual & Nightly | Admin-triggered or scheduled backup; configurable retention; re-importable JSON | v1.0 |
| Alembic Migrations | Versioned schema migrations; automatic on startup | v1.0 |
| Firearms Registry | Track owned guns with shared/private ownership model | v2.0 |
| Range Sessions | Log sessions: gun, ammo, rounds fired, date, location | v2.0 |
| Target Photo Uploads | Attach target photos to range sessions | v2.0 |
| Session Sharing | Share range sessions with other users on the instance | v2.0 |
| Cleaning Reminders | Service intervals per firearm; dashboard alerts | v2.0 |
| Reporting | Inventory, spend, usage, and low-stock reports; PDF and CSV export | v2.0 |
| Cost Analytics | Price-per-round over time, spend by dealer, averages by caliber | v2.0 |
| Accessories Module | Track accessories; attach to firearms; shared/private ownership | v3.0 |

---

## 3. Ownership Model

This is the core design decision that shapes the entire data model. AmmoLedger uses a **shared inventory model with attributed usage** — not a multi-tenant model where each user has a fully isolated silo.

### 3.1 The Problem It Solves

A family wants to:
- Share a common pool of ammo that anyone can draw from
- Know who used what and when
- Allow individual members to also track their own personal ammo separately
- Apply the same model to firearms and accessories in v2.0+

### 3.2 The Solution — `owner_id` + `is_shared`

Every inventory entity (ammo box, firearm, accessory) has two fields that together determine visibility and access:

| Field | Type | Purpose |
|-------|------|---------|
| `owner_id` | FK → users | Who created / owns this record |
| `is_shared` | BOOLEAN | Whether the record is visible to all Members |

This produces four meaningful states:

| owner_id | is_shared | Meaning |
|----------|-----------|---------|
| Admin | true | Admin's ammo — family can see and use it |
| Admin | false | Admin's private ammo — Admin only |
| Member | true | Member's ammo — shared with the family |
| Member | false | Member's personal stash — their eyes only |

### 3.3 How It Applies Across Entities

| Entity | owner_id | is_shared | Notes |
|--------|----------|-----------|-------|
| Ammo box | creator | true/false | Shared = all Members can log expenditures against it |
| Firearm | creator | true/false | Shared = all Members can log range sessions against it |
| Accessory (v3.0) | creator | true/false | Inherits visibility from attached firearm |
| Expenditure log | logged_by user | always visible to Admin | Full audit trail regardless of box ownership |
| Range session (v2.0) | creator | configurable | Who shot, what gun, what ammo, how many rounds |

### 3.4 Audit Trail

Expenditure logs and range session logs always record `logged_by` (the user who performed the action). Admins can always see all logs regardless of who owns the parent record. A family member cannot hide usage from the Admin.

---

## 4. Authentication

### 4.1 First Run Setup

On first launch with an empty database, the app redirects to a setup screen to create the initial Admin account (username + password). After setup, the user is logged in automatically and can create additional accounts from the Admin panel.

### 4.2 Login

- Standard username/password login at the root URL (`/`)
- Session-based auth with a configurable timeout (default: 8 hours)
- Failed login attempts are rate-limited (5 attempts, then 15-minute lockout)
- Each session is scoped to the authenticated user — role is checked server-side on every request

### 4.3 Password Reset

For users who are locked out, recovery is handled via the server configuration file — no email dependency required.

```yaml
# config.yaml
reset_token: "your-secret-token-here"
```

Visit `/reset?token=your-secret-token-here` to access a password reset form. Remove the token from `config.yaml` after use. Admins can also reset any user's password from the Admin panel.

### 4.4 Invitation System

New users are added by Admin via invitation links rather than direct account creation. This avoids sharing temporary passwords out-of-band.

#### Invite flow

1. Admin navigates to **User Management → Invite User**
2. Admin selects the role the invited user will receive and optionally enters an email hint (for display only — not validated)
3. System generates a UUID invitation token and stores it in the `invitations` table with a configurable expiry (default: 72 hours)
4. Admin copies the generated invite link and sends it to the recipient however they choose (email, messaging app, etc.)
5. Recipient opens the link, sees a registration form pre-populated with the assigned role, and creates their account (username + password)
6. On registration, `used_at` and `used_by` are set on the invitation row; the user account is created and the session is started

#### Link states

| State | Condition | User-visible message |
| ------- | ----------- | ---------------------- |
| **Valid** | Token exists, `expires_at` is in the future, `used_at` is null, `is_revoked` is false | Registration form shown |
| **Expired** | `expires_at` is in the past | "This invite link has expired. Ask an Admin to send a new one." |
| **Used** | `used_at` is not null | "This invite link has already been used." |
| **Revoked** | `is_revoked` is true | "This invite link has been revoked." |

#### Registration mode

Configurable in `config.yaml` via `security.registration_mode`:

| Mode | Behavior |
| ------ | ---------- |
| `invite_only` | Only valid invite links allow registration (default) |
| `open` | Anyone can register without an invite (creates a Member account) |
| `disabled` | No new registrations — Admin creates accounts directly |

#### API endpoints

| Method | Path | Auth | Description |
| -------- | ------ | ------ | ------------- |
| `POST` | `/auth/invite` | Admin | Create an invitation; returns the invite URL |
| `GET` | `/auth/invite/{token}` | None | Validate token and return role/email_hint for the form |
| `POST` | `/auth/register` | None | Complete registration using a valid invite token |
| `DELETE` | `/auth/invite/{token}` | Admin | Revoke an invitation |

### 4.5 Password Requirements

#### Hard requirements (enforced on create and change)

- Minimum 12 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character (`!@#$%^&*()-_=+[]{}|;:'",.<>?/~`)
- Must not contain the user's username (case-insensitive)
- Must not match any of the user's last 5 passwords (checked via bcrypt comparison against `password_history`)
- Must not appear in a bundled list of the 10,000 most common passwords

#### Real-time strength indicator

The registration and password-change forms show a live strength meter with per-rule status icons. The submit button is disabled until all hard requirements are met.

#### Password change rules

- Users can change their own password from the Settings page
- Admins can force-reset any user's password (the new password must still meet all requirements)
- After a forced reset the user is prompted to change their password on next login (requires a `must_change_password` flag on the `users` table)

#### Configuration flags (in `config.yaml`)

```yaml
security:
  password_min_length: 12        # minimum character count (8–128)
  password_history_count: 5      # number of previous passwords to reject (0 = disabled)
  password_common_list: true     # reject passwords on the common-password list
```

---

## 5. Multi-User Architecture & RBAC

### 5.1 Roles

| Role | Description |
|------|-------------|
| **Admin** | Full access to all data (shared and private), all users, system settings, and backup controls. Can create, edit, and deactivate accounts. Can assign roles. Sees all expenditure and session logs regardless of owner. |
| **Member** | Can view all shared inventory plus their own private records. Can log expenditures against shared boxes and manage their own private boxes. Cannot manage other users or system settings. |
| **Read-Only** | Can view shared inventory only. Cannot log usage, add records, or access any management features. Good for guests or auditors. |

### 5.2 Permission Matrix

| Permission | Admin | Member | Read-Only | Notes |
|------------|:-----:|:------:|:---------:|-------|
| View shared inventory | ✓ | ✓ | ✓ | |
| View own private inventory | ✓ | ✓ | ✗ | |
| View all users' private inventory | ✓ | ✗ | ✗ | Admin only |
| View pricing / cost data | ✓ | ✓ | ✓ | Visible to all roles |
| Add ammo box (shared) | ✓ | ✗ | ✗ | Only Admin can add to shared pool |
| Add ammo box (private) | ✓ | ✓ | ✗ | Members manage own private boxes |
| Edit / delete own private box | ✓ | ✓ | ✗ | |
| Edit / delete any box | ✓ | ✗ | ✗ | Admin only |
| Log expenditure against shared box | ✓ | ✓ | ✗ | Logged with user attribution |
| Log expenditure against own private box | ✓ | ✓ | ✗ | |
| View expenditure history (all users) | ✓ | ✗ | ✗ | Admin sees full audit trail |
| View own expenditure history | ✓ | ✓ | ✗ | |
| Manage containers / locations | ✓ | ✓ | ✗ | Shared resource; Members can add |
| Manage lookup tables | ✓ | ✗ | ✗ | Calibers, types, dealers, etc. |
| Create / deactivate users | ✓ | ✗ | ✗ | Admin only |
| Assign roles | ✓ | ✗ | ✗ | Admin only |
| Trigger manual backup | ✓ | ✗ | ✗ | Admin only |
| Configure backup schedule | ✓ | ✗ | ✗ | Admin only |
| View system settings | ✓ | ✗ | ✗ | Admin only |
| CSV import | ✓ | ✓ | ✗ | Imports into own account as private |

### 5.3 Enforcement

- All permission checks are enforced **server-side** on every API route
- Role is stored in the session and re-validated on each request
- The frontend may hide UI elements based on role, but this is cosmetic only — the API is the authority
- Deactivated accounts cannot log in; all their records are preserved with their original `owner_id`

---

## 6. Data Model

### 6.1 Users

```
users
├── id               INTEGER    Primary key
├── username         TEXT       Unique login name
├── email            TEXT       Optional; reserved for future notifications
├── password_hash    TEXT       Bcrypt hash — plaintext never stored or logged
├── role             TEXT       admin | member | readonly
├── is_active        BOOLEAN    Deactivated accounts cannot log in; records preserved
├── created_at       DATETIME   Account creation timestamp
├── last_login_at    DATETIME   Last successful login; nullable
└── created_by       INTEGER    FK → users.id; nullable for first admin
```

### 6.2 Ammo Box

The core entity. Represents a physical box or pack of ammunition.

```
ammo_box
├── id               INTEGER    Auto-increment primary key — the Box ID shown in UI
├── owner_id         INTEGER    FK → users.id
├── is_shared        BOOLEAN    True = visible to all Members
├── caliber_id       INTEGER    FK → calibers
├── manufacturer_id  INTEGER    FK → manufacturers
├── product_name     TEXT       Optional free-text product name (e.g. "Gold Dot", "HST", "V-Crown"); nullable
├── gr_oz            DECIMAL    Bullet weight
├── weight_unit      TEXT       GR | OZ
├── type_id          INTEGER    FK → ammo_types (FMJ, JHP, Slug, Birdshot...)
├── category_id      INTEGER    FK → categories (Hunting, Defense, Target...)
├── qty_original     INTEGER    Box size — rounds when purchased
├── qty_remaining    INTEGER    Current rounds left; decremented on expenditure
├── purchase_date    DATE       Date purchased; nullable
├── cost_per_round   DECIMAL    Cost per round; box total derived in UI
├── dealer_id        INTEGER    FK → dealers; nullable
├── container_id     INTEGER    FK → containers; nullable
├── notes            TEXT       Free text; nullable
├── created_at       DATETIME
└── updated_at       DATETIME
```

### 6.3 Expenditure Log

Immutable record of rounds used. Each entry decrements the parent box `qty_remaining`.

```
expenditure_log
├── id               INTEGER    Primary key
├── ammo_box_id      INTEGER    FK → ammo_box
├── logged_by        INTEGER    FK → users.id — who pulled the rounds
├── rounds_used      INTEGER    Number of rounds expended
├── date             DATE       Date rounds were used
├── notes            TEXT       Optional: range name, purpose, etc.
└── created_at       DATETIME
```

### 6.4 Storage

Locations contain Containers. Both are optional — a box can exist without either.

```
locations
├── id               INTEGER    Primary key
├── name             TEXT       e.g. Gun Safe, Garage Cabinet, Bedroom Closet
└── notes            TEXT       Optional

containers
├── id               INTEGER    Primary key
├── name             TEXT       e.g. Ammo Can #1, Range Bag, Blue Bin
├── location_id      INTEGER    FK → locations; nullable
└── notes            TEXT       Optional
```

### 6.5 Lookup Tables

All shared across users. `source` distinguishes YAML-seeded defaults from user-created entries. Deactivated entries are hidden from dropdowns but preserved in historical records.

```
calibers        — id, name, is_active, source (yaml | user)
manufacturers   — id, name, is_active, source
ammo_types      — id, name, is_active, source
categories      — id, name, is_active, source
dealers         — id, name, url, is_active, source
```

### 6.6 App Settings

Key-value store for internal application state that persists across restarts.

```
app_settings
├── id          INTEGER    Primary key
├── key         TEXT       Unique setting key (e.g. "defaults_version")
└── value       TEXT       Setting value (always stored as text)
└── updated_at  DATETIME   Last updated timestamp
```

Current keys written by the application:

| Key | Written by | Purpose |
| --- | ---------- | ------- |
| defaults_version | startup sync | Last successfully synced defaults.yaml version |

### 6.7 Firearms (v2.0)

```
firearms
├── id               INTEGER    Primary key
├── owner_id         INTEGER    FK → users.id
├── is_shared        BOOLEAN    True = Members can log sessions against it
├── make             TEXT       e.g. Glock, Ruger, Smith & Wesson
├── model            TEXT       e.g. 19 Gen 5, 10/22, Model 686
├── caliber_id       INTEGER    FK → calibers
├── serial           TEXT       Optional
├── purchase_date    DATE       Optional
├── notes            TEXT       Optional
├── rounds_lifetime  INTEGER    Total rounds fired through this firearm; auto-incremented
├── rounds_since_clean INTEGER  Rounds since last cleaning; reset on cleaning log entry
├── last_cleaned_at  DATE       Date of last cleaning/service; nullable
├── created_at       DATETIME
└── updated_at       DATETIME
```

### 6.7 Range Sessions (v2.0)

```
range_sessions
├── id               INTEGER    Primary key
├── owner_id         INTEGER    FK → users.id
├── is_shared        BOOLEAN    Visible to other Members if true
├── date             DATE
├── location_name    TEXT       Free text location name (range, field, etc.)
├── notes            TEXT       Optional: conditions, goals, etc.
└── created_at       DATETIME

range_session_lines
├── id               INTEGER    Primary key
├── session_id       INTEGER    FK → range_sessions
├── firearm_id       INTEGER    FK → firearms; nullable (dry fire, etc.)
├── ammo_box_id      INTEGER    FK → ammo_box; nullable
├── rounds_fired     INTEGER
├── target_photo     TEXT       File path to uploaded photo; nullable (v2.0)
└── notes            TEXT       Optional
```

### 6.8 Accessories (v3.0)

```
accessories
├── id               INTEGER    Primary key
├── owner_id         INTEGER    FK → users.id
├── is_shared        BOOLEAN
├── firearm_id       INTEGER    FK → firearms; nullable (unattached)
├── type             TEXT       Scope, Red Dot, Light, Grip, Suppressor, Magazine...
├── make             TEXT
├── model            TEXT
├── serial           TEXT       Optional
├── purchase_date    DATE       Optional
├── cost             DECIMAL    Optional
└── notes            TEXT       Optional
```

### 6.10 Invitations

```
invitations
├── id               INTEGER    Primary key
├── token            TEXT       UUID; unique index
├── created_by       INTEGER    FK → users.id (the Admin who created it)
├── created_at       DATETIME
├── expires_at       DATETIME
├── used_at          DATETIME   Nullable; set when the invite is accepted
├── used_by          INTEGER    FK → users.id; nullable
├── role             TEXT       Role to assign on registration (admin/member/readonly)
├── email_hint       TEXT       Optional display-only email for the Admin's reference
└── is_revoked       BOOLEAN    Default false; set by Admin to invalidate before use
```

### 6.11 Password History

```
password_history
├── id               INTEGER    Primary key
├── user_id          INTEGER    FK → users.id
├── password_hash    TEXT       bcrypt hash of a previous password
└── created_at       DATETIME   When this password was set
```

Only the most recent N hashes are retained per user (N = `security.password_history_count`). Older rows are pruned on every password change.

---

## 7. Database Migrations

### 7.1 Overview

AmmoLedger uses **Alembic** for database schema migrations. Every change to the data model is captured as a versioned migration file committed alongside the application code. Migrations run automatically on startup — users never need to think about them.

### 7.2 Why Alembic

- De facto standard for Python/SQLAlchemy/SQLModel projects
- Autogenerates migration files by diffing SQLModel classes against the current schema
- Tracks applied versions in an `alembic_version` table in the database
- Supports upgrade and downgrade on every migration
- Migration files live in git — every schema change is reviewable and auditable

### 7.3 Migration File Structure

```
backend/
└── migrations/
    ├── env.py
    ├── script.py.mako
    └── versions/
        ├── 0001_initial_schema.py
        ├── 0002_add_is_shared_to_ammo_box.py
        ├── 0003_add_firearms_table.py
        └── 0004_add_accessories_table.py
```

Each file contains:

```python
def upgrade() -> None:
    op.add_column('ammo_box', sa.Column('is_shared', sa.Boolean(), default=False))

def downgrade() -> None:
    op.drop_column('ammo_box', 'is_shared')
```

### 7.4 Startup Sequence

On every container start, FastAPI runs this sequence before accepting requests:

```
1. run_migrations()      — Alembic applies any pending migrations in order
2. sync_yaml_seeds()     — YAML seed data: insert any new lookup values
3. check_first_run()     — If no users exist, flag app for first-run setup flow
```

### 7.5 Developer Workflow

When a model change is needed:

```bash
# 1. Update the SQLModel class in models.py
# 2. Autogenerate the migration file
alembic revision --autogenerate -m "add is_shared to ammo_box"

# 3. Review the generated file in migrations/versions/
# 4. Commit both the model change and the migration file together
git add backend/models.py backend/migrations/versions/0002_add_is_shared_to_ammo_box.py
git commit -m "feat: add is_shared field to ammo_box"
```

> **Rule:** Every PR that changes the data model must include the corresponding Alembic migration file. PRs without migrations for model changes will not be merged.

### 7.6 Upgrade Experience for Users

```bash
docker compose pull       # pull new image
docker compose up -d      # start — migrations run automatically on startup
```

The user sees nothing. Alembic detects the current database version, runs any new migrations in sequence, and the app starts normally.

### 7.7 Migration Playbook for Breaking Changes

For rare cases where a migration cannot be done in-place (major restructuring):

```
1. Admin triggers Backup Now from the admin panel (JSON export)
2. Download and save the backup file
3. docker compose down
4. Delete ammoledger.db (or rename as extra safety)
5. docker compose pull && docker compose up -d
6. Fresh schema is created by Alembic from scratch
7. Admin uses Import Backup in the UI to reload data
```

The backup JSON is version-tagged so the importer knows the source schema and can transform records to the new shape during import.

### 7.8 Rolling Back a Bad Migration

```bash
alembic downgrade -1        # roll back one migration
alembic downgrade 0001      # roll back to a specific version
```

In practice, restoring from a backup is usually faster and safer than a downgrade for a self-hosted app.

---

## 8. YAML Seed Data

A `defaults.yaml` file ships with the application and pre-populates all lookup tables on startup. The sync process is version-aware and configurable via `config.yaml`.

### 8.1 Version Field

`defaults.yaml` carries a `version` field at the top. The last successfully synced version is stored in `app_settings` under the key `defaults_version`. On startup the two are compared to decide whether sync should run.

```yaml
version: "1.0"

calibers:
  - "9mm Luger"
  - "45 ACP"
  ...
```

### 8.2 Sync Config Flags

Three flags in `config.yaml` control sync behavior:

```yaml
defaults:
  sync_on_startup: true    # Always sync on startup, even if version already matches
  update_existing: false   # If true, rename yaml-sourced entries when YAML spelling changes
  allow_removal: false     # If true, deactivate yaml-sourced entries removed from YAML
```

| Flag | Default | Effect |
| ---- | ------- | ------ |
| sync_on_startup | true | When false, sync is skipped if stored version equals YAML version |
| update_existing | false | When true, yaml-sourced entries are renamed to match current YAML spelling |
| allow_removal | false | When true, yaml-sourced entries absent from YAML are deactivated (`is_active=false`) |

### 8.3 Sync Logic

On each startup the following sequence runs:

1. Read `version` from `defaults.yaml`
2. Query `app_settings` for `defaults_version`
3. If versions match **and** `sync_on_startup` is false → skip, log "Defaults up to date"
4. Otherwise sync every lookup table (calibers, manufacturers, ammo_types, categories, dealers):
   - **Not in DB** → insert with `source="yaml"` — logged as "Added"
   - **In DB, source="user"** → never touch — logged as "Skipping user entry"
   - **In DB, source="yaml", update_existing=false** → skip
   - **In DB, source="yaml", update_existing=true** → update name to current YAML spelling
   - **In DB, source="yaml", not in YAML, allow_removal=true** → set `is_active=false` — logged as "Deactivated"
5. Write current YAML `version` to `app_settings.defaults_version`
6. Log summary: `Defaults sync complete: X added, Y skipped, Z deactivated. Version: 1.0`

Name matching is **case-insensitive** — existing entries with different casing are found correctly and never duplicated.

### 8.4 The source Field

Every lookup record carries a `source` field (`yaml` or `user`). This distinguishes YAML-seeded defaults from user-created entries. The Settings UI uses this to show which entries came from defaults and which were added manually. User entries are never modified or removed by the sync process regardless of config flags.

### 8.5 Community Contributions

Any user can submit a pull request to `defaults.yaml` to add calibers, manufacturers, or types. Bump the `version` field with each PR. New defaults are applied to all installations on the next startup after upgrade.

---

## 9. Feature Specifications — v1.0

### 9.1 Overview Dashboard

- Total rounds on hand across all visible inventory
- Breakdown by caliber: round count and estimated value
- Total inventory value (qty_remaining × cost_per_round) across all visible boxes
- Low stock alerts per caliber at configurable thresholds
- Recently added boxes
- Recent expenditure activity (who used what, when)

### 9.2 Ammo Inventory

#### Add Ammo Box
- Form with all fields from Section 6.2
- `is_shared` toggle — defaults to `false` (private)
- Caliber, manufacturer, type, category, dealer dropdowns all support inline **Add New**
- **Product Name** — free-text field positioned directly below Manufacturer; not a dropdown (product lines too varied to maintain a list); carries through to the Add X Copies feature
- Cost entered per round; calculated box total shown alongside for reference
- Container and location are optional — a **None** option is always available

#### Inventory List
- Columns: Box ID, Caliber, Brand, Gr/Oz, Type, Qty Remaining, Location, Cost/rd, Owner
- Sortable columns
- Color indicator for partially used and nearly-empty boxes
- Members see: all shared boxes + their own private boxes
- Admin sees: all boxes

#### Box Detail
- All fields displayed and editable (based on role)
- Expenditure history for that box (with user attribution)
- Quick-log rounds button

### 9.3 Expend Rounds

- Search for a box by ID, caliber, or brand
- Options: **Shot All**, **Shot Some** (enter count), or **Custom**
- Confirmation shows new `qty_remaining` before committing
- Entry written to `expenditure_log` with `logged_by`, date, and optional notes

### 9.4 Search & Filter

- Filter bar: Caliber, Container, Location, Category, Type, Manufacturer, Owner
- Combinable filters (AND logic)
- Live summary below filter bar: round count and estimated value for the filtered set
- URL reflects filter state — bookmarkable and shareable

### 9.5 User Management (Admin)

- List all accounts: username, role, status, last login
- Create new account: username, email (optional), role, temporary password
- Edit role or deactivate an account
- Reset any user's password (forced reset flags the account with `must_change_password`)
- Deactivated accounts cannot log in; records are preserved with original `owner_id`

#### Invite link management

- **Invite User** button opens a modal: select role, optional email hint, set expiry (default 72 hours)
- Generated link is displayed with a copy-to-clipboard button; link is never stored in plaintext after display
- **Pending Invites** table shows: email hint, role, created at, expires at, status (Valid / Expired / Revoked)
- Admin can revoke any pending invite; used invites are read-only
- Expired and used invites older than 30 days are hidden by default (expandable)

### 9.6 Settings

- Manage lookup tables: Calibers, Manufacturers, Types, Categories, Dealers, Containers, Locations
- Add, rename, or deactivate entries (deactivated entries hidden from dropdowns but preserved in historical records)
- Change own password (subject to full password requirements and history check)
- Configure low-stock threshold per caliber
- View YAML seed sync log (what was added on last startup)
- Backup controls (Admin only — see Section 11)

#### Security settings (Admin only)

- **Registration mode** — toggle between `invite_only`, `open`, and `disabled`
- **Invite expiry** — default hours for new invite links (e.g. 24, 48, 72)
- **Password minimum length** — configurable from 8 to 128 characters (default 12)
- **Password history depth** — number of previous passwords to block reuse (default 5; 0 = disabled)
- **Common password list** — enable/disable rejection of passwords on the top-10k list

### 9.7 Backup (Admin)

See [Section 11](#11-database-backup) for full specification. UI entry point is Settings → Backup.

### 9.8 CSV Import

#### Overview

Import is a two-step process — validate first, then confirm. No database writes happen during validation. The flow gives the user full visibility into what will change before any data is committed.

#### Step 1 — Validation (`POST /import/validate`)

Accepts a CSV file upload and runs full validation with **no database writes**. Returns a structured validation report:

##### New values to be created

- List of new calibers, manufacturers, ammo types, categories, and dealers that will be auto-created on import
- Fuzzy match warnings where an imported value closely matches an existing DB entry — the user must verify the match before confirming

##### Row warnings (non-blocking — row imports with the adjusted value)

| Warning | Behaviour |
| ------- | --------- |
| `qty_remaining` exceeds `qty_original` | Capped to `qty_original` |
| Unrecognized date format | `purchase_date` left blank |
| Missing `cost_per_round` | Set to `0.00` |
| Fuzzy matched value | Shows what was matched and from which lookup |

##### Row errors (blocking — row will not import)

| Error | Condition |
| ----- | --------- |
| Missing required field | `caliber`, `qty_original`, or `qty_remaining` absent |
| Invalid number | `qty_remaining` or `qty_original` cannot be parsed as an integer |

##### Validation summary

- Total rows, valid rows, warning count, error count
- List of all new lookup values that will be created on confirm
- A **validation token** with a 15-minute expiry — required to call the confirm endpoint

Returns `400` if the file format is invalid. Returns `422` if zero rows are importable.

#### Step 2 — Confirm & Import (`POST /import/confirm`)

Requires the validation token from Step 1. Token expires after 15 minutes; expired tokens must re-validate.

##### Pre-import backup

Before any data is written the system automatically triggers a backup:

- Labelled `ammoledger_backup_pre-import_YYYY-MM-DD.json`
- Stored in `/data/backups/` alongside scheduled backups
- Import is **blocked** if the backup fails to write

##### Import behaviour

- New lookup values (calibers, manufacturers, etc.) are created first with `source="user"`
- Ammo boxes are created with `owner_id` = importing user; `is_shared` defaults to `false`
- Duplicate detection: `caliber + manufacturer + purchase_date + cost_per_round` — duplicates are skipped, not errored
- Fuzzy-matched values use the existing DB entry, not the raw imported string
- Returns import summary: `X rows imported, Y duplicates skipped, Z warnings`

#### Backup Requirement Config

Three flags in `config.yaml` control import backup behaviour:

```yaml
import:
  require_backup: true       # Auto-backup always runs before import
  backup_warning_hours: 24   # Warn if last backup is older than N hours
  backup_block_hours: 168    # Block if last backup is older than N hours (when require_backup is false)
```

| Flag | Default | Effect |
| ---- | ------- | ------ |
| require_backup | true | When true, a backup is always taken automatically before import |
| backup_warning_hours | 24 | Warn in the UI if the most recent backup is older than this threshold |
| backup_block_hours | 168 | When `require_backup` is false, block import if last backup exceeds this age |

#### Fuzzy Matching Rules

| Match type | Behaviour |
| ---------- | --------- |
| Exact (case-insensitive) | Silent — no warning shown |
| Fuzzy (close spelling) | Warning shown; uses existing DB entry |
| No match | New entry created; shown in validation report |

The system **never silently auto-corrects** without surfacing the match to the user.

#### CSV Template

The downloadable template includes a version header row and these columns in order:

```text
ammoledger_version, caliber, manufacturer, product_name,
grain, weight_unit, type, category, qty_original,
qty_remaining, purchase_date, cost_per_round, dealer,
container, location, notes
```

| Column | Required | Format | Notes |
| ------ | -------- | ------ | ----- |
| ammoledger_version | Header only | text | Version tag — do not edit; enables future import migration |
| caliber | Yes | text | Matched to calibers lookup; auto-created if no match |
| manufacturer | Yes | text | Matched to manufacturers lookup; auto-created if no match |
| product_name | No | text | Free-text product line or SKU (e.g. "Gold Dot", "HST", "V-Crown") |
| grain | No | integer | Bullet weight; leave blank for shotgun |
| weight_unit | No | GR \| OZ | Defaults to GR if omitted |
| type | No | text | FMJ, JHP, Slug, etc.; auto-created if no match |
| category | No | text | Hunting, Defense, Target, etc.; auto-created if no match |
| qty_original | Yes | integer | Box size when purchased |
| qty_remaining | Yes | integer | Current rounds on hand; capped to `qty_original` if higher |
| purchase_date | No | YYYY-MM-DD | Left blank if format unrecognised |
| cost_per_round | No | decimal | e.g. `0.32`; set to `0.00` if missing |
| dealer | No | text | Matched to dealers lookup; auto-created if no match |
| container | No | text | Must match an existing container name |
| location | No | text | Must match an existing location name |
| notes | No | text | Free text |

---

## 10. Future Feature Specifications

### 10.1 Firearms Registry (v2.0)

- Track owned firearms with the same `owner_id` + `is_shared` model as ammo boxes
- Fields: make, model, caliber, serial (optional), purchase date, notes
- Lifetime round count auto-incremented by range sessions
- Round count at last cleaning; configurable service interval
- Admin sees all; Members see shared + their own

### 10.2 Range Sessions (v2.0)

- Log a session: date, location name (free text), notes, `is_shared` flag
- Multiple line items per session: firearm + ammo box + rounds fired
- Auto-deducts from `ammo_box.qty_remaining`
- Auto-increments `firearms.rounds_lifetime` and `rounds_since_clean`
- Attach target photos to a session line (stored in `/data/uploads/`)
- Shared sessions visible to all Members on the instance

### 10.3 Cleaning Reminders (v2.0)

- Set service interval per firearm: round count threshold or calendar interval
- Dashboard widget shows firearms approaching or past their service interval
- Log a cleaning event: resets `rounds_since_clean`, records `last_cleaned_at` and round count at service

### 10.4 Reporting (v2.0)

- Inventory snapshot: all visible ammo with current qty, value, and location
- Spend report: total cost by caliber, by dealer, by time period
- Usage report: rounds expended over time, by caliber, by user, by firearm
- Low stock report: all calibers below threshold
- Export all reports to PDF and CSV
- Optional scheduled report delivery via email (requires SMTP configuration in `config.yaml`)

### 10.5 Cost Analytics (v2.0)

- Price-per-round over time per caliber — track whether prices are rising
- Total spend by dealer/source
- Average cost per round by caliber across all purchases
- Spend trend charts

### 10.6 Accessories Module (v3.0)

- Track accessories: scopes, red dots, lights, grips, suppressors, magazines
- Same `owner_id` + `is_shared` model as ammo boxes and firearms
- Optional attachment to a specific firearm
- Detach/reattach history — track which firearm an accessory has been on
- Fields: type, make, model, serial (optional), purchase date, cost, notes

### 10.7 Bulk Label Printing (v2.0)

#### Configurable Label Template

- Admin configures the default label template in Settings
- Any `ammo_box` field can be toggled on or off
- Selected fields can be reordered via drag and drop
- Field size can be set: **large** for key fields (Box ID, Caliber), **normal** for others
- Template is saved as the default for all future label prints
- Users can override the template at print time without changing the saved default

#### Label Size Options

Support these Avery label formats:

| Format | Size | Per sheet | Best for |
| ------ | ---- | --------- | -------- |
| 5160 | 1" × 2-5/8" | 30 | Standard ammo labels |
| 5163 | 2" × 4" | 10 | Larger rifle boxes |
| 5167 | 1/2" × 1-3/4" | 80 | Small pistol boxes |
| 5164 | 3-1/3" × 4" | 6 | Large rifle boxes |

#### QR Code

- Optional field in the label template — toggled on/off like any other field
- QR code encodes the full URL to the box detail page
- Base URL configured in `config.yaml`:

  ```yaml
  app:
    base_url: "http://localhost:5173"
  ```

- When scanned, opens the browser directly to the box detail page
- If not logged in, redirects to login then back to the box page

#### QR Scan → Expend Flow (mobile optimised)

The box detail page, when accessed via QR scan, is mobile-optimised and shows:

- Box ID, caliber, manufacturer, product name
- `qty_remaining` with a visual progress bar
- Quick expend buttons:

  ```text
  [ Shot All (N) ]
  [ Shot 50 ]  [ Shot 25 ]  [ Shot 10 ]  [ Shot 5 ]
  [ Custom amount... ]
  ```

Quick preset buttons support range use with gloves or in poor lighting conditions. The **Shot All** button shows the current remaining count so the action is unambiguous.

#### Print Flow

1. Select one or more boxes from the inventory list
2. Click **Print Labels**
3. Choose label size (defaults to last-used preference)
4. Preview labels before printing
5. Download as PDF or send directly to the browser print dialog

---

## 11. Database Backup

### 11.1 Design Goal

Backups must be re-importable into a clean installation. This enables a migration path for breaking schema changes: dump → wipe → upgrade → import. Format is portable JSON, not a raw SQLite binary.

### 11.2 Backup Format

- Structured JSON with one array per table
- Version-tagged with the AmmoLedger schema version that produced it
- Filename: `ammoledger_backup_YYYY-MM-DD_HH-MM.json`
- Stored in `/data/backups/` — this path is a mounted Docker volume so files survive container restarts and rebuilds

### 11.3 Manual Backup

- Admin panel has a **Backup Now** button
- Triggers immediately, shows progress, then offers a download link
- Admin can download any previous backup file from the backup history list

### 11.4 Scheduled Backup

- Configured in `config.yaml`
- Runs as an internal async task — no external cron required
- Default: nightly at 3:00 AM, retain 30 days

```yaml
# config.yaml
backup:
  enabled: true
  schedule: "03:00"
  retention_days: 30
  path: /data/backups
```

Old backups beyond `retention_days` are automatically pruned.

### 11.5 Restore / Re-import

- Admin panel **Import Backup** — upload a backup JSON file
- Preview shows record counts per table before committing
- Two modes:
  - **Full restore** — wipe existing data and replace with backup contents
  - **Additive** — merge backup into existing data, skipping duplicates
- Backup version tag is validated — incompatible versions are rejected with a clear error message

### 11.6 Breaking Migration Playbook

```
1. Admin → Backup Now → download the JSON file
2. Stop the container
3. Delete (or rename) ammoledger.db
4. Pull new image: docker compose pull
5. Start: docker compose up -d
   → Alembic creates the new schema from scratch
6. Admin → Import Backup → upload the saved JSON
   → Importer transforms data to the new schema shape
```

### 11.7 Data Directory Structure

All runtime data lives under the `/data` Docker volume. Nothing in this directory is committed to git except `defaults.yaml`.

```
/data/
├── ammoledger.db        # SQLite database (git-ignored)
├── config.yaml          # App settings and secrets (git-ignored; auto-created on first start)
├── defaults.yaml        # Editable seed data (copied from bundled backend/defaults.yaml if missing)
├── backups/             # Nightly and manual backup JSON files (auto-created; git-ignored)
└── uploads/             # Target photo uploads — v2.0 (auto-created; git-ignored)
```

**config.yaml** is auto-generated on first startup from a bundled template. Edit it to configure:
- `app.session_timeout_hours` — session lifetime (default: 8 hours)
- `security.reset_token` — one-time token to enable `/reset` password recovery; clear after use
- `backup.enabled`, `backup.schedule`, `backup.retention_days` — nightly backup settings
- `smtp.*` — optional SMTP settings for scheduled report delivery (v2.0)

**Environment variables** take precedence over config.yaml for path configuration:

| Variable | Default | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `sqlite:////data/ammoledger.db` | SQLite connection string |
| `SESSION_SECRET` | *(required in production)* | Signs session cookies — set a strong random value |
| `CONFIG_PATH` | `/data/config.yaml` | Path to config.yaml |
| `DEFAULTS_PATH` | `/data/defaults.yaml` | Path to defaults.yaml seed file |
| `BACKUP_PATH` | `/data/backups` | Backup output directory |
| `UPLOADS_PATH` | `/data/uploads` | Photo upload directory (v2.0) |

---

## 12. Reverse Proxy, SSL & External Access

AmmoLedger should never be exposed directly to the internet on an unencrypted port. Always place it behind a reverse proxy with SSL termination and add a secondary authentication layer for external access.

### 12.1 Option A — Tailscale (Recommended)

Tailscale creates a private encrypted mesh network. AmmoLedger is only reachable from devices on your Tailscale network — never exposed to the public internet.

- Install Tailscale on the AmmoLedger host and on family devices / phones
- Access AmmoLedger at its Tailscale IP from anywhere — works on LTE at the range
- No port forwarding, no public DNS, no SSL certificate management required
- Tailscale itself acts as a secondary authentication layer beyond AmmoLedger's own login
- Free tier: up to 3 users / 100 devices

### 12.2 Option B — Cloudflare Tunnel

Exposes a local service through Cloudflare's edge without opening inbound firewall ports.

- Install `cloudflared` on the host and create a tunnel pointing to AmmoLedger
- Cloudflare provides automatic SSL — no certificate management
- Enable **Cloudflare Access** in front of the tunnel for secondary authentication (email OTP, Google/GitHub SSO, or email allowlist)
- Cloudflare Access acts as a zero-trust gateway — users authenticate to Cloudflare before reaching AmmoLedger's login screen
- Free Cloudflare plan supports this configuration

### 12.3 Option C — Self-Managed Reverse Proxy

For users who prefer full control with their own domain:

- Run **Nginx Proxy Manager** or **Traefik** as a companion Docker service
- Use **Let's Encrypt** (via Certbot or Traefik's ACME integration) for free SSL certificates
- Add HTTP Basic Auth at the proxy level as a secondary authentication layer
- Requires a domain name and port forwarding on the router

### 12.4 Port Binding

In all external-access scenarios, bind AmmoLedger's ports to `127.0.0.1` only so the reverse proxy is the only entry point:

```yaml
# docker-compose.yml
services:
  backend:
    ports:
      - "127.0.0.1:8000:8000"
  frontend:
    ports:
      - "127.0.0.1:5173:5173"
```

---

## 13. Technical Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Backend | Python + FastAPI | Familiar language; auto-generated API docs at `/docs` |
| Frontend | React + Tailwind CSS | Ideal for AI-assisted UI development; no custom CSS required |
| Database | SQLite + SQLModel | Zero-config; single file; easy backup |
| Migrations | Alembic | Versioned schema changes; automatic on startup |
| Auth | Session + Bcrypt | Secure password hashing; server-side sessions |
| Container | Docker Compose | Single command startup on any OS; base images pinned to `python:3.12.9-slim-bookworm` and `node:20.19.1-slim`; production frontend served by `nginx:1.27-alpine` (planned multi-stage build) |
| Config | YAML | Human-editable seed data and app settings |
| Backup | JSON export/import | Re-importable; version-tagged; survives schema migrations |
| External Access | Tailscale or Cloudflare | SSL + secondary auth without managing certificates |
| CI/CD | GitHub Actions + GHCR | Lint (ruff) and compose validation on every push and PR; images published to `ghcr.io` with three-tier tags: `:dev` + `:sha-<hash>` on every push to `main`; `:latest`, full semver, and major-only on GitHub Release; PR builds only (no push) |

---

## 14. Non-Functional Requirements

- Runs on a single Docker Compose stack on a home server, NAS, or Windows PC
- No internet connection required after initial install
- All data stored locally; no telemetry or external calls
- Mobile-responsive UI — usable on a phone at the range
- API documented at `/docs` (FastAPI Swagger UI — auto-generated)
- Database backed up by copying a single `.db` file or using the built-in backup system
- All API routes enforce RBAC server-side — role enforcement is never client-only
- Passwords hashed with bcrypt — plaintext never stored or logged
- All schema changes versioned in Alembic — no manual database surgery required
- First run setup completes in under 2 minutes

### 14.1 Configuration Validation

`config.yaml` is validated on every startup before any other initialisation step. All checks run before reporting so the operator sees every problem at once.

#### Check categories

| Category | Behaviour |
| -------- | --------- |
| Presence | Error if a required field is absent |
| Type | Error if a field has the wrong type (e.g. string where integer expected) |
| Value | Error if a field is present but out of allowed range or format |
| Warning | Logged and startup continues; does not block the application |

#### Validated fields

**Presence (error if missing):** `security.session_secret`, `app.session_timeout_hours`, `backup.enabled`, `backup.schedule`, `backup.retention_days`

**Type checks:** `backup.retention_days` (integer), `app.session_timeout_hours` (integer), `backup.enabled` (boolean), `import.require_backup` (boolean), `import.backup_warning_hours` (integer), `import.backup_block_hours` (integer), `smtp.port` (integer, only when `smtp.enabled` is true)

**Value checks:** `security.session_secret` ≥ 32 chars; `backup.schedule` matches `HH:MM`; `backup.retention_days` 1–365; `app.session_timeout_hours` 1–720; `import.backup_block_hours` ≥ `import.backup_warning_hours`; `smtp.port` 1–65535 (when smtp enabled)

**Warnings:** session_secret is the default sentinel value; `smtp.enabled` true but `smtp.host` empty; `backup.enabled` false; `app.base_url` contains `localhost`

#### Dev vs production mode

Controlled by `app.env` in `config.yaml`:

| Mode | Validation errors | Warnings |
| ---- | ----------------- | -------- |
| `development` | Logged; startup continues with caution | Logged |
| `production` | Startup exits with code 1; all errors printed | Logged |

Additionally, using the default `session_secret` sentinel value is a **warning** in development but a hard **error** in production.

#### Missing config.yaml

If `/data/config.yaml` does not exist on startup:

1. The bundled `config.template.yaml` is copied to `/data/config.yaml`
2. Clear instructions are printed including the command to generate a session secret
3. The process exits with code 1

The operator edits the file and restarts. This prevents accidental startup with missing or unconfigured credentials.

---

## 15. Open Questions

| # | Question | Recommendation |
|---|----------|----------------|
| 1 | Should Members be able to flip their own private boxes to shared, or is that an Admin-only action? | Allow Members to share their own boxes — keeps the Admin from being a bottleneck for family use |
| 2 | Should backup JSON files be optionally encrypted with a passphrase before download? | Yes, add as an optional config flag — useful if backups are stored on a shared NAS or cloud drive |
| 3 | SMTP for scheduled reports (v2.0) — optional or required? | Optional; app works fully without it; configure in `config.yaml` |
| 4 | Should the CSV import template be versioned so future releases can detect and handle older import files? | Yes — add a `ammoledger_version` header row to the template |

---

*AmmoLedger is an open-source self-hosted project. Contributions to `defaults.yaml` and bug reports are welcome via pull request.*