# Changelog

<!-- markdownlint-disable MD024 -->

All notable changes to AmmoLedger are documented here.
Format: [Keep a Changelog](https://keepachangelog.com)
Versioning: [Semantic Versioning](https://semver.org)

> Looking for older entries? See [docs/CHANGELOG-pre-v0.1.9.md](./docs/CHANGELOG-pre-v0.1.9.md)
> for the v0.1.0–v0.1.8 archive.

---

## [Unreleased]

<!--
Entries here are on the dev branch but not yet released. When cutting the
next versioned release, change this header to `## [X.Y.Z] — YYYY-MM-DD`
and create a fresh empty `## [Unreleased]` block above it.
-->

### Added — Firearms tracking

- **Firearms registry (`/firearms`).** Track each firearm with manufacturer, model, caliber, serial, barrel length, finish, purchase details, and dealer. Card-grid or list view with search and filters by manufacturer, caliber, type, and cleaning status. Same ownership model as ammo boxes — members own private firearms by default; admins can mark firearms as shared so all members see them. View mode, filter selections, and sort order persist across sessions.
- **Firearm catalog.** Built-in community catalog of ~20 popular manufacturers and ~50 popular models (Glock 17/19, Ruger 10/22, S&W M&P, Sig P320/P365, AR-platform rifles, common shotguns, etc.) with default caliber and action type — adding a cataloged gun is two clicks. Custom model names supported for off-catalog firearms.
- **Multi-select compliance tags.** Twelve seeded tags covering common state classifications (CA, NY, MA, NJ) and federal NFA categories (SBR, suppressor host, MG, AOW, SBS), plus federal pre-ban. Multi-select per firearm so a single gun can carry orthogonal compliance facts (e.g. CA Featureless + NFA SBR). Users can add their own compliance tags when the community list lags new legislation. One-time disclaimer surfaces on first open: tags are community-maintained, AmmoLedger does not provide legal advice.
- **Personal tags.** Per-user free-form colored tags (Carry, Heirloom, Range Only, EDC, etc.) with an 8-color palette. Managed inline from the firearm form — no separate admin page.
- **Firearm maintenance log.** Three event types per firearm: Cleaning (resets `rounds_since_clean`, updates `last_cleaned_at`), Service (gunsmith trips, parts replacement), and Note (free-form milestones). Backdated entries supported with user-overridable rounds-at-event count. Editing or deleting any log entry recalculates the firearm's denormalized cleaning state from the full log history, so the snapshot fields never drift from the source of truth.
- **Service intervals.** Per-firearm round-based and time-based intervals (either, both, or neither). Cleaning status — green (`ok`) / amber (`due_soon`, ≥80% of either threshold) / red (`overdue`) — reflects whichever threshold is most pressing and surfaces on every firearm card and on the dashboard.
- **Firearm detail page (`/firearms/:id`).** Three tabs — Overview (full specs + cleaning state + tags + notes), Log (per-entry edit and delete), and Sessions (per-firearm range history). Header Edit and Delete actions are gated by RBAC.

### Added — Range sessions

- **Range sessions (`/range`).** Multi-line range day log: each line ties an optional firearm to an optional ammo box with rounds fired. At least one line per session; at least one of firearm or box per line. Lines may set `rounds_fired = 0` for dry-fire entries paired with a firearm.
- **Atomic ammo deduction + firearm counter increment.** Range sessions deduct `qty_remaining` from ammo boxes through the existing `expenditure_log` table — no parallel deduction path, no risk of drift. Firearm `rounds_lifetime` and `rounds_since_clean` increment in the same transaction.
- **Reversible mutations.** Editing or deleting a session or any line reverses every side effect: ammo restored, firearm counters decremented (clamped at 0), expenditure log rows removed. The session detail page previews the exact reversal before deletion so you know what will change. PATCH on a line is implemented as reverse-then-apply so firearm/box swaps net out correctly.
- **Atomic multi-line create.** A two-line POST whose second line overdraws its box rolls back the entire transaction — no partial state, no orphan session row, no stranded log entries.
- **Caliber-match awareness.** The Log Range Day dialog highlights ammo boxes matching the line's firearm caliber (with a "Match" badge) and warns (non-blockingly) on caliber mismatch — useful for sub-caliber adapters but obvious when accidental.
- **Range Sessions tab on each firearm.** Per-firearm session history and rounds-through-this-firearm totals computed in a single grouped query, no N+1 fetching.
- **Range session detail page (`/range-sessions/:id`).** Full session view with per-line table, click-through navigation to involved firearms and ammo boxes, and a destructive-action-aware delete confirmation.

### Added — Dashboard

- **Firearms Needing Service widget** — overdue (red) and due-soon (amber) firearms with the specific reason (rounds-based or time-based interval breach) and an inline "Log Cleaning" quick-action. Hidden when no firearms need attention.
- **Recent Range Sessions widget** — last 5 sessions visible to the user, with a "View All" link to `/range`.
- **Quick Actions row** — "+ Log Range Day", "+ Add Firearm", "+ Add Ammo Box" shortcuts on the dashboard (hidden for read-only users).

### Added — Lookups & admin

- **`manufacturers.types` column.** A single manufacturers table now serves ammo and firearm domains, distinguished by a JSON array on each row (`["ammo"]`, `["firearm"]`, or both). Existing manufacturers backfilled to ammo-only; firearm-only manufacturers like Glock seed as firearm-only; shared manufacturers like Federal or Sig Sauer carry both.
- **New community lookups.** Firearm Models, Action Types (~11 seeded), and Compliance Tags (~12 seeded), each with the same community-curated source / community_key / is_imported pattern as the existing manufacturer and caliber lookups.
- **Admin pages.** Manage Firearm Models, Action Types, and Compliance Tags alongside the existing Manufacturers / Calibers admin pages. Manufacturers admin gets a Type column (Ammo / Firearm checkboxes) for explicit type assignment.
- **Lookup endpoint extensions.** `GET /lookups/manufacturers?type=ammo|firearm` filter; new `GET /lookups/firearm-models` (with `?manufacturer_id=` for cascading dropdowns), `/firearm-action-types`, `/firearm-compliance-tags`, and per-user `/firearm-user-tags`.

### Added — Exports

- **Firearms CSV export** at `GET /firearms/export/csv` plus an Export CSV button on the Firearms list toolbar. One row per firearm; tag multi-values collapsed to pipe-separated lists; respects the visibility filter (members see own + shared, read-only sees shared only).
- **Range sessions CSV export** at `GET /range-sessions/export/csv` plus an Export CSV button on the Range page toolbar. One row per line, denormalized for spreadsheet pivot tables — session-level fields (date, location, notes, owner) repeat across the lines of one session.

### Changed

- **`expenditure_log` extended** with optional `range_session_line_id` FK to the new `range_session_lines` table, providing a bidirectional audit trail for session-driven ammo expenditures. Pre-existing expenditures (logged via `/ammo/:id/expend` or At Range) leave this column NULL.
- **`GET /firearms?cleaning_status=` accepts comma-separated values** for fetching multiple status buckets in one request — e.g. `?cleaning_status=due_soon,overdue`. Single-value filtering still works. Used by the dashboard Firearms Needing Service widget.
- **`GET /range-sessions?firearm_id=` response extended** with `rounds_for_filter_firearm` so the firearm-detail Sessions tab can show per-session rounds totals without an N+1 fetch loop.
- **JSON export/restore extended.** Backup and restore now cover `firearm_action_types`, `firearm_models`, `firearm_compliance_tags`, `firearm_user_tags`, the `firearms`, `firearm_log`, and the two firearm tag-link tables, plus `range_sessions` and `range_session_lines`. The export order now places `expenditure_log` after `range_session_lines` to satisfy the new FK on restore. Schema-migration validation continues to require an exact match against the current Alembic head.
- **PRD §6.7 duplicate-heading bug fixed.** The Range Sessions schema block was previously numbered as a second `### 6.7`; it's now correctly sequenced. PRD §10.3 renamed from "Cleaning Reminders" to reflect the generalized firearm log model.
- **Sidebar layout** updated to include Firearms (between Products and At Range) and Range (between Firearms and At Range), with a custom firearm SVG icon matching the CartridgeIcon precedent and Lucide's Target icon for Range.

### Database migrations

- `0002_add_firearm_lookups.py` — adds `manufacturers.types`, `firearm_models`, `firearm_action_types`, `firearm_compliance_tags`, `firearm_user_tags`. Backfills existing manufacturers to `["ammo"]`.
- `0003_add_firearms.py` — adds `firearms`, `firearm_log`, and the two tag-link tables. CHECK constraint enforces "either `firearm_model_id` or `custom_model_name` set."
- `0004_add_range_sessions.py` — adds `range_sessions`, `range_session_lines`, and the `expenditure_log.range_session_line_id` column.

### Deferred

The following items were deliberately scoped out of this release and remain on the roadmap:

- **Multi-caliber firearms.** v1 firearms have a single caliber FK plus a free-text `caliber_notes` field for the workaround. A `firearm_calibers` join table will be added in a future migration without renaming the existing column.
- **Target photo uploads on range session lines.** Schema has no `target_photo` column yet; future migration adds it when the feature ships.
- **Firearms CSV import.** Export-only in v1. Import will follow the existing CSV import validate/preview/confirm pattern used for ammo, but is not in this release.
- **Accessories module** (PRD v3.0). Tracking sights, optics, holsters, spare magazines, etc. is a separate feature.
- **At Range / Range workflow merge.** The mobile quick-expend page (At Range) and the multi-line Range Sessions page remain separate. Future UX research will determine whether to unify them.
- **Additional community lookups.** Sight types, finishes, and other taxonomies are currently free-text on firearms. They become candidates for community lookups based on user feedback.

## [0.2.3] — 2026-05-09

### Changed

- Renamed the Inventory page to Ammo. The route is now /ammo. Existing bookmarks to /inventory will 404 — update saved links.
- Replaced the Ammo page sidebar icon with a custom cartridge (bullet) icon, replacing the generic box icon used previously.

### Removed

- The /inventory route. Use /ammo instead.

## [0.2.2] — 2026-05-09

### Added

- **Split Box**: split a single ammo box into multiple smaller tracking records. Two split types — Full (all rounds distributed, parent archived) and Partial (some rounds peeled off, parent stays active). Two modes — Equal (specify number of boxes; rounds-per-box auto-calculated and editable) and Custom (specify each child's round count individually). Children inherit caliber, manufacturer, product name, grain, type, condition, category, purchase date, cost per round, dealer, sharing, and owner from the parent; container, location, notes, legacy ID, and product link reset for each child. Access via the new Split icon in the inventory row Actions column.
- **Split Box: dated note auto-appended to parent**. Every split appends a `[Split YYYY-MM-DD] …` line to the parent box's notes describing what happened, never overwriting existing notes. Format adapts to even vs. mixed child sizes (e.g. `Fully split into 20 × 50-round boxes (#101–#120)` vs. `Fully split into 5 boxes (240 rounds total) → #101–#105`). Each split adds its own line, so a box partial-split repeatedly accumulates a clean chronological history right in its notes.
- **Split Box: odd-size warning on preview and success panes**. If any new box's round count differs from the mode of the split, that row is flagged in amber so unusual portions (e.g. last 47-round box from a short-weight bucket) get labelled differently from their even peers.
- **Split Box: success/labeling pane**. After confirming a split, the dialog shows a labeling-friendly view of all new boxes with large Box IDs, round counts, and inherited details — designed for fast physical labeling. Re-openable later from the parent's expanded-row history (click a "Split into N boxes" entry).
- **Inventory Group By: Split Parent**. New 9th Group By option clusters boxes by their split parent. Headers show `Split from #N (Caliber, Mfg, Product)` and sort numerically by parent ID. Boxes with no split parent collect into a "No Split Parent" group.
- **Split-aware audit trail**. The parent's expenditure history now renders `log_type = "split"` entries as clickable amber rows showing how many boxes were created and their IDs. Click to re-open the labeling pane.

- **Split Box: parent details dialog**. Group By "Split Parent" group headers now show an info icon — click it to view the parent box's caliber, manufacturer, product, round counts, dates, and full notes/split history. Works even when the parent is filtered out of the visible list or invisible to you under sharing rules (in which case the parent's private notes are hidden). Modal-locked so reading multi-line history is safe.
- **Sort By dropdown** added to the inventory toolbar. Sort by Box ID, Caliber, Manufacturer, Remaining, Purchase Date, or Updated Date with an asc/desc toggle. Selection persists across reloads. When Group By is active, the chosen sort applies within each group. The clickable column-header sort arrows stay in sync with the dropdown.
- **Updated date** now visible in the expanded row of every inventory row, alongside Purchased date.
- **Split Box: child boxes get a "Split from #N" note**. Every child created by a split has its notes pre-populated with `[Split YYYY-MM-DD] Split from #{parent.id}` so an isolated child reveals its origin. The user's own notes append after this line.
- **GET /ammo/split-parents** endpoint returns metadata for every box that has at least one child. Used by the Split Parent Group By header and the parent details dialog. RBAC-aware: notes are hidden for parents not visible to the caller, but caliber/manufacturer/product are always returned so headers render correctly.

### Changed

- **Dashboard "All" scope** (lifetime totals — Total Boxes, Total Rounds, Total Value, Calibers Tracked) now filters on `split_from_id IS NULL` to count only root boxes, preventing double-counting after splits. Without this filter, a 1000-round case split into 20 × 50-round children would have shown 2000 rounds in the All-scope view (parent's 1000 + children's 20×50). Current scope is unchanged — it was already correct via the existing `is_archived` / `qty_remaining` math.
- **Reporting integrity rule** (PRD §6.13) refined from the previous `is_leaf` definition to a simpler `split_from_id IS NULL` ("root box") filter. The earlier rule under-counted partial-split parents because it excluded the parent without accounting for the rounds it kept; the root-box rule handles full splits, partial splits, and nested splits uniformly.
- **Inventory list always includes split parents.** Fully-split parents (archived, qty_remaining=0) used to disappear from the default "Active only / Has rounds" view, leaving users no way to reach the parent's notes and history. Now any box that has at least one child is included regardless of those filters. Manually-archived or empty boxes without children are unaffected — they're still hidden by default. CSV export uses the same rule.
- **Dashboard "All" scope Total Boxes counts every record.** Earlier behavior (root-only count) made Total Boxes stay flat after splitting a case, which contradicted the user's expectation that splitting a 1000-round case into 20 boxes increases the count by 20 (since there really are 20 more physical boxes). Total Rounds and Total Value still count root boxes only — those represent the same physical rounds and double-counting them would inflate the round/value math.

### Fixed

- **Split Box preview labels.** The Preview pane labelled boxes as `Box 1`, `Box 2`, etc., which several users mistook for the actual auto-incremented Box IDs that would be assigned. Now uses plain `1.`, `2.`, `3.` with a disclaimer "Box IDs will be assigned when you confirm the split." above the list.
- **Split Box success and review panes can no longer be dismissed by clicking outside or pressing Esc.** Only the explicit Done or Close button dismisses. Previously, clicking anywhere on the page behind the dialog closed the labeling list — users would lose the new box IDs they were trying to read or write down.

## [0.2.1] — 2026-05-07

Bug-fix release. Restore UX rework — additive import mode removed (it was silently corrupting ownership when imported users collided with existing accounts), schema migration validation added, and the import preview now shows user conflicts, an `app_settings` diff, and a per-user ownership summary so admins see what a full restore will actually do before clicking through. Closes #10.

### Changed

- **Restore**: removed additive import mode. Full replace is now the only restore mode. Additive was silently corrupting ownership when imported users collided with existing accounts — colliding user rows were skipped while their child rows still inserted, ending up pointing at whoever currently held the ID. Closes #10.
- **Restore**: `/backup/import/preview` now returns user conflicts, an `app_settings` diff (operational telemetry keys filtered), and a per-user ownership summary so admins see what the restore will actually do before clicking through.

### Added

- **Restore**: schema migration validation. Exports whose `schema_migration` field doesn't exactly match the current database's Alembic head are rejected on both `/backup/import/preview` and `/backup/import/commit`. Prevents silent corruption from a schema-drifted export. A TODO at the validation site documents future relaxation once migration `0002+` ships.

### Removed

- **Restore**: the `mode` form parameter on `/backup/import/commit` and the corresponding "Additive Merge" UI button and warning dialog.

### Coming Next

The next feature work is **Split Box** — split a single ammo box into multiple smaller boxes (e.g., a 1000-round case into 20 boxes of 50). After that, the major focus is **firearms tracking, range session logging, and cleaning reminders**, with **accessories management** (optics, magazines, holsters, etc.) on the same roadmap. See the [README](README.md#whats-coming-next) for details.

## [0.2.0] — 2026-05-06

**First public release.** v0.2.0 is the first version of AmmoLedger considered ready for general use. Substantial work and testing has gone into reaching this point — the data model is stable, the import/export flows are reliable, and the major UX gaps from earlier dev iterations are closed. From here on, breaking changes will be minimized and clearly called out.

### Added

- **Dev build version check** — when running a dev build, the About page now compares the running commit (`GIT_SHA`) against the tip of the `dev` branch and shows "N new commits on dev since this build" with a link to the GitHub compare view. Stable (release) builds keep the existing `releases/latest` comparison. Both checks are cached for 24 hours and refreshed by the scheduled `version_check` task and the manual "Check Now" button.
- **Dashboard: Total Boxes stat card** — new leftmost card in the Inventory Stats row showing the count of boxes in the current scope.
- **Dashboard: Current / All scope toggle** on the Inventory Stats row. "Current" (default) shows active, non-empty inventory only; "All" shows lifetime totals across every box ever tracked, using original purchase quantities for rounds and value. Selection persists in `localStorage`. The lower dashboard sections (By Caliber, Running Low, Recent Activity) always reflect current inventory regardless of the toggle.
- **Inventory page deep-link filter params** — the inventory page now accepts `emptyFilter` and `statusFilter` URL query params to land on a pre-filtered view (e.g., `/inventory?statusFilter=archived&emptyFilter=all`).
- **Import success breakdown** — when archived boxes were imported, the result page shows an active vs. archived count and a "View Archived Boxes" button that deep-links to the matching inventory filter.
- **At Range mode** — new mobile-optimized page (sidebar: At Range) for fast round logging during range sessions. Search by box ID or legacy ID, on-screen number pad with show/hide preference, ±1 steppers, and large tap targets. Tap any result to open the quick-expend popover. Hidden for read-only users.
- **Box ID search on Inventory page** — the search field selector now includes "Box ID", which matches against both numeric box ID and legacy ID.
- **Quick-expend Crosshair icon** on every inventory row (desktop Actions column, mobile collapsed card header) — discoverable one-tap shortcut to log rounds used. The existing click-the-Remaining-count behavior is preserved as a secondary shortcut.
- **Unarchive action** — archived boxes now show an ArchiveRestore icon (desktop) / "Restore" button (mobile) in the same slot as the Archive icon, allowing boxes to be restored to active inventory without leaving the page.
- **Archive confirmation popover** (`QuickArchivePopover`) — clicking Archive now opens a small popover (matching the quick-expend popover style) that captures an `archive_reason` before archiving. Empty boxes prefill the reason as "Empty Box" and archive with one click. Boxes with rounds remaining show an amber warning and require an explicit reason.

### Changed

- **Imported archived boxes now record `archive_reason="imported"`** (was `"manual"`). Boxes arriving with `is_archived=true` from a CSV were previously tagged as manually archived. The `archive_reason` field now accepts: `split | empty | manual | imported`.
- **Sidebar reorganization** — Import moved from the top nav section into Settings (alongside Profile and Thresholds). The top section now contains Dashboard, Inventory, Products, At Range.
- **Archiving a box with rounds remaining now requires explicit confirmation and a reason.** Empty boxes prefill "Empty Box" and archive in one click. The hardcoded `archive_reason: 'manual'` is replaced by the user-supplied reason from the new popover.
- **Archived rows now show an amber ArchiveRestore icon** — the icon was previously gray, indistinguishable from other action icons at a glance. Archived boxes now show a distinct amber icon (`text-amber-600`, `hover:text-amber-700`) making them scannable without hovering.
- **"Show Empty" and "Archived" checkboxes replaced with three-state filter dropdowns:**
  - **Empty:** "Has rounds" (default) / "Empty only" / "All boxes" — "Empty only" applies an additional client-side filter so only `qty_remaining === 0` boxes are shown.
  - **Status:** "Active only" (default) / "Archived only" / "All boxes" — "Archived only" applies a client-side filter so only archived boxes are shown.
  - Both selections persist in `localStorage` (`inventory_empty_filter`, `inventory_archived_filter`). The old `inventory_show_empty` key is migrated automatically on first load.
  - CSV export uses the broader server-side view (active vs all) — exporting "Empty only" or "Archived only" via the dropdown will include the wider set in the CSV.
- **Quick-expend popover presets updated.** New static set: 50 / 30 / 20 / 10 / 1 (added 1-round and AR mag sizes 20/30; removed the redundant 25 and 5). The popover also surfaces up to two recently-used round counts from the current session as additional preset buttons.
- **Quick-expend notes field now persists across popover invocations within the same browser tab session.** Range sessions can log the same notes across many boxes without retyping. Cached notes die when the tab closes.
- **Numeric preset buttons relabeled from "Shot N" to just the number** for tighter horizontal layout. "Shot All" remains as the action button.

### Fixed

- **Inventory page no longer renders two expend popovers side-by-side.** Clicking the Remaining count cell had the same effect as clicking the Crosshair icon — both opened a `QuickExpendPopover` anchored to their own trigger, producing a visual duplicate. The Remaining count is now a static display; the Crosshair icon in the Actions column is the sole quick-expend trigger.
- **At Range page widened on desktop when 2+ results were visible.** Long box descriptions are now constrained to wrap within the result card (`min-w-0` + `break-words`).
- **Import success message clarified** — when archived boxes were imported, the message now correctly tells users to set both the Status filter ("Archived only") AND the Empty filter ("All boxes") to view them. Previously only mentioned the Status filter, which produced an empty view in the typical case where archived boxes are also empty (e.g., legacy imports).

### Known limitations

- **No persistent hint for hidden archived/empty boxes on the Inventory page.** Archived and empty boxes hidden by the current filter are discoverable via the Status / Empty filter dropdowns or via the post-import deep links. A passive inventory-page hint is planned for a future release.
- **Dashboard empty-state shows when only archived boxes exist.** If all imported boxes are archived (e.g. a legacy CSV where every box was historically empty), the active-inventory check returns zero and the "No ammo inventory yet" empty state is shown, even though the boxes are present and visible via the Archived filter. Users can reach those boxes from the Inventory page by switching the Status filter to "Archived only".

### Coming Next

The next major feature set will add **firearms tracking, range session logging, and cleaning reminders**. **Accessories management** (optics, magazines, holsters, etc.) is also on the roadmap. See the [README](README.md#whats-coming-next) for details.

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
- **Additive JSON import now requires explicit confirmation.** Clicking Import with additive mode selected now shows a warning modal explaining that additive mode adds rows whose IDs don't already exist — which means importing your own backup will skip every row, and importing from a different installation can produce silently corrupted foreign key references. The narrow legitimate use case (recovering deleted rows from your own export) is documented in the modal. A proper merge/preview import is planned for v0.3.0.
- **JSON exports now surface a security notice** warning that the file contains bcrypt password hashes and should be stored and transmitted with appropriate care.
- **First-boot no longer requires two starts** — on a fresh `/data` volume with no `AL_SESSION_SECRET` set, the backend now starts successfully after writing the default `config.yaml` instead of exiting with code 1. The setup notice is still printed with a reminder to set a custom secret before production use.

### Fixed

- **Scheduled nightly backup now WAL-safe** — replaces `shutil.copy2` with SQLite's online backup API (`Connection.backup()`) in `_backup_fn()`. Matches the fix already in place for the manual `/backup/trigger` endpoint and pre-import safety backups. Backups created by the scheduled task under WAL mode could previously miss writes that lived in the `.db-wal` sidecar — this closes that gap.
- **Products page: list view table now scrolls** — `overflow-hidden` on the table wrapper was clipping the scrollbar; replaced with `overflow-x-auto`
- **Products page: content area now scrolls** — grid and list views were clipped by AppShell's overflow-hidden; fixed with flex-1 overflow-auto on the content wrapper
- **Products page: edit drawer now populates correctly** — replaced useCallback/onSheetOpen with useEffect matching the inventory form pattern; fields were always empty on open
- **Products page: image preview no longer causes unnecessary re-fetches** — cache-buster timestamp is now memoized per URL instead of recomputed on every render
- **Products page: TopBar subtitle now renders** — "Saved product templates for quick box entry" was silently ignored; TopBar now accepts and displays an optional subtitle
- **Products page: edit/delete buttons now respect RBAC** — hidden for unauthorized users; members can only edit/delete their own products; Add Box and Add Product hidden for read-only users
- **Products page: search input debounced** — 300 ms delay prevents an API request on every keystroke
- **Products page: removed duplicate NONE constant** — shadowing inner declaration removed; module-scope declaration is sufficient
- **JSON export now includes ammo_conditions, products, caliber_thresholds, and location_thresholds.** These tables were silently missing from `/backup/export`, meaning a JSON restore could lose threshold configuration, the entire products catalog, and any custom ammo conditions. Existing JSON exports are still valid but incomplete — a fresh export after upgrading captures everything. The `password_history` table was also removed from the export (it served no restore purpose and exposed additional bcrypt hashes).
- **Restore flow now confirms before destructive operations and forces logout after.** Both SQLite restore and full-mode JSON import now show a confirmation modal warning that the current admin account will be replaced, and automatically log the operator out after a successful restore so they re-authenticate against the restored user database. Additive JSON import is unchanged.

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
