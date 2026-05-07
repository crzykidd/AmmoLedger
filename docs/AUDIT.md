# AmmoLedger — PRD vs Codebase Audit

**Audited:** 2026-04-26  
**PRD Version:** 2.9  
**Codebase Branch:** main  
**Auditor:** Claude Code (automated)

This report compares every feature specified in `docs/PRD.md` against the actual
backend and frontend implementation. Use it as a pre-v1.0 task list.

---

## SECTION 1 — IN PRD, BUILT AND WORKING

Features fully specified in the PRD that have corresponding backend AND frontend implementation.

---

### 1.1 Authentication & First-Run Setup (§4.1, §4.2)

**Backend:**
- `POST /auth/setup` — `backend/routers/auth.py` — first-run admin creation; 409 if users already exist
- `POST /auth/login` — `backend/routers/auth.py` — session-based login with bcrypt verification; constant-time dummy hash to prevent timing attacks
- `POST /auth/logout` — `backend/routers/auth.py` — session clear
- `GET /auth/me` — `backend/routers/auth.py` — returns `{first_run: true}` when no users exist, or the current user

**Frontend:**
- `frontend/src/pages/auth/SetupPage.tsx` — first-run admin creation form
- `frontend/src/pages/auth/LoginPage.tsx` — login form
- `frontend/src/api/auth.ts` — all auth API calls

---

### 1.2 Invitation System (§4.4)

**Backend:**
- `POST /auth/invite` — `backend/routers/auth.py` — Admin creates invite; returns token + URL
- `GET /auth/invite/{token}` — `backend/routers/auth.py` — validates token, returns role/email_hint
- `POST /auth/register` — `backend/routers/auth.py` — creates account from valid invite
- `DELETE /auth/invite/{token}` — `backend/routers/auth.py` — revokes invite
- `GET /auth/invites` — `backend/routers/auth.py` — lists all invites (Admin only)
- Invite model in `backend/models.py` (`Invitation` table)

**Frontend:**
- `frontend/src/pages/admin/InviteManagementPage.tsx` — create invite, list pending/used/expired invites, revoke
- `frontend/src/pages/auth/RegisterPage.tsx` — registration form for invite recipients
- `frontend/src/api/invites.ts` — all invite API calls

---

### 1.3 Password Requirements & History (§4.5)

**Backend:**
- `backend/password_utils.py` — `validate_password_strength()`: min length, uppercase, lowercase, digit, special char, username-not-in-password, common password list check
- `backend/password_utils.py` — `check_password_history()` and `save_password_history()`: per-user bcrypt history with pruning
- `PasswordHistory` model in `backend/models.py`
- All password changes and resets call both validation and history check

**Frontend:**
- `frontend/src/components/PasswordStrengthMeter.tsx` — real-time strength meter with per-rule status icons; `allRulesPassed()` helper used to gate submit buttons

---

### 1.4 RBAC — Three Roles (§5.1, §5.2)

**Backend:**
- `backend/utils/rbac.py` — `require_auth()` and `require_role(*roles)` FastAPI dependencies
- Role checked server-side on every protected route; admin, member, read_only enforced
- Visibility filter in `backend/routers/ammo.py` — `_visibility_filter()` restricts list/get by role and `is_shared` flag
- Write permission gate — `_check_write()` in `backend/routers/ammo.py`

---

### 1.5 Ammo CRUD API (§9.2)

**Backend:**
- `GET /ammo` — `backend/routers/ammo.py` — list with visibility filter, search, archived toggle; returns `AmmoListResponse` with totals
- `POST /ammo` — create; shared flag admin-only
- `GET /ammo/{id}` — get single box
- `PATCH /ammo/{id}` — update; write-permission gate
- `DELETE /ammo/{id}` — delete; write-permission gate
- `PATCH /ammo/bulk-update` — `backend/routers/ammo.py` — max 500 IDs; member limited to own boxes; admin can set is_shared; notes_mode (replace/append)

**Frontend:**
- `frontend/src/pages/inventory/InventoryPage.tsx` — full inventory page with search, archived toggle, condition filter, Group By, column filters, bulk selection
- `frontend/src/components/inventory/InventoryTable.tsx` — desktop table with expandable rows, per-column filter row, Group By groups with headers, checkbox column, sort
- `frontend/src/components/inventory/InventoryCardList.tsx` — mobile card list
- `frontend/src/components/inventory/AmmoFormPanel.tsx` — add/edit slide-out panel with all fields
- `frontend/src/components/inventory/BulkEditPanel.tsx` — bulk edit side panel
- `frontend/src/api/ammo.ts` — all ammo API calls

---

### 1.6 Round Expenditure (§9.2.1, §9.3)

**Backend:**
- `POST /ammo/{id}/expend` — `backend/routers/expenditure.py` — deducts from `qty_remaining`, creates `ExpenditureLog` entry with `log_type="expend"`
- `GET /ammo/{id}/history` — returns expenditure log; admin sees all, member sees own

**Frontend:**
- `frontend/src/components/QuickExpendPopover.tsx` — anchored popover on Remaining cell; Shot All + preset buttons + custom input + optional notes
- `frontend/src/components/inventory/ExpendDialog.tsx` — modal expend for mobile card list
- `frontend/src/api/ammo.ts` — `expendAmmo()` and `getAmmoHistory()`

