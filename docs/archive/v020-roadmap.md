# AmmoLedger v0.2.0 Roadmap

**Status:** Pre-release planning  
**Based on:** v0.1.8 codebase audit (May 2026)  
**Branch:** `dev`

---

## Already Done (ships from 0.1.8)

Everything below is fully implemented, tested, and shipping. v0.2.0 is additive.

- **Authentication & RBAC** — session auth; Admin / Member / Read-Only roles; bcrypt hashing; invite-based registration; password history and strength enforcement
- **Password Reset** — admin-generated single-use reset links (24h expiry); emergency config-token self-recovery for admin accounts
- **Full Inventory CRUD** — add, edit, delete, archive ammo boxes; expandable rows with expenditure history; sortable table
- **Quick Expend** — click the Remaining count on any row to open the QuickExpendPopover inline; Shot All, preset amounts, custom input; full audit trail
- **Product Catalog** — reusable product templates with images (jpg/png/webp, 5MB max); auto-fill Add Box from product; Save as Template dialog; Auto-Generate products from existing inventory; CSV import auto-links boxes to products
- **Three-Tier Threshold System** — global default, per-caliber overrides, and per-location overrides stored server-side; admin-only writes; read-only view for non-admins
- **Caliber Threshold Drawer** — tap any caliber on dashboard or inventory summary panel to view/edit threshold inline; Reset to Default button when override exists
- **Dashboard** — four stats cards (Total Rounds, Total Value, Calibers Tracked, Running Low); By Caliber section with Mix/Stock view toggle (persists to localStorage); color-coded stock levels; Running Low panel (By Caliber + By Location)
- **Bulk Select & Edit** — checkbox multi-select; bulk-edit Manufacturer, Type, Category, Condition, Dealer, Location, Container, Shared status, Cost, Notes; max 500 boxes per operation; notes Append/Replace mode
- **Group By** — 8 grouping options (None, Caliber, Manufacturer, Category, Type, Location, Container, Condition); collapsible group headers with summary stats; Collapse All / Expand All
- **Per-Column Filters** — always-visible filter row; operators: `<50`, `>100`, `10-50`, exact; Shared column filter; filter count badge and Clear Filters button
- **Field-Scoped Search** — dropdown next to search box to narrow results to a specific field (Caliber, Manufacturer, Type, etc.)
- **Dynamic Summary Panel** — Caliber Summary panel reflects active Group By; clickable cells apply field filter
- **CSV Import** — two-step validate/confirm; fuzzy matching with interactive resolution; legacy ID mode; ownership toggle (Shared/Private); ownership column in CSV; pre-import SQLite backup
- **CSV Export** — filtered inventory export from toolbar; full archive export from Backup page; round-trip importable format
- **Backup & Restore** — manual SQLite backup; JSON export; scheduled nightly backup (APScheduler); restore from `.db`; import from JSON (full-replace or additive-merge); backup retention cleanup
- **Datasets Page** — accordion UI for all 8 lookup tables (renamed from Lookups); Collapse All / Expand All; section state persists to localStorage; usage counts (clickable); source badges (community/user/local/yaml); pending-import banner; Contribute button; Check for Updates button
- **Community-Maintained Lookups** — dealers, manufacturers, calibers, ammo types synced from `community/` directory on GitHub; pending-import review with cherry-pick dialog; orphan demotion; rename-demotes-to-local
- **Admin Tasks Page** — registered task registry; last-run status, duration, next scheduled time; Run Now button; enable/disable per task; edit task intervals; execution history with expandable error details; auto-refresh
- **User Management** — list users; change roles; deactivate/reactivate; generate and revoke invite links; admin-generated password reset links; all on one unified `/admin/users` page
- **Help Page** — searchable FAQ covering Getting Started, Inventory, Thresholds, Import, Backup, User Management; TOC sidebar on desktop; search highlights matching text
- **HelpTip Tooltips** — contextual ⓘ icon on key form fields; popover on hover or click
- **About Page** — version info; GitHub Releases update check (24h cache); update-available banner; Check Now button (admin); What's New modal auto-shown after upgrade
- **Structured Logging** — timestamps, level, module on every backend log entry; full tracebacks for unhandled errors
- **Getting Started Wizard** — dashboard checklist with real condition checks; "All set" completion state; dismissible
- **Profile Slide-Out Drawer** — click username in sidebar to view account info and change password
- **Version Display** — version in sidebar footer; dev builds show `dev · sha` with GitHub commit link; release builds show clean version
- **First-Run Setup Wizard** — empty dashboard and inventory states with Import and Add Box CTAs

