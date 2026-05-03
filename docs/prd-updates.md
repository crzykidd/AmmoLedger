# PRD Update List

**Source:** docs-audit-report.md  
**Target File:** docs/PRD.md  
**Date:** May 2026  

This document lists every required change to `docs/PRD.md` in section order. Each entry identifies what is wrong, why, and provides the exact replacement text where applicable.

---

## Revision History Table — Add New Entry

Add the following row to the Revision History table (after the existing 3.13 row):

```
| 3.14 | May 2026 | Documentation audit — corrected §2 roadmap structure (0.2.0 → v1.0 → v2.0+); updated §4.2 to reflect email-based login (not username); corrected §5.2 permission matrix (CSV import role, containers/locations); updated §6.1 users schema (added first_name, last_name, must_change_password); updated §6.4 storage schema (added is_active, source); updated §6.5 lookup tables (added community_key, is_imported, local source, dealer geo fields); expanded §6.6 app_settings keys; fixed §6.7 duplicate section number; corrected §8.6 community contributions workflow; added §9.15 community-maintained lookup tables; corrected §9.14 community_sync description; corrected §9.8 pre-import backup format; updated §9.4 search and filter (field-scoped search, removed unbuilt components); corrected §9.6 Datasets page rename; updated §10.7 label printing target version; corrected §13 CI/CD description; resolved §16 open questions. |
```

---

## §1 Product Overview

No changes required.

---

## §2 Version Roadmap — MAJOR REWRITE

**Problem:** The entire roadmap table uses "v1.0" as the first release column. Everything listed as "v1.0" was already shipped as of v0.1.8. The table does not reflect the actual release trajectory. `community_sync` and other recently-built features are not listed.

**Replace the entire §2 section** with:

```markdown
## 2. Version Roadmap

### Shipped (v0.1.x series — current)

The following features are fully implemented and shipping:

| Feature | Description |
|---------|-------------|
| Authentication & First Run | Login, first-run setup, config-based and admin-generated password reset |
| Multi-User Accounts | User management UI; RBAC roles enforced from day one |
| RBAC — Admin / Member / Read-Only | Role-based permission enforcement on all API routes |
| Shared Ownership Model | is_shared flag on ammo boxes; attributed expenditure logging |
| Ammo Inventory | Full CRUD for ammo boxes with all tracked fields |
| Ammo Condition field | Track production origin (Factory New, Remanufactured, Surplus, etc.) |
| Storage — Containers & Locations | Containers and locations; optional, independent assignment to boxes |
| Round Expenditure | Quick-log rounds used; deducts from box quantity |
| Usage History | Timestamped log of all expenditures with user attribution |
| Search & Filter | Field-scoped search dropdown; per-column filters with operators; Group By (8 options) |
| Bulk Select & Edit | Checkbox multi-select; bulk-edit up to 500 boxes in one operation |
| CSV Import | Two-step validate/confirm; fuzzy matching; legacy ID mode; ownership toggle |
| CSV Export | Export filtered inventory or full archive |
| YAML Seed Data | Lookup tables seeded from YAML; auto-synced on startup |
| Community-Maintained Lookups | Dealers, manufacturers, calibers, and ammo types synced from GitHub community/ directory; pending-import review; Contribute button |
| Product Catalog | Reusable product templates with images; auto-fill Add Box; Auto-Generate from inventory |
| Overview Dashboard | Stats cards; By Caliber (Mix/Stock views); Running Low panel; Caliber Threshold Drawer |
| Three-Tier Threshold System | Global default, per-caliber, and per-location; server-side; admin-only writes |
| DB Backup — Manual & Nightly | Admin-triggered or scheduled SQLite backup; JSON export; configurable retention |
| Alembic Migrations | Versioned schema migrations; automatic on startup |
| Admin Tasks Page | Scheduled job registry; Run Now; execution history; enable/disable; edit intervals |
| Help System | Searchable FAQ at /help; HelpTip contextual tooltips on form fields |
| About Page | Version info; GitHub update check; What's New modal on upgrade |
| Password Management | Strength enforcement; history; admin-generated reset links; config-token self-recovery |

### v0.2.0 Target — Next Major Release

Core feature complete. Adds the remaining "range day" workflow features.

| Feature | Description |
|---------|-------------|
| Split Box | Split a box into two separate tracking records (partial split) |
| Restock / Add Same | Quickly restock an existing product without re-entering all fields |
| Add X Copies | Specify number of boxes when adding — creates N identical records in one operation |

### v1.0 Target — Polished Stable Release

Quality, polish, and the first notification channel.

| Feature | Description |
|---------|-------------|
| Notifications | Low-stock alerts and system events via Discord webhook or email |
| Label Printing | Print QR-code labels for boxes; Avery sheet sizes; mobile expend via QR scan |
| Quick Filter Chips | Horizontal scrollable row of caliber, type, and condition chips below search bar |
| Advanced Filter Panel | Multi-select collapsible panel (caliber, manufacturer, type, condition, category, dealer, location) |
| URL State for Filters | Active filters and sort reflected in URL for bookmarkability |
| Mobile Optimization | Full mobile-responsive polish; usable one-handed at the range |

### v2.0 — Firearms & Range

| Feature | Description |
|---------|-------------|
| Firearms Registry | Track owned guns with shared/private ownership model |
| Range Sessions | Log sessions: gun, ammo, rounds fired, date, location |
| Target Photo Uploads | Attach target photos to range sessions |
| Session Sharing | Share range sessions with other users on the instance |
| Cleaning Reminders | Service intervals per firearm; dashboard alerts |
| Reporting | Inventory, spend, usage, and low-stock reports; PDF and CSV export |
| Cost Analytics | Price-per-round over time, spend by dealer, averages by caliber |

### v3.0 — Accessories

| Feature | Description |
|---------|-------------|
| Accessories Module | Track accessories; attach to firearms; shared/private ownership |
```

