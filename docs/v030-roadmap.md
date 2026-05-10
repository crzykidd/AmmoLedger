# AmmoLedger v0.3.0 Roadmap

**Status:** Planning
**Branch:** `dev`

---

## Carryover from v0.2.0

These items were originally scoped for v0.2.0 but were deferred to keep the v0.2.0 release focused. Most are small or single-feature additions.

### Split Box

**What:** A user who entered a case as one box can split it into individually-tracked boxes.

**Status:** Schema fields exist (`split_from_id`, `is_archived`, `archive_reason = "split"`); no router endpoint, business logic, or frontend UI built yet.

**Effort:** Large (3–5 days full-stack)

**Spec reference:** PRD §9.2.4

### Restock / Add Same

**What:** Open the Add Box form pre-filled with all field values copied from an existing box. Eliminates re-entry when restocking a familiar product.

**Status:** Not started.

**Effort:** Small (half-day frontend)

**Spec reference:** PRD §9.2.5

### Add X Copies

**What:** A "Number of boxes" field on the Add Ammo form. If N > 1, creates N identical boxes in one DB transaction.

**Status:** Not started.

**Effort:** Small (half-day full-stack)

**Spec reference:** PRD §9.2 "Add X Copies"

### Login Rate Limiting

**What:** PRD §4.2 specifies 5-attempt lockout with 15-minute timeout after failed logins.

**Status:** Not implemented.

**Effort:** Small (1–2 hours)

**Spec reference:** PRD §4.2

### CSV Import Role Gate

**What:** `/import/validate` and `/import/confirm` currently use `require_auth`, which permits Read-Only users. Should be `require_role("admin", "member")`.

**Status:** Tracked in GitHub issue (filed 2026-05-06).

**Effort:** Trivial (2-line change).

**Spec reference:** PRD §5.2 permission matrix

---

## Firearms & Range Tracking (major workstream)

This is the major new feature set teased in the v0.2.0 README. Together these features extend AmmoLedger from "ammunition tracker" to "collection tracker."

### Firearms Registry

**What:** Track firearms in your collection by serial number, manufacturer, model, caliber, acquisition date, current location, and notes. Ownership and sharing model mirrors ammo boxes (`owner_id` + `is_shared`). Soft-delete via `is_archived`.

**Spec reference:** PRD §10.1, §6.7

### Range Sessions

**What:** Log range trips with date, location, and per-firearm round-expenditure lines. Each line ties to a firearm and to one or more ammo boxes (decrements `qty_remaining` like the existing expenditure log does). Sessions become a first-class entity with their own list view, edit, and history.

**Depends on:** Firearms Registry.

**Spec reference:** PRD §10.2

### Cleaning Reminders

**What:** Per-firearm round-count thresholds. Cumulative rounds since last cleaning are tracked. Dashboard surfaces firearms due or overdue for cleaning. Reset cleaning timestamp from the firearm detail page.

**Depends on:** Firearms Registry.

**Spec reference:** PRD §10.3

### Reporting & Cost Analytics

**What:** Cost-per-round breakdowns over time, expenditure summaries by caliber/firearm/date range, range session frequency reports.

**Depends on:** Range Sessions for the firearm-side data; existing expenditure log for the ammo side.

**Spec reference:** PRD §10.4, §10.5

---

## Deferred to v1.0+

### Notifications (in-app bell + Discord + email)

**Reason:** `notifications` table exists in the schema but no routes, delivery logic, or frontend bell. Substantial multi-week effort. Defer until firearms work is stable.

**Spec reference:** PRD §9.9, §6.13

### Label Printing (PDF, Avery, QR codes)

**Reason:** No foundation in codebase. Standalone feature with many edge cases. Defer to v1.0.

**Spec reference:** PRD §10.7

### Quick Filter Chips / Advanced Filter Panel / URL State for Filters

**Reason:** Per-column filters and the new three-state dropdowns cover the primary use cases. Polish features. Defer to v1.0.

**Spec reference:** PRD §9.4

### Persistent Ammo Page Hint for Hidden Archived/Empty Rows

**Reason:** Documented in the v0.2.0 CHANGELOG `### Known limitations`. Discoverability via the filter dropdowns and post-import deep-links is sufficient for most users. Polish.

---

## Deferred to v3.0+

### Accessories Module

**What:** Track sights, optics, magazines, holsters, slings, and other gear alongside firearms.

**Reason:** Depends on Firearms Registry and Range Sessions being stable.

**Spec reference:** PRD §10.6

---

## Pre-Release Checklist for v0.3.0

To be filled in as the release approaches. Skeleton:

- [ ] Selected scope items implemented and tested
- [ ] PRD updates per any spec changes
- [ ] README version badge updated to `0.3.0`
- [ ] CHANGELOG.md `[Unreleased]` section moved to `[0.3.0] — YYYY-MM-DD`
- [ ] Alembic migrations for any schema changes (firearms registry will need new tables)
- [ ] `backend/version.py` `__version__` updated to `"0.3.0"`
- [ ] `frontend/package.json` version updated
- [ ] Roadmap doc archived to `docs/archive/v030-roadmap.md` and a fresh `v040-roadmap.md` (or similar) created
- [ ] PR `dev` → `main`; CI passes; tag `v0.3.0` from `main`
