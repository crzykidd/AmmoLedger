# Changelog

<!-- markdownlint-disable MD024 -->

All notable changes to AmmoLedger are documented here.
Format: [Keep a Changelog](https://keepachangelog.com)
Versioning: [Semantic Versioning](https://semver.org)

> Older releases are archived per minor series — see the [Archived releases](#archived-releases) index at the bottom of this file.

---

## [Unreleased]

<!--
Entries here are on the dev branch but not yet released. When cutting the
next versioned release, change this header to `## [X.Y.Z] — YYYY-MM-DD`
and create a fresh empty `## [Unreleased]` block above it.
-->

### Added

- **Datasets page now shows firearm usage alongside ammo usage.** Each lookup entry's "In Use" column previously only counted ammo boxes (firearm-specific lookups like action types, frame sizes, optic cuts, etc. always showed 0). The column now renders a blue "N boxes" chip and a separate purple "N firearms" chip when applicable — covering calibers, manufacturers, dealers, and every firearm-specific lookup (action types, models, compliance tags, frame sizes, optic cuts, rail types, finishes, conditions). Clicking the firearms chip on a caliber or manufacturer deep-links to `/firearms` with the matching filter pre-applied; for other lookups it navigates to the firearms list unfiltered. Hide and Delete now respect both ammo and firearm references — entries used by firearms can no longer be silently deleted, and the lock tooltip shows both counts. Fixes #20
- **Datasets page filter toolbar.** A persistent toolbar above the sections lets you hide unused entries, hide entries that are already hidden, and filter by source (All / Community / User-added). All three preferences are stored in localStorage so they survive page reloads.

### Changed

- **Backend and frontend now print a structured startup banner.** On startup both services emit a single line that identifies the running build: version (e.g. `v0.3.6-dev (abc1234)`), release channel (`dev` vs `release`), git branch, short SHA, and runtime version (Python for backend, Node for frontend). This makes it possible to confirm at a glance — from `docker compose logs` alone — which image is actually running, instead of cross-referencing tags. Fixes #33
- **README and Installation Guide overhauled for public beta.** README is now a tight landing page (tagline, screenshots placeholder, four feature areas — Ammo / Firearm / Range / Cleaning & Utilization, three-step Quick Start, community blurb). Removed the inline "What's New" history (now changelog-only) and "What's Coming Next" (now tracked in [GitHub issues](https://github.com/crzykidd/AmmoLedger/issues)). Moved env var reference, NAS/PUID-PGID, reverse-proxy topology, generic version-agnostic upgrade steps, and DB maintenance into `docs/INSTALL.md`.
- **Production compose: frontend now publishes on `5173:5173`** (was `127.0.0.1:5173` only). External access still wants a reverse proxy in front, but the bind no longer assumes one is already there. Backend remains on the private `ammoledger_net` bridge with no published ports.
- **Production compose: backend env block trimmed.** Removed the redundant `DATABASE_URL`, `CONFIG_PATH`, `DEFAULTS_PATH`, `BACKUP_PATH`, and `UPLOADS_PATH` lines (all have correct `/data/...` defaults baked into the image). Only `PYTHONUNBUFFERED`, `PUID`, and `PGID` remain uncommented; every `AL_*` override is listed as an optional commented example with accurate names.

### Fixed

- **Backend container no longer fails to start on Windows checkouts due to CRLF line endings.** Added a repo-root `.gitattributes` that pins shell scripts, Dockerfiles, and other text files to LF on checkout (while keeping `.bat`/`.cmd`/`.ps1` as CRLF). Without this, Git's `core.autocrlf=true` on Windows would silently smudge `backend/docker-entrypoint.sh` to CRLF on checkout, causing the bind-mounted dev container to fail with `exec /usr/local/bin/docker-entrypoint.sh: no such file or directory` — the kernel was reading the shebang as `#!/bin/sh\r` and looking for an interpreter that doesn't exist. Fresh clones on Windows now get LF for files that must stay LF.

## [0.3.6] — 2026-05-21

### Fixed

- **Vite dev server now detects file changes on Windows Docker.** Added filesystem polling (`usePolling: true`) to `vite.config.ts` — without this, inotify events from the Windows host never reach the Linux container, so HMR silently stops working after the first change.
- **Inventory search now works for all fields.** Searching with "All Fields" selected previously returned no results for Manufacturer, Category, Condition, Dealer, and Location because the search was handled server-side and only matched product name and legacy ID. Search is now fully client-side and matches across all fields including caliber, manufacturer, type, category, condition, dealer, location, container, product name, notes, and box ID. Product Name search also looks up the linked catalog product via product_id, so it works even for boxes whose `product_name` field isn't denormalized. Fixes #29
- **Products page "Used by X boxes" link filters by FK, not sub-brand text.** Clicking the usage-count link on a product card (or "View Linked Ammo" in the delete dialog) previously navigated to inventory with a Product Name text search, which incorrectly matched every box sharing the same sub-brand (e.g., all "American Eagle" boxes regardless of caliber/grain/type). The link now filters by the product's actual ID, and the inventory view shows a clearable chip indicating which product is being viewed. Empty and archived boxes linked to that product are included so the count matches the badge on the product card.

### Changed

- **Sidebar navigation reorganized.** The "Settings" section has been removed. Import and Thresholds moved under a unified "Admin" section, which is now visible to all roles (admin-only items are hidden from non-admins). Products is now visually nested under Ammo in the main nav to clarify it is the ammo product catalog. Profile settings are now accessible via the gear icon next to the username in the sidebar footer, replacing the standalone Profile nav item. Fixes #32
- **Products page: Add Box opens on-page drawer.** Clicking **Add Box** on a product card or row no longer navigates away to the Inventory page. A focused drawer opens on the Products page itself, showing the product thumbnail and name at the top, then collecting the box-specific fields: Qty per Box, # of Boxes (creates N identical boxes in one save), Purchase Date, Cost/Round, Dealer, Location, Container, and Notes. All dropdowns support inline item creation. Fixes #30
- **Products page: usage count is now a link.** "Used by X boxes" in grid view and the boxes count in list view are clickable — they navigate to the Inventory page pre-filtered to that product's boxes. Fixes #30
- **Products page filters expanded.** The single "Show Empty" toggle is replaced by two independent filters: **Has Empty** (products with at least one box at 0 qty remaining) and **Has Archived** (products with at least one archived box). Fixes #30
- **Changelog archives split per minor series.** Older releases now live in one file per minor (`docs/CHANGELOG-0.2.x.md`, `docs/CHANGELOG-0.1.x.md`), linked from an index at the bottom of `CHANGELOG.md`. The active changelog now carries only the current minor series plus unreleased changes. The former `docs/CHANGELOG-pre-v0.1.9.md` was renamed to `docs/CHANGELOG-0.1.x.md`.

## [0.3.5] — 2026-05-19

### Fixed

- **Backend now honors PUID/PGID for data file ownership.** Previously the container always ran as UID 1000 (baked into the image at build time), so setting a different user — common on NAS and multi-user homelab setups — caused permission errors writing to the `/data` volume. The backend now starts as root, remaps its internal user to the `PUID`/`PGID` environment variables (default 1000:1000 for backward compatibility), fixes `/data` ownership, and drops privileges before running. Existing deployments that don't set PUID/PGID are unaffected. See PRD §15.2.

### Security

- **Resolved CodeQL path-traversal alerts in product image preview endpoints.** Preview tokens no longer flow into `Path()` construction. Instead, the matching on-disk file is discovered via `Path.iterdir()` — the Path objects we operate on originate from the OS's directory listing, not from user-supplied input. A regex pre-check (`^[A-Za-z0-9_-]{32}$`) still rejects obviously malformed tokens before touching the filesystem; the `.is_relative_to()` defense-in-depth check is retained. Behavior unchanged — malformed tokens still return 400, missing previews still return 404. Resolves 5 GitHub Advanced Security "Uncontrolled data used in path expression" alerts in `backend/routers/products.py`.

## [0.3.4] — 2026-05-18

### Added

- **Products: Find Image Online.** Edit a product and click "Find Image Online" in the image area to search the web for a product photo using the product's name. Pick from a 5×2 grid of results, crop to square (or skip), and save. Requires admin to configure a Brave Search API key in `config.yaml` (`image_search.api_key`) or via `AL_IMAGE_SEARCH_API_KEY`; the button is hidden when not configured.

### Changed

- **Production docker-compose: network hardening.** Backend now runs on a private `ammoledger_net` bridge with no published ports. Frontend bound to `127.0.0.1:5173` only (was `:5173` on all interfaces) so a reverse proxy must be in front of it for any external access. Optional commented-out `proxy_net` attachment for users who run their reverse proxy in a separate compose stack with an externally-managed network. No behavior change for users running standalone with a localhost-bound proxy.
- **Documented backend outbound hosts.** PRD §12.6 lists every external host the backend may reach (GitHub for version check and community sync, `api.search.brave.com` for Find Image, Discord and SMTP for notifications). All are tied to optional features and degrade gracefully when unreachable.

### Documentation

- **Design-only PRD additions: Licenses and Legal Owners.** Two new feature areas were designed and documented under `docs/prd/` (carry permits / NFA tax stamps / reciprocity / coverage view, and trusts / LLCs / recurring filings). **Not yet implemented** — no UI, no API, no database schema. Implementation is not scheduled to any release; this is design groundwork only. See `docs/prd/licenses.md` and `docs/prd/legal-owners.md` for the full specs.

## [0.3.3] — 2026-05-18

### Fixed

- **Range session delete no longer returns 500 Internal Server Error.** A SQLite foreign-key
  ordering issue between `expenditure_log` and `range_session_lines` caused an `IntegrityError`
  when the session was committed — the FK is declared at the column level via SQLModel's
  `foreign_key=` but not as an ORM Relationship, so the unit-of-work dependency sort could not
  order the DELETEs. Reversal now flushes pending DELETEs before subsequent DELETEs so the FK
  is honored. Same fix applied to line delete and line update.
- **Reversing a range session line no longer leaves the firearm's `rounds_since_clean` out of
  sync with the cleaning log.** When `rounds_lifetime` was decremented across a prior cleaning
  event, the independent `max(0, ...)` clamp on `rounds_since_clean` could leave the denormalized
  snapshot inconsistent. `_reverse_session_line` now calls `_recalculate_firearm_clean_state`
  after decrementing to re-derive `rounds_since_clean` and `last_cleaned_at` from the log.
- **Range session and firearm dates no longer shift by one day in non-UTC timezones.** Plain date fields (range session date, firearm log event date, purchase date, last cleaned date, and date filter pickers) were parsed as midnight UTC by `parseISO`, causing the displayed day to be off by one for users east of UTC. A new `parseLocalDate()` helper parses `YYYY-MM-DD` strings as midnight in the browser's local timezone. Full ISO timestamp fields (`created_at`, `updated_at`, `expires_at`, etc.) are unaffected and continue to display in local time as intended.
- **Backend validation errors now display as readable text instead of `[object Object]`.** When the backend returns a Pydantic validation error, `detail` is an array of error objects rather than a plain string. The range session save flow was coercing that array to `[object Object]`, hiding the real error message. A new `formatBackendError()` helper handles Pydantic v2 arrays, plain string `detail`, and network `Error` instances, always producing a single readable string.
- **Range session edit no longer fails with "Input should be none" when saving a past date.** The `RangeSessionUpdate` Pydantic schema had a Python PEP 563 annotation-shadow bug: with `from __future__ import annotations`, the `date = None` field default shadowed the `datetime.date` type name during Pydantic's deferred annotation evaluation, causing the field to be treated as `NoneType` and rejecting any non-null value with a 422. Fixed by introducing a private module-level alias `_Date = date` in `schemas.py` that is never used as a field name, ensuring Pydantic always resolves the type from module globals. The frontend PATCH payload also now defensively omits the `date` key when it is empty.

## [0.3.2] — 2026-05-17

### Fixed

- **Firearms list view photo cell now shows the full image.** The 36×36 thumbnail was cropping landscape firearm photos via `object-cover`, showing only a slice of the rail or handguard instead of the firearm itself. The cell now uses `object-contain` so the entire photo fits inside the cell with black letterbox/pillarbox bars as needed. Cell background changed to black so the bars look intentional. Loading skeleton shade bumped one step for visibility against zebra-striped rows.

## [0.3.1] — 2026-05-17

### Fixed

- **Firearm detail page crash on first load.** The page rendered a blank shell on every visit due to a React Rules of Hooks violation: the `document.title`-setting `useEffect` was placed after three conditional early returns (invalid ID, error, loading). React detected a hook count mismatch between the loading render and the data-arrival render and unmounted the entire tree. The effect is now declared unconditionally at the top of the component with an `if (!firearm) return` guard inside its body.


## [0.3.0] — 2026-05-17

**Firearms tracking, range session logging, and firearm maintenance
log all ship in this release.** AmmoLedger now manages firearms
alongside ammo: per-firearm registries with photos, multi-line range
sessions that atomically deduct ammo and bump firearm counters, a
maintenance log driving green/amber/red cleaning status, and full
CSV import/export round-trip for firearms data. Both the existing
ammo flows and the new firearm flows share the same ownership model,
the same community-curated lookups, and the same backup/restore
pipeline.

### Added — Firearms tracking

- **Firearms registry (`/firearms`).** Track each firearm with manufacturer, model, caliber, serial, barrel length, finish, purchase details, and dealer. Card-grid or list view with search and filters by manufacturer, caliber, type, and cleaning status. Same ownership model as ammo boxes — members own private firearms by default; admins can mark firearms as shared so all members see them. View mode, filter selections, and sort order persist across sessions.
- **Firearm catalog.** Built-in community catalog of ~25 popular manufacturers and ~100 popular models (Glock 17/19, Ruger 10/22, S&W M&P, Sig P320/P365, AR-platform rifles, common shotguns, etc.) with default caliber, action type, and standard barrel length — adding a cataloged gun is two clicks and barrel length auto-fills from the catalog when the field is blank. Custom model names supported for off-catalog firearms.
- **Physical attribute community lookups.** Frame size (Micro / Subcompact / Compact / Full-Size / Competition / Other), optic cut (RMR / DeltaPoint Pro / RMSc / 507K / Aimpoint Acro / Trijicon SRO / Holosun K-series / Proprietary / Other), rail type (Picatinny / M-LOK / KeyMod / Proprietary / Other), and finish (Cerakote / Nitron / nDLC / Blued / Stainless / etc.). All four are community-curated with user-extensible local entries. Replaced the prior pre-release free-text Finish field with a structured FK lookup so users can't fragment data by typing "Cerakote" vs "cerakote" vs "FDE Cerakote."
- **Standard capacity** column on firearms for tracking the magazine capacity the firearm was designed for (the spec, not the magazine the user has loaded).
- **Default barrel length on catalog models.** ~80 popular firearm models carry seeded barrel-length values from manufacturer spec sheets, auto-filling on the firearm form when the user hasn't entered one. Users can override per firearm to handle threaded barrels, custom shop variants, etc. Threaded variants are not seeded as separate catalog entries.
- **Multi-select compliance tags.** Twelve seeded tags covering common state classifications (CA, NY, MA, NJ) and federal NFA categories (SBR, suppressor host, MG, AOW, SBS), plus federal pre-ban. Multi-select per firearm so a single gun can carry orthogonal compliance facts (e.g. CA Featureless + NFA SBR). Users can add their own compliance tags when the community list lags new legislation. One-time disclaimer surfaces on first open: tags are community-maintained, AmmoLedger does not provide legal advice.
- **Personal tags.** Per-user free-form colored tags (Carry, Heirloom, Range Only, EDC, etc.) with an 8-color palette. Managed inline from the firearm form — no separate admin page.
- **Firearm maintenance log.** Three event types per firearm: Cleaning (resets `rounds_since_clean`, updates `last_cleaned_at`), Service (gunsmith trips, parts replacement), and Note (free-form milestones). Backdated entries supported with user-overridable rounds-at-event count. Editing or deleting any log entry recalculates the firearm's denormalized cleaning state from the full log history, so the snapshot fields never drift from the source of truth.
- **Firearm photos.** Up to 5 photos per firearm with one designated as default. Photos auto-resize on upload (longest side ≤ 2048 px, server-generated 256 px thumbnails) and are stored on the filesystem under `${UPLOADS_PATH}/firearm_photos/<firearm_id>/`. JPEG, PNG, and WebP accepted; HEIC rejected with a friendly export-as-JPEG hint. EXIF orientation honored so portrait phone photos land upright. Photo URLs are auth-gated streaming endpoints — not served from a public static path.
- **Photo manager** drawer with drag-to-reorder, set-default, and delete actions. The 5-photo cap is enforced API-side (not in the schema) so it can be tuned later without a migration.
- **Photos on cards and detail page.** The firearms list-page card grid shows the default photo at the top of each card with a FirearmIcon fallback for firearms without photos; the firearm detail page replaces the prior text-only hero with a default-photo + thumb-strip layout that opens a lightbox on click. List view gains a small thumbnail in a leading column.
- **Service intervals.** Per-firearm round-based and time-based intervals (either, both, or neither). Cleaning status — green (`ok`) / amber (`due_soon`, ≥80% of either threshold) / red (`overdue`) — reflects whichever threshold is most pressing and surfaces on every firearm card and on the dashboard.
- **Firearm detail page (`/firearms/:id`).** Three tabs — Overview (full specs + cleaning state + tags + notes), Log (per-entry edit and delete), and Sessions (per-firearm range history). Header Edit and Delete actions are gated by RBAC.
- **Firearm polish fields.** Six new optional fields per firearm: `nickname` (personal display name shown as primary identifier in list and detail views when set), `condition` (community-curated lookup seeded with New / Used / Like New / LNIB / Refurbished / C&R / Surplus), `sight_radius_in`, `weight` + `weight_unit` (OZ or LB), and `twist_rate` (free-text). Condition is selectable from a new collapsible **Specifications** section in the firearm form. All six fields round-trip through the firearms CSV export and import.

### Added — Range sessions

- **By Firearm / By Box mode toggle** in the Log Range Day dialog. Per-session mode reshapes the line UI so the primary unit is firearm (with 1..N box allocations inside) or box (with 1..N firearm allocations inside) — matching how shooters actually narrate a range day instead of forcing tuple construction in the user's head. Defaults to By Firearm; remembers the last-used mode via localStorage. Mid-entry mode switch prompts to confirm and starts with a fresh empty line. Launching the dialog from a firearm page forces By Firearm for that session.
- **Quick-chip rounds picker** on each line in the Log Range Day dialog: chips for 1, 10, 20, 30, 50 plus a context-aware "Use all (N)" chip that snaps to the selected box's remaining count. Chips set (do not add) the rounds value — matches the proven At Range quick-expend pattern. Static chips that exceed the selected box's remaining count are hidden.
- **By Firearm / By Box display toggle** on the range session detail page. Display-only re-grouping of the existing line table — no editing implied. Each group shows the firearm or box, total rounds for that group, and the per-line counterpart inline. Persists in localStorage independently from the dialog's edit mode.
- **Range sessions (`/range`).** Multi-line range day log: each line ties an optional firearm to an optional ammo box with rounds fired. At least one line per session; at least one of firearm or box per line. Lines may set `rounds_fired = 0` for dry-fire entries paired with a firearm.
- **Atomic ammo deduction + firearm counter increment.** Range sessions deduct `qty_remaining` from ammo boxes through the existing `expenditure_log` table — no parallel deduction path, no risk of drift. Firearm `rounds_lifetime` and `rounds_since_clean` increment in the same transaction.
- **Reversible mutations.** Editing or deleting a session or any line reverses every side effect: ammo restored, firearm counters decremented (clamped at 0), expenditure log rows removed. The session detail page previews the exact reversal before deletion so you know what will change. PATCH on a line is implemented as reverse-then-apply so firearm/box swaps net out correctly.
- **Atomic multi-line create.** A two-line POST whose second line overdraws its box rolls back the entire transaction — no partial state, no orphan session row, no stranded log entries.
- **Caliber-match awareness.** The Log Range Day dialog highlights ammo boxes matching the line's firearm caliber (with a "Match" badge) and warns (non-blockingly) on caliber mismatch — useful for sub-caliber adapters but obvious when accidental.
- **Range Sessions tab on each firearm.** Per-firearm session history and rounds-through-this-firearm totals computed in a single grouped query, no N+1 fetching.
- **Range session detail page (`/range-sessions/:id`).** Full session view with per-line table, click-through navigation to involved firearms and ammo boxes, and a destructive-action-aware delete confirmation.

### Added — At Range

- **Quick session attribution.** At Range's expend popover gains a three-option session attribution control (None / New / Last). Selecting New creates a single-line range session with today's date; Last appends a line to the most recent session the user created today. Both paths also require picking a firearm, with caliber-matching firearms surfaced first and a non-blocking amber warning on mismatch. Selecting None preserves today's behavior exactly (ammo deduct only, no firearm or session linkage).
- **Box-by-box session building.** Session and firearm choices persist in sessionStorage so a user can step through multiple boxes during a range day without re-picking. Last-session linkage is day-scoped — it clears automatically when the date rolls over. Firearm preference persists across days so a habitual one-gun shooter doesn't have to re-pick tomorrow.

### Added — Dashboard

- **Firearms Needing Service widget** — overdue (red) and due-soon (amber) firearms with the specific reason (rounds-based or time-based interval breach) and an inline "Log Cleaning" quick-action. Hidden when no firearms need attention.
- **Recent Range Sessions widget** — last 5 sessions visible to the user, with a "View All" link to `/range`.
- **Quick Actions row** — "+ Log Range Day", "+ Add Firearm", "+ Add Ammo Box" shortcuts on the dashboard (hidden for read-only users).

### Added — Lookups & admin

- **`manufacturers.types` column.** A single manufacturers table now serves ammo and firearm domains, distinguished by a JSON array on each row (`["ammo"]`, `["firearm"]`, or both). Existing manufacturers backfilled to ammo-only; firearm-only manufacturers like Glock seed as firearm-only; shared manufacturers like Federal or Sig Sauer carry both.
- **New community lookups.** Firearm Models, Action Types (~11 seeded), and Compliance Tags (~12 seeded), each with the same community-curated source / community_key / is_imported pattern as the existing manufacturer and caliber lookups.
- **Admin pages.** Manage Firearm Models, Action Types, Compliance Tags, plus the four new Frame Sizes / Optic Cuts / Rail Types / Finishes lookups alongside the existing Manufacturers / Calibers admin pages. Manufacturers admin gets a Type column (Ammo / Firearm checkboxes) for explicit type assignment.
- **Lookup endpoint extensions.** `GET /lookups/manufacturers?type=ammo|firearm` filter; new `GET /lookups/firearm-models` (with `?manufacturer_id=` for cascading dropdowns), `/firearm-action-types`, `/firearm-compliance-tags`, and per-user `/firearm-user-tags`.

### Added — Form UX

- **LookupCombobox** — every form drawer dropdown (firearm form: manufacturer, model, caliber, action type, frame size, optic cut, rail type, finish, dealer; ammo box form: caliber, manufacturer, type, condition, category, location, container; products form: caliber, manufacturer, type, category, condition) gains type-ahead search and an inline "+ Create" affordance when the typed value doesn't match. New entries are marked `source='user'` and surface alongside community entries with a subtle "user" badge for transparency. Inline-created entries never sync to community — local installation only.
- **Fuzzy-match guard.** Before creating a new entry, a client-side Levenshtein similarity check surfaces likely typos against existing entries ("Did you mean 'Glock'?" when the user typed "Glok"). Threshold matches the CSV importer — distance 1 for short strings (≤ 6 characters on either side), distance 2 otherwise. Users can pick the existing match or proceed with the new value.
- **Member-role lookup creation.** Members can now create lookup entries inline from any form. Admin governance over PATCH / DELETE / hide remains unchanged — only POST is relaxed. Read-only users see all existing options + source badges but no create affordance.

### Added — Exports & Imports

- **Firearms CSV export** at `GET /firearms/export/csv` plus an Export CSV button on the Firearms list toolbar. One row per firearm; tag multi-values collapsed to pipe-separated lists; respects the visibility filter (members see own + shared, read-only sees shared only).
- **Range sessions CSV export** at `GET /range-sessions/export/csv` plus an Export CSV button on the Range page toolbar. One row per line, denormalized for spreadsheet pivot tables — session-level fields (date, location, notes, owner) repeat across the lines of one session.
- **Firearms CSV import** at `POST /import/firearms/validate` → `POST /import/firearms/confirm`. Three-stage flow matching the existing ammo import: upload → preview → confirm. Round-trip compatible with the v0.3.0 firearms export — re-importing an unmodified export produces semantically equivalent rows, including the physical-attribute FK columns (`frame_size`, `optic_cut`, `rail_type`, `finish`) and `standard_capacity`. Derived export columns (`photo_count`, `display_model`, `cleaning_status`) are silently ignored on import. Surfaced as a new "Firearms" tab on the existing Import page.
- **Per-value remap UI** in the firearms preview step. Unmatched values (manufacturer, model, caliber, action type, dealer, compliance tags, user tags) surface with fuzzy-match suggestions; the user decides per value whether to map to an existing entry or create new. Community-curated lookups default to "use existing" on similarity match; user-scoped lookups default to "create new."
- **Cascading firearm model resolution.** Models are scoped under their manufacturer during validation and creation, so a "P226" under Sig Sauer doesn't fuzzy-match to a "P226" under any other manufacturer. New manufacturers created during import always carry `types: ["firearm"]`; existing manufacturers get `firearm` unioned into their types.
- **Synthetic firearm-log entries on import.** When a CSV row carries a non-zero `rounds_lifetime`, a synthetic `note` log entry is created at the firearm's purchase date (or today) seeding the lifetime count. When `last_cleaned_at` is set, an additional synthetic `cleaning` entry is created on that date so `rounds_since_clean` and the cleaning status pipeline remain consistent with the firearm log being the source of truth.
- **Pre-import backup** is hard-blocking before any rows are written (matches ammo import behavior). Backup filename is returned on success; a backup failure rolls the request back with no firearms created.
- **Firearms import template** download at `GET /import/firearms/template` — blank-with-examples CSV showing every supported column.

### Added — Backup formats

- **Backup zip option.** New `backup.include_photos` setting (default true) controls whether scheduled and manual backups produce a single `.zip` containing the WAL-safely-copied SQLite file plus the firearm photos directory, or a bare `.db` file. The zip layout preserves `firearm_photos/<firearm_id>/<file>` so restore is a straight rename. `AL_BACKUP_INCLUDE_PHOTOS` env var override.
- **Unified `/backup/restore` endpoint** accepts both `.db` and `.zip` uploads, dispatching by extension. Zip restore validates each archive entry against path-traversal (rejects absolute paths and `..` components) before extracting into a temp directory; the candidate database is integrity-checked and Alembic-upgraded to head before replacing the live DB. The existing `/backup/restore/sqlite` endpoint remains as a deprecated alias for one release.

### Changed

- **Firearm nickname shown as primary label everywhere a firearm appears.** When a nickname is set (e.g. "Bedside Carry"), it is used as the headline label followed by the make/model as context (e.g. "Bedside Carry — SIG Sauer P365"). Without a nickname the label falls back to "Manufacturer Model" — no visible change for users who haven't set nicknames. Applies to all picker dropdowns, list and card views, session detail groupings, the dashboard Firearms Needing Service widget, delete confirmation dialogs, and `document.title` on the firearm detail page.
- **Every form drawer's lookup `<Select>` is replaced by the new LookupCombobox.** The dropdown UX gains type-ahead filtering and source-badge transparency on all surfaces — the firearm form drawer, the ammo box form, the products form, and the lookups admin selectors. Existing keyboard behavior preserved; the cascading model picker continues to be scoped to the currently-selected manufacturer and disables inline create with an inline hint when no manufacturer is set.
- **`expenditure_log` extended** with optional `range_session_line_id` FK to the new `range_session_lines` table, providing a bidirectional audit trail for session-driven ammo expenditures. Pre-existing expenditures (logged via `/ammo/:id/expend` or At Range) leave this column NULL.
- **`backup.trigger` produces zip by default** for v0.3.0+ installations (controllable via `backup.include_photos`). `/backup/list` now surfaces `.zip` files alongside `.db` and `.json` with a new `zip` type badge.
- **`firearms` CSV export** gains a `photo_count` column. Photo bytes remain out-of-band — they live in the zip backup or are fetched per-firearm via the new photo endpoints.
- **`GET /firearms?cleaning_status=` accepts comma-separated values** for fetching multiple status buckets in one request — e.g. `?cleaning_status=due_soon,overdue`. Single-value filtering still works. Used by the dashboard Firearms Needing Service widget.
- **`GET /range-sessions?firearm_id=` response extended** with `rounds_for_filter_firearm` so the firearm-detail Sessions tab can show per-session rounds totals without an N+1 fetch loop.
- **JSON export/restore extended.** Backup and restore now cover `firearm_action_types`, `firearm_models`, `firearm_compliance_tags`, `firearm_user_tags`, the `firearms`, `firearm_log`, and the two firearm tag-link tables, plus `range_sessions` and `range_session_lines`. The export order now places `expenditure_log` after `range_session_lines` to satisfy the new FK on restore. Schema-migration validation continues to require an exact match against the current Alembic head.
- **PRD §6.7 duplicate-heading bug fixed.** The Range Sessions schema block was previously numbered as a second `### 6.7`; it's now correctly sequenced. PRD §10.3 renamed from "Cleaning Reminders" to reflect the generalized firearm log model.
- **Sidebar layout** updated to include Firearms (between Products and At Range) and Range (between Firearms and At Range), with a custom firearm SVG icon matching the CartridgeIcon precedent and Lucide's Target icon for Range.
- **Sidebar**: Settings and Admin sections are now collapsible by clicking their headers. Collapse state persists across sessions (`sidebar_sections_collapsed` in localStorage). Sections auto-expand when the current route is inside them so the active page is always visible.

### Security

- **Firearm photo path validation** (`backend/utils/firearm_photos.py`). Three CodeQL `py/path-injection` findings closed. Filename inputs are now validated against a strict whitelist (`^[0-9a-f]{32}(_thumb)?\.jpg$` — the exact shape the server generates); `firearm_id` is checked as a non-negative integer before use in any path; every computed path is resolved and asserted to live under `${UPLOADS_PATH}/firearm_photos/` before any filesystem operation (`mkdir`, `rmtree`, `unlink`, `read_bytes`). Symlink-escape attempts (where a firearm subdirectory is a symlink pointing outside the photos root) are detected and refused at `rmtree` time. The byte-streaming endpoints return 404 on validation failure — no internal path details are exposed to clients.

### Database migrations

- `0002_firearms_feature.py` — single migration covering the entire firearms
  feature. Adds `manufacturers.types`, the firearm and range-session domain
  tables (`firearm_models`, `firearm_action_types`, `firearm_compliance_tags`,
  `firearm_user_tags`, `firearm_frame_sizes`, `firearm_optic_cuts`,
  `firearm_rail_types`, `firearm_finishes`, `firearms`, `firearm_log`,
  `firearm_compliance_tag_links`, `firearm_user_tag_links`, `range_sessions`,
  `range_session_lines`), and the `expenditure_log.range_session_line_id`
  audit FK. Replaces the previously-staged 0002 / 0003 / 0004 split — collapsed
  pre-release for a clean v0.3.0 schema baseline. No schema downgrade path
  is provided beyond reverting to v0.1.9's `0001_initial_schema.py`.
- `0003_add_firearm_photos.py` — adds the `firearm_photos` table for the
  per-firearm photo gallery. FK indexes on `firearm_id` and `uploaded_by`
  are created in the same migration; a SQLite partial unique index
  (`WHERE is_default = 1`) enforces "at-most-one default photo per firearm"
  at the DB layer. The 5-photo cap is left as an API-layer rule for easy
  future tuning. New runtime dependency: Pillow (image processing).
- `0004_firearm_v030_polish.py` — adds the `firearm_conditions` lookup table
  (seeded with 7 entries via `defaults.yaml` v2.1) and six new columns on
  `firearms`: `nickname`, `firearm_condition_id` (FK + index), `sight_radius_in`,
  `weight`, `weight_unit` (CHECK `IN ('OZ', 'LB') OR NULL`), and `twist_rate`.

---

## Archived releases

Older releases are archived one file per minor series:

- [v0.2.x](docs/CHANGELOG-0.2.x.md) — 0.2.0 → 0.2.3
- [v0.1.x](docs/CHANGELOG-0.1.x.md) — 0.1.0 → 0.1.9