---

## §4.2 Login — Correct Two Issues

**Problem 1:** PRD says "Standard username/password login". The actual implementation uses email + password, not a separate username.

**Replace:**
> Standard username/password login at the root URL (`/`)

**With:**
> Standard email/password login at the root URL (`/`)

**Problem 2:** PRD says "Failed login attempts are rate-limited (5 attempts, then 15-minute lockout)." This is **not implemented**. The login endpoint has no rate-limiting logic.

**Replace:**
> Failed login attempts are rate-limited (5 attempts, then 15-minute lockout)

**With:**
> Failed login attempts are not currently rate-limited. Rate limiting is a v1.0 target.

---

## §4.4 Invitation System — Role Name Consistency

**Problem:** PRD §4.4 shows the role value as `readonly` (no underscore) in the link states table and invitation flow description. The actual stored value and all code consistently uses `read_only` (with underscore).

**In the registration mode table**, change `readonly` to `read_only` in the role column.

**In the API table notes**, change any reference to `readonly` role to `read_only`.

---

## §5.2 Permission Matrix — Two Corrections

**Problem 1:** CSV import row says "Admin + Member". Actual code uses `require_auth` (all roles, including read_only). This is currently a bug — read_only users can submit imports. Until the bug is fixed, the matrix should note the discrepancy; after the fix ships in 0.2.0, update to "Admin + Member".

**Replace the CSV import row:**
> | CSV import | ✓ | ✓ | ✗ | Imports into own account as private |

**With:**
> | CSV import | ✓ | ✓ | ✗ | Should be admin+member only; read_only enforcement fix targeted for 0.2.0 |

**Problem 2:** "Manage containers / locations" row says "Admin + Member". Actual code: all lookup create/update/delete endpoints use `require_role("admin")` only. Members cannot add containers or locations.

**Replace:**
> | Manage containers / locations | ✓ | ✓ | ✗ | Shared resource; Members can add |

**With:**
> | Manage containers / locations | ✓ | ✗ | ✗ | Admin only; members read lookup data but cannot create/edit/delete entries |

---

## §6.1 Users — Add Missing Fields

**Problem:** The PRD §6.1 schema block is missing `first_name`, `last_name`, and `must_change_password` fields that exist in the model.

**Replace the schema block** with:

```
users
├── id               INTEGER    Primary key
├── username         TEXT       Unique; always set to email value on creation (kept for DB compatibility)
├── email            TEXT       Login email address
├── first_name       TEXT       Default ""
├── last_name        TEXT       Default ""
├── password_hash    TEXT       Bcrypt hash — plaintext never stored or logged
├── role             TEXT       admin | member | read_only
├── is_active        BOOLEAN    Deactivated accounts cannot log in; records preserved
├── must_change_password BOOLEAN Default false; set by admin reset; cleared on password change
├── created_at       DATETIME   Account creation timestamp
├── last_login_at    DATETIME   Last successful login; nullable
└── created_by       INTEGER    FK → users.id; nullable for first admin
```

---

## §6.2 Ammo Box — Add Missing Field Reference

**Problem:** The `product_id` FK is in the model but not shown in the §6.2 schema block.

**Add after `legacy_id` line:**
```
├── product_id       INTEGER    FK → products; nullable — set when box is added from product selector, auto-generated, or CSV-linked
```

---

## §6.4 Storage — Add Missing Fields

**Problem:** Both `locations` and `containers` schema blocks are missing `is_active` and `source` fields.

**Replace:**
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

**With:**
```
locations
├── id               INTEGER    Primary key
├── name             TEXT       e.g. Gun Safe, Garage Cabinet, Bedroom Closet
├── notes            TEXT       Optional
├── is_active        BOOLEAN    Default true; inactive entries hidden from form dropdowns
└── source           TEXT       yaml | user

containers
├── id               INTEGER    Primary key
├── name             TEXT       e.g. Ammo Can #1, Range Bag, Blue Bin
├── location_id      INTEGER    FK → locations; nullable
├── notes            TEXT       Optional
├── is_active        BOOLEAN    Default true; inactive entries hidden from form dropdowns
└── source           TEXT       yaml | user
```

---

## §6.5 Lookup Tables — Add Community Fields and Dealer Geo Fields

**Problem:** The lookup table schema block does not reflect community sync fields or dealer geo fields added in Phase 8.14.

**Replace:**
```
calibers        — id, name, is_active, source (yaml | user)
manufacturers   — id, name, url, is_active, source
ammo_types      — id, name, is_active, source
ammo_conditions — id, name, is_active, source
categories      — id, name, is_active, source
dealers         — id, name, url, is_active, source
```

**With:**
```
calibers        — id, name, is_active, source (yaml | community | local | user), community_key, is_imported
manufacturers   — id, name, url, is_active, source (yaml | community | local | user), community_key, is_imported
ammo_types      — id, name, is_active, source (yaml | community | local | user), community_key, is_imported
ammo_conditions — id, name, is_active, source (yaml | user)
categories      — id, name, is_active, source (yaml | user)
dealers         — id, name, url, is_active, source (yaml | community | local | user), community_key, is_imported,
                  types (JSON array: online/local/auction/gun show), country, state, is_standard_geo
```

**Add after the existing note about `url` on manufacturers:**

> `community_key` is a stable identifier used for matching community YAML entries to DB rows across sync runs. `is_imported` distinguishes entries accepted from the community (true) from entries pending admin review (false). Entries with `source="community"` that are renamed by an admin are demoted to `source="local"` — independently editable and no longer updated by community sync. `local` source entries can be hidden or deleted.

---

## §6.6 App Settings — Expand Known Keys Table

**Problem:** Only `defaults_version` is listed. Many more keys are written at runtime.

**Replace the Current Keys table:**

| Key | Written by | Purpose |
| --- | ---------- | ------- |
| defaults_version | startup sync | Last successfully synced defaults.yaml version |

**With:**

| Key | Written by | Purpose |
| --- | ---------- | ------- |
| `defaults_version` | startup sync | Last successfully synced defaults.yaml version |
| `threshold_default_rounds` | thresholds API | Global default round threshold (default: 200) |
| `latest_version` | version check task | Latest GitHub release version |
| `update_available` | version check task | "true" or "false" — is a newer version available |
| `version_last_checked` | version check task | ISO 8601 timestamp of last GitHub API check |
| `last_backup_at` | backup task | ISO datetime of last successful scheduled backup |
| `last_backup_file` | backup task | Filename of last successful scheduled backup |
| `current_version` | startup | Running application version |
| `last_seen_version` | startup | Version at last startup; used to detect upgrades |
| `upgraded_from` | startup | Previous version when an upgrade is detected; cleared on dismissal |

---

## §6.7 Duplicate Section Number — Fix Numbering

**Problem:** There are two §6.7 sections (Firearms and Range Sessions). All subsequent sections need renumbering.

**Rename:**
- Second §6.7 (Range Sessions) → §6.8
- §6.8 (Accessories) → §6.9
- §6.9 (Database Indexes) → §6.10
- §6.10 (Invitations) → §6.11
- §6.11 (Password History) → §6.12
- §6.12 (Notifications) → §6.13
- §6.13 (Reporting Integrity Rules) → §6.14
- §6.14 (Product Catalog) → §6.15

Update all cross-references (§6.13 for semantics → §6.14, etc.).

---

## §8.1–§8.5 YAML Seed Data — Note on Community Sync

**Problem:** The YAML seed sync section describes only the original `defaults.yaml`-based workflow. As of Phase 8.14, community-maintained tables (calibers, manufacturers, ammo_types, dealers) are synced from GitHub, not from `defaults.yaml`. The `defaults.yaml` still seeds ammo_conditions, categories, and `acquisition_sources`.

**Add after §8.5 (Ammo Condition Seeds):**

> ### 8.6 Community-Maintained Lookup Tables
>
> As of v0.1.6, calibers, manufacturers, ammo types, and dealers are maintained by the community in the `community/` directory of the GitHub repository rather than in `defaults.yaml`. On startup, the application fetches the latest YAML files from GitHub and queues new entries as pending for admin review. `defaults.yaml` continues to seed `ammo_conditions`, `categories`, and acquisition sources (non-commercial dealer types).
>
> See §9.15 for the full community sync specification.

**Rename existing §8.6 (Community Contributions)** to §8.7 and update its content to reflect the new pull request workflow targets the `community/` directory rather than `defaults.yaml`.

---

## §9.2 Add Ammo Box — is_shared Default Clarification

**Problem:** PRD says `is_shared` "defaults to `false` (private)". The CHANGELOG (v0.1.0) and README say "Add Box defaults to Shared". This is contradictory.

**Verification:** The `AmmoBoxCreate` schema has `is_shared: bool = False` (default private). The UI toggle may default to a different state than the schema default.

**Action:** Clarify what the UI toggle defaults to. If the UI default is Shared (checked), say so:

**Replace:**
> `is_shared` toggle — defaults to `false` (private)

**With:**
> `is_shared` toggle — the UI toggle defaults to Shared for ease of use in a family context; the schema default is `false` so API clients creating boxes without specifying `is_shared` will create private boxes.

---

## §9.2 Group By Location — Correct Description

**Problem:** PRD says "Location | Container's `location_id`". As of Phase 8.14 / migration 0017, `location_id` is directly on `ammo_box`, independent of containers.

**In the Group By table, replace:**
> | Location | Container's `location_id` |

**With:**
> | Location | `ammo_box.location_id` (direct FK, independent of container assignment) |

---

## §9.4 Search & Filter — Major Update

**Problem:** §9.4 describes Quick Filter Chips and Advanced Filter Panel that were not implemented. The actual implementation uses field-scoped search dropdown and per-column filters (specified in §9.2 PRD revision 2.7).

**Replace the entire §9.4 section** with:

```markdown
### 9.4 Search & Filter

#### Global Search

Single search box at the top of the inventory list. Searches across: product_name and legacy_id (via the `search` query parameter). Fires on keystroke with 300ms debounce; results update without page reload.

#### Field-Scoped Search Dropdown

A dropdown next to the search box lets users narrow results to a specific field:

| Option | Searches |
| ------ | -------- |
| All Fields | Full-text API search across product_name and legacy_id (existing behavior) |
| Caliber | Caliber name (client-side filter on loaded data) |
| Manufacturer | Manufacturer name |
| Ammo Type | Type name |
| Category | Category name |
| Condition | Condition name |
| Dealer | Dealer name |
| Location | Location name |
| Container | Container name |
| Product Name | Product name |

"All Fields" is the default. Switching to a specific field applies that filter client-side on the currently loaded result set.

#### Per-Column Filters

Specified in §9.2. Always-visible filter row directly below the column headers.

#### Sort

Click any column header to sort ascending; click again for descending. Arrow indicator on active sort column. Default sort: ID ascending.

#### Performance Target

Results in under 200ms for up to 10,000 box records, relying on the indexes defined in §6.10.

#### Future — v1.0 Targets

The following are deferred to v1.0:

- **Quick Filter Chips** — Horizontal scrollable row of caliber, type, and condition chips
- **Advanced Filter Panel** — Collapsible multi-select panel (caliber, manufacturer, type, condition, category, location, container, dealer; purchase date range; cost range; qty range)
- **URL State** — Active filters and sort reflected in URL for bookmarkability
```

---

## §9.6 Settings — Rename Lookups to Datasets

**Problem:** The Lookup Tables page was renamed to "Datasets" in v0.1.8. The URL changed from `/admin/lookups` to `/admin/datasets` (with `/admin/lookups` redirecting). The PRD still calls it "Lookup Tables page (`/admin/lookups`)".

**Replace:**
> #### Lookup Tables page (`/admin/lookups`) — Admin only

**With:**
> #### Datasets page (`/admin/datasets`) — Admin only

Also update any reference to "Lookups page" → "Datasets page" within §9.6.

**Update source badge description:** Add `community` (blue) and `local` (purple, demoted community entries) alongside `yaml` (gray) and `user` (gold/amber).

**Replace:**
> - **Source** badge: `yaml` (gray) for YAML-seeded entries, `user` (gold) for admin-created entries

**With:**
> - **Source** badge: `community` (blue) for community-synced entries, `user` (gold/amber) for admin-created entries, `yaml` (gray) for YAML-seeded entries (conditions, categories), `local` (purple) for community entries demoted by renaming

---

## §9.8 CSV Import — Correct Pre-Import Backup Format

**Problem:** §9.8 says the pre-import backup is labelled `ammoledger_backup_pre-import_YYYY-MM-DD.json`. §11.5 correctly says it is a SQLite `.db` file. The `.json` label in §9.8 is wrong.

**Replace:**
> Labelled `ammoledger_backup_pre-import_YYYY-MM-DD.json`

**With:**
> Labelled `ammoledger_pre-import_YYYY-MM-DD.db` (SQLite file, same as Quick Backup format)

---

## §9.9 Notifications — Mark as Not Yet Built

**Problem:** §9.9 is written as if notifications are built. The table and delivery channel descriptions exist but no routes, business logic, or frontend UI are implemented.

**Add a warning banner at the top of §9.9:**

> **Status: NOT YET IMPLEMENTED.** The `notifications` table (§6.13) exists in the database schema as a placeholder. No notification routes, delivery logic (Discord, email, in-app bell), or frontend UI have been built. This is a v1.0 target.

---

## §9.14 Admin Tasks — Correct community_sync Description

**Problem:** The `community_sync` row in the Registered Tasks table says "Placeholder for future community data sync (currently no-ops)". This is wrong — community sync is fully implemented.

**Replace:**
> | `community_sync` | 24 h | Placeholder for future community data sync (currently no-ops) |

**With:**
> | `community_sync` | 24 h | Sync dealers, manufacturers, calibers, and ammo types from the community/ directory in the GitHub repository; fetches latest YAML files; queues new entries as pending for admin review; falls back to bundled YAML files when GitHub is unreachable |

---

## §9.15 Community-Maintained Lookup Tables — ADD NEW SECTION

**Problem:** This entire feature (Phase 8.14) is undocumented in the PRD body. Add §9.15 after §9.14.

**Add the following new section:**

```markdown
### 9.15 Community-Maintained Lookup Tables

#### Overview

Dealers, manufacturers, calibers, and ammo types are maintained by the community in the `community/` directory of the GitHub repository. Each table has a corresponding YAML file (`community/dealers.yaml`, `community/manufacturers.yaml`, etc.). The community sync task (`community_sync`) runs every 24 hours and on every startup.

#### Sync Behavior

**First startup:** All community entries are imported automatically (is_imported = true).

**Subsequent syncs:**
- New entries in community YAML that are not in the DB → added with `is_imported = false` (pending review)
- Existing community entries still in YAML → updated if fields changed (name, URL, geo)
- Community entries previously in YAML but removed → demoted from `source="community"` to `source="local"` (orphan demotion)

#### Source Values

| Source | Meaning | Badge Color |
| ------ | ------- | ----------- |
| `community` | Synced from GitHub community YAML; not locally modified | Blue |
| `local` | Was community; demoted by rename or orphan demotion; independently editable | Purple |
| `user` | Created by an admin through the UI | Gold/Amber |
| `yaml` | Seeded from bundled defaults.yaml (ammo_conditions, categories) | Gray |

#### Pending Import Review

When a sync adds new community entries (is_imported = false), an amber banner appears on the Datasets page showing the count of pending entries per table. Admins can:

- **Cherry-pick import:** Check individual entries and import selected
- **Hide rejected:** Hide entries they don't want
- **Dismiss:** Decide later (entries remain pending)

#### Community Sync API (`/community/*` and `/geo/*`, admin-only for writes)

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/community/status` | Sync status per table (total, imported, pending, hidden) |
| GET | `/community/pending` | List all pending (not yet imported) entries |
| POST | `/community/import` | Import selected pending entries (array of {table, id} pairs) |
| POST | `/community/sync` | Trigger an on-demand sync; returns counts of new/updated/demoted entries |
| GET | `/geo/countries` | Country list for dealer geo fields |
| GET | `/geo/states/{country}` | State/province list for a given country |

#### Datasets Page (`/admin/datasets`)

- Sidebar nav item with amber pending-count badge; dot indicator when sidebar is collapsed
- Accordion sections for all 8 lookup tables; all collapsed by default; open/closed state persisted to localStorage
- **Collapse All / Expand All** toolbar button
- Per-section search, usage counts (clickable — navigates to Inventory filtered by that value)
- Source badges on every entry (community, user, yaml, local)
- Pending-import banner per section with cherry-pick import dialog
- **Check for Updates** button (admin only) — triggers on-demand community sync
- **Contribute** button per community-managed section — exports user-created entries as a YAML snippet for pull request submission; provides direct link to open a PR on GitHub

#### Rename Behavior

When an admin renames a `community` entry:
- `source` changes from `community` to `local`
- `community_key` is cleared
- Entry is no longer updated by community sync
- Source badge changes from blue to purple

#### Dealer Geo Fields

Community YAML for dealers includes geographic metadata:

| Field | Values | Notes |
| ----- | ------ | ----- |
| `types` | JSON array: `online`, `local`, `auction`, `gun show` | Multiple types allowed |
| `country` | ISO country code | Default "US" |
| `state` | State/province short code | Optional |
| `is_standard_geo` | boolean | true = standard US state dropdown; false = free-text |

Add/edit form for dealers includes country dropdown and state dropdown (populated from `/geo/*` endpoints).
```

---

## §10.7 Bulk Label Printing — Update Target Version

**Problem:** §10.7 is in §10 (Future Features) but the Version Roadmap table in §2 listed it as v0.2.0 (now corrected to v1.0). The §10 heading should reflect the corrected version target.

**Change the section heading from:**
> ### 10.7 Bulk Label Printing (v2.0)

**To:**
> ### 10.7 Bulk Label Printing (v1.0)

---

## §13 Technical Stack — Correct CI/CD Row

**Problem:** CI/CD row says "images published with three-tier tags: `:dev` + `:sha-<hash>` on every push to `main`". This is wrong — dev images are pushed on push to the `dev` branch, not `main`.

**Replace the CI/CD row:**
> CI/CD | GitHub Actions + GHCR | Lint (ruff) and compose validation on every push and PR; images published to `ghcr.io` with three-tier tags: `:dev` + `:sha-<hash>` on every push to `main`; `:latest`, full semver, and major-only on GitHub Release; PR builds only (no push) |

**With:**
> CI/CD | GitHub Actions + GHCR | Lint (ruff), migration check, and compose validation on every push and PR; push to `dev` branch builds and pushes `:dev` + `:sha-<hash>` images; merge to `main` builds and pushes `:latest` + `:sha-<hash>` images; GitHub Release builds and pushes `:latest`, full semver (`:0.2.0`), and major-only (`:0`) tags to GHCR; PR builds only (no push) |

**Also correct the Notifications row:**
> Notifications | In-app bell + Discord webhook + Email (SMTP) | Multi-channel; extensible channel interface for future clients |

**To:**
> Notifications | In-app bell + Discord webhook + Email (SMTP) | Not yet implemented — v1.0 target; `notifications` table schema exists as placeholder; multi-channel design with extensible channel interface |

---

## §16 Open Questions — Resolve Answered Items

**Q4 (CSV version header):** Already implemented. Mark as resolved.

**Replace Q4 row:**
> | 4 | Should the CSV import template be versioned so future releases can detect and handle older import files? | Yes — add a `ammoledger_version` header row to the template |

**With:**
> | 4 | ~~Should the CSV import template be versioned?~~ | **Resolved** — `ammoledger_version` header row is implemented in the CSV export and import template. |

**Q1 (Members sharing boxes):** Resolved as admin-only. Mark as resolved.

**Replace Q1 row:**
> | 1 | Should Members be able to flip their own private boxes to shared, or is that an Admin-only action? | Allow Members to share their own boxes — keeps the Admin from being a bottleneck for family use |

**With:**
> | 1 | ~~Should Members be able to flip their own private boxes to shared?~~ | **Resolved** — Admin-only. Code enforces `is_shared=true` requires admin role to prevent unintentional sharing. |
