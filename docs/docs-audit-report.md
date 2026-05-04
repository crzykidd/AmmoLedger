# AmmoLedger Documentation Audit Report

**Audit Date:** May 2026  
**Audited By:** Claude Code (automated documentation audit)  
**Source of Truth:** `dev` branch codebase  
**Current Version:** v0.1.8  

---

## Table of Contents

1. [PRD Accuracy Audit](#a-prd-accuracy-audit)
2. [README Accuracy Audit](#b-readme-accuracy-audit)
3. [CHANGELOG Completeness](#c-changelog-completeness)
4. [0.2.0 Release Gap Analysis](#d-020-release-gap-analysis)

---

## A. PRD Accuracy Audit

### §1 Product Overview

**Status: OK.** The overview, target users, and design principles are accurate and still relevant.

---

### §2 Version Roadmap

**Status: INACCURATE — needs restructuring.**

The roadmap table uses "v1.0" as the first release column. Everything currently in the "v1.0" column is already built and shipped as of v0.1.8. This is confusing and does not reflect the actual release trajectory.

**Current roadmap table issues:**

1. All items listed as "v1.0" are already built and shipped.
2. Split Box and Restock/Add Same are listed as "v0.2.0" — correct, these are not yet built.
3. Notifications are listed as "v0.2.0" — but are NOT yet built. Given the scope, this should probably be deferred to v1.0.
4. Label Printing is listed as "v0.2.0" — not built, and given it's a complex feature, better deferred to v1.0 or v2.0+.
5. The roadmap does not reflect the community-maintained lookup tables feature (Phase 8.14) or the Admin Tasks/Caliber Threshold Drawer features already shipped.

**Recommended restructure:** See `prd-updates.md` for full rewrite.

---

### §3 Ownership Model

**Status: OK.** The `owner_id` + `is_shared` model is accurately described and correctly implemented in `models.py`. The four-state matrix and visibility rules match the `_visibility_filter()` logic in `backend/routers/ammo.py`.

---

### §4 Authentication

#### §4.1 First Run Setup — OK

Accurately describes the first-run flow. Code in `auth.py::setup()` matches — redirects to setup if no users exist.

#### §4.2 Login — MINOR INACCURACY

PRD says "Standard username/password login" and mentions rate-limiting (5 attempts, 15-minute lockout). **The rate-limiting described is NOT implemented.** The login endpoint in `auth.py::login()` has no rate-limiting logic — it checks credentials and returns 401 on failure without any lockout mechanism.

Also, the PRD says "username/password" but the actual implementation uses **email + password** (no separate username for login). The `users` table has a `username` column but its docstring says "kept for DB compat; set to email on create" — login queries by `User.email`.

#### §4.3 Password Reset — OK

Both flows (admin-generated token and config-token self-recovery) are accurately described and correctly implemented in `auth.py`.

#### §4.4 Invitation System — OK

All flows are accurately described. API endpoints match exactly. The role value `"read_only"` (with underscore) is used in the code, while the PRD lists it as `"readonly"` (no underscore). The frontend types use `'read_only'` and the backend validates against `("admin", "member", "read_only")`.

**Minor inaccuracy:** PRD §4.4 lists the role as `readonly` in the table, but the actual stored value is `read_only` (with underscore). Same in §5.1 ("Read-Only" description) — code consistently uses `read_only`.

#### §4.5 Password Requirements — OK

All password rules are implemented. The "must not contain the user's username" check uses `identifier=body.email` (since username = email). The bundled common password list check is implemented in `password_utils.py`.

---

### §5 Multi-User Architecture & RBAC

#### §5.1 Roles — OK

The three roles (Admin, Member, Read-Only) are accurately described. Code uses `"admin"`, `"member"`, `"read_only"`.

#### §5.2 Permission Matrix — MULTIPLE INACCURACIES

Auditing each row against the actual router enforcement:

| Matrix Row | PRD Says | Code Says | Status |
|---|---|---|---|
| Add ammo box (shared) | Admin only | `require_role("admin","member")` then `if shared and not admin: 403` → effectively admin only | OK (enforced at logic level) |
| Add ammo box (private) | Admin + Member | `require_role("admin","member")` | OK |
| Edit/delete own private box | Admin + Member | `_check_write()`: admin or (member + not shared + own box) | OK |
| Edit/delete any box | Admin only | `_check_write()`: admin only for shared boxes | OK |
| Manage lookup tables | Admin only | All lookup write endpoints use `require_role("admin")` | OK |
| CSV import | Admin + Member | `require_auth` — **read_only users can also trigger import** | **INACCURACY** |
| CSV export | All roles | `require_auth` | OK |
| Write threshold overrides | Admin only | `require_role("admin")` on all write threshold endpoints | OK |
| Manage products | Admin + Member | `require_role("admin","member")` | OK |
| Manage containers/locations | Admin + Member | Lookup create endpoints use `require_role("admin")` only | **INACCURACY** |

**CSV Import:** The PRD says only Admin + Member can import. The actual `importer.py` uses `require_auth` (all roles including read_only). This means a read_only user can submit a CSV import — which seems unintentional and creates a privilege violation.

**Manage containers/locations:** The PRD says Admin + Member can manage containers/locations. However, the lookups router uses `require_role("admin")` for all create/update/delete operations. Members cannot add containers or locations.

#### §5.3 Enforcement — OK

Accurate description of server-side enforcement. The frontend does hide elements by role but the API is the authority.

---

### §6 Data Model

#### §6.1 Users — MINOR INACCURACY

PRD shows:
```
users
├── username TEXT
├── email TEXT (optional)
```

**Actual code:** `username` is kept for DB compat and is always set to email on create. `email` is `Optional[str]` at model level but is always set in practice. The PRD does not reflect the `first_name` and `last_name` fields on the users table (migration 0010). These fields are in the model but missing from the PRD's §6.1 schema block.

**Missing from PRD §6.1:** `first_name TEXT`, `last_name TEXT`, `must_change_password BOOLEAN`.

#### §6.2 Ammo Box — MINOR INACCURACY

PRD §6.2 matches the model closely. One gap: `product_id INTEGER FK → products` is in the model but not shown in the PRD §6.2 schema block (it was added in §6.14 instead). The schema block in §6.2 should include `product_id` for completeness.

#### §6.3 Expenditure Log — OK

Matches `models.py::ExpenditureLog` exactly.

#### §6.4 Storage — INACCURACY

PRD §6.4 shows bare schema for locations/containers:
```
locations: id, name, notes
containers: id, name, location_id, notes
```

**Actual model** has additional fields on both:
- `locations`: `is_active BOOLEAN`, `source TEXT`
- `containers`: `is_active BOOLEAN`, `source TEXT`

These were added for the Lookups page redesign (PRD revision 3.4) but the §6.4 schema block was not updated.

#### §6.5 Lookup Tables — MINOR INACCURACY

PRD shows: `calibers — id, name, is_active, source (yaml | user)`. 

**Actual model** for community-managed tables (Caliber, Manufacturer, AmmoType, Dealer) also has:
- `community_key: Optional[str]`
- `is_imported: bool`

The source field now has three values: `yaml | community | user` (not just `yaml | user`).

Also, Dealer has additional geo fields not described in §6.5: `types`, `country`, `state`, `is_standard_geo`. These were mentioned in the CHANGELOG for v0.1.6 but §6.5 wasn't updated.

#### §6.6 App Settings — INCOMPLETE

PRD §6.6 only lists `defaults_version` as a key. Many more keys are now written at runtime:
- `threshold_default_rounds`
- `latest_version`, `update_available`, `version_last_checked`
- `last_backup_at`, `last_backup_file`
- `last_seen_version`, `upgraded_from`
- `current_version`

The table in §6.6 should be expanded.

#### §6.7 Firearms (v2.0) and §6.7 Range Sessions (v2.0) — NOTE: DUPLICATE SECTION NUMBER

PRD has two sections numbered §6.7. The second one (Range Sessions) should be §6.8. All subsequent sections are off by one. Accesssories at §6.8 should be §6.9. The PRD has §6.9 for Database Indexes, which would be §6.10. Etc. This is a formatting error.

#### §6.9 Database Indexes — PARTIAL INACCURACY

The index list in §6.9 includes `notifications: user_id, is_read, created_at`. The notifications table exists in the model but no actual notification routes exist yet. Whether these indexes are in the migration files should be verified (they may be present from migration 0009).

Also lists indexes on `ammo_box.split_from_id` and `ammo_box.location_id` — both exist in the model.

#### §6.10 Invitations — OK

Matches `models.py::Invitation` exactly.

#### §6.11 Password History — OK

Matches `models.py::PasswordHistory` exactly.

#### §6.12 Notifications — SCHEMA EXISTS, FEATURE NOT BUILT

The `notifications` table exists in `models.py::Notification` and matches the PRD §6.12 schema. However, no notification routes, delivery logic, or frontend UI exists. The model is a placeholder.

#### §6.13 Reporting Integrity Rules — PARTIAL (No Split Box Implementation)

The leaf box concept and reporting rules are correctly documented but are only relevant once Split Box is implemented. Split Box fields (`split_from_id`, `is_archived`, `archive_reason`) exist in the model, but no split logic exists in any router. These reporting rules cannot be fully tested until Split Box ships.

#### §6.14 Product Catalog — OK

Accurately describes the products table, unique index, auto-generate logic, image storage, and API endpoints. Matches `models.py::Product` and `routers/products.py`.

---

### §7 Database Migrations — OK

The Alembic migration strategy, file structure, startup sequence, developer workflow, and upgrade/rollback procedures are all accurate. Migration files exist in `backend/migrations/versions/` up to `0020_community_sync_fields.py`.

Minor note: The example in §7.3 shows `0004_add_accessories_table.py` — accessories are a v3.0 feature and this migration doesn't exist. It's just an illustrative example, which is fine.

---

### §8 YAML Seed Data

#### §8.1–§8.5 — PARTIALLY OUTDATED

The YAML seed sync description in §8.1–§8.5 reflects the original `defaults.yaml`-based sync. As of Phase 8.14 (CHANGELOG v0.1.6), the community-maintained lookup tables system was added. The PRD revision history entry 3.11 mentions adding §8.2 and §9.15, but:

1. §8.2 still describes "Sync Config Flags" rather than "Community Contributions" — the revision 3.11 note in the revision history says §8.2 was added but the actual §8.2 in the document body still shows the old content (Sync Config Flags). The community sync system is documented only in the CHANGELOG, not in the PRD body.
2. There is **no §9.15 section** in the document body. Revision 3.11 claims to add §9.15 but it was never written.

**Community Sync System is completely undocumented in the PRD body.** The actual implementation (`utils/community_sync.py`, `routers/community.py`, the `community/` YAML directory, the Datasets page) has no corresponding PRD section.

#### §8.6 Community Contributions — OUTDATED

The PRD §8.6 says "users can submit a pull request to `defaults.yaml` to add calibers, manufacturers, or types." This is the old workflow. The new workflow (Phase 8.14) uses the `community/` directory with separate YAML files per table, pending-import review, and the Contribute button.

---

### §9 Feature Specifications

#### §9.1 Overview Dashboard — OK

The stats cards, By Caliber section with Mix/Stock toggle, Caliber Threshold Drawer, Running Low section, and Recent Activity are all accurately described and match the implemented dashboard. The Getting Started checklist behavior described matches the implementation.

#### §9.2 Ammo Inventory — PARTIAL INACCURACY

**Add ammo box form:** PRD says `is_shared` "defaults to `false` (private)". The `AmmoBoxCreate` schema has `is_shared: bool = False`. But the CHANGELOG (v0.1.0) says "Add Ammo Box form now defaults new boxes to Shared" — which is in direct conflict. The schema default is False (private) but the CHANGELOG says shared. The README also says "Add Box defaults Shared". This is inconsistent — the PRD description is likely what the code actually does (schema default = False) while the UI may show a toggle defaulting to shared.

**Add X Copies:** PRD §9.2 describes a "Number of boxes" field on the add form. This field does NOT exist in the `AmmoBoxCreate` schema (no `quantity` or `copies` field). The backend only creates one box per POST. This feature is described in the PRD but NOT implemented.

**Inventory list columns:** PRD §9.2 lists "Condition" as a column. The implementation adds a condition badge — OK.

**Group By "Location":** PRD says "Location | Container's `location_id`". The CHANGELOG and code description says location is now directly on `ammo_box.location_id` (not through containers). The PRD's Group By Location description is outdated.

**Per-column filter "Shared":** PRD says `s`/`shared` → shared only; `p`/`private` → private only. This is a UI-side filter, not confirmed in this audit but likely implemented.

**Field-scoped search dropdown:** The PRD §9.4 "Quick Filter Chips" and "Advanced Filter Panel" are described but the actual implementation (Phase 8.16 CHANGELOG) added a field-scoped search dropdown instead. The PRD's §9.4 describes a different, more complex filter UI than what exists.

#### §9.2.1 QuickExpendPopover — OK

Accurately describes the implementation including preset buttons, input fields, RBAC, and success/error behavior.

#### §9.2.4 Split Box — NOT BUILT

The specification exists in the PRD. **No split logic exists in any router, model method, or frontend component.** The fields (`split_from_id`, `archive_reason = "split"`) exist in the data model but the actual split functionality is unimplemented.

#### §9.2.5 Restock / Add Same — NOT BUILT

The specification exists. **No restock logic exists anywhere in the codebase.** No router endpoint, no frontend UI component for restocking.

#### §9.3 Expend Rounds — OK

The QuickExpendPopover fulfills this. The `POST /ammo/{box_id}/expend` endpoint is implemented in `routers/expenditure.py`.

#### §9.4 Search & Filter — PARTIALLY INACCURATE

The PRD describes three components: Global Search, Quick Filter Chips, and Advanced Filter Panel. **What's actually built is different:**

- Global search box: **exists** (searches product_name and legacy_id server-side per `GET /ammo?search=`)
- Field-scoped search dropdown: **exists** (added in v0.1.8, not in PRD §9.4)
- Quick Filter Chips: **NOT built** — no caliber/type/condition chip row exists
- Advanced Filter Panel (collapsible with multi-select dropdowns): **NOT built** — what exists is the per-column filter row (always-visible row below headers)

The §9.4 spec is largely superseded by the per-column filters spec added in PRD revision 2.7 (§9.2's Group By and per-column filters). §9.4 was never updated to reflect that quick chips and the advanced panel were replaced by the per-column filter approach.

**URL State preservation:** PRD says "Active filters and sort are reflected in the URL — links are bookmarkable." This is NOT implemented — filters are client-side state only, not URL params.

#### §9.5 User Management (Admin) — OK

Accurately describes the unified `/admin/users` page with Users, Active Invitations, Invitation History sections, and Invite User modal. The redirect from `/admin/invites` to `/admin/users` exists in `App.tsx`.

The PRD mentions "Reset a user's password directly (admin sets it, flags must_change_password) — Key icon per row". This is the `POST /users/{user_id}/reset-password` endpoint — it exists and is implemented.

#### §9.6 Settings — MINOR INACCURACY

The Lookup Tables page description in §9.6 describes 8 accordion sections with source badges `yaml` (gray) and `user` (gold). As of Phase 8.14, there are now three source values: `community` (blue), `user` (gold/amber), and `local` (purple, a demoted community entry). The gray `yaml` source still exists for conditions and categories. The Datasets page description has been partially updated via CHANGELOG but the PRD §9.6 was not updated.

Also: the page was renamed from "Lookups" to "Datasets" in v0.1.8. The PRD still calls it "Lookup Tables page (`/admin/lookups`)".

**Security settings section:** PRD describes configurable registration mode, invite expiry, password min length, and history depth in a Settings UI. No such settings UI exists — these are configured only via `config.yaml`. There is no admin UI panel for these security config values.

#### §9.7 Backup (Admin) — OK

Reference to §11 is accurate. The backup page exists at `/admin/backup`.

#### §9.8 CSV Import — OK

The two-step validate/confirm flow, legacy ID mode, fuzzy matching, pre-import backup, and ownership toggle are all accurately described and implemented.

**Minor note:** PRD says pre-import backup is "Labelled `ammoledger_backup_pre-import_YYYY-MM-DD.json`" (JSON format). The CHANGELOG says it takes a SQLite backup (`pre-import_YYYY-MM-DD.db`) which matches §11.5 which says "Quick Backup (SQLite)". The JSON label in §9.8 is wrong — it should be `.db` not `.json`.

**CSV template columns:** PRD lists `ammoledger_version` as the first column. The actual CSV export (`ammo.py::_CSV_COLUMNS`) starts with `ammologger_version` (note: "logger" not "ledger") — this is a naming inconsistency in the export code vs the PRD spec.

#### §9.9 Notifications — NOT BUILT

The `notifications` table exists in the DB model (migration 0008) but no notification routes, delivery logic (Discord webhook, email, in-app bell icon), or frontend UI exist. The entire §9.9 specification is unimplemented.

#### §9.10 Version Info & About — OK

The About page, version check against GitHub, What's New modal, and upgrade detection are accurately described and implemented.

#### §9.11 Empty Box & Archive Behavior — OK

Accurately describes the implemented behavior. "Show empty boxes" toggle exists. Archive functionality with `is_archived` and `archive_reason` is in the model. The "auto-archived after N days empty (future config option)" is correctly marked as future.

#### §9.12 Help System — OK

The Help page at `/help` with searchable FAQ, collapsible sections, and HelpTip contextual tooltips are accurately described and implemented.

#### §9.13 Product Catalog — OK

Accurately describes the Products page, product form, Add Box integration, Save as Template dialog, and CSV import product linking. Implementation matches.

#### §9.14 Admin Tasks — PARTIALLY INACCURATE

The task registry and history, API endpoints, and Tasks UI are accurately described. However:

**`community_sync` description in §9.14 is wrong:** The PRD says "Placeholder for future community data sync (currently no-ops)". **This is incorrect** — the community sync is fully implemented in `utils/community_sync.py` and `_community_sync_fn()` in `task_definitions.py`. It syncs dealers, manufacturers, calibers, and ammo types from GitHub.

**Missing §9.15:** The PRD revision history entry 3.11 mentions adding §9.15 for the community-maintained lookup tables feature. **This section was never written.** The community sync feature (Phase 8.14) — including the Datasets page, pending-import review, source badges, Contribute button, and GitHub sync mechanism — has no corresponding PRD section.

---

### §10 Future Feature Specifications

#### §10.1–§10.5 (Firearms, Range Sessions, Cleaning, Reporting, Cost Analytics) — OK

These are v2.0 features and correctly placed in Future Specifications. Not yet built. Appropriate.

#### §10.6 Accessories (v3.0) — OK

Correctly placed and described.

#### §10.7 Bulk Label Printing (v2.0) — VERIFY TARGET VERSION

Bulk label printing is in §10 (Future Features) as v2.0. The Version Roadmap table in §2 shows it as v0.2.0. This is a contradiction. Given the complexity (PDF generation, Avery formats, QR codes), v2.0+ is more realistic. **Recommend: move to v1.0 or v2.0 in the roadmap, remove from v0.2.0 target.**

---

### §11 Database Backup — OK

The dual-format backup strategy (SQLite file + JSON export), scheduled backup, manual backup UI, restore playbooks, and pre-import backup are all accurately described and implemented.

---

### §12 Reverse Proxy — OK

The Tailscale, Cloudflare Tunnel, and self-managed reverse proxy options are accurately described.

---

### §13 Technical Stack — MINOR INACCURACY

The CI/CD row says "images published with three-tier tags: `:dev` + `:sha-<hash>` on every push to `main`". This is wrong — dev images are pushed on push to the `dev` branch, not `main`. On push to `main`, `:latest` + `:sha-<hash>` are pushed. On GitHub Release, `:latest`, full semver, and major-only are pushed.

The Notifications row: "In-app bell + Discord webhook + Email (SMTP)" — this is planned, not built. Should note this is v1.0 target.

---

### §14 Release Process — OK

The semantic versioning, CHANGELOG format, and release steps are accurate and match `CLAUDE.md`.

---

### §15 Non-Functional Requirements

#### §15.1 Configuration — OK

ENV variable priority, supported ENV variables, and startup config source logging are accurately described and implemented.

#### §15.2 Error Handling — OK

The API error format and standard error codes are described. The global exception handler is implemented.

#### §15.3 Logging & Error Handling — OK

Log levels, categories, format, and global exception handler are accurately described.

---

### §16 Open Questions — OUTDATED

Several open questions have been answered:

- **Q4** (CSV version header) — Yes, `ammoledger_version` header row is implemented.
- **Q1** (Members sharing their own boxes) — Code enforces admin-only for sharing (`is_shared=true` requires admin role). So the answer is "no, admin only" — this decision was made and should be documented as resolved.
- **Q2** (Encrypted backups) — Not implemented; still open.
- **Q3** (SMTP for reports) — Not built; still open.

---

## B. README Accuracy Audit

### What's Built Section — MOSTLY ACCURATE

The "What's Built" section at the top of the README is accurate and up to date for v0.1.8. All listed features are implemented.

### Features Section — MOSTLY ACCURATE

The full Features list is comprehensive and accurate. A few observations:

**First-run setup wizard:** README says "guides new users through adding inventory, setting thresholds, and inviting others" — this is accurate.

**No mention of Notifications:** The Features section does not mention the planned notifications system, which is correct since it's not built.

**"GHCR image registry":** README correctly shows GHCR paths with `crzykidd` username. No placeholder `YOURUSERNAME` detected.

### Quick Start Instructions — MINOR ISSUE

README says the API docs are at `http://localhost:8000/docs`. In a Docker Compose production setup, ports are bound to `127.0.0.1` — this is accessible if running locally. For remote/NAS access behind a reverse proxy, the path would be `/api/docs`. The README gives correct local access instructions.

### Docker version pull example — OK

The version pull example shows `0.1.8` as a specific version — this will need updating on each release.

### Project Structure — OUTDATED

The Project Structure section in the README is significantly outdated. It shows a minimal file tree that doesn't reflect what's actually been built:

```
backend/
│   └── routers/
│       └── auth.py  ← only one router shown
```

The actual structure has 13 router files. The utils directory also has many more files than shown. This section should be updated or removed.

### `config.yaml` Settings Table — INCOMPLETE

The settings table shows only 4 settings (`session_timeout_hours`, `reset_token`, `backup.schedule`, `backup.retention_days`). The actual `config.yaml` supports many more settings (notifications config, import config, SMTP config, etc.). The table is accurate for what it shows but omits many valid settings.

### `docs/` Reference — INCOMPLETE

README says docs are in `docs/PRD.md` and `docs/INSTALL.md`. There is also `docs/HELP.md` (referenced in the PRD for Help page content). The CONTRIBUTING.md is referenced in the README's Community Data section.

---

## C. CHANGELOG Completeness

### Missing from CHANGELOG

The following built features are either missing or under-described in the CHANGELOG:

1. **InviteManagementPage.tsx exists separately** — The CHANGELOG for v0.1.0 records merging invitations into the Users page and removing the separate page. However, `frontend/src/pages/admin/InviteManagementPage.tsx` still exists as a file. This may be a dead code artifact — the file exists but the route is redirected. Not a CHANGELOG issue but worth noting.

2. **Rate limiting on login** — The PRD §4.2 describes rate limiting but it was never implemented. No CHANGELOG entry removes it from the spec or notes it was deferred.

3. **`local` source for demoted community entries** — The CHANGELOG v0.1.8 mentions "Community entries demoted to `local` show a purple badge" and "`local` source entries can be hidden or permanently deleted". The `source` field in the model has `yaml | community | user` in its comment, but `local` is actually a fourth value used at runtime. The model comment (`# yaml | community | user`) is incorrect — it should include `local`.

### [Unreleased] Section

The `[Unreleased]` section is **empty** — which is correct since all work is captured in versioned releases.

### Changelog Format

Follows Keep a Changelog format. Categories (Added, Changed, Fixed, Security) are used appropriately. User-facing language is maintained.

### Version labeling in CHANGELOG

Multiple versions (0.1.0, 0.1.1, 0.1.2, etc.) were all released on 2026-05-02 or 2026-05-03. This is unusual for semantic versioning but is explained by the project being in pre-1.0 rapid iteration. The dates are accurate.

---

## D. 0.2.0 Release Gap Analysis

### What's Already Done (ships from 0.1.8)

The following features are fully built and working:

- Authentication (login, setup, invite, register, password reset)
- RBAC with three roles (Admin, Member, Read-Only)
- Full ammo inventory CRUD
- Product catalog with images and auto-generate
- Three-tier threshold system (global, per-caliber, per-location) — server-side, admin-only writes
- Dashboard with By Caliber toggle (Mix/Stock views), Running Low, Recent Activity
- Caliber Threshold Drawer
- CSV import with two-step validation, fuzzy matching, legacy ID mode, ownership toggle
- CSV export (filtered inventory + full archive)
- Backup & Restore (SQLite backup, JSON export, scheduled nightly, restore flows)
- Admin Tasks page with job registry, execution history, Run Now
- Community-maintained lookup tables (Datasets page, GitHub sync, pending review, Contribute)
- Bulk select and edit (up to 500 boxes)
- Group By with 8 options, per-column filters, field-scoped search
- User management (roles, deactivation, invite generation, password reset links)
- Help page with searchable FAQ and HelpTip tooltips
- About page with version check and What's New modal
- Password strength enforcement and history
- Structured logging and global exception handler

### Must Have (blocks 0.2.0 tag)

| Feature | Description | Effort |
|---------|-------------|--------|
| **Split Box** | Split a box into two tracking records (equal and custom modes). Fields exist in model; needs router endpoint, audit log entry, and frontend UI. | Large |
| **Restock / Add Same** | Open Add Box form pre-filled from an existing box. No backend changes needed — purely a frontend convenience feature that navigates to Add Box with query params. | Small |

### Should Have (0.2.0 if time, else v1.0)

| Feature | Description | Effort |
|---------|-------------|--------|
| **Add X Copies** | Number-of-boxes field on Add form; backend creates N boxes in one transaction. Small backend change + form field. | Small |
| **URL state for filters** | Active filters and sort reflected in URL for bookmarkability. Purely frontend change. | Medium |
| **Fix CSV import permission** | Import should require `member+` role, not `require_auth` (allows read_only). One-line backend fix. | Small |
| **Rate limiting on login** | PRD specifies 5-attempt lockout. Not implemented. Security feature. | Small-Medium |

### Deferred

| Feature | Target Version | Reason |
|---------|----------------|--------|
| Notifications (in-app bell, Discord, email) | v1.0 | Table exists but no routes, delivery logic, or UI. Substantial work across backend + frontend + config. |
| Label Printing (PDF, Avery, QR codes) | v1.0 or v2.0 | Complex feature requiring PDF generation library. No foundation in codebase. |
| Quick Filter Chips | v1.0 | Nice-to-have; per-column filters cover the use case. |
| Advanced Filter Panel (multi-select) | v1.0 | Per-column filters cover most use cases. |
| URL state for filters | v1.0 | If not prioritized for 0.2.0. |
| Firearms Registry | v2.0 | Separate module, significant scope. |
| Range Sessions | v2.0 | Depends on Firearms Registry. |
| Cleaning Reminders | v2.0 | Depends on Firearms Registry. |
| Reporting & Cost Analytics | v2.0 | After core modules are stable. |
| Accessories Module | v3.0 | Depends on Firearms Registry and Range Sessions. |

### Gap Summary: What Needs to Happen Before Tagging 0.2.0

**Minimum viable 0.2.0:**

1. **Implement Split Box** (large effort) — backend endpoint `POST /ammo/{id}/split`, expenditure log entry with `log_type="split"`, frontend split dialog in inventory row actions menu.
2. **Implement Restock / Add Same** (small effort) — frontend only; "Restock" button in inventory row opens Add Box form with pre-filled values via URL params or state.
3. **Fix CSV import role gate** (trivial) — change `require_auth` to `require_role("admin", "member")` in `importer.py`.
4. **PRD documentation update** — bring PRD current for all built features (§9.15 community section, roadmap restructure, data model corrections).
5. **README update** — update Project Structure section; update version badge to 0.2.0 on release.

**Confirmation of current thinking:**
- Split Box + Restock/Add Same → **confirmed 0.2.0** (code audit confirms these are not built)
- Notifications → **confirmed defer to v1.0** (table exists, nothing else does; substantial scope)
- Label Printing → **confirmed defer to v1.0 or v2.0** (no foundation at all in codebase)