---

### 1.7 Lookup Tables — 7 Tables (§6.5)

**Backend:**
- `GET/POST /calibers` — `backend/routers/lookups.py`
- `GET/POST /manufacturers` + `PATCH /manufacturers/{id}` — includes URL field
- `GET/POST /ammo-types`
- `GET/POST /ammo-conditions`
- `GET/POST /categories`
- `GET/POST /dealers` + `PATCH /dealers/{id}` — includes URL field
- `GET/POST /locations`
- `GET/POST /containers`
- All lookup models in `backend/models.py`

**Frontend:**
- `frontend/src/api/lookups.ts` — all lookup API calls
- Lookups used in `AmmoFormPanel.tsx` dropdowns with inline Add New capability

---

### 1.8 YAML Seed Data (§8)

**Backend:**
- `backend/utils/seeds.py` — `sync_yaml_seeds()`: version-aware sync; `sync_on_startup`, `update_existing`, `allow_removal` config flags honored; case-insensitive upsert; source tracking (yaml vs user); per-table functions for simple, manufacturers, and dealers
- Startup sequence in `backend/main.py` calls `sync_yaml_seeds()` on every start
- `AmmoCondition` seeds included (`backend/utils/seeds.py`)

---

### 1.9 Overview Dashboard (§9.1)

**Backend:** All data served via existing `/ammo`, `/thresholds/low-stock`, `/thresholds/default` endpoints.

**Frontend:**
- `frontend/src/pages/dashboard/DashboardPage.tsx`
- Stats row: Total Rounds, Total Boxes, Calibers Tracked, Low Stock Items (calibers + locations)
- Running Low section — By Caliber and By Location subsections (from `fetchLowStock`)
- By Caliber breakdown with progress bars and low-stock indicators
- Recent Activity (last 5 boxes by updated_at — see gap in §2.6 below)
- Getting Started wizard with checklist items and dismiss to localStorage

---

### 1.10 Three-Tier Threshold System (§9.1, §8.1 of PRD v2.8)

**Backend:**
- `GET/PUT /thresholds/default` — `backend/routers/thresholds.py`
- `GET/POST/DELETE /thresholds/calibers/{caliber_id}` — per-caliber overrides
- `GET/POST/DELETE /thresholds/locations/{location_id}` — per-location thresholds
- `GET /thresholds/low-stock` — combined caliber + location low-stock response
- `CaliberThreshold` and `LocationThreshold` models in `backend/models.py`

**Frontend:**
- `frontend/src/pages/settings/ThresholdSettingsPage.tsx` — manage global default + per-caliber + per-location
- `frontend/src/api/thresholds.ts` — all threshold API calls
- `frontend/src/hooks/useThresholds.ts` — client-side threshold helpers

---

### 1.11 CSV Import (§9.8)

**Backend:**
- `POST /import/validate` — `backend/routers/importer.py` — two-step validation; row errors/warnings; fuzzy matching (Levenshtein ≤2); new lookup values report; legacy ID analysis; 15-minute validation token
- `POST /import/confirm` — validates token; pre-import backup; legacy ID mode (explicit PK insertion + sqlite_sequence reset); ownership toggle (is_shared)
- `GET /import/template` — downloadable CSV template with example rows

**Frontend:**
- `frontend/src/pages/ImportPage.tsx` — full three-state UI: Upload → Validation results → Import result
- Legacy ID section with three-state UI (eligible/conflict/non-integer)
- Ownership radio (Shared/Private)
- Countdown timer on validation token expiry
- `frontend/src/api/import.ts` — all import API calls

---

### 1.12 Database Backup & Restore (§11)

**Backend:**
- `POST /backup/trigger` — quick SQLite file backup; records `last_backup_at` in `app_settings`
- `POST /backup/export` — JSON export with version tag and schema migration number
- `GET /backup/list` — lists all backup files
- `GET /backup/download/{filename}` — downloads a backup file
- `DELETE /backup/{filename}` — deletes a backup file
- `POST /backup/restore/sqlite` — uploads `.db`, validates integrity, runs Alembic migrations, replaces live DB
- `POST /backup/import/preview` — previews JSON export
- `POST /backup/import/commit` — full replace or additive merge from JSON export; pre-import backup runs first
- `utils/scheduler.py` — nightly APScheduler-based backup with retention pruning
- `GET/POST /system/config` — backup schedule config persisted to `config.yaml`; reschedules on save

**Frontend:**
- `frontend/src/pages/admin/BackupPage.tsx` — Quick Backup, Data Export, Scheduled Backup config, Backup History with download/delete, Restore from SQLite, Import from JSON
- `frontend/src/api/backup.ts` — all backup API calls

---

### 1.13 Config Validation (§15.1)

**Backend:**
- `backend/utils/config.py` — `validate_config()` runs all presence/type/value/warning checks before startup
- `load_and_validate_config()` — exits with code 1 in production on errors; logs warnings and continues in dev
- Copies `config.template.yaml` if config file is missing
- Discord webhook warning added beyond PRD spec

---

### 1.14 Version Info & About Page (§9.10)

**Backend:**
- `GET /system/version` — returns `version`, `latest_version`, `update_available`, `build_sha`
- `_record_version()` in `backend/main.py` — stores `current_version` and `last_seen_version` in `app_settings`; logs upgrade path

