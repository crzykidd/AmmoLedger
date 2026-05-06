# Changelog

<!-- markdownlint-disable MD024 -->

All notable changes to AmmoLedger are documented here.  
Format: [Keep a Changelog](https://keepachangelog.com)  
Versioning: [Semantic Versioning](https://semver.org)

---

## [Unreleased]

### Added

- **Push product edits to linked boxes** — when editing a product that is linked to one or more ammo boxes, a confirmation dialog offers the option to sync the updated caliber, manufacturer, weight, type, condition, and category to all linked boxes
- **Duplicate check on product update** — editing a product to match another existing product's key fields now returns a 409 conflict with the conflicting product name
- **Inventory bulk edit: "Reassign Product"** — searchable product picker in the bulk edit panel lets you reassign multiple boxes to a different product in one action
- **Bulk product reassignment syncs key fields** — caliber, manufacturer, weight, type, category, and condition are automatically updated on all selected boxes to match the new product
- **Bulk product reassignment confirmation dialog** — warns about the scope of changes before applying
- **Products page edit drawer: read-only by default** — image and notes are immediately editable; an "Enable full editing" toggle unlocks the rest of the fields with a warning that changes may require updating linked boxes
- **Products page list view: sortable column headers** — Name, Caliber, Type, Category, Default $/rd, Boxes, and Updated columns are now click-to-sort
- **Products page list view: Updated date column** — shows when each product was last modified
- **Products page delete dialog: "View Linked Ammo" button** — when a product has linked boxes, a new button navigates to the inventory page filtered by product name
- **Products page toolbar: "Show Empty" filter** — toggle to show only products with zero linked boxes
- **Editable task intervals** — admins can change how often each task runs directly from the Tasks page; hover a task's interval to reveal the edit icon
- **Per-task scheduling constraints** — minimum and maximum intervals are enforced per task (e.g. Version Check: 4–24 hours; Community Sync: 4–168 hours)
- **Schedule conflict warnings** — saving a daily task that lands within 5 minutes of another daily task shows an advisory warning
- **Database Optimize exclusive execution guard** — skips automatically if another task is already running, retries once after 5 seconds; reason recorded in history
- **"Skipped" task status** — tasks that are skipped record a history entry with status `skipped` and a reason; shown with a yellow indicator in both the registry and history table

### Fixed

- **Products page: list view table now scrolls** — `overflow-hidden` on the table wrapper was clipping the scrollbar; replaced with `overflow-x-auto`
- **Products page: content area now scrolls** — grid and list views were clipped by AppShell's overflow-hidden; fixed with flex-1 overflow-auto on the content wrapper
- **Products page: edit drawer now populates correctly** — replaced useCallback/onSheetOpen with useEffect matching the inventory form pattern; fields were always empty on open
- **Products page: image preview no longer causes unnecessary re-fetches** — cache-buster timestamp is now memoized per URL instead of recomputed on every render
- **Products page: TopBar subtitle now renders** — "Saved product templates for quick box entry" was silently ignored; TopBar now accepts and displays an optional subtitle
- **Products page: edit/delete buttons now respect RBAC** — hidden for unauthorized users; members can only edit/delete their own products; Add Box and Add Product hidden for read-only users
- **Products page: search input debounced** — 300 ms delay prevents an API request on every keystroke
- **Products page: removed duplicate NONE constant** — shadowing inner declaration removed; module-scope declaration is sufficient

### Improved

- **Products page: skeleton loading state** — grid and list views show animated skeleton cards/rows while fetching instead of plain text
- **Products page: "no results" empty state** — when a search or filter is active and returns nothing, shows a targeted message with a Clear Filters button instead of the "no products" prompt
- **Products page: product count indicator** — shows how many products are displayed and whether a filter is active
- **Tasks page "Next Run" now populated on load** — scheduler writes APScheduler fire times back to the database on startup; previously showed "—" until after the first manual run
- **Schedule changes and enable/disable take effect immediately** — toggling or updating a task now reschedules only that job in the live scheduler without a full restart
- **Daily task schedule times now display in local timezone** — the Interval column converts the stored UTC time to the user's browser timezone (e.g. 03:00 UTC shows as 8:00 PM for Pacific)
- **Automated scheduled tasks now fire correctly** — scheduler switched from async event-loop mode to background thread mode, matching the synchronous task functions
- **Task timestamps now display correct local time** — all API datetimes now include a UTC indicator (`Z`), fixing "Last Run" and "Next Run" relative times that previously showed incorrect offsets in local time zones
- **Community sync history no longer shows `[object Object]`** — nested stats (e.g. dealers, calibers) are now rendered as readable summaries like `dealers: 2 new, 1 updated; calibers: 3 new`

## [0.1.8] — 2026-05-03

### Added

- **Caliber threshold drawer** — tap any caliber on the dashboard or inventory summary panel to view its threshold details; admins can edit the threshold or reset to global default inline without leaving the page
- **Dashboard By Caliber toggle** — switch between "Mix" (% of total inventory, existing behavior) and "Stock" (proximity to threshold) views; persists across sessions
- **Color-coded stock levels in Stock view** — green (≥110% of threshold), yellow (90–110%), red (below 90%); round count text matches bar color
- **Threshold value displayed in Stock view** — round count shown as "X rds / threshold" for each caliber

- **Field-scoped search** — a dropdown next to the search box lets users narrow results to a specific field: Caliber, Manufacturer, Ammo Type, Category, Condition, Dealer, Location, Container, or Product Name; "All Fields" mode keeps the existing full-text API search behavior
- **Dynamic summary panel** — the Caliber Summary panel now reflects the active Group By setting; switching to "Manufacturer" Group By shows a Manufacturer Summary, etc.; summary cells are clickable and apply the corresponding field search; low-stock highlighting is preserved when the caliber grouping is active
- **Filter results counter** — when any filter is active the StatsBar highlights with a gold border and shows "Boxes X / Y" (filtered vs. total) so it's immediately clear how many items a filter matched

- **Datasets page** (renamed from "Lookups") — sidebar nav item, route, and page title updated; `/admin/lookups` redirects to `/admin/datasets` for backward compatibility
- **Pending count badge on sidebar** — amber badge on the Datasets nav item shows total pending community entries; dot indicator when sidebar is collapsed
- **Collapse All / Expand All** button in the Datasets page toolbar; section open/closed state persists across page visits via localStorage (default: all collapsed)
- **Clickable usage counts** — "In Use" counts in the Datasets table are now links that navigate to Inventory pre-filtered by that caliber, manufacturer, type, or category

### Changed

- **Threshold system unified** — low-stock alerts are now driven entirely by server-side caliber totals; the previous localStorage-based threshold system has been removed; thresholds compare total rounds across all boxes for a caliber (not per-box quantity), matching how the dashboard always worked
- **Threshold settings are admin-only** — only admins can add, edit, or delete thresholds; members and read-only users see the current settings in a read-only view
- Low-stock nav on the dashboard Running Low panel now links directly to Inventory filtered by the affected caliber or location
- **Orphan demotion on community sync** — entries previously sourced from the community YAML that are no longer present in the upstream file are automatically demoted to `local` source instead of remaining as stale community entries
- **Rename demotes community → local** — editing a community entry's name demotes it to `local` source and clears its community key, making it independently editable
- Community entries demoted to `local` show a purple badge (distinct from blue community and gold user badges)
- `local` source entries can be hidden or permanently deleted just like user-created entries
- Delete endpoint error message updated: "Cannot delete community entries — use Hide instead"

## [0.1.7] — 2026-05-03

### Changed

- **Community manufacturer list cleanup** — renamed "Estate" → "Estate Cartridge" (matches branding on boxes and official website), renamed "Yugo" → "Yugoslavian Military Surplus" (origin label, not a manufacturer), renamed "Privi Partizan" → "Prvi Partizan" (correct spelling)
- Added missing manufacturer URLs: Copper Only Projectiles (warriorarms.com), Estate Cartridge (estatecartridge.com), ZSR (zsr.com.tr)
- Added new manufacturers: Igman (Bosnian military/commercial), Pobjeda (historical Yugoslavian arsenal)
- **Community dealer list cleanup** — added Rivertown Munitions URL, removed West Coast Armory (not a dealer)

## [0.1.6] — 2026-05-03

### Added

- **Product catalog** — a dedicated Products page at `/products` for creating and managing product templates; each product captures caliber, manufacturer, product name, bullet weight, type, category, condition, default cost, UPC, and an optional image
- Product images — upload a jpg/jpeg/png/webp image (up to 5 MB) per product; displayed on the product card and in the Add Box form
- **Auto-fill from product** — when adding a new ammo box, select a product from the search-as-you-type selector at the top of the form; caliber, manufacturer, product name, weight, type, category, condition, and cost auto-populate from the product
- **Add Box from Products page** — each product card has an "Add Box" button that opens Inventory pre-filled with the selected product
- **Save as Template** — after manually adding a box with no product selected, a dialog offers to save the box's details as a new product template for future reuse
- **Auto-generate products** — admin-only button on the Products page that groups existing inventory boxes by their unique caliber + manufacturer + product name + weight + type combination and creates a product for each group; also back-fills all matching boxes
- Product visibility follows the same shared/private ownership model as ammo boxes — shared products are visible to all users; private products are visible to the owner and admins
- CSV import auto-links imported boxes to matching products by comparing caliber, manufacturer, product name, gr/oz, and type; unmatched boxes can be wired up by running Auto-Generate later
- **Admin Tasks page** at `/admin/tasks` — view all scheduled jobs with last-run status, duration, and next scheduled time; manually trigger any task with Run Now; enable/disable individual tasks; change task intervals
- **Task execution history** — every task run (scheduled or manual) records start time, end time, duration, status, and any error or stats details; history table is searchable by task with expandable rows for error messages and result details
- Database Optimize, Version Check, Scheduled Backup, Backup Cleanup, and Community Sync tasks are all registered and controllable from the Tasks page
- **Community-maintained lookup tables** — dealers, manufacturers, calibers, and ammo types are now synced automatically from the `community/` directory in the GitHub repository on every startup; falls back to bundled YAML files when GitHub is unreachable
- **Pending import review** — on first startup all community entries are imported automatically; on subsequent syncs new entries are queued as pending and shown in a banner on the Admin → Lookups page; admins can cherry-pick which entries to import or hide
- **Check for Updates** button on the Lookups page (admin only) — triggers an on-demand community sync and shows how many new entries are pending across all four tables
- **Source badges** on every lookup entry — blue badge for community-maintained entries, gold for user-created entries, gray for YAML-seeded entries
- **Contribute button** on each community-managed lookup section — generates a YAML snippet of all user-created entries in that table and provides a direct link to open a pull request on GitHub
- **Review & Import dialog** — checklist of all pending community entries for a table; import selected, hide rejected, or dismiss to decide later
- **Dealer geo fields** — type (online/local/auction/gun show), country, and state/province added to the dealer model; community YAML includes these fields for all entries; add/edit form has country and state dropdowns

### Changed

- CSV import similarity warnings replaced with an interactive resolution grid — when the validator detects values similar to existing entries, you can now choose per-match whether to map to the existing value or import as new; remapped values are excluded from the "new values will be created" list
- Similarity resolution defaults are now context-aware — community-maintained fields (caliber, manufacturer, type, dealer) default to "Use existing" while user-local fields (location, container, category, condition) default to "Import as new"
- Inventory Group By headers now show all stats (boxes, rounds, value, low stock) together on the right side for better readability
- Groups now start collapsed when first selecting a Group By option, giving an overview before drilling in; expand/collapse state is preserved per group across page navigation within the session

### Fixed

- CSV import caliber fuzzy matching no longer flags unrelated calibers that share a suffix (e.g. `.25 ACP` vs `.45 ACP`); normalizes leading dots and compares numeric portions before applying Levenshtein distance
- Container and location similarity matching now compares trailing numbers — `Ammo Can #1` no longer falsely matches `AmmoCan 11`
- Group By Location and Container no longer shows all boxes under "No Location" / "No Container" on initial page load (race condition where grouping ran before lookup data arrived)

### Security

- Updated python-multipart (0.0.9 → 0.0.27) and pytest (8.2 → 9.0.3) for vulnerability fixes
- Product image upload validates file extensions against an allowlist and uses database-sourced IDs for file path construction to prevent path traversal
- Product image URLs are sanitized via regex extraction before rendering to prevent DOM XSS injection

## [0.1.5] — 2026-05-02

### Fixed

- Tagged release images now display the clean version string (e.g. `v0.1.5`) instead of `v0.1.5-dev` — `github.ref_name` returns the tag name on release events, so `GIT_BRANCH` is now explicitly set to `main` for release builds in CI
- Dev branch CI checks (lint, migration, YAML validation) now run on every push to `dev` as well as `main`, so PR status checks are always current when opening a `dev → main` pull request

## [0.1.4] — 2026-05-02

### Added

- **Export CSV** button in the Inventory toolbar — exports currently visible boxes (respects active search and Archived/Empty filters) as a CSV file; confirmation dialog shows the row count before downloading
- **Export All to CSV** in Admin → Backup — exports every ammo box (including archived) as a full CSV; suitable for migrations and spreadsheet review
- CSV export includes `owner`, `created_at`, and `updated_at` columns — exported files can be round-tripped back through the CSV importer
- CSV importer now recognises `owner` (username → user lookup, falls back to importer with a warning), `created_at`, and `updated_at` (ISO datetime, falls back to current time with a warning); `id` column is recognised but always ignored (use `legacy_id` instead)
- Build info in version display — dev builds (branch ≠ `main`) show `v0.1.x-dev (sha)`, local builds with no env vars show `v0.1.x-local`, release builds show clean `v0.1.x`
- About page shows Branch and Commit rows for dev builds; commit SHA links to the GitHub commit
- Version text is now a clickable link — release builds link to the GitHub release page; dev builds link the SHA to the exact commit; local builds show plain text
- Sidebar footer shows `dev · abc1234` with a clickable GitHub commit link for dev builds
- Startup log includes display version so dev vs release images are immediately identifiable in `docker logs`
- Local dev builds (no `GIT_BRANCH`/`GIT_SHA` set) display as `v0.1.x-local`

### Fixed

- Frontend no longer rejects requests from reverse proxy hostnames (Traefik, Nginx, Caddy, etc.) — Vite's host check is disabled so the app works behind any user-configured proxy
- Frontend container no longer crashes with `EACCES` on `node_modules/.vite/deps_temp_*` at startup — targeted `chown` on `/app`, `/app/node_modules`, and `/app/node_modules/.vite` gives Vite the write access it needs without recursing over all of `node_modules`

## [0.1.3] — 2026-05-02

### Fixed

- Clear actionable error message when `/data` is not writable — shows the exact `chown` command needed and links to the troubleshooting guide; container exits immediately rather than failing partway through startup
- Troubleshooting section added to `docs/INSTALL.md` covering the `/data` permission denied error and UID 1000 requirement
- Frontend container no longer fails with `EACCES` when Vite tries to write its config timestamp file (`vite.config.ts.timestamp-*.mjs`) on startup — `/app` directory ownership corrected so the container user can write to it

## [0.1.2] — 2026-05-02

### Added

- `AL_BACKEND_URL` environment variable for the frontend — configures the container-internal URL used to proxy API requests to the backend (default: `http://backend:8000`); useful when the backend runs on a custom service name or port

### Fixed

- Startup no longer crashes with `PermissionError` when `/data` is owned by root and the container runs as a non-root user
- `ensure_data_dirs()` logs a warning and continues if `/data/backups` or `/data/uploads` cannot be created — these directories are only required when a backup or upload is actually triggered
- `_ensure_defaults_yaml()` logs a warning and skips the file copy if `/data` is not writable; seed sync falls back to the bundled `defaults.yaml` inside the image
- `sync_yaml_seeds()` falls back to the bundled `defaults.yaml` if `DEFAULTS_PATH` is missing or unreadable
- First-run setup message correctly handles the case where the config template cannot be written to `/data` — instructs the user to use `AL_SESSION_SECRET` via environment variable instead

## [0.1.1] — 2026-05-02

### Added

- Environment variable support for all key config settings — set `AL_SESSION_SECRET`, `AL_BASE_URL`, `AL_BACKUP_ENABLED`, and others directly in `docker-compose.yml` without editing `config.yaml`
- ENV variables override `config.yaml` values when both are present (ENV always wins)
- App can start without `config.yaml` when `AL_SESSION_SECRET` is set via environment — built-in defaults are used for all other settings; no file editing required
- Config source logging on startup — each `AL_*` override is printed to `docker logs` so it is clear which values came from environment variables
- Full ENV variable reference table in `docs/INSTALL.md` with three configuration options (config.yaml, ENV-only, mixed)
- `config.template.yaml` updated with ENV override comments on every supported field and a header block listing all `AL_*` variables
- `app.name` config field — display name for the application (default `AmmoLedger`), overridable with `AL_APP_NAME`

### Changed

- First-run setup message now explains both options: edit `config.yaml` or set `AL_SESSION_SECRET` in the compose file

## [0.1.0] — 2026-05-02

### Added

- Getting Started wizard now includes an "Import your existing data" item with quick-access buttons for Import CSV and Restore Backup
- Empty dashboard state now shows two action buttons — Add Ammo Box (primary) and Import from CSV (secondary) — when no inventory exists
- Empty inventory state now shows Import from CSV alongside Add Ammo Box when no boxes have been added yet
- Getting Started thresholds item marked complete if any per-caliber or per-location thresholds have been set, not only if the global default has been changed
- `location_id` field directly on ammo_box — boxes can be assigned to a location without requiring a container; location and container are now independent
- Location dropdown in the Add/Edit Ammo Box form, positioned above the Container field
- Location as a bulk-editable field in the Bulk Edit panel
- Version check against GitHub Releases — the backend checks for the latest release on every `/system/version` call with a 24-hour cache; the About page shows whether the installation is up to date
- **Check Now** button on the About page (admin only) — forces a fresh GitHub version check immediately, bypassing the cache
- Last-checked timestamp displayed on the About page version card
- **What's New** modal shown automatically after an upgrade — lists release notes for all versions between the old and new installation; fetches notes from GitHub Releases API with CHANGELOG.md as fallback; dismissible with a "Got it" button
- Structured logging throughout the backend — all key operations logged with timestamps, level, and module name
- DEBUG level logging in development mode for detailed request tracing (import rows, box counts, seed entries)
- INFO level logging in production for operational visibility (logins, imports, backups, threshold changes)
- Global exception handler ensures all unhandled errors produce a full traceback in `docker logs` even without per-endpoint try/except
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

- Getting Started wizard invite link corrected to `/admin/users`
- Group By Location and location threshold logic now use `ammo_box.location_id` directly instead of joining through containers
- CSV import maps the `location` column directly to `ammo_box.location_id`
- Admin Lookups page redesigned as eight collapsible accordion sections (Calibers, Manufacturers, Ammo Types, Categories, Ammo Conditions, Dealers, Locations, Containers)
- Each Lookups section shows a live entry count in the header and a real-time search input when expanded
- Every lookup entry now shows its usage count (number of non-archived ammo boxes using it)
- YAML-seeded entries with no associated boxes can be hidden from form dropdowns (Hide button); hidden entries are shown at the bottom of the list and can be unhidden at any time
- User-created entries with no associated boxes can be permanently deleted from the Lookups page
- All lookup form dropdowns (Add Ammo Box, Bulk Edit, Import, etc.) automatically exclude hidden entries
- Locations and Containers are now full lookup table entries with source and active status, consistent with Calibers and other lookup tables
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