---

## Must Have (blocks 0.2.0 tag)

### Split Box

**What:** A user who entered a case as one box can split it into individually-tracked boxes.

**Why it's blocked:** `split_from_id`, `is_archived`, and `archive_reason = "split"` exist in the data model, but no router endpoint, business logic, or frontend UI has been built.

**Implementation required:**
- Backend: `POST /ammo/{box_id}/split` endpoint accepting an array of `{qty: int}` objects; creates new child boxes, writes `expenditure_log` entry with `log_type="split"` and `related_ids` array, archives parent box (full split) or decrements `qty_remaining` (partial split)
- Frontend: "Split Box" menu item in inventory row actions; split dialog with Equal Split (Mode A) and Custom Split (Mode B) options; preview screen before confirming; success toast with new box IDs

**Effort:** Large (3–5 days full-stack)

**Spec reference:** PRD §9.2.4

---

### Restock / Add Same

**What:** Open the Add Box form pre-filled with all field values copied from an existing box. Eliminates re-entry when restocking a familiar product.

**Why it's blocked:** No restock logic exists anywhere in the codebase (no router change, no frontend component).

**Implementation required:**
- Frontend only: "Restock" menu item in inventory row `⋮` menu → navigates to `/inventory?restock_from={box_id}`; `InventoryPage` reads the `restock_from` param, fetches the box, opens the Add form with pre-filled values; form header shows "Based on Box #N — edit any fields"; all fields editable; source box is unchanged
- No backend changes required

**Effort:** Small (half-day frontend)

**Spec reference:** PRD §9.2.5

---

## Should Have (0.2.0 if time, else v1.0)

### Add X Copies

**What:** A "Number of boxes" field on the Add Ammo form. If N > 1, creates N identical boxes in one DB transaction.

**Why deferred:** The `AmmoBoxCreate` schema has no `copies` field. Backend changes small; frontend adds a numeric input.

**Implementation required:**
- Backend: add `copies: int = 1` to `AmmoBoxCreate`; `POST /ammo` loops and creates N boxes; returns list of created IDs
- Frontend: "Number of boxes" numeric input (default 1) on Add form; success message shows "Added N boxes (#X–#Y)"

**Effort:** Small (half-day full-stack)

**Spec reference:** PRD §9.2 "Add X Copies"

---

### Fix CSV Import Role Gate

**What:** The `/import/validate` and `/import/confirm` endpoints use `require_auth` (all roles). Read-Only users can currently submit CSV imports, which is a privilege violation.

**Implementation required:**
- Backend: change `Depends(require_auth)` to `Depends(require_role("admin", "member"))` on both import endpoints in `routers/importer.py`

**Effort:** Trivial (2-line change)

**Spec reference:** PRD §5.2 permission matrix

---

### Rate Limiting on Login

**What:** PRD §4.2 specifies 5-attempt lockout with 15-minute timeout after failed logins. Not implemented.

**Implementation required:**
- Backend: in-memory counter keyed by email+IP; increment on failed login; raise 429 with `Retry-After` header when limit exceeded; reset on successful login
- Consider: use `slowapi` (FastAPI rate limiting library) or a simple dict with TTL

**Effort:** Small (1–2 hours)

**Spec reference:** PRD §4.2

---

## Deferred

### Notifications (in-app bell + Discord + email)

**Target version:** v1.0  
**Reason:** The `notifications` table exists in the schema as a placeholder (migration 0008). No routes, delivery logic (Discord webhook, email SMTP), or frontend bell icon/panel have been built. This is substantial work across backend + frontend + config. Deferring keeps 0.2.0 scope focused on the Split Box workflow.

**Spec reference:** PRD §9.9, §6.13

---

### Label Printing (PDF, Avery, QR codes)