**Frontend:**
- `frontend/src/pages/AboutPage.tsx` — logo, tagline, version display, update-available indicator, GitHub links, license
- `frontend/src/api/system.ts` — `getSystemVersion()`

---

### 1.15 Alembic Migrations (§7)

14 migration files in `backend/migrations/versions/`:
- `0001_initial_schema.py` through `0014_threshold_revamp.py`
- Covers: initial schema, product_name, app_settings, ammo_box fields (split_from_id, is_archived, archive_reason), expenditure_log fields (log_type, related_ids), invitations, password_history, notifications, DB indexes, user name fields, must_change_password, ammo_conditions, manufacturer URL, caliber/location threshold tables

---

### 1.16 User Management (§9.5)

**Backend:**
- `GET /users` — list all users (admin only)
- `PATCH /users/{id}` — update role or is_active (admin only; cannot modify self)
- `POST /users/{id}/reset-password` — force reset with `must_change_password` flag
- `POST /users/me/change-password` — self-service password change

**Frontend:**
- `frontend/src/pages/admin/UserManagementPage.tsx` — table with role select, activate/deactivate, reset password dialog with strength meter
- `frontend/src/pages/settings/ProfilePage.tsx` — account info, change password form with strength meter, must-change-password banner

---

### 1.17 Admin Lookups Page (§2.6 of PRD v2.6)

**Backend:**
- `PATCH /manufacturers/{id}` — update name and/or URL
- `PATCH /dealers/{id}` — update name and/or URL

**Frontend:**
- `frontend/src/pages/admin/LookupsPage.tsx` — inline editing for Manufacturers and Dealers (name + URL); source label shown

---

### 1.18 Group By and Column Filters (§9.2)

**Frontend:**
- `frontend/src/components/inventory/InventoryTable.tsx` — Group By with 8 options; collapsible group headers with box count, total rounds, total value, low-stock count; per-column filter row (ID, Caliber, Manufacturer, Gr/Oz, Type, Category, Remaining, Value, Shared); numeric operator filters for Remaining and Value
- Group By persisted to `localStorage`; Collapse All / Expand All toolbar buttons
- Column filter count and Clear Filters button in toolbar

---

### 1.19 Bulk Select and Edit (§9.2, PRD v2.9)

**Backend:**
- `PATCH /ammo/bulk-update` — max 500 IDs; notes_mode (replace/append); member limited to own boxes; 403 on is_shared=true for member

**Frontend:**
- `frontend/src/components/inventory/BulkEditPanel.tsx` — right-side sheet drawer; fields with Mixed hints; Notes Append/Replace radio; confirmation with field list and box count
- `frontend/src/pages/inventory/InventoryPage.tsx` — checkbox column header (indeterminate state), amber bulk action toolbar, selection cleared on filter/group change

---

## SECTION 2 — IN PRD, PARTIALLY BUILT

Features in the PRD that have some implementation but are incomplete.

---

### 2.1 Rate Limiting on Login (§4.2)

**PRD specifies:** 5 failed login attempts, then 15-minute lockout.

**What IS implemented:**
- `backend/routers/auth.py` — login validates credentials and returns 401 on failure; constant-time dummy hash prevents timing attacks

**What IS MISSING:**
- No attempt counter or lockout mechanism anywhere in `backend/routers/auth.py`
- No `login_attempts` tracking in the `User` model or a separate table
- No per-IP or per-account lockout timer
- No reset mechanism after 15 minutes

**Required:** Add attempt counter + expiry to user session or a separate table; enforce lockout after 5 failures.

---

### 2.2 Password Reset via Config Token (§4.3)

**PRD specifies:** `GET /reset?token=<token>` flow backed by `reset_token` in `config.yaml`.

**What IS implemented:**
- The `reset_token` field concept is implied by the config validation in `backend/utils/config.py`

**What IS MISSING:**
- No `GET /reset` or `POST /reset` route in any router
- No `reset_token` validation logic in the backend
- No frontend page at `/reset`
- The token is not read from `config.yaml` anywhere in the startup or auth flow

**Required:** Backend route `GET /reset?token=` and `POST /reset` + frontend `/reset` page.

---

### 2.3 Dashboard — Scope Selector (§9.1)

**PRD specifies:** Toggle `[My Ammo] [Shared] [All]` at top of dashboard; `All` visible to Admin only; selection persisted to localStorage.

**What IS implemented:**
- `frontend/src/pages/dashboard/DashboardPage.tsx` fetches all ammo via `listAmmo()` with no scope parameter

**What IS MISSING:**
- No scope toggle UI in `DashboardPage.tsx`
- The backend `GET /ammo` already applies per-role visibility filtering, but no explicit scope parameter exists to filter to "My Ammo only" or "Shared only"
- Stats do not change based on scope selection

**Required:** Add scope toggle to dashboard UI; add `scope` query param to `GET /ammo` (values: `mine`, `shared`, `all`); gate `all` to admin.

---

### 2.4 Dashboard — Recent Activity (§9.1)

**PRD specifies:** Last 10 `expenditure_log` entries where `log_type='expend'` — showing date, who logged it, Box ID, caliber, and rounds used.

