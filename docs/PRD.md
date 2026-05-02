# AmmoLedger — Product Requirements Document

**Version:** 2.9 — Working Draft  
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
| 2.0 | April 2026 | Major update: notifications multi-channel system, version info and update detection, empty box and archive behavior, expanded search and filter spec, dashboard scope selector and getting started guide, error handling standards, DB indexes, reporting integrity rules and leaf box concept, expenditure log types (expend/split/adjust), split box feature with full and partial modes, restock/add same, add X copies, label printing with QR code and mobile expend flow, release process and CHANGELOG.md format. PRD v2.0 represents a complete and comprehensive specification ready for full frontend and remaining backend development. |
| 2.1 | April 2026 | Updated backup section to dual format strategy — SQLite file for scheduled backups, JSON export for migrations. Added version detection on startup docs, pre-import backup, and restore playbooks. |
| 2.2 | April 2026 | Phase 4.6: user management backend (invite system, password policy, password history, must_change_password flag), user management UI, invite management UI, registration page, profile/password-change page, admin sidebar section. |
| 2.3 | April 2026 | Inventory row redesign: new column layout (ID, Gr/Oz, Type, Category, Value), Manufacturer now includes product_name subtitle, Remaining cell opens QuickExpendPopover in-place, expanded row two-column layout with purchase details + expenditure history. |
| 2.4 | April 2026 | Added ammo_condition field — production origin lookup table (Factory New, Remanufactured, Reloaded / Handload, Military Surplus, Old / Unknown) with YAML seed values, add/edit form dropdown between Type and Category, condition badge in inventory row, Condition filter support, CSV import column. |
| 2.4.1 | April 2026 | Updated ammo_condition seed values — split Old and Unknown into separate entries. Old = known aged ammunition; Unknown = origin completely unknown. Bumped defaults.yaml to version 1.1. |
| 2.5 | April 2026 | Legacy ID Mode for CSV import — eligibility analysis on validate, use_legacy_ids form field on confirm, explicit primary key insertion for integer legacy_ids, sqlite_sequence reset after import, three-state UI (eligible/conflict/non-integer), legacy_id column added to CSV template. |
| 2.6 | April 2026 | url field on manufacturers — optional website link stored in DB, pre-populated for known brands via defaults.yaml v1.3. Admin Lookups page at /admin/lookups with inline name/URL editing. PATCH /manufacturers/{id} endpoint. §6.5 updated. |
| 2.7 | April 2026 | Inventory Group By and per-column filters — §9.2 expanded with Group By spec (8 options, collapsible group headers with summary stats, localStorage persistence) and per-column filter row spec (always visible, AND logic, numeric operators for Remaining/Value). |
| 2.8 | April 2026 | Three-tier threshold system — global default + per-caliber + per-location thresholds stored server-side in DB; new `/thresholds/*` API endpoints; dashboard Running Low shows caliber totals and location totals; Add Box defaults shared; CSV import ownership toggle. §8.1 rewritten. |
| 2.9 | April 2026 | Bulk checkbox select and edit — checkbox column in inventory table, bulk action toolbar, Bulk Edit side panel, `PATCH /ammo/bulk-update` endpoint. §9.2 updated. |
| 3.0 | May 2026 | Password reset — admin-generated one-time links (UI) and config-token admin self-recovery (emergency). §4.3 rewritten to cover both flows. |
| 3.1 | May 2026 | Help system — §9.12 added: Help page with searchable FAQ and collapsible Q&A sections; HelpTip contextual tooltips on form fields and key UI elements. |
| 3.2 | May 2026 | Merged Invitations into Users page — §9.5 rewritten with three sections (users, active invitations, invitation history) and inline Invite User modal. Separate Invitations sidebar link and `/admin/invites` page removed. |
| 3.3 | May 2026 | Added logging and error handling spec — §15.3 added: log levels, what gets logged, global exception handler, log format. |
| 3.4 | May 2026 | Admin Lookups page redesigned — accordion layout with all 8 lookup tables, per-section search, usage counts, hide (YAML) / delete (user) actions, active_only filter on all lookup GET endpoints, is_active and source fields added to locations and containers. §9.6 updated. |
| 3.5 | May 2026 | Version check against GitHub releases and post-upgrade What's New modal — GET /system/version now checks GitHub API with 24h cache; POST /system/version/check (admin force-refresh); GET /system/changelog (GitHub Releases first, CHANGELOG.md fallback); POST /system/version/dismiss-upgrade; WhatsNewModal shown on upgrade; About page updated with Check Now button and last-checked timestamp. §9.10 updated. |
| 3.6 | May 2026 | Direct location assignment on ammo_box — location_id FK added to ammo_box table; location and container are now independent; CSV import sets location_id directly; Group By Location and location thresholds use ammo_box.location_id; Location dropdown added to Add/Edit form and Bulk Edit panel. §4.1 and §6.3 updated. |
| 3.7 | May 2026 | Environment variable config support — AL_* env vars override config.yaml; app can start without config.yaml if AL_SESSION_SECRET is set; startup logs which values came from ENV; §15.1 updated with configuration sources priority. |
| 3.8 | May 2026 | CSV export — GET /ammo/export/csv (filtered, all users) and GET /backup/export/csv (all boxes, admin). Export CSV toolbar button in §9.2 with confirmation dialog. CSV importer extended to handle owner/created_at/updated_at/id columns. §9.2, §9.8, §11.3 updated. |
| 3.9 | May 2026 | Product catalog — §6.9 added: products table with COALESCE unique index, image storage, product_id FK on ammo_box. §9.13 added: Products page (grid/list, add/edit sheet, image upload, auto-generate), Add Box product selector, Save as Template dialog, CSV import product auto-linking. |

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
14. [Release Process](#14-release-process)
15. [Non-Functional Requirements](#15-non-functional-requirements)
16. [Open Questions](#16-open-questions)

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
| Ammo Condition field | Track production origin (Factory New, Remanufactured, Surplus, etc.) | v1.0 |
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

Two flows are supported — no email server required.

#### Admin-generated user reset links (UI)

1. Admin opens Admin → Users and clicks the link icon (↗) next to a user
2. Backend creates a single-use `PasswordResetToken` (expires 24 h) and returns a URL
3. Admin copies the URL and sends it to the user out-of-band
4. User visits `/reset?token=<uuid>`, sets a new password, and signs in
5. Token is marked used; any previous unused tokens for that user are invalidated

#### Admin self-recovery (config token)

Emergency access when the admin account is locked out — no UI interaction needed:

```yaml
# config.yaml
security:
  reset_token: "your-secret-token-here"  # generate with: openssl rand -hex 32
```

Visit `/reset?token=your-secret-token-here`, enter your admin email, and set a new password. **Clear `reset_token` from `config.yaml` and restart immediately after use.** Only works for admin-role accounts.

#### Shared `/reset` page

- Token type (DB or config) is detected server-side from the same URL pattern
- DB token: email is pre-filled and read-only
- Config token: email field is editable (admin enters their own email)
- Password strength and history rules apply to both flows
- On success: redirects to `/login`

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
├── ammo_condition_id INTEGER   FK → ammo_conditions; nullable (Factory New, Remanufactured, etc.)
├── category_id      INTEGER    FK → categories (Hunting, Defense, Target...)
├── qty_original     INTEGER    Box size — rounds when purchased
├── qty_remaining    INTEGER    Current rounds left; decremented on expenditure
├── purchase_date    DATE       Date purchased; nullable
├── cost_per_round   DECIMAL    Cost per round; box total derived in UI
├── dealer_id        INTEGER    FK → dealers; nullable
├── location_id      INTEGER    FK → locations; nullable — direct location assignment, independent of container
├── container_id     INTEGER    FK → containers; nullable
├── legacy_id        TEXT       Optional user-supplied ID from a prior tracking system; nullable
├── notes            TEXT       Free text; nullable
├── split_from_id    INTEGER    FK → ammo_box.id; nullable — set when box was created by a split
├── is_archived      BOOLEAN    Default false — true when fully split, manually archived, or empty+archived
├── archive_reason   TEXT       "split" | "empty" | "manual"; nullable
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
├── rounds_used      INTEGER    Rounds expended; negative allowed for adjust entries
├── date             DATE       Date rounds were used
├── log_type         TEXT       "expend" | "split" | "adjust" — see §6.13 for semantics
├── related_ids      TEXT       JSON array of related box IDs; nullable — used by split entries
├── notes            TEXT       Optional: range name, purpose, etc.
└── created_at       DATETIME
```

Log types:

- **expend** — real rounds used; counted in usage reports (default)
- **split** — audit record created when a box is split; `rounds_used` = total rounds split out; never counted in usage reports
- **adjust** — Admin correction; `rounds_used` can be negative to restore rounds; never counted in usage reports

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
manufacturers   — id, name, url, is_active, source
ammo_types      — id, name, is_active, source
ammo_conditions — id, name, is_active, source
categories      — id, name, is_active, source
dealers         — id, name, url, is_active, source
```

`url` on manufacturers is optional. Pre-populated for known brands via `defaults.yaml`; blank for private-label or unknown brands. Admins can update the URL via the Lookups settings page without affecting the `source` field.

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

### 6.9 Database Indexes

Indexes required for search and filter performance targets (sub-200ms at 10,000 box records):

**ammo_box:** `caliber_id`, `manufacturer_id`, `type_id`, `category_id`, `owner_id`, `is_shared`, `qty_remaining`, `is_archived`, `created_at`, `legacy_id`, `split_from_id`

**expenditure_log:** `ammo_box_id`, `logged_by`, `date`, `log_type`

**users:** `username`, `email`

**app_settings:** `key`

**invitations:** `token`, `expires_at`, `is_revoked`

**notifications:** `user_id`, `is_read`, `created_at`

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

### 6.12 Notifications

```
notifications
├── id            INTEGER    Primary key
├── user_id       INTEGER    FK → users.id; nullable (null = system-wide notification)
├── type          TEXT       low_stock | backup_failure | backup_success |
│                            import_complete | new_user | update_available
├── title         TEXT       Short notification title
├── message       TEXT       Full notification message
├── is_read       BOOLEAN    Default false
├── created_at    DATETIME
└── read_at       DATETIME   Nullable; set when the user marks it read
```

### 6.13 Reporting Integrity Rules

#### The Leaf Box Problem

When a box is split the original becomes a parent record in the audit trail. Counting both parent and children would double-count rounds. All inventory and purchase reports must only count **leaf boxes**.

#### Leaf Box Definition

A box is a leaf if no other box has `split_from_id` pointing to it:

```sql
is_leaf = NOT EXISTS (
  SELECT 1 FROM ammo_box child
  WHERE child.split_from_id = this_box.id
)
```

Computed at query time — not stored as a column — to ensure it is always accurate. The index on `split_from_id` keeps this fast.

#### Reporting Query Rules

| Report | Filter |
| ------ | ------ |
| Total rounds purchased | `SUM(qty_original)` WHERE `is_leaf = true` |
| Total rounds on hand | `SUM(qty_remaining)` WHERE `is_leaf = true AND is_archived = false` |
| Total inventory value | `SUM(qty_remaining × cost_per_round)` WHERE `is_leaf = true AND is_archived = false` |
| Total rounds expended | `SUM(rounds_used)` FROM `expenditure_log` WHERE `log_type = 'expend'` only |

Split and adjust entries are **never** counted as rounds used in reports.

#### Adjustment Entries

- Admin-only: create an `adjust` entry with a negative `rounds_used` to restore rounds after a logging mistake
- Example: logged 50 expended, only shot 30 — Admin creates adjust with `rounds_used = -20`; `qty_remaining` is restored
- No expenditure_log entries can ever be deleted
- `expend` and `split` entries are immutable after creation

### 6.14 Product Catalog

Products are reusable templates that can be linked to ammo boxes.

#### products table

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | INTEGER PK | auto |
| `name` | TEXT | auto-generated from manufacturer + product_name + caliber + gr_oz + type |
| `caliber_id` | FK → calibers | required |
| `manufacturer_id` | FK → manufacturers | required |
| `product_name` | TEXT nullable | e.g. "HST 147gr" |
| `gr_oz` | FLOAT nullable | bullet weight |
| `weight_unit` | TEXT | GR or OZ, default GR |
| `type_id` | FK → ammo_types | nullable |
| `category_id` | FK → categories | nullable |
| `ammo_condition_id` | FK → ammo_conditions | nullable |
| `default_cost` | FLOAT nullable | cost per round |
| `upc` | TEXT nullable | barcode for future scanning |
| `image_path` | TEXT nullable | relative path under `/data/uploads/products/` |
| `notes` | TEXT nullable | |
| `owner_id` | FK → users | creator |
| `is_shared` | BOOLEAN | default true |
| `created_at` | DATETIME | auto |
| `updated_at` | DATETIME | auto |

#### Unique constraint

Products are deduplicated using a COALESCE-based expression index (standard UNIQUE cannot handle NULLs):

```sql
CREATE UNIQUE INDEX ix_product_unique
ON products(caliber_id, manufacturer_id, COALESCE(product_name, ''), COALESCE(gr_oz, -1), COALESCE(type_id, -1))
```

#### ammo_box linkage

`ammo_box.product_id` (FK → products, nullable) — set when a box is added from a product selector, created via auto-generate, or matched during CSV import.

#### Auto-generate

`POST /products/auto-generate` (admin only):

1. Load all ammo boxes that have no `product_id` set
2. Group by `(caliber_id, manufacturer_id, COALESCE(product_name, ''), COALESCE(gr_oz, -1), COALESCE(type_id, -1))`
3. For each group: compute most-common category/condition and average cost; create product if key not already in products table
4. Back-fill `product_id` on every box whose key matches
5. Return counts: created, already_existed, boxes_linked

#### Image storage

Product images are stored at `/data/uploads/products/{id}.{ext}`. The extension is determined at upload time from the file's content type. Served by `GET /products/{id}/image`. Maximum size: 5 MB. Accepted types: jpg, jpeg, png, webp.

#### API

| Method | Path | Auth | Notes |
| ------ | ---- | ---- | ----- |
| GET | `/products` | any | list, supports `?search=`, `?caliber_id=`, `?my_only=` |
| POST | `/products` | member+ | create |
| GET | `/products/{id}` | any | single product with joined names and usage_count |
| PUT | `/products/{id}` | owner or admin | update |
| DELETE | `/products/{id}` | owner or admin | also deletes image file |
| POST | `/products/{id}/image` | owner or admin | multipart upload |
| DELETE | `/products/{id}/image` | owner or admin | removes file and clears image_path |
| GET | `/products/{id}/image` | any | FileResponse |
| POST | `/products/auto-generate` | admin | batch create from inventory |

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

### 8.5 Ammo Condition Seeds

Default values for the `ammo_conditions` lookup table:

```yaml
ammo_conditions:
  - "Factory New"
  - "Remanufactured"
  - "Reloaded / Handload"
  - "Military Surplus"
  - "Old"
  - "Unknown"
```

These represent the production origin of the ammunition. `Factory New` is the most common and should be displayed first. `Old` means aged ammunition of known origin; `Unknown` means origin is completely unknown. All six values ship in `defaults.yaml` and are synced on startup.

### 8.6 Community Contributions

Any user can submit a pull request to `defaults.yaml` to add calibers, manufacturers, or types. Bump the `version` field with each PR. New defaults are applied to all installations on the next startup after upgrade.

---

## 9. Feature Specifications — v1.0

### 9.1 Overview Dashboard

#### Scope Selector

Toggle at the top of the dashboard — controls which inventory all stats and widgets reflect:

```text
[ My Ammo ]  [ Shared ]  [ All ]   ← All visible to Admin only
```

Default: **My Ammo**. Device remembers last selected scope via `localStorage`.

#### Stats Cards (row of 4)

| Card | Value |
| ---- | ----- |
| Total Rounds | Sum of `qty_remaining` for leaf, non-archived boxes in scope |
| Total Value | Sum of `qty_remaining × cost_per_round` for leaf, non-archived boxes in scope |
| Calibers Tracked | Distinct caliber count for boxes in scope |
| Running Low | Count of calibers below configured threshold in scope |

All stats respect the leaf box definition from §6.13.

#### Caliber Breakdown Table

Per caliber in scope: caliber name, rounds on hand, number of boxes, estimated value, status indicator (healthy / low / empty).

#### Recent Activity

Last 10 `expenditure_log` entries where `log_type = 'expend'` — showing date, who logged it, Box ID, caliber, and rounds used.

#### Low Stock Alerts

Running Low section shows two subsections:

- **By Caliber** — calibers where total rounds on hand (across all non-archived boxes) are below the threshold. Threshold resolution: per-caliber override → global default.
- **By Location** — locations where total rounds on hand (all non-archived boxes in containers at that location) are below the location's explicit threshold. Only locations with a threshold set appear here.

The Low Stock Items stat card counts low calibers + low locations.

Thresholds are stored server-side in the database and shared across all users. Three-tier resolution:

1. **Global default** — `threshold_default_rounds` in `app_settings`; default 200 rounds.
2. **Per-caliber** — `caliber_thresholds` table; overrides global default for a specific caliber.
3. **Per-location** — `location_thresholds` table; independent of caliber thresholds; only triggers alerts when explicitly set.

**API endpoints** (all require authentication):

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/thresholds/default` | Get global default rounds |
| PUT | `/thresholds/default` | Update global default (admin only) |
| GET | `/thresholds/calibers` | List per-caliber thresholds with on-hand and status |
| POST | `/thresholds/calibers` | Create or update a caliber threshold |
| DELETE | `/thresholds/calibers/{caliber_id}` | Remove a caliber threshold |
| GET | `/thresholds/locations` | List per-location thresholds with on-hand and status |
| POST | `/thresholds/locations` | Create or update a location threshold |
| DELETE | `/thresholds/locations/{location_id}` | Remove a location threshold |
| GET | `/thresholds/low-stock` | Combined low calibers + low locations for dashboard |

#### Getting Started Guide

Shown as an overlay on first login after account creation:

```text
Checklist:
  □ Add your first ammo box
  □ Set up storage locations
  □ Configure backup schedule
  □ Invite family members  (Admin only)
```

"Don't show again" checkbox saved to `localStorage`. Reopenable from the nav bar help icon or the About page.

### 9.2 Ammo Inventory

#### Add Ammo Box

- Form with all fields from Section 6.2
- `is_shared` toggle — defaults to `false` (private)
- Caliber, manufacturer, type, condition, category, dealer dropdowns all support inline **Add New**
- **Product Name** — free-text field positioned directly below Manufacturer; not a dropdown (product lines too varied to maintain a list); carries through to the Add X Copies and Restock features
- **Condition** — optional dropdown between Type and Category; values from `ammo_conditions` lookup (Factory New, Remanufactured, Reloaded / Handload, Military Surplus, Old / Unknown); defaults to blank (no selection required)
- Cost entered per round; calculated box total shown alongside for reference
- Container and location are optional — a **None** option is always available

#### Add X Copies

- **Number of boxes** field on the add form; defaults to 1
- If quantity > 1: creates N identical `ammo_box` records in a single DB transaction
- Each box gets a unique auto-incremented ID; all field values are identical across copies
- API response returns all created box IDs
- Success message: "Added N boxes (#X–#Y)"
- Use case: buying a case that contains multiple identical boxes

#### Inventory List

| Column | Content | Notes |
|--------|---------|-------|
| Expand | Chevron toggle | Reveals detail row |
| ID | Box ID (bold); `legacy_id` below in gray if set | — |
| Caliber | Caliber name | Sortable |
| Manufacturer | Manufacturer name; `product_name` below in gray if set | Sortable |
| Gr/Oz | Bullet weight + unit | — |
| Type | Ammo type name | — |
| Condition | Condition badge (Factory New, Remanufactured, etc.); hidden when null | — |
| Category | Category name | — |
| Remaining | Round count + inline progress bar; click opens QuickExpendPopover | Sortable |
| Value | `qty_remaining × cost_per_round`; shown only if cost is set | — |
| Shared | "Shared" badge or "Private" text | — |
| Actions | Edit (pencil), Delete (trash), Archive (box-x) icons | Role-gated |

- Sortable columns: ID, Caliber, Manufacturer, Remaining (default sort: ID ascending)
- Amber row tint when box is below configured threshold
- Progress bar: green > 50 %, amber 20–50 %, red < 20 %
- Clicking Remaining opens QuickExpendPopover (`stopPropagation` prevents row expansion)
- `read_only` users see the count but cannot click to expend
- Empty boxes hidden by default; toggle above list: **Show empty boxes**
- Members see: all shared boxes + their own private boxes; Admin sees: all boxes

#### Group By

Toolbar dropdown (persisted to `localStorage` key `inventory_group_by`):

| Option | Groups by |
| -------- | ----------- |
| None (default) | No grouping |
| Caliber | `caliber_id` |
| Manufacturer | `manufacturer_id` |
| Category | `category_id` |
| Type | `type_id` |
| Location | Container's `location_id` |
| Container | `container_id` |
| Condition | `ammo_condition_id` |

- Groups sorted alphabetically; boxes without a value for the field collected into "No [Field]" group shown last
- Each group header row spans the full table width, amber-tinted background
- Header shows: ▼/▶ toggle · group name · box count badge · total rounds · total value · low-stock count (amber, only if > 0)
- Click group header to collapse/expand that group
- All groups start expanded when Group By selection changes
- "Collapse All" and "Expand All" toolbar buttons appear when Group By is active
- Collapse state resets on Group By change; not persisted to localStorage

#### Per-Column Filters

Always-visible filter row directly below the column headers. All filters are AND-combined with each other and with the global search bar.

| Column | Filter behavior |
| -------- | ---------------- |
| ID | Partial match on numeric `id` or `legacy_id` string |
| Caliber | Partial match on caliber name, case-insensitive |
| Manufacturer | Partial match on manufacturer name and `product_name` |
| Gr/Oz | Partial match on weight value string |
| Type | Partial match on type name |
| Category | Partial match on category name |
| Remaining | Operator filter: `50` = exact, `<50` = less than, `>100` = greater than, `10-50` = range |
| Value | Same operator filter as Remaining |
| Shared | Prefix match: `s`/`shared` → shared only; `p`/`private` → private only |

- Active filter inputs highlighted with gold border
- "N filters active" counter and "Clear Filters" button appear in toolbar when any column filter is set
- Stats row (Boxes / Rounds / Value) reflects currently visible filtered rows, not total inventory
- Column filters reset on page refresh; Group By persists

#### Export CSV (Toolbar)

- **Export CSV** button in the inventory toolbar (outline style, with Download icon), right of the search row
- Opens a confirmation dialog: "Export N boxes to CSV?" — N reflects currently filtered row count
- On confirm: `window.location.href` navigates to `GET /ammo/export/csv` with current `search`, `show_archived`, and `show_empty` query params
- Downloaded file: `ammoledger_export_YYYY-MM-DD.csv`
- All users with inventory access can export (respects RBAC visibility filter — members only export boxes they can see)
- Column layout and content identical to the importer template — file is round-trip importable

#### Expanded Row

Two-column layout inside a `<tr>` below the main row:

- **Left column:** Purchase date, Dealer, Container, Notes (each shown only if set)
- **Right column:** Expenditure history — date, rounds used, optional notes per entry; "No expenditure history" when empty

Future action buttons at bottom of expanded row: Restock, Split (placeholder until implemented).

#### Bulk Select and Edit

A checkbox column (leftmost) enables multi-box selection for batch operations.

**Checkbox column:**

- Header checkbox: selects / deselects all visible (filtered) boxes; shows indeterminate state when partially selected
- Row checkboxes: hidden until hover when nothing is selected; always visible when any box is selected
- Group header checkbox: selects / deselects all boxes in that group; shows indeterminate state when partially selected
- Selection cleared automatically when filters, Group By, or search changes

**Bulk action toolbar** (amber bar, visible when selection > 0):

- Shows selected count and a Clear button
- "Edit Selected" button opens the Bulk Edit side panel

**Bulk Edit side panel** (right-side sheet drawer):

- Title: "Edit N Selected Boxes"
- Fields: Manufacturer, Type, Category, Condition, Dealer, Location (UI-only filter for Container dropdown), Container, Shared (admin only), Cost per Round, Notes
- Each field defaults to the common value if all selected boxes share the same value; otherwise shows blank with "Mixed" hint
- Blank / unchanged field = keep each box's existing value; only non-blank fields are applied
- Notes field shows Append / Replace radio buttons when text is entered
- Confirmation dialog shows the list of fields being changed and box count before applying
- Backend: `PATCH /ammo/bulk-update` — max 500 IDs per call; members can only update boxes they own; admins can update any box; 403 if member tries to set `is_shared=true`

### 9.2.1 QuickExpendPopover

Anchored popover attached to the Remaining cell. Opens on click, closes on Cancel or successful submission.

#### Header

"Box #[id] — [caliber] [manufacturer]" in bold  
"[N] rounds remaining" in muted text below

#### Preset Buttons

- **Shot All** — always shown; sets quantity input to `qty_remaining`
- **Shot 50 / Shot 25 / Shot 10 / Shot 5** — shown only when `qty_remaining` is strictly greater than that number (avoids duplicating Shot All)

#### Input Fields

- **Rounds used** — numeric input; validated `1 ≤ rounds ≤ qty_remaining`
- **Notes** — optional free-text

#### Actions

- **Cancel** — closes popover, clears state
- **Log Usage** — calls `POST /ammo/{id}/expend`; on success: invalidates `['ammo']` query cache, shows toast "Logged N rounds for [caliber]", closes popover; on error: shows inline error message

#### RBAC

Same rules as the existing Log Use button: `read_only` cannot expend; members can log own and shared boxes; admins can log all boxes.

### 9.2.4 Split Box

#### Use Case

A user purchases a case as one entry. Later opens it and needs to track individual boxes separately.

#### Split Types

| Type | Behaviour |
| ---- | --------- |
| **Full Split** | All rounds in parent accounted for in new boxes; original archived (`archive_reason = "split"`); `is_leaf` becomes false on parent |
| **Partial Split** | Splits off some boxes; original `qty_remaining` reduced by split amount; original stays active as a leaf |

#### Split Modes

**Equal Split (Mode A):** Specify the number of boxes; rounds per box auto-calculated from `qty_remaining`; user can override rounds per box; total must equal `qty_remaining` for a full split.

**Custom Split (Mode B):** Specify rounds per box individually; add as many boxes as needed; running total vs available rounds shown; `[ + Add another box ]` button.

#### Fields Inherited by New Boxes

Inherited from parent: caliber, manufacturer, product_name, type, category, grain, weight_unit, purchase_date, cost_per_round, dealer, is_shared, owner_id.

Reset on new boxes: container, location, notes, legacy_id — each gets a unique auto-incremented ID; `split_from_id` set to parent box ID.

#### Audit Trail

An `expenditure_log` entry is written on the parent box: `log_type = "split"`, `rounds_used` = total rounds split out, `related_ids` = JSON array of new child box IDs. Split entries are never counted in usage reports.

#### Validation

- Split total cannot exceed `qty_remaining` — error code `SPLIT_EXCEEDS_AVAILABLE`
- Minimum 2 boxes in any split; each box must have at least 1 round

#### UI Flow

Access via box detail page or inventory list `⋮` menu → **Split Box**. Preview screen shows all boxes to be created before confirming. Success: "Split complete — N new boxes created (#X–#Y)" with links.

### 9.2.5 Restock / Add Same

Any existing box can be used as a template to quickly add new boxes of the same ammo. Eliminates re-entering all fields when restocking.

#### Access Points

Inventory list `⋮` → **Restock**, box detail page **Restock This Ammo** button, or empty box detail **Restock This Ammo** call-to-action.

#### Pre-populated Fields

Opens the Add Ammo form with these copied from the source box: caliber, manufacturer, product name, grain, weight unit, type, category, dealer, cost per round (editable — prices change), qty per box (from `qty_original` of source box).

Fields reset to defaults: purchase date → today, container → blank, location → blank, notes → blank, number of boxes → 1, is_shared → user default.

Form header: *"Based on Box #47 — edit any fields"*. Submitting creates new boxes — source box is unchanged.

### 9.3 Expend Rounds

- Search for a box by ID, caliber, or brand
- Options: **Shot All**, **Shot Some** (enter count), or **Custom**
- Confirmation shows new `qty_remaining` before committing
- Entry written to `expenditure_log` with `logged_by`, date, and optional notes

### 9.4 Search & Filter

#### Global Search

Single search box at the top of the inventory list. Searches across: caliber, manufacturer, product_name, legacy_id, type, category, dealer, notes. Fires on keystroke with 300ms debounce; minimum 2 characters; results update without page reload.

#### Quick Filter Chips

Horizontal scrollable row below the search box: most common calibers as chips, type chips (FMJ, JHP, Slug, etc.), condition chips (Factory New, Remanufactured, etc.), category chips. Active chips highlighted; click to toggle off.

#### Advanced Filter Panel

Collapsible panel with full options:

- Caliber, Manufacturer, Type, Condition, Category, Location, Container, Dealer (all multi-select dropdowns)
- Purchase date range (from / to)
- Cost per round range (min / max)
- Qty remaining range (min / max)
- Show empty boxes toggle
- Show archived boxes toggle

#### Filter Summary Bar

Shown when any filter is active: *"Showing X boxes — N rounds — $Y value"* with a **Clear all filters** link.

#### Sort

Click any column header to sort ascending; click again for descending. Arrow indicator on active sort column. Default sort: newest first (`created_at DESC`). Sort preference persists for the session.

#### URL State

Active filters and sort are reflected in the URL — links are bookmarkable and shareable.

#### Performance Target

Results in under 200ms for up to 10,000 box records, relying on the indexes defined in §6.9.

### 9.5 User Management (Admin)

Single unified page at `/admin/users` combining user administration and invitation management.

#### Users section

- List all accounts: name, email, role, status, last login
- Change a user's role via inline dropdown
- Activate or deactivate an account (deactivated accounts cannot log in; records preserved)
- Generate a one-time password reset link (24h expiry) — Link icon per row
- Reset a user's password directly (admin sets it, flags `must_change_password`) — Key icon per row

#### Active Invitations section

- Lists only `valid` (pending) invitations
- Columns: email hint, role, created at, expires with days-remaining
- **Copy Link** button per row to re-copy the invite URL
- **Revoke** button to invalidate a pending invite
- Empty state prompts admin to use Invite User

#### Invitation History section

- Shows expired, used, and revoked invites from the last 30 days
- **Show older** expands to include invites beyond 30 days (displayed at reduced opacity)
- Columns: email hint, role, created, status badge

#### Invite User modal

- **Invite User** button in top-bar opens modal
- Fields: role (Member default), email hint (optional), expires in (72 h default)
- Success state displays the generated URL with copy button and expiry timestamp
- On success, Active Invitations table refreshes automatically; Done closes the modal and resets the form

The old `/admin/invites` URL redirects to `/admin/users`.

### 9.6 Settings

- Change own password (subject to full password requirements and history check)
- Configure low-stock threshold per caliber
- View YAML seed sync log (what was added on last startup)
- Backup controls (Admin only — see Section 11)

#### Lookup Tables page (`/admin/lookups`) — Admin only

Eight collapsible accordion sections, all collapsed by default:

**Sections:** Calibers, Manufacturers, Ammo Types, Categories, Ammo Conditions, Dealers, Locations, Containers

Each section header shows the count of active entries. Click to expand.

**Expanded section content:**

- Search input — real-time case-insensitive partial match on entry name
- Scrollable table (max 400 px) with columns:
  - **Name** | **Website** (Manufacturers and Dealers only) | **Source** | **In Use** | **Actions**
- **Source** badge: `yaml` (gray) for YAML-seeded entries, `user` (gold) for admin-created entries
- **In Use** count: number of non-archived ammo boxes currently using this lookup value; `—` when zero
- Hidden/inactive entries shown at the bottom of each section in muted text with strikethrough on the name
- Add new entry form at the bottom of each section (Name input; URL input for Manufacturers and Dealers)

**Action rules:**

| Condition | Available actions |
|-----------|-------------------|
| YAML entry, in use (boxes > 0) | Edit only |
| YAML entry, not in use, active | Edit + Hide |
| User entry, in use | Edit only |
| User entry, not in use, active | Edit + Delete (with confirmation dialog) |
| Any inactive entry | Unhide only |

- **Hide** sets `is_active = false` — entry disappears from all form dropdowns; a warning tooltip notes it will be restored on next restart (YAML entries are re-seeded on startup)
- **Delete** permanently removes user-created entries with no associated boxes; blocked with a clear error for YAML entries or entries still in use
- **Unhide** sets `is_active = true` — entry reappears in form dropdowns immediately

**`active_only` filter on all lookup endpoints:**

All lookup GET endpoints (`/calibers`, `/manufacturers`, etc.) accept `active_only: bool` (default `true`). Form dropdowns use the default and never show hidden entries. The Lookups admin page fetches with `active_only=false` to display the full list including hidden entries.

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
- Ammo boxes are created with `owner_id` = importing user by default; `is_shared` defaults to `false`
- `owner` column (optional): username → user lookup; if not found, falls back to importing user + per-row warning
- `created_at` / `updated_at` columns (optional): ISO datetime; if invalid, falls back to current time + per-row warning
- `id` column (optional): always ignored — use `legacy_id` for ID mapping; presence generates a one-time validation warning
- Duplicate detection: `caliber + manufacturer + purchase_date + cost_per_round` — duplicates are skipped, not errored
- Fuzzy-matched values use the existing DB entry, not the raw imported string
- Returns import summary: `X rows imported, Y duplicates skipped, Z warnings`

#### Legacy ID Mode

When the CSV was exported from another system that used numeric IDs, AmmoLedger can optionally preserve those IDs as the new box IDs rather than auto-assigning new ones.

##### Eligibility

The validate endpoint returns a `legacy_id_mode` block:

| Field | Type | Meaning |
| ----- | ---- | ------- |
| `all_integers` | bool | Every non-blank `legacy_id` value is a positive integer |
| `conflict_count` | int | Number of legacy IDs that already exist as box IDs in the DB |
| `conflicting_ids` | int[] | Up to 10 conflicting IDs (preview) |
| `has_more_conflicts` | bool | More than 10 conflicts exist |
| `blank_count` | int | Rows with no `legacy_id` value |
| `eligible` | bool | `all_integers=true` AND `conflict_count=0` |

Legacy ID mode is only offered when `eligible=true`.

##### UI behaviour

- **State A — eligible:** Radio button group: "Use Legacy IDs as box IDs" / "Assign new sequential IDs" (default). If `blank_count > 0`, a note explains those rows will receive a new sequential ID.
- **State B — conflicts:** Amber warning box listing the conflicting IDs. Sequential IDs will be assigned; legacy IDs stored in the Legacy ID field.
- **State C — non-numeric:** Info box noting non-integer IDs are present. Sequential IDs will be assigned.

##### Confirm endpoint behaviour

When `use_legacy_ids=true`:

1. Re-runs eligibility check against live DB state (guard against race conditions)
2. Each eligible row is inserted with `id = int(legacy_id)` explicitly set
3. Rows with blank `legacy_id` receive a new auto-increment ID
4. After commit, `sqlite_sequence` is reset to `MAX(id)` so future inserts continue from the correct position
5. Response includes `legacy_id_mode_used: true` and `autoincrement_reset_to: N`

When `use_legacy_ids=false` (or omitted), behaviour is unchanged — all rows receive new auto-increment IDs and `legacy_id` is stored in the `legacy_id` field.

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
grain, weight_unit, type, ammo_condition, category, qty_original,
qty_remaining, purchase_date, cost_per_round, dealer,
container, location, legacy_id, notes
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
| ammo_condition | No | text | Factory New, Remanufactured, etc.; matched to ammo_conditions lookup; auto-created if no match |
| category | No | text | Hunting, Defense, Target, etc.; auto-created if no match |
| qty_original | Yes | integer | Box size when purchased |
| qty_remaining | Yes | integer | Current rounds on hand; capped to `qty_original` if higher |
| purchase_date | No | YYYY-MM-DD | Left blank if format unrecognised |
| cost_per_round | No | decimal | e.g. `0.32`; set to `0.00` if missing |
| dealer | No | text | Matched to dealers lookup; auto-created if no match |
| container | No | text | Must match an existing container name |
| location | No | text | Must match an existing location name |
| legacy_id | No | integer or text | ID from a previous tracking system; used as AmmoLedger box ID when Legacy ID Mode is eligible |
| notes | No | text | Free text |

### 9.9 Notifications

#### Notification Types

| Type | Trigger |
| ---- | ------- |
| `low_stock` | A caliber drops below its configured threshold |
| `backup_failure` | Scheduled or manual backup fails |
| `backup_success` | Scheduled backup completes successfully |
| `import_complete` | CSV import finishes |
| `new_user` | A new user registers (Admin only) |
| `update_available` | A newer GitHub release is detected |

#### Delivery Channels

All channels are optional and configured independently in `config.yaml`. Multiple channels can be active simultaneously.

**In-app (always enabled):** Bell icon in nav bar with unread count badge. Notification panel slides out on click showing recent alerts. Mark as read individually or all at once. Notifications stored in the `notifications` table (§6.12).

**Email (optional, requires SMTP config):** Uses the SMTP settings already in `config.yaml`. Per-user opt-in from profile settings. Configurable per notification type.

**Discord (optional):** Webhook URL configured in `config.yaml`. Sends formatted embed messages to a Discord channel. Configurable per notification type.

**Extensible design:** Notification system uses a channel interface (`send(notification)`) so additional clients (Slack, Telegram, Pushover, Gotify) can be added in future versions without changing core notification logic.

#### Config Structure

```yaml
notifications:
  discord:
    enabled: false
    webhook_url: ""
    notify_on: ["low_stock", "backup_failure", "update_available"]
  email:
    notify_on: ["backup_failure"]
  low_stock:
    default_threshold: 50
    per_caliber_thresholds: {}
```

### 9.10 Version Info & About

#### About Page

Accessible from the nav bar. Shows: AmmoLedger logo and tagline, current installed version (e.g. `v1.2.0`), update status (up-to-date or newer version available with a link to GitHub releases), last-checked timestamp, links to GitHub repo, issues, changelog, and documentation.

Admin users see a **Check Now** button next to the last-checked time that forces a fresh GitHub version check bypassing the 24-hour cache. Clicking it spins while the check runs and updates the status immediately.

#### Update Detection

`GET /system/version` checks the GitHub API on every call, using a 24-hour cache stored in `app_settings`:

| Setting key | Value |
| --- | --- |
| `latest_version` | Latest release tag (stripped of `v` prefix) |
| `update_available` | `"true"` or `"false"` |
| `version_last_checked` | ISO 8601 timestamp of last check |

```text
GET https://api.github.com/repos/crzykidd/AmmoLedger/releases/latest
```

If the GitHub API call fails (network error, rate limit), the previously cached values are returned unchanged. Never sends any user data — read-only public API.

`POST /system/version/check` (admin-only) forces a fresh check regardless of cache age, returns the same shape as `GET /system/version`.

#### Release Notes on Upgrade

On startup, `_record_version()` compares `__version__` to `last_seen_version` in `app_settings`. If the version changed, the old version is stored in `upgraded_from`.

`GET /system/version` returns `upgraded_from` (non-null after an upgrade, null after dismissal).

When `upgraded_from` is set, a **What's New** modal is shown to any authenticated user. The modal:

- Fetches `GET /system/changelog?from_version=<upgraded_from>&to_version=<current>` for release notes
- Tries GitHub Releases API first; falls back to parsing `CHANGELOG.md` from the filesystem; returns empty if neither is available
- Has an **X** button in the header and a **Got it** button in the footer — both call `POST /system/version/dismiss-upgrade` which clears `upgraded_from`

`GET /system/changelog?from_version=&to_version=` returns:

```json
{
  "source": "github" | "local" | "unavailable",
  "sections": [
    { "version": "0.2.0", "date": "2024-01-15", "body": "### Added\n- ..." }
  ]
}
```

#### Version Storage

Current version stored in `backend/version.py`:

```python
__version__ = "0.1.0"
```

Single source of truth for the entire app. Docker image built with this version baked in. GitHub Actions tags the image with this version on release.

### 9.11 Empty Box & Archive Behavior

#### Empty Boxes

- Boxes with `qty_remaining = 0` are considered empty
- Hidden from the inventory list by default
- Toggle above inventory list: **Show empty boxes**
- Toggle state saved to `localStorage` per device

#### Archived Boxes

- Boxes can be archived three ways: fully split (`archive_reason = "split"`), manually by the user (`archive_reason = "manual"`), or auto-archived after N days empty (future config option)
- Archived boxes hidden from inventory by default
- Separate toggle: **Show archived boxes**
- Archived boxes are never deleted automatically — all expenditure history is preserved

### 9.12 Help System

#### Help Page (`/help`)

- Accessible to all authenticated roles via sidebar (HelpCircle icon, below About)
- Content defined in `docs/HELP.md`; mirrored as a structured TypeScript constant in the page component
- Two-column desktop layout: sticky TOC sidebar (## section headings as anchor links) + scrollable main content
- Search input at top — filters to sections and items matching the query; highlights matching text
- Collapsible sections (## headings) — click to expand/collapse all items in a section
- Collapsible Q&A items (### headings) — individual accordion, auto-expanded when a search is active
- Covers: Getting Started, Inventory, Stock Thresholds, Import, Backup & Restore, User Management, About

#### Contextual Help Tooltips (HelpTip component)

- Reusable `HelpTip` component renders a small ⓘ icon (Info, 14px, muted gray)
- Popover opens on hover (150ms close delay) or click; dismisses on click-outside
- Dark background, light text; max-width 250px; positioned above trigger with auto-flip
- Placed next to field labels in: Add/Edit Ammo Box form (12 fields), Inventory toolbar (Group By, Show Empty, Archived), Stock Thresholds page (3 threshold labels), Import page (Ownership and ID Assignment sections)

### 9.13 Product Catalog

#### Products Page (`/products`)

- Accessible to all authenticated roles via sidebar (BookOpen icon, between Inventory and Import)
- Two view modes: **Grid** (image card layout) and **List** (compact rows) — toggled by icon buttons, saved to localStorage
- Search input filters by name, caliber, or manufacturer (client-side across loaded results)
- Caliber filter dropdown to narrow list to a single caliber
- **Add Product** button opens a Sheet drawer (member+ only)
- Each product card/row shows: name, caliber, bullet weight+unit, type badge, usage count ("X boxes"), and product image (or placeholder icon)
- Card actions: **Add Box** (navigates to `/inventory?product_id={id}`) and edit/delete (owner or admin)
- Delete confirmation AlertDialog before removing a product
- **Auto-Generate** button (admin only) — triggers `POST /products/auto-generate`; shows counts of created products and linked boxes in a success toast

#### Product Form Sheet

Fields: Name (auto-built, read-only), Caliber (required), Manufacturer (required), Product Name (free text), Gr/Oz + Unit toggle (GR/OZ), Type, Category, Condition, Default Cost per Round, UPC, Shared toggle, Notes, Image upload area

Image upload area: click to browse or drag-and-drop; shows preview with remove button; accepts jpg/jpeg/png/webp ≤ 5 MB; uploaded after save via `POST /products/{id}/image`

#### Add Box Integration

- `AmmoFormPanel` shows a **Product Selector** at the top of the Add form (hidden in edit mode)
- Selector: search-as-you-type input, dropdown of matching products, "Enter details manually →" link
- Selecting a product calls `applyProduct()` — fills caliber, manufacturer, product_name, gr_oz, weight_unit, type, category, condition, cost_per_round from the product and switches to manual mode
- In manual mode: shows selected product name in a muted chip with a ×Clear link
- "Enter details manually" hides the selector and lets the user fill all fields themselves
- When navigating from the Products page ("Add Box" button), the URL carries `?product_id={id}`; InventoryPage reads the param, opens the Add form, and passes `initialProductId` to `AmmoFormPanel` which fetches the product and auto-fills

#### Save as Template Dialog

- Shown after a successful manual box creation (no product selected)
- `AlertDialog` with two actions: **Save as Template** and **Skip**
- Save as Template calls `POST /products` with the box's caliber/manufacturer/product_name/gr_oz/weight_unit/type/category/condition/cost_per_round and `is_shared: true`
- On success: invalidates the products query cache and shows a success toast

#### CSV Import Product Linking

After all boxes are committed in `POST /import/confirm`, a product-linking pass runs:

1. Load all products visible to the importing user (shared + owner's private)
2. Build a lookup dict keyed by `(caliber_id, manufacturer_id, COALESCE(product_name,'').lower(), gr_oz ?? -1, type_id ?? -1)`
3. For each imported box with no `product_id`, compute its key and look up a match
4. If found: set `product_id`; commit the updates
5. Response includes `product_links` count; unmatched boxes can be linked later via Auto-Generate

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

### 11.1 Backup Formats

#### Format A — SQLite File Backup (scheduled/quick)

- Direct copy of `ammoledger.db` file
- Filename: `ammoledger_YYYY-MM-DD_HH-MM.db`
- Stored in `/data/backups/`
- Used for: daily safety net, quick restore to same version
- Restore: stop app, replace `ammoledger.db`, restart — Alembic detects version and migrates automatically if needed
- Cannot be used to restore across major breaking schema changes

#### Format B — JSON Export (on-demand/migration)

- Structured JSON with one array per table
- Version-tagged with AmmoLedger version and Alembic migration number
- Filename: `ammoledger_export_YYYY-MM-DD_HH-MM.json`
- Used for: cross-version migration, moving to new server, pre-import safety backup, human-readable data inspection
- IDs preserved exactly on reimport — box #47 stays box #47, labels do not need reprinting
- SQLite autoincrement sequence reset after import to continue from highest imported ID

#### JSON Export Format

```json
{
  "ammologger_version": "1.0.0",
  "schema_migration": "0009",
  "exported_at": "2026-04-25T03:00:00",
  "tables": {
    "users": ["..."],
    "ammo_box": ["..."],
    "expenditure_log": ["..."],
    "calibers": ["..."],
    "...": "all tables"
  }
}
```

### 11.2 Scheduled Backup (automatic)

- Runs nightly at configured time (default 03:00)
- Format: SQLite file copy (Format A)
- Retention: configurable days (default 30)
- Stored in `/data/backups/`
- Old backups beyond retention pruned automatically
- Runs as internal async task — no external cron

### 11.3 Manual Backup (Admin UI)

Admin panel shows both options:

**Quick Backup (SQLite):**

- Copies current DB file immediately
- Download link provided after completion
- Good for: before making changes, quick safety net

**Data Export (JSON):**

- Full structured export of all data
- Download link provided after completion
- Good for: migrations, moving servers, reading your own data

**CSV Export:**

- `GET /backup/export/csv` — admin-only; exports all boxes including archived as a CSV download
- Filename: `ammoledger_full_export_YYYY-MM-DD.csv`
- Column layout identical to the CSV import template — file is round-trip importable
- Includes `owner`, `created_at`, `updated_at` columns for full fidelity restore via the CSV importer

Last backup and last export timestamps shown.

### 11.4 Version Detection on Startup

The database tracks its own version via two mechanisms:

**`alembic_version` table (managed by Alembic):**

- Contains current migration number e.g. `"0009"`
- Alembic compares this to codebase migrations
- Automatically runs any missing migrations on startup
- Startup log shows: `"Applying migrations: 0007, 0008, 0009... done"`

**`app_settings` table (managed by AmmoLedger):**

- key: `"current_version"` → `"1.0.0"`
- key: `"schema_migration"` → `"0009"`
- On startup: compare stored version to running version
- If different: log upgrade path clearly: `"Previous version: 1.0.0 → Current: 1.1.0"`
- Update stored version after successful startup

This means any SQLite backup (`.db` file) carries its own version information. Copying an old backup into a new installation is safe — Alembic detects the version gap and migrates automatically.

### 11.5 Pre-Import Backup

Before any CSV import:

- System automatically runs a Quick Backup (SQLite)
- Labeled: `ammoledger_pre-import_YYYY-MM-DD.db`
- Import blocked if backup fails to write
- Ensures safe rollback point before data changes

### 11.6 Breaking Migration Playbook

For rare cases where migration cannot be done in-place:

1. On old version: Admin → Data Export (JSON)
2. Download and save the JSON file
3. `docker compose down`
4. Delete or rename `ammoledger.db`
5. `docker compose pull && docker compose up -d`
   → Alembic creates fresh schema from scratch
6. Admin → Import Backup → upload JSON file
   → Importer transforms data to new schema shape
   → IDs preserved throughout

### 11.7 Restore Playbook (SQLite backup)

For restoring from a SQLite backup:

1. `docker compose down`
2. Replace `/data/ammoledger.db` with backup file
3. `docker compose up -d`
   → Alembic detects version, runs any needed migrations automatically
   → App starts normally

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
| Notifications | In-app bell + Discord webhook + Email (SMTP) | Multi-channel; extensible channel interface for future clients |
| Changelog | CHANGELOG.md — Keep a Changelog format | Updated each PR; released with GitHub Releases; powers the in-app About page |

---

## 14. Release Process

### 14.1 Semantic Versioning

| Increment | When |
| --------- | ---- |
| Patch `1.0.x` | Bug fixes; no new features |
| Minor `1.x.0` | New features; backwards compatible |
| Major `x.0.0` | Breaking changes requiring dump → restore migration (see §11.6) |

### 14.2 CHANGELOG.md

- Lives at repo root; follows [Keep a Changelog](https://keepachangelog.com) format
- `[Unreleased]` section updated as features land during each phase
- User-facing language only — describe what changed for the user, not how it was implemented
- Categories: **Added**, **Changed**, **Fixed**, **Security**, **Deprecated**, **Removed**
- One line per change; group minor fixes

### 14.3 Release Steps

```text
1. Move [Unreleased] entries to new version section with today's date:
   ## [1.1.0] - YYYY-MM-DD
2. Commit: "chore: release v1.1.0"
3. Push to main
4. GitHub → Releases → Draft new release
5. Tag: v1.1.0 | Title: AmmoLedger v1.1.0
6. Body: paste the CHANGELOG section for this version
7. Publish → GitHub Actions builds and pushes:
   :1.1.0, :1.1, :1, :latest to GHCR
```

### 14.4 In-App Release Notes

The About page fetches the release body from the GitHub Releases API. The CHANGELOG section for a given version is the single source of truth — no duplication required.

---

## 15. Non-Functional Requirements

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

### 15.1 Configuration

#### Configuration Sources

AmmoLedger merges configuration from three sources in priority order (highest wins):

| Priority | Source | Notes |
| --- | --- | --- |
| 1 (highest) | `AL_*` environment variables | Set in `docker-compose.yml` environment section |
| 2 | `/data/config.yaml` | Mounted from the `ammoledger_data` Docker volume |
| 3 (lowest) | Built-in defaults | Bundled `config.template.yaml` values |

This allows simple deployments to use `config.yaml` for all settings, and container orchestration tools (Komodo, Portainer, Kubernetes) to inject secrets via environment variables without a config file on disk.

If `AL_SESSION_SECRET` is set, `config.yaml` is **not required**. The app loads `config.template.yaml` as the base configuration, applies all `AL_*` overrides, and starts normally.

#### Supported ENV Variables

| ENV Variable | config.yaml key | Type | Description |
| --- | --- | --- | --- |
| `AL_SESSION_SECRET` | `security.session_secret` | string | Session signing key (min 32 chars) |
| `AL_RESET_TOKEN` | `security.reset_token` | string | Emergency admin password reset token |
| `AL_APP_NAME` | `app.name` | string | Application display name |
| `AL_BASE_URL` | `app.base_url` | string | Public URL for links and QR codes |
| `AL_BACKUP_ENABLED` | `backup.enabled` | boolean | Enable nightly scheduled backups |
| `AL_BACKUP_SCHEDULE` | `backup.schedule` | string | Backup time in HH:MM format |
| `AL_BACKUP_RETENTION_DAYS` | `backup.retention_days` | integer | Days to keep old backup files |
| `AL_BACKUP_PATH` | `backup.path` | string | Backup storage directory path |

Boolean ENV values accept `true`, `false`, `1`, `0`, `yes`, `no`, `on`, `off` (case-insensitive).

#### Startup Config Source Logging

On every startup, the backend logs which configuration source supplied each overridden value:

```text
  Config: loaded from /data/config.yaml
  ENV override: AL_SESSION_SECRET → security.session_secret
  ENV override: AL_BASE_URL → app.base_url
```

Or in ENV-only mode:

```text
  Config: no config.yaml — using AL_* environment variables
  ENV override: AL_SESSION_SECRET → security.session_secret
```

#### Configuration Validation

`config.yaml` (or the merged result) is validated on every startup before any other initialisation step. All checks run before reporting so the operator sees every problem at once.

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

### 15.2 Error Handling

#### API Error Format

All API errors return a consistent JSON envelope:

```json
{
  "error": true,
  "code": "ERROR_CODE",
  "message": "Human readable message",
  "detail": "Additional context if available"
}
```

#### Standard Error Codes

| Code | Meaning |
| ---- | ------- |
| `UNAUTHORIZED` | Not logged in |
| `FORBIDDEN` | Insufficient role |
| `NOT_FOUND` | Resource not found or not visible to this user |
| `INSUFFICIENT_ROUNDS` | Expend amount exceeds `qty_remaining` |
| `DUPLICATE_ENTRY` | Unique constraint violation |
| `VALIDATION_ERROR` | Request body failed schema validation |
| `CONFIG_ERROR` | Configuration issue detected on startup |
| `BACKUP_REQUIRED` | Import attempted without required backup |
| `SPLIT_EXCEEDS_AVAILABLE` | Split total exceeds `qty_remaining` |

#### Backend Error Handling

- Global FastAPI exception handler returns the consistent JSON format for all error types
- Full error details logged server-side with timestamp; sensitive data never included in error responses
- 500 errors logged with full stack trace

#### Frontend Error Handling

- React error boundary wraps the entire app
- **Fatal errors:** friendly full-page error screen with "Reload" and "Go to Dashboard" options
- **Non-fatal errors:** toast notification
- **Network errors:** "Cannot reach server — check your connection"
- **Session expiry (401):** redirect to login with return URL preserved; user lands back where they were after logging in
- **Form validation:** inline errors shown next to each field; submit button disabled while errors exist

### 15.3 Logging & Error Handling

#### Log Levels

AmmoLedger uses Python standard logging configured by the `APP_ENV` environment variable:

| Mode | Level | Description |
| ---- | ----- | ----------- |
| `development` (default) | DEBUG | Verbose — request tracing, row counts, per-item seed sync details, box-level round changes |
| `production` | INFO | Operational events only — imports, backups, auth events, threshold changes, errors |

Third-party loggers (`uvicorn.access`, `apscheduler`, `sqlalchemy.engine`) are silenced to `WARNING` in both modes.

#### What Gets Logged

| Category | Events logged |
| -------- | ------------- |
| **Authentication** | Login success/failure, account creation (method: setup/invite), password reset token generated, reset completed. Passwords and tokens are never logged. |
| **Import** | File received with byte count, parsed row/header count, legacy ID analysis result, pre-import backup filename, row insertion progress (every 100 rows in DEBUG), final imported/skipped counts, exceptions with full traceback |
| **Backup** | Manual backup triggered, backup complete with size, JSON export created, restore started, restore complete, file deleted (WARN), scheduled backup start/complete/failure, pruned file count |
| **Inventory** | Box created (DEBUG), box updated (DEBUG), box deleted with username (DEBUG), bulk update with count and username (INFO) |
| **Expenditure** | Rounds logged with box ID and username (INFO), before/after remaining count (DEBUG) |
| **Thresholds** | Default threshold change, per-caliber and per-location threshold set with resolved name |
| **Seeds** | Sync version (INFO), per-table entry count (DEBUG), individual add/deactivate events (DEBUG) |
| **Startup** | Version, config path, migrations complete, defaults synced, scheduler status, server ready |

#### Global Exception Handler

A FastAPI `@app.exception_handler(Exception)` catches any unhandled exception before it reaches the client:

- Logs `ERROR` with the HTTP method, path, and full traceback via `exc_info=`
- Returns HTTP 500 with `{"detail": "Internal server error — check server logs"}`
- No stack trace is exposed to the client
- `HTTPException` instances are handled by FastAPI's own handler first and do not reach this handler

Per-endpoint `try/except` in the import routes supplements the global handler with file-specific context (filename, mode) before re-raising.

#### Log Format

```text
timestamp | LEVEL    | module   | message
```

Example output:

```text
2026-05-01 14:30:00 | INFO     | importer | Import validate started: inventory.csv, 48302 bytes
2026-05-01 14:30:00 | DEBUG    | importer | Parsed 1195 rows, 19 headers found
2026-05-01 14:30:00 | DEBUG    | importer | Legacy ID analysis: all_integers=True, conflicts=0, eligible=True
2026-05-01 14:30:00 | INFO     | importer | Import validate complete: 1195 valid, 0 errors, 2 warnings
2026-05-01 14:30:05 | INFO     | importer | Pre-import backup created: ammoledger_pre-import_2026-05-01_14-30.db
2026-05-01 14:30:05 | INFO     | importer | Import complete: 1195 imported, 0 skipped
```

Viewing logs in a running container:

```bash
docker logs ammologger-backend-1 --follow
```

---

## 16. Open Questions

| # | Question | Recommendation |
|---|----------|----------------|
| 1 | Should Members be able to flip their own private boxes to shared, or is that an Admin-only action? | Allow Members to share their own boxes — keeps the Admin from being a bottleneck for family use |
| 2 | Should backup JSON files be optionally encrypted with a passphrase before download? | Yes, add as an optional config flag — useful if backups are stored on a shared NAS or cloud drive |
| 3 | SMTP for scheduled reports (v2.0) — optional or required? | Optional; app works fully without it; configure in `config.yaml` |
| 4 | Should the CSV import template be versioned so future releases can detect and handle older import files? | Yes — add a `ammoledger_version` header row to the template |

---

*AmmoLedger is an open-source self-hosted project. Contributions to `defaults.yaml` and bug reports are welcome via pull request.*