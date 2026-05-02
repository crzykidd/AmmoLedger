# Changelog

<!-- markdownlint-disable MD024 -->

All notable changes to AmmoLedger are documented here.  
Format: [Keep a Changelog](https://keepachangelog.com)  
Versioning: [Semantic Versioning](https://semver.org)

---

## [Unreleased]

### Added

- Invite User modal integrated into Admin → Users page — role, optional email hint, and expiry in one dialog; success state shows the generated link with a copy button
- Active Invitations section on the Users page — pending invites with Copy Link and Revoke actions
- Invitation History section on the Users page — expired, used, and revoked invites from the last 30 days; older entries expandable
- Help page at `/help` with a searchable FAQ covering Getting Started, Inventory, Thresholds, Import, Backup, User Management, and About — accessible from the sidebar
- Collapsible section and Q&A item accordion on the Help page; TOC sidebar on desktop; search highlights matching text
- Contextual help tooltips on key form fields — hover or click the ⓘ icon next to a label to see a brief description
- HelpTip tooltips added to: Add Ammo Box form fields (Caliber, Manufacturer, Product Name, Qty, Weight, Type, Condition, Category, Cost, Shared, Legacy ID), Inventory toolbar (Group By, Show Empty, Archived), Stock Thresholds page, and Import page (Ownership, ID Assignment)
- Password reset via admin-generated links — admin clicks "Generate Reset Link" on any user in Admin → Users, copies the URL, and sends it; link expires in 24 hours and is single-use
- Emergency admin self-recovery via config token — set `security.reset_token` in `config.yaml`, visit `/reset?token=<value>` to reset your admin password without email
- `POST /auth/reset-token/{user_id}` — admin-only endpoint that creates a one-time reset token and returns the reset URL
- `GET /auth/reset?token=` and `POST /auth/reset` — public endpoints for validating and consuming reset tokens (DB or config)
- `GET /expenditures/recent` endpoint returning the last 10 expend-type log entries with caliber name, manufacturer, product name, rounds used, date, and who logged them
- Empty boxes (qty_remaining=0) are now hidden in the inventory list by default; "Show Empty" toggle in the toolbar reveals them; toggle state saved to localStorage
- `show_empty` query parameter on `GET /ammo` — defaults to false; independent of `show_archived`
- Checkbox multi-select in inventory table — select individual boxes, groups, or all filtered boxes at once
- Bulk Edit side panel — edit Manufacturer, Type, Category, Condition, Dealer, Container, Shared status, Cost per Round, and Notes across all selected boxes in one operation
- Notes bulk edit supports Append and Replace modes — append adds text to each box's existing notes; replace overwrites
- Confirmation dialog before applying bulk changes shows which fields will be updated and how many boxes are affected
- Bulk action toolbar (amber bar) appears above the table when boxes are selected — shows count, Clear button, and Edit Selected button
- Selection automatically cleared when filters, Group By, or search terms change
- Production `docker-compose.yml` using pre-built GHCR images and a named Docker volume — end users no longer need the full source repository
- Three-tier stock threshold system — global default (200 rds), per-caliber overrides, and per-location overrides, all stored server-side and shared across users
- Threshold settings page redesigned with three sections: Global Default, Per-Caliber Thresholds, and Per-Location Thresholds; each table shows current on-hand rounds and OK/Low status
- Dashboard Running Low section now shows caliber totals and location totals in separate subsections, using server-computed threshold logic
- Import CSV — Ownership option (Shared / Private) added to validation results screen; defaults to Shared

### Changed

- Development compose file renamed to `docker-compose.dev.yml`; `docker-compose.yml` is now the production file for end users
- Add Ammo Box form now defaults new boxes to Shared
- Dashboard Low Stock Items stat card now counts low calibers plus low locations (not individual boxes)
- Stock thresholds are now stored in the database (`caliber_thresholds`, `location_thresholds` tables) instead of browser localStorage

### Removed

- Separate Invitations page (`/admin/invites`) and sidebar link — invitation management is now part of the Users page; the old URL redirects automatically
- Box-level low-stock detection removed from dashboard Running Low section; replaced by caliber-total and location-total approach

### Fixed

- Dashboard Recent Activity now shows the last 10 expenditure log entries (who logged it, caliber, rounds, date) instead of recently updated boxes
- Dashboard second stat card now shows Total Value instead of Total Boxes; when some boxes have no cost set a partial sum is shown with an asterisk and subtitle
- Legacy ID no longer shown as subtitle when it matches the box ID — avoids redundant display for imported boxes that used legacy ID mode

### Performance

- ANALYZE runs after bulk CSV import to update SQLite query planner statistics
- ANALYZE runs before each backup so statistics are fresh in the backup file

### Added

- Group By dropdown on inventory page — group rows by Caliber, Manufacturer, Category, Type, Location, Container, or Condition; selection persisted to localStorage
- Collapsible group headers with summary stats — box count, total rounds, total value, and low-stock count per group
- Collapse All / Expand All toolbar buttons appear when Group By is active
- Per-column filter row always visible below inventory table headers — filter by ID (matches legacy ID too), Caliber, Manufacturer, Gr/Oz, Type, Category, Remaining, Value, and Shared
- Remaining and Value column filters support operators: `<50`, `>100`, `10-50` range, or exact match
- Active filter count and Clear Filters button in toolbar when any column filter is set
- Toolbar stats (Boxes / Rounds / Value) now reflect filtered rows only, not total inventory
- Full logo image displayed in expanded sidebar (`logo-full-dark.png`, max 120 px tall, centered with padding); collapsed sidebar shows 40×40 circle logo
- About page (`/about`) — app name, tagline, current version, update-available banner, GitHub / Issue / Changelog / Documentation links, MIT license note
- About link in sidebar below the Collapse button, above the username section
- Version string displayed below Sign out button in expanded sidebar — shows `v{version}` for releases; `dev · {sha}` with a GitHub commit link for dev builds (when `GIT_SHA` env var is set)
- User profile slide-out drawer — click username in sidebar to view account info (email, member-since date, last login) and change password without leaving the current page
- Getting Started wizard now checks real conditions: "Add your first ammo box" checks actual inventory count; "Invite a family member" checks for used invites or more than one user account; admin-only item is hidden from non-admin users
- "All set" completion state in Getting Started wizard when every item is checked — shows confirmation message with a Dismiss button
- Getting Started wizard now appears at the top of the dashboard even when inventory is non-empty, until dismissed

### Changed

- ID column is now sortable in inventory table
- README and CLAUDE.md updated to reflect accurate phase completion status — phase table and Features section now describe what is actually built

### Fixed

- GitHub Actions image cleanup now correctly prunes SHA-tagged images — `delete-only-untagged-versions: true` only removed truly untagged images (none); changed to `false` with `ignore-versions` pattern protecting `latest`, `dev`, and semver tags; two separate cleanup jobs merged into one that waits for both builds
- `defaults.yaml` manufacturer and dealer entries without URLs were missing the `url` field entirely; added explicit `url: ""` so the YAML is consistent and parseable without special-casing absent keys
- Added `40 S&W` to the calibers defaults list; bumped `defaults.yaml` to v1.4
- Getting started wizard "Invite a family member" item previously showed "Coming soon" and was never completable — invitations are live, item now checks real conditions
- Expanded `ammo_types` defaults — added FMJ BT, FMJ MC, HP, LRN, RN, RN/FMJ, SWC, SCHP, BTHP, Shot, SLD Rimfire, Tracer, M67; bumped `defaults.yaml` to v1.2 so new types sync automatically on next startup
- Docker build time reduced significantly — `COPY --chown` sets file ownership at copy time rather than running `chown -R` on `node_modules` after the fact, eliminating a 70+ second recursive chown on 100k+ files
- Missing `HTTPException` import in `main.py` caused a `NameError` at runtime when backup config endpoints returned errors
- Removed `#` prefix from inventory ID column — box ID now displays as a plain number
- Legacy ID now shown as a small gray subtitle under the box ID when set; hidden entirely when not set
- Password strength meter now shown on Profile password change form consistently with registration flow; all password forms (setup, registration, profile, admin reset) now use the same `PasswordStrengthMeter` component with visual strength bar and per-rule checklist, always visible from the first keystroke
- Registration page email field now pre-populates from `email_hint` and becomes read-only when the admin specified one; uses `setValue` after async invite validation so react-hook-form picks up the value correctly; `readOnly` (not `disabled`) ensures the value is still submitted with the form
- Ruff lint errors in backend: removed unused `Optional` import from `password_utils.py`, unused `check_password_history` and `require_auth` imports from `routers/auth.py`, unused `pytest` imports from test files, and added `# noqa: E402` to post-env-setup imports in `tests/conftest.py`

### Added

- Legacy ID field on Add / Edit Ammo Box form — optional field for carrying over an ID from a previous tracking system; displays as a subtitle under the box ID in the inventory table when set
- `ammo_condition` field on ammo boxes — tracks production origin (Factory New, Remanufactured, Reloaded / Handload, Military Surplus, Old, Unknown); shown as a muted badge next to the type in the inventory table
- `ammo_conditions` lookup table seeded from `defaults.yaml` (6 values); synced automatically on startup
- Condition dropdown on Add / Edit Ammo Box form between Type and Category
- Condition filter dropdown in the inventory toolbar — narrows the list to boxes with a specific condition
- `POST /import/validate` — validates a CSV file, returns importable row count, errors, warnings, new lookup values to be created, fuzzy-match similarity warnings, and a 15-minute validation token
- `POST /import/confirm` — imports all valid rows from the CSV; creates new lookup values; automatically takes a pre-import SQLite backup before writing any data
- `GET /import/template` — downloads a CSV template with header row and two example rows showing correct format for every column
- Import page (`/import`) — three-state flow: upload CSV → view validation results → confirm and view import summary; includes countdown timer for token expiry, expandable new-value lists, separate error and warning tables, and fuzzy-match warnings
- Import link in the sidebar navigation between Inventory and Settings
- **Legacy ID Mode** for CSV import — when all `legacy_id` values in the CSV are unique positive integers with no conflicts, a radio-button option lets you preserve them as AmmoLedger box IDs; the confirm endpoint inserts rows with explicit IDs and resets the autoincrement counter; rows without a legacy ID receive a new sequential ID
- `legacy_id` column added to the CSV import template
- ID Assignment section in the validation results screen: shows the Legacy ID Mode radio group when eligible, an amber conflict warning when IDs clash, or an info note when IDs are non-numeric
- `url` field on manufacturers — optional website link, pre-populated for all known brands via `defaults.yaml`
- Complete manufacturer list updated to 47 entries with URLs for all known brands; `defaults.yaml` bumped to v1.3
- Manufacturer URLs shown as clickable external links in the Admin → Lookups page
- Lookups page (`/admin/lookups`) in the Admin sidebar — shows manufacturers table with inline name/URL editing; admin-only
- Complete dealer/source list expanded to 30 entries — major online retailers (Lucky Gunner, SG Ammo, Ammo.com, Brownells, MidwayUSA, Natchez, PSA, Wideners, etc.) plus non-commercial sources (Gift, Gun Show, Inherited, Found, Reloaded, Local Gun Shop); `PATCH /dealers/{id}` endpoint for admin URL and name editing
- Dealers section added to Admin → Lookups page with the same inline name/URL editing as manufacturers

- **Phase 5 — Backup & Restore system**
- `POST /backup/trigger` — manual SQLite database backup with download link
- `POST /backup/export` — full JSON data export (all tables, version-tagged)
- `GET /backup/list` — list all backup files with type, size, and timestamp
- `GET /backup/download/{filename}` — download any backup file
- `DELETE /backup/{filename}` — delete a backup file
- `POST /backup/restore/sqlite` — restore database from uploaded .db file (integrity-checked, auto-migrated)
- `POST /backup/import/preview` — preview a JSON export before importing
- `POST /backup/import/commit` — commit JSON import in full-replace or additive-merge mode
- `GET /system/config` — read backup schedule config (admin only)
- `POST /system/config` — update backup schedule config; reloads scheduler immediately
- Nightly scheduled backup via APScheduler — runs at configured time, prunes files beyond retention window
- Automatic pre-import SQLite backup before any restore or import operation
- Backup management UI at Admin → Backup with Quick Backup, Data Export, Scheduled Backup config, Backup History table, Restore from .db, and Import from JSON sections

- **Phase 4.6 frontend** — Registration page, user management UI, invite management UI, profile/password-change page, admin sidebar section
- **Registration page** (`/register?token=…`) — validates invite token on mount, shows role/email hint, includes live password strength checklist, auto-logs in and redirects to dashboard on success
- **User management** (`/admin/users`) — table with role badge, status badge, last login; per-row role dropdown, deactivate/reactivate toggle, reset-password dialog
- **Invite management** (`/admin/invites`) — generate invite link with role/email hint/expiry form, copy-to-clipboard link box, pending invites table with revoke action; hides old expired/used invites by default
- **Profile page** (`/settings/profile`) — account info section (read-only) plus change-password form with live strength checklist; force-reset banner shown when `must_change_password` is set
- **Admin sidebar section** — Users and Invitations nav items visible to admin role only
- **Profile + Thresholds** separated in sidebar Settings section with section header
- **Password strength checklist** — shared component showing 5 rule checkmarks in real time; submit buttons disabled until all pass
- **Must-change-password redirect** — `ProtectedRoute` redirects to `/settings/profile` if `user.must_change_password` is set; banner persists until password changed and `refetch()` clears the flag
- Favicon and apple-touch-icon link tags added to `index.html`

- **User management backend** (Phase 4.6) — admin can list all users, update roles, deactivate accounts, and force-reset passwords
- **Invitation system** — admin generates time-limited invite tokens; invited users self-register via `/register?token=...`; tokens are single-use and revocable
- **Password policy enforcement** — 12-char minimum, uppercase, lowercase, digit, and special character required; email/username must not appear in password
- **Password history** — last 5 password hashes retained per user; reuse blocked on change and admin reset
- `must_change_password` flag — set by admin reset, cleared on next successful password change
- `POST /auth/invite` — admin creates a scoped, expiring invite link
- `GET /auth/invites` — admin lists all invitations with status (valid / used / expired / revoked)
- `GET /auth/invite/{token}` — public endpoint to validate a token and return role / email hint
- `POST /auth/register` — public endpoint to create an account from a valid token (auto-logs in on success)
- `DELETE /auth/invite/{token}` — admin revokes an invitation
- `GET /users` — admin lists all users sorted by creation date
- `PATCH /users/{user_id}` — admin updates a user's role or active status (cannot modify self)
- `POST /users/{user_id}/reset-password` — admin force-resets any user's password
- `POST /users/me/change-password` — any authenticated user can change their own password
- Backend test suite: 40 tests covering password validation, invite lifecycle, user management, and auth flows
- `pytest` and `httpx` added to `requirements.txt`

- **Dashboard** — landing page after login with stats cards (total rounds, total boxes, calibers tracked, low stock count), caliber breakdown with proportion bars, running-low list, and recent-activity feed
- Getting Started checklist shown on first login (no inventory yet) — guides through adding a box, setting thresholds, and future invite; dismissible with "Don't show again"
- Dashboard nav link is active for both `/` and `/dashboard`
- **Stock thresholds** — configurable low-stock alerts stored in localStorage; set a global rounds threshold or per-caliber overrides
- Amber row tint and amber card border on any ammo box below its caliber's threshold
- Inline stock progress bar (green / amber / red by fill %) on every inventory row and card
- Dismissible low-stock alert banner on the inventory page showing the count of low items (dismissed per session)
- Collapsible caliber summary panel on the inventory page with total rounds and box count per caliber, low-stock indicator on affected rows
- **Settings → Stock Thresholds page** (`/settings/thresholds`) — edit default and per-caliber round thresholds with live save
- Settings nav item in the sidebar linking to the threshold settings page
- **Inventory page** — full CRUD UI for ammo boxes with responsive table (desktop) and card list (mobile)
- Purchase date field uses a Calendar popover (shadcn Calendar + Popover) with date-fns formatting ("MMM d, yyyy"); defaults to today when adding a new box
- **Log Use button** (crosshair icon) on every inventory row and card — opens an expenditure dialog to record rounds fired
- Expenditure dialog: rounds used (validated against current stock), date used, optional notes; updates qty_remaining via PATCH
- Stock progress bar in expenditure dialog shows remaining rounds colored gold/amber/red by fill level
- Toast notifications for logged use (and errors); Toaster mounted globally in App
- RBAC for Log Use: read_only sees no button; members can log their own boxes and shared boxes; admins can log all
- Sortable inventory table columns: caliber, manufacturer, product name, qty remaining
- Expandable rows / cards showing weight, cost per round, purchase date, container, and notes
- "Add Box" form panel (side drawer) with all fields: caliber, manufacturer, product name, qty, weight, type, category, purchase date, cost/round, container, notes
- Edit and delete actions gated by role — admin edits all, member edits own boxes, read-only sees no actions
- Delete confirmation dialog with loading state
- Real-time search bar filtering ammo by caliber, manufacturer, or product name
- Show/hide archived boxes toggle
- Stats bar showing total boxes, total rounds, and total inventory value
- Empty state with prompt to add first box when no inventory exists
- All lookup data (calibers, manufacturers, types, categories, containers) cached for 5 minutes
- Migration 0010: `first_name` and `last_name` columns on the `users` table
- Phase 4.1 frontend shell: React + TypeScript + Tailwind + shadcn/ui scaffold
- React Router with auth-gated routes (`/`, `/login`, `/setup`, `/dashboard`, `/inventory`)
- `AuthContext` — calls `GET /auth/me` on mount, provides `user`, `isFirstRun`, `login()`, `logout()`, `refetch()`
- `ThemeContext` — `light`/`dark`/`system` theme with `amber` accent, both persisted to `localStorage`
- `AppShell` with collapsible sidebar (240 px / 64 px), state persisted to `localStorage`
- Sidebar shows full logo when expanded, circle logo when collapsed; gold active nav highlight
- `LoginPage` — dark navy card, email/password fields, error display, link to `/setup` on first run
- `SetupPage` — same navy layout, first/last name + email + password + confirm, auto-login on success
- Typed `fetch` API client (`src/api/client.ts`) with `credentials: 'include'` for session cookies
- Typed auth API wrappers: `getMe`, `login`, `logout`, `setup`
- shadcn-compatible `Button` and `Input` components in `src/components/ui/`
- Brand colors added to Tailwind config: `navy #0D1821`, `gold #B8962E`, `gold-light #D4AF5A`
- `TopBar` layout component for page titles and action slots
- `DashboardPage` and `InventoryPage` stubs (AppShell + "Coming soon")

### Changed

- Expenditure logging now uses `POST /ammo/{box_id}/expend` instead of `PATCH /ammo/{box_id}` — rounds, date, and notes are persisted in the expenditure log
- Expanded rows in the inventory table now show expenditure history (date, rounds used, notes) fetched from `GET /ammo/{box_id}/history`
- Inventory table columns redesigned: ID column added (with legacy_id subtitle), Manufacturer column now shows product name as a subtitle, Gr/Oz / Type / Category columns added, Value column (remaining × cost/rd) added
- Log Use crosshair button removed from Actions column — click the Remaining count directly to open the in-place QuickExpendPopover
- Expanded row now uses a two-column layout: purchase details (date, dealer, container, cost/rd, notes) on the left and expenditure history on the right
- Archive button added to inventory row actions for admin/member users

### Changed

- README now displays logo and badges at top of page
- Frontend converted from JavaScript to TypeScript; `tsconfig.json` configured for Vite + strict mode
- Auth endpoints switched from `username` to `email` — login and setup now accept `{ email, password }` and `{ email, first_name, last_name, password }` respectively; all responses return `email`, `first_name`, `last_name` instead of `username`

### Fixed

- React key-prop warning in InventoryTable: replaced shorthand `<>` fragment with `<Fragment key={box.id}>` so the key is on the outermost element returned from map
- SelectItem empty-string value crash: replaced `value=""` on the optional "None" item with `"__none__"` sentinel to satisfy Radix UI's constraint
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