**What IS implemented:**
- `frontend/src/pages/dashboard/DashboardPage.tsx` shows "Recent Activity" section; displays last 5 boxes sorted by `updated_at` with Added/Updated action heuristic

**What IS MISSING:**
- Does not show expenditure log entries — shows ammo boxes sorted by `updated_at`
- Does not show who logged it, how many rounds used, or the date of usage
- Only shows 5 items instead of the PRD's 10
- There is no backend endpoint for recent expenditure activity across all boxes; `GET /ammo/{id}/history` requires a specific box ID

**Required:** Add `GET /expenditures/recent` endpoint returning last 10 expend-type log entries with user info; update `DashboardPage.tsx` to use it.

---

### 2.5 Inventory — Value Column (§9.2)

**PRD specifies:** Value = `qty_remaining × cost_per_round`; shown only if cost is set.

**What IS implemented:**
- `AmmoListResponse.total_value` calculated in `backend/routers/ammo.py`
- `frontend/src/components/inventory/InventoryTable.tsx` — Value column present in table

**What IS MISSING:**
- The `AmmoListResponse` returns `total_value: None` when ANY box lacks a cost, rather than summing only boxes that have costs set (per PRD: "None when any visible box lacks cost_per_round" — this matches the current behavior for the total, but the per-row value display behavior needs verification)
- Verify that the per-row Value cell in `InventoryTable.tsx` correctly shows blank when `cost_per_round` is null (this appears correct in the column filter logic but should be confirmed in the table render)

**Status:** Mostly correct; confirm per-row rendering matches PRD spec.

---

### 2.6 Dashboard — Total Value Stat Card (§9.1)

**PRD specifies:** Stats row of 4 cards: Total Rounds, Total Value, Calibers Tracked, Running Low.

**What IS implemented:**
- `frontend/src/pages/dashboard/DashboardPage.tsx` — 4 stat cards: Total Rounds, **Total Boxes**, Calibers Tracked, Low Stock Items

**What IS MISSING:**
- The second stat card shows **Total Boxes** (not Total Value as the PRD specifies)
- No Total Value stat card is displayed, even though `total_value` is available in the API response

**Required:** Replace the Total Boxes card with Total Value; move box count elsewhere or drop it.

---

### 2.7 Empty Box Toggle (§9.11)

**PRD specifies:** Empty boxes (qty_remaining=0) hidden by default; toggle "Show empty boxes" above inventory list; state saved to localStorage.

**What IS implemented:**
- `backend/routers/ammo.py` — `GET /ammo` has `show_archived` parameter (filters `is_archived == False` by default)
- `frontend/src/pages/inventory/InventoryPage.tsx` — "Archived" toggle exists

**What IS MISSING:**
- Empty boxes (qty_remaining=0, is_archived=False) are NOT currently hidden by default — the API filter only excludes `is_archived` boxes
- No `show_empty` query parameter on `GET /ammo`
- The UI toggle says "Archived" not "Show empty boxes" — PRD requires a separate toggle for empty vs archived
- PRD specifies localStorage persistence for the empty toggle (the archived toggle uses `showArchived` state with no localStorage save)

**Required:** Add `show_empty=false` default filter to `GET /ammo`; separate "Show empty" and "Show archived" toggles in the UI; save empty toggle to localStorage.

---

### 2.8 Inventory — Archive / Unarchive (§9.2) ✓ Resolved

**Previously missing:** No confirmation dialog; hardcoded `archive_reason: 'manual'`; no unarchive path; no quick-expend discoverability.

**Now implemented (Phase 8.17):**
- `frontend/src/components/inventory/QuickArchivePopover.tsx` — new popover component (parallel to `QuickExpendPopover`). Empty boxes prefill reason "Empty Box"; boxes with rounds show an amber warning and require an explicit reason. User-supplied reason stored in `archive_reason`.
- `InventoryTable.tsx` — Archive icon now opens `QuickArchivePopover`. Archived rows replace the icon with `ArchiveRestore` (inline unarchive, no confirmation). Crosshair quick-expend icon added as first action on each row.
- `InventoryCardList.tsx` — expanded card shows Archive/Restore button alongside Log Use/Edit/Delete. Collapsed card header shows Crosshair icon for quick expend.
- `InventoryPage.tsx` — `archiveMutation` and `openArchive` removed; popover owns its mutation.

**Still missing:**
- No dedicated `POST /ammo/{id}/archive` endpoint — frontend still PATCHes directly. Low priority; archive-specific audit log is a future concern.

---

### 2.9 Getting Started — "Set Up Storage Locations" Step (§9.1)

**PRD specifies:**
```
□ Add your first ammo box
□ Set up storage locations
□ Configure backup schedule
□ Invite family members  (Admin only)
```

**What IS implemented:**
- `frontend/src/pages/dashboard/DashboardPage.tsx` `GettingStartedCard` shows: Create account (done), Add first ammo box, Set stock thresholds, Invite a family member

**What IS MISSING:**
- "Set up storage locations" step replaced by "Set stock thresholds" — not what the PRD specifies
- "Configure backup schedule" step from the PRD is not in the wizard
- The PRD checklist has 4 items (excl. "Create account"); the current implementation has 3 for admin, 2 for non-admin

**Required:** Align the Getting Started checklist with the PRD spec; add "Set up storage locations" and "Configure backup schedule" steps.

---

### 2.10 Settings — Security Settings UI (§9.6)

**PRD specifies:** Admin security settings: registration mode toggle, invite expiry default, password minimum length, password history depth, common password list toggle.

**What IS implemented:**
- `backend/utils/config.py` — validates `security.registration_mode`, `security.invite_expiry_hours`, `security.password_min_length`, `security.password_history_count`, `security.password_common_list` fields in config.yaml
- Backend reads config on startup

**What IS MISSING:**
- No API endpoints to read or write these security settings at runtime
- No frontend UI for any security settings — they can only be changed by editing `config.yaml` manually and restarting
- No route analogous to `GET/POST /system/config` but for security settings

**Required:** Expose `GET/POST /system/security` (or expand `/system/config`) and build a Security settings section in the admin UI.

---

### 2.11 CSV Import — Duplicate Detection (§9.8)

**PRD specifies:** Duplicate detection on `caliber + manufacturer + purchase_date + cost_per_round`; duplicates skipped, not errored.

**What IS implemented:**
- `backend/routers/importer.py` — import/confirm processes each row and creates `AmmoBox`; uses `INSERT OR IGNORE` indirectly

**What IS MISSING:**
- No explicit duplicate check on the four-field combination `caliber + manufacturer + purchase_date + cost_per_round`
- The backend simply inserts rows; there is no deduplication query before insertion
- The `skipped` counter counts rows that fail validation, not detected duplicates

**Required:** Add pre-insert duplicate check in `confirm_import()` comparing the four-field key against existing boxes.

---

### 2.12 Notifications — In-App Bell (§9.9)

**PRD specifies:** Bell icon in nav bar with unread count badge; notification panel slides out on click; mark read individually or all at once; stored in `notifications` table.

**What IS implemented:**
- `Notification` model in `backend/models.py` — table exists with all required fields
- Migration `0008_add_notifications_table.py` — table is in the DB schema
- `NotificationRead` schema in `backend/schemas.py`
- `notifications` table included in JSON export/import

**What IS MISSING:**
- No backend router for notifications — no `GET /notifications`, `PATCH /notifications/{id}/read`, `POST /notifications/read-all` endpoints
- No frontend bell icon, badge, or notification panel in `frontend/src/components/layout/Sidebar.tsx` or `AppShell.tsx`
- No notification creation logic anywhere (nothing writes to the `notifications` table)

**Status:** Data model exists only; all delivery logic is missing. See also §3.2 (Notifications — Phase 9).

---

### 2.13 Password Reset — `must_change_password` Enforcement (§4.5)

**PRD specifies:** After a forced reset the user is prompted to change password on next login.

**What IS implemented:**
- `User.must_change_password` field in `backend/models.py`
- `POST /users/{id}/reset-password` sets `must_change_password = True`
- `frontend/src/pages/settings/ProfilePage.tsx` — shows amber warning banner when `mustChangePassword` is true
- `frontend/src/contexts/AuthContext` exposes `mustChangePassword`

**What IS MISSING:**
- The app does not **block** navigation until the password is changed — the banner is informational only
- A user with `must_change_password=True` can still use all features of the app without changing their password
- PRD says "the user is prompted" — implies a forced redirect or modal, not just an informational banner

**Required:** Force redirect to `/profile` (or show a blocking modal) when `must_change_password` is true; only allow `/auth/logout` and `POST /users/me/change-password` until password is changed.

---

### 2.14 Update Detection — Background Check (§9.10)

**PRD specifies:** On startup and every 24 hours, backend checks GitHub API for latest release; stores `latest_version`, `update_available`, `update_checked_at` in `app_settings`.

**What IS implemented:**
- `GET /system/version` returns `latest_version` and `update_available` from `app_settings`
- `_record_version()` in `backend/main.py` stores version on startup

**What IS MISSING:**
- No GitHub API call anywhere in the backend — `latest_version` and `update_available` are never written to `app_settings`
- No periodic background task to check for updates (APScheduler is used for backups but not for update checks)
- `update_checked_at` key is never written

**Required:** Add a startup + periodic (every 24h) GitHub Releases API check in the scheduler; write `latest_version`, `update_available`, `update_checked_at` to `app_settings`.

---

### 2.15 Split Box Feature (§9.2.4)

**PRD specifies:** Full and partial split modes; equal and custom split modes; inherits fields from parent; audit log with `log_type="split"` and `related_ids`; validation on split total; UI flow via `⋮` menu or box detail.

**What IS implemented:**
- `split_from_id`, `is_archived`, `archive_reason` fields on `AmmoBox` model — data model is ready
- `log_type` and `related_ids` fields on `ExpenditureLog` model — audit trail fields exist
- `frontend/src/components/inventory/InventoryTable.tsx` — expanded row mentions "Restock, Split (placeholder until implemented)" as future action buttons

**What IS MISSING:**
- No `POST /ammo/{id}/split` backend endpoint
- No split logic in any router
- No split UI in the frontend (only a placeholder comment in the expanded row)

**Required:** Implement `POST /ammo/{id}/split` with full/partial modes; build split UI.

---

### 2.16 Restock / Add Same (§9.2.5)

**PRD specifies:** Restock from inventory list `⋮` menu or box detail page; pre-populates Add Ammo form from source box; source box unchanged.

