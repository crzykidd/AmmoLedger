# AmmoLedger Changelog — 0.2.x Archive

This file is a **frozen archive** of all changelog entries from v0.2.0
through v0.2.3. It is no longer updated.

For the active changelog from v0.3.0 onward, see [CHANGELOG.md](../CHANGELOG.md).
For the archive index, see the bottom of [CHANGELOG.md](../CHANGELOG.md).

---

# Changelog

<!-- markdownlint-disable MD024 -->

All notable changes to AmmoLedger are documented here.  
Format: [Keep a Changelog](https://keepachangelog.com)  
Versioning: [Semantic Versioning](https://semver.org)

---

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

The next feature work is **Split Box** — split a single ammo box into multiple smaller boxes (e.g., a 1000-round case into 20 boxes of 50). After that, the major focus is **firearms tracking, range session logging, and cleaning reminders**, with **accessories management** (optics, magazines, holsters, etc.) on the same roadmap. See the [README](../README.md#whats-coming-next) for details.

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

The next major feature set will add **firearms tracking, range session logging, and cleaning reminders**. **Accessories management** (optics, magazines, holsters, etc.) is also on the roadmap. See the [README](../README.md#whats-coming-next) for details.
