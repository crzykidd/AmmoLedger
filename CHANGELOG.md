# Changelog

<!-- markdownlint-disable MD024 -->

All notable changes to AmmoLedger are documented here.
Format: [Keep a Changelog](https://keepachangelog.com)
Versioning: [Semantic Versioning](https://semver.org)

> Looking for older entries? See [docs/CHANGELOG-pre-v0.1.9.md](./docs/CHANGELOG-pre-v0.1.9.md)
> for the v0.1.0–v0.1.8 archive.

---

## [0.1.9] — 2026-05-05

First test release built on the squashed initial schema. From this version
forward, all installations share a single `0001_initial_schema.py` and any
future schema changes will be incremental migrations on top of it.

### Added

- **SQLite PRAGMA configuration** — WAL journal mode, NORMAL synchronous, foreign keys ON, 64 MB cache, 256 MB mmap, and in-memory temp store applied on every connection. Significantly improves concurrent read performance and enforces FK integrity at the database level.
- **Database indexes on ammo_box FK columns** — adds indexes on `location_id`, `product_id`, `ammo_condition_id`, `dealer_id`, and `container_id`. Eliminates full-table scans on the lookups page and threshold queries.
- **New scheduled task `db_vacuum`** — runs `VACUUM` daily at 04:30. Disabled by default; admins can enable it on the Tasks page. Requires ~2× free disk space while running.
- **Tasks page persistent warning on `db_vacuum` row** — amber indicator explains the disk-space and write-lock implications at a glance.
- **Tasks page confirmation dialog when enabling `db_vacuum`** — intercepts the enable toggle and presents a summary of VACUUM's resource requirements before the `PATCH` fires.
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

### Changed

- **`GET /products` now runs ~7 queries regardless of product count** — previously ran 6 queries per product (6N+1). Lookup names and usage counts are now batch-loaded in a single pass.
- **Threshold endpoints now use grouped queries** — `/thresholds/locations`, `/thresholds/status`, and `/thresholds/low-stock` previously issued one raw SQL query per location threshold. All three now use a single grouped SUM + IN-clause name lookup matching the existing caliber-side pattern.
- **Backup trigger now uses SQLite online backup API** — `Connection.backup()` replaces `shutil.copy2`. Required for correctness under WAL mode; pre-import safety backup updated to match.
- **Renamed scheduled task `db_analyze` → `db_optimize`** — now runs `PRAGMA optimize` instead of bare `ANALYZE`. Only re-analyzes tables where statistics are stale; faster and the current SQLite recommendation.
- **Post-import and pre-backup statistics refresh switched to `PRAGMA optimize`** — consistent with the renamed task.

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

### Migration notes

- **Migration history squashed.** All pre-v0.1.9 migrations (0001–0022) collapsed into a single initial schema migration. See [docs/HISTORY.md](./docs/HISTORY.md) for the rationale and [backend/migrations/archive/](./backend/migrations/archive/) for the original migration files.
- **Fresh install required.** No upgrade path from v0.1.x. Both developer environments were wiped and reinitialized against the squashed schema before tagging v0.1.9. Public users of v0.1.9 and later will not encounter this — every fresh install runs a single migration from this point forward.
- WAL mode creates `.db-wal` and `.db-shm` sidecar files alongside `ammoledger.db`. These are normal and managed automatically by SQLite. Both are inside the `/data` mount so existing Docker volumes need no changes.
- `db_vacuum` task is seeded in disabled state. Enable it from the Tasks page if you want periodic VACUUM (requires ~2× DB size in free disk space).