**What IS implemented:**
- `AmmoBoxCreate` schema supports all required fields
- `AmmoFormPanel.tsx` accepts `editBox` prop which could be repurposed

**What IS MISSING:**
- No restock entry point in the inventory list (`⋮` menu does not exist — actions are inline icon buttons)
- No "Restock" action in `InventoryTable.tsx`
- No form header "Based on Box #47 — edit any fields"
- No dedicated restock flow that pre-populates the form from an existing box while resetting date/container/notes

**Required:** Add restock action to inventory row actions; add pre-population logic to `AmmoFormPanel.tsx`.

---

### 2.17 Add X Copies (§9.2)

**PRD specifies:** Number of boxes field on add form defaults to 1; creates N identical records in one transaction; success message shows "Added N boxes (#X–#Y)".

**What IS implemented:**
- `POST /ammo` creates a single box

**What IS MISSING:**
- No `count` or `copies` parameter on `POST /ammo`
- No "Number of boxes" field in `AmmoFormPanel.tsx`
- No batch-creation logic in the backend

**Required:** Add optional `count: int = 1` to `AmmoBoxCreate`; create N boxes in a transaction; return all created IDs; update `AmmoFormPanel.tsx`.

---

## SECTION 3 — IN PRD, NOT BUILT

Features clearly specified in the PRD with no meaningful implementation in the codebase.

---

### 3.1 Password Reset via Config Token [v1.0]

**PRD §4.3:** `GET /reset?token=` and `POST /reset` routes; `reset_token` read from `config.yaml`.  
**Status:** No route, no frontend page, config key never read.  
**Files needed:** `backend/routers/auth.py` (new routes), `frontend/src/pages/auth/ResetPage.tsx`

---

### 3.2 Notifications — Full System [v1.0 for in-app bell; v1.0 for backup notifications]

**PRD §9.9:**  
- In-app bell icon with unread count badge (nav bar)
- Notification panel slide-out
- Mark individual / all-read
- Creation events: `low_stock`, `backup_failure`, `backup_success`, `import_complete`, `new_user`, `update_available`

**Status:** DB model and migration exist. Zero backend routes. Zero frontend components. No notification creation anywhere.  
**Files needed:** New `backend/routers/notifications.py`; notification creation hooks in backup/import/threshold routes; bell icon + panel in `frontend/src/components/layout/Sidebar.tsx` or `AppShell.tsx`.

---

### 3.3 Notification Delivery — Discord Webhook [v1.0 per PRD; could defer to v2.0]

**PRD §9.9:** Discord webhook channel; sends formatted embed messages; configurable per notification type.  
**Status:** Config structure validated (`notifications.discord.enabled`, `webhook_url`); no sending logic implemented.  
**Files needed:** `backend/utils/notifications.py` channel interface + Discord implementation.

---

### 3.4 Notification Delivery — Email (SMTP) [v1.0 per PRD; could defer to v2.0]

**PRD §9.9:** Email channel; per-user opt-in from profile settings; configurable per notification type.  
**Status:** SMTP config validated; no sending logic. No per-user opt-in field.  
**Files needed:** Email channel in `backend/utils/notifications.py`; `email_notifications` preference on User model or settings.

---

### 3.5 Release Notes Modal on Upgrade [v1.0]

**PRD §9.10:** On first startup after a version change, show a release notes modal to Admin users (once per version per user; dismissible); release notes sourced from GitHub release body.  
**Status:** `last_seen_version` is written to `app_settings` in `_record_version()`. Version change is logged to console. No modal, no GitHub API call for release notes, no per-user dismissal tracking.  
**Files needed:** Endpoint to return release notes; frontend modal in `AppShell.tsx` or router.

---

### 3.6 Update Detection — Background GitHub API Check [v1.0]

**PRD §9.10:** Startup + every 24h check of GitHub Releases API; stores `latest_version`, `update_available`, `update_checked_at`.  
**Status:** `latest_version` and `update_available` are read but never written. APScheduler exists for backup job but no update-check job.  
**Files needed:** Add update-check job in `backend/utils/scheduler.py`; call on startup in `backend/main.py`.

---

### 3.7 Advanced Filter Panel (§9.4) [v1.0]

**PRD §9.4:**  
- Collapsible advanced filter panel
- Multi-select dropdowns for Caliber, Manufacturer, Type, Condition, Category, Location, Container, Dealer
- Purchase date range
- Cost per round range
- Qty remaining range
- Show empty boxes toggle
- Show archived boxes toggle

**Status:** Per-column text filters exist in `InventoryTable.tsx`. The global search bar filters on product_name/legacy_id. No collapsible advanced filter panel exists. No multi-select dropdowns for any lookup. No date range or cost range filters.  
**Files needed:** `frontend/src/components/inventory/AdvancedFilterPanel.tsx`; backend query params on `GET /ammo` for all filter dimensions.

---

### 3.8 Quick Filter Chips (§9.4) [v1.0]

**PRD §9.4:** Horizontal scrollable row of chips below search box for common calibers, types (FMJ, JHP, etc.), condition chips, category chips.  
**Status:** Not implemented. Only a "Condition" dropdown exists in the toolbar (not chips).  
**Files needed:** `frontend/src/components/inventory/QuickFilterChips.tsx`.

---