**Target version:** v1.0  
**Reason:** No foundation in the codebase — no PDF generation, no label template system, no QR code library. Requires selecting and integrating a PDF generation library (reportlab, weasyprint, or a JS-based solution in the frontend). Complex feature with many edge cases (Avery format calibration, QR URL config). Best addressed as a standalone feature in v1.0.

**Spec reference:** PRD §10.7

---

### Quick Filter Chips

**Target version:** v1.0  
**Reason:** Per-column filters already cover the primary use case. The chip row is a polish/convenience feature. Not a blocker.

**Spec reference:** PRD §9.4 (future section after rewrite)

---

### Advanced Filter Panel (multi-select collapsible)

**Target version:** v1.0  
**Reason:** Per-column filters handle the majority of filtering use cases. Multi-select dropdown panel is a UX enhancement. Deferred to allow focus on Split Box for 0.2.0.

**Spec reference:** PRD §9.4 (future section after rewrite)

---

### URL State for Filters

**Target version:** v1.0  
**Reason:** Purely a frontend change (reflect active filters in URL params for bookmarkability). Useful but not blocking. Per-column filters work fine without URL state for most users.

**Spec reference:** PRD §9.4

---

### Firearms Registry

**Target version:** v2.0  
**Reason:** Separate module. Requires new tables (firearms, range_sessions, range_session_lines), new routes, and substantial frontend pages. Planned as a major feature set for v2.0.

**Spec reference:** PRD §10.1, §6.7

---

### Range Sessions

**Target version:** v2.0  
**Reason:** Depends on Firearms Registry.

**Spec reference:** PRD §10.2

---

### Cleaning Reminders

**Target version:** v2.0  
**Reason:** Depends on Firearms Registry.

**Spec reference:** PRD §10.3

---

### Reporting & Cost Analytics

**Target version:** v2.0  
**Reason:** After core modules (ammo, firearms, range) are stable. Requires reporting queries against multiple tables and a PDF/chart generation library.

**Spec reference:** PRD §10.4, §10.5

---

### Accessories Module

**Target version:** v3.0  
**Reason:** Depends on Firearms Registry and Range Sessions being stable.

**Spec reference:** PRD §10.6

---

## Pre-Release Checklist for 0.2.0

Before tagging `v0.2.0`:

- [ ] Split Box — backend endpoint + frontend dialog
- [ ] Restock / Add Same — frontend navigation + pre-fill
- [ ] Fix CSV import role gate (`require_role("admin", "member")`)
- [ ] PRD updates per `docs/prd-updates.md`
- [ ] README version badge updated to `0.2.0`
- [ ] README Project Structure section updated
- [ ] README features list includes Split Box and Restock
- [ ] CHANGELOG.md `[Unreleased]` section moved to `[0.2.0] — YYYY-MM-DD`
- [ ] Alembic migration if any schema changes land for 0.2.0 (Split Box may not need schema changes — `split_from_id` already exists)
- [ ] `backend/version.py` `__version__` updated to `"0.2.0"`
- [ ] `docker-compose.yml` version tag updated in documentation
- [ ] PR `dev` → `main`; CI passes; tag `v0.2.0` from `main`

---

## Notes on Scope Decisions

**Why is Split Box "Must Have" for 0.2.0?**  
The data model fields (`split_from_id`, `is_archived`, `archive_reason`) have been in the schema since the initial migrations. They are dead weight until Split Box ships. The PRD §9.2.4 spec is fully written. The v0.2.0 roadmap in the PRD has always listed Split Box as a 0.2.0 item. Users who purchase ammo by the case are the primary target for this feature.

**Why is Restock "Must Have" for 0.2.0?**  
It's a small effort (half a day, frontend-only) that closes a common workflow gap. Users currently have to re-enter all fields when adding a new box of the same ammo they bought before. This is friction that directly contradicts the "Low friction — common tasks take under 10 seconds" design principle.

**Why defer Notifications to v1.0?**  
The notifications table is a schema placeholder. Building the full notification system (in-app bell, Discord webhook, email via SMTP, per-user preferences, notification routing logic) is a substantial multi-week effort that would significantly delay 0.2.0 for a feature most users won't configure immediately. The 0.2.0 milestone is better focused on the split/restock workflow that most users will use on day one.