### 3.9 URL State for Filters & Sort (§9.4) [v1.0]

**PRD §9.4:** Active filters and sort reflected in the URL — links are bookmarkable and shareable.  
**Status:** All filter state is local React state; URL is never updated.  
**Files needed:** Integrate `useSearchParams` from react-router-dom into `InventoryPage.tsx`.

---

### 3.10 Box Detail Page (§9.2, §9.2.4, §9.2.5) [v1.0]

**PRD §9.2.4, §9.2.5:** Split and Restock accessible from "box detail page"; QR scan → expend flow is mobile-optimized box detail page (§10.7).  
**Status:** No `/inventory/:id` route exists. Individual boxes can only be viewed in the expanded row within the inventory table. There is no standalone box detail page.  
**Files needed:** `frontend/src/pages/inventory/BoxDetailPage.tsx`; route `/inventory/:id`.

---

### 3.11 Bulk Label Printing (§10.7) [v2.0 — intentionally deferred]

Print labels for selected boxes; configurable template; Avery formats; optional QR code encoding box detail URL; QR scan → expend mobile flow.  
**Status:** No implementation. Marked v2.0 in PRD.

---

### 3.12 Firearms Registry (§10.1) [v2.0 — intentionally deferred]

Track owned firearms with owner_id + is_shared model.  
**Status:** No implementation. Marked v2.0 in PRD.

---

### 3.13 Range Sessions (§10.2) [v2.0 — intentionally deferred]

Log range sessions; multi-line items; auto-deduct ammo; attach target photos.  
**Status:** No implementation. Marked v2.0 in PRD.

---

### 3.14 Reporting (§10.4) [v2.0 — intentionally deferred]

Inventory, spend, usage, low-stock reports; PDF and CSV export; scheduled email delivery.  
**Status:** No implementation. Marked v2.0 in PRD.

---

### 3.15 Cost Analytics (§10.5) [v2.0 — intentionally deferred]

Price-per-round over time; spend trend charts; average cost by caliber.  
**Status:** No implementation. Marked v2.0 in PRD.

---

### 3.16 Cleaning Reminders (§10.3) [v2.0 — intentionally deferred]

Service interval per firearm; dashboard widget.  
**Status:** No implementation. Marked v2.0 in PRD.

---

### 3.17 Accessories Module (§10.6) [v3.0 — intentionally deferred]

Track accessories attached to firearms.  
**Status:** No implementation. Marked v3.0 in PRD.

---

## SECTION 4 — BUILT, NOT IN PRD

Features that exist in the code but are not documented in the PRD. These need to be added to the PRD or removed.

---

### 4.1 User Model Uses Email as Primary Login Identifier

**What exists:** `backend/routers/auth.py` — login is `POST /auth/login` with `email` field; `backend/models.py` `User` has both `username` and `email` columns, but `username` is set to the email value on creation. The `UserResponse` schema exposes `email`, not `username`.

**PRD says:** §6.1 specifies `username TEXT — Unique login name` as the primary login field; the PRD's login form in §4.2 implies username/password.

**Gap:** The codebase uses email as the login identifier (email/password login). The PRD specifies username/password login. These are inconsistent. The PRD needs to be updated to reflect the email-based auth model, or the code needs to change back to usernames.

---

### 4.2 User Model Has `first_name` and `last_name` Fields

**What exists:** `backend/models.py` `User` has `first_name: str` and `last_name: str`; migration `0010_add_user_name_fields.py`; all user-facing display uses full name.

**PRD says:** §6.1 specifies no first/last name fields — only `username`, `email`, `password_hash`, `role`, `is_active`, `created_at`, `last_login_at`, `created_by`.

**Gap:** PRD §6.1 needs to be updated to include `first_name` and `last_name` fields.

---

### 4.3 Backup — JSON Import Has "Additive Merge" Mode

**What exists:** `POST /backup/import/commit` accepts `mode: str = Form("full")` with `full` or `additive` options. Additive mode skips rows where `id` already exists. Frontend exposes "Full Replace" and "Additive Merge" buttons.

**PRD says:** §11 describes the JSON import/restore flow but does not mention an "additive merge" mode — only full replacement is specified.

**Gap:** Add "additive merge" mode to PRD §11.3 or §11.6.

---

### 4.4 Discord Webhook Config Validated but Not Documented Fully

**What exists:** `backend/utils/config.py` validates `notifications.discord.enabled` and `notifications.discord.webhook_url`; warns if enabled but webhook_url empty.

**PRD says:** §9.9 mentions Discord webhook as a delivery channel. §15.1 validated fields list does not mention Discord-specific fields.

**Gap:** PRD §15.1 validated fields should list `notifications.discord.enabled` (boolean) and `notifications.discord.webhook_url` (string when enabled).

---

### 4.5 `GET /system/config` and `POST /system/config` — Backup Config API

**What exists:** `backend/main.py` — `GET /system/config` returns backup section of config.yaml; `POST /system/config` validates and writes backup config back to config.yaml, then reschedules the APScheduler job. Frontend uses this in `BackupPage.tsx`.

**PRD says:** §11.3 describes the backup config UI but does not specify these config read/write API endpoints.

**Gap:** Add `GET /system/config` and `POST /system/config` to the API endpoint table in PRD §11.3.

---

### 4.6 `GET /health` and `GET /system/health`

**What exists:** `backend/main.py` — two health check endpoints. `/health` returns `{status: "ok", version: __version__}` with no auth. `/system/health` requires auth and checks DB connectivity.

**PRD says:** Not mentioned anywhere.

**Gap:** Document health check endpoints in PRD §13 or a new §Technical API section.

---

### 4.7 CSV Import Has `is_shared` Toggle (Ownership at Import Time)

**What exists:** `POST /import/confirm` accepts `is_shared: bool = Form(True)` parameter; all imported boxes receive the same `is_shared` value. Frontend `ImportPage.tsx` has a Shared/Private radio group.

**PRD says:** §9.8 states "Ammo boxes are created with `owner_id` = importing user; `is_shared` defaults to `false`." The ownership toggle appears to have been added as part of PRD v2.7/v2.8 but the import spec in §9.8 still says defaults to false.

**Gap:** PRD §9.8 "Import behaviour" needs to be updated to reflect the per-import ownership toggle (`is_shared` radio, default `false`).

---

### 4.8 `UserProfileDrawer` Component

**What exists:** `frontend/src/components/UserProfileDrawer.tsx` — a slide-out drawer for the current user's profile info and quick-access links.

**PRD says:** §8.3 of CLAUDE.md build status says "Profile slide-out drawer: COMPLETE" but the PRD document itself does not specify a profile drawer — §9.6 (Settings) only mentions a profile/password page.

**Gap:** Add the profile slide-out drawer to PRD §9.6 or as a UI element in §9.5.

---

### 4.9 Backup Files — `GET /backup/export/download/{filename}`

**What exists:** `backend/routers/backup.py` — two download endpoints: `GET /backup/download/{filename}` and `GET /backup/export/download/{filename}`. The second sets `application/json` MIME type for JSON files.

**PRD says:** §11.3 mentions download links but does not distinguish two download routes.

**Gap:** Minor — document both download route variants in PRD §11.3.

---

### 4.10 `ammo_condition_id` Missing from `AmmoBoxCreate` in PRD's CSV Template Column Order

**What exists:** `backend/routers/importer.py` `VALID_COLUMNS` includes `ammo_condition`; the template has `ammo_condition` column.

**PRD says:** §9.8 CSV template lists: `ammoledger_version, caliber, manufacturer, product_name, grain, weight_unit, type, ammo_condition, category, qty_original, qty_remaining, purchase_date, cost_per_round, dealer, container, location, legacy_id, notes`. The actual template from `GET /import/template` uses `gr_oz` not `grain`, and the column order differs slightly (legacy_id is second, not second-to-last).

**Gap:** PRD §9.8 CSV column spec shows `grain` but the implementation uses `gr_oz`; PRD shows `legacy_id` at the end but the template puts it second. Update PRD §9.8 to match the actual template.

---

### 4.11 DB Index on `caliber_thresholds.caliber_id` via UniqueConstraint (Not in Migrations Separately)

**What exists:** `backend/models.py` `CaliberThreshold` and `LocationThreshold` use `UniqueConstraint` which implies an index, managed in migration `0014_threshold_revamp.py`.

**PRD says:** §6.9 DB indexes does not list `caliber_thresholds` or `location_thresholds` tables.

**Gap:** PRD §6.9 needs `caliber_thresholds: caliber_id (unique)` and `location_thresholds: location_id (unique)` added.

---

## Summary — v1.0 Release Gaps

The following items from Section 2 and Section 3 are **required for v1.0** (not deferred):

| Priority | Item | Effort |
|----------|------|--------|
| HIGH | Rate limiting on login (5 attempts → 15-min lockout) | Backend only |
| HIGH | Password reset via config token (`/reset?token=`) | Backend + Frontend |
| HIGH | `must_change_password` enforcement (block navigation) | Frontend only |
| HIGH | Empty box toggle (separate from archived toggle) | Backend param + Frontend |
| HIGH | Recent Activity shows actual expenditure log entries | New backend endpoint + Frontend |
| HIGH | Dashboard scope selector (My / Shared / All) | Backend param + Frontend |
| HIGH | Dashboard stat card: Total Value (not Total Boxes) | Frontend only |
| HIGH | In-app notifications bell + panel | New router + Frontend components |
| HIGH | Notification creation events (low_stock, backup, import, new_user) | Backend hooks |
| HIGH | Update detection background check (GitHub API) | Backend scheduler |
| MEDIUM | Advanced filter panel (multi-select, date/cost ranges) | Backend params + Frontend |
| MEDIUM | URL state for filters and sort | Frontend only |
| MEDIUM | Box detail page (`/inventory/:id`) | Frontend only |
| MEDIUM | Split box feature | New backend endpoint + Frontend |
| MEDIUM | Restock / Add Same flow | Frontend only (API ready) |
| MEDIUM | Add X Copies | Backend + Frontend |
| MEDIUM | Getting Started checklist alignment | Frontend only |
| MEDIUM | Security settings admin UI | New backend endpoints + Frontend |
| LOW | Quick filter chips | Frontend only |
| LOW | Release notes modal on upgrade | Backend (GitHub call) + Frontend modal |
| LOW | Duplicate detection in CSV import | Backend only |
| LOW | Archive confirmation dialog | Frontend only |
