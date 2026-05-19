<!-- This document is part of the AmmoLedger PRD. See ../PRD.md for the master document. -->

# Licenses — Carry Permits, NFA Stamps, and Reciprocity

**Status:** DRAFT — design committed at the architectural level. Not yet scheduled to a release. Depends on the Legal Owners feature (see legal-owners.md) shipping first.

**Scope:** This document specifies the Licenses feature — tracking user-held firearms-related permits and credentials (US state carry permits, UK firearms/shotgun certificates, Canadian PAL/RPAL, NFA tax stamps, hunting licenses, instructor credentials, state prerequisites like CA FSC), modeling reciprocity between jurisdictions, surfacing renewal reminders, and visualizing where a user is legally covered to carry. Excludes legal entity record-keeping and entity filings — those live in `legal-owners.md`.

**Cross-references:**
- Ownership model and RBAC: see `../PRD.md` §3 and §5.
- Legal entity layer this feature depends on: see `legal-owners.md`.
- Notification delivery for license reminders (not yet started): see `../PRD.md` Phase 9 Notifications.
- Firearm compliance tags (overlapping but distinct — tags describe a firearm; licenses describe a person): see `../PRD.md` §6.7.
- Community lookups sync pattern this feature reuses for license types, jurisdictions, and reciprocity data: see `../PRD.md` §8.2.

---

## 1. Overview

### 1.1 The problem

Firearm owners who carry typically hold one or more permits, each with expiration windows, governing jurisdictions, and a web of reciprocity agreements with other jurisdictions. AmmoLedger has no place to record this today. Letting a carry permit lapse has serious legal consequences in most US states. A user building a multi-state carry portfolio needs to know which jurisdictions their permits cover, which honor only resident permits, and which permits are due for renewal.

### 1.2 The design at a glance

Three conceptual layers:

1. **License Types** (community YAML) — taxonomy of licenses that exist in the world: what they're called, what purpose they serve, how coverage works, whether they link to specific firearms.
2. **User Licenses** (user data) — what the user actually holds: permit number, issuing authority, issue and expiration dates, linked firearms, reminder offsets.
3. **Reciprocity** (community YAML) — directed graph of which jurisdictions honor which permits, with first-class condition flags for the most important edge cases.

### 1.3 Umbrella term: Licenses

Sidebar entry: **Licenses**. Route: `/licenses`. All of the following live under one feature area:

- US state carry permits (CCW, CHL, LTC, CWFL, etc.)
- NFA tax stamps (Form 1, Form 4, Form 5)
- Ownership licenses (UK Firearms Certificate, UK Shotgun Certificate, Canadian PAL/RPAL)
- Hunting licenses
- Instructor / dealer credentials
- State-specific prerequisites (CA Firearm Safety Certificate, etc.)

### 1.4 Why this is its own feature, not a compliance tag

Firearm compliance tags (v0.3.0) describe properties of a *firearm* — jurisdiction, restriction, classification. Licenses describe rights of a *person* — what that person is authorized to do, carry, or own. They interact (a UK FAC entry is linked to a specific firearm; a CA CCW lists specific handguns) but are orthogonal entities. Merging them would force the wrong granularity onto both.

### 1.5 What this feature does NOT do

- **No legal advice** — community-maintained data, may be wrong or stale. Do not rely on for legal decisions. Per-user disclaimer acknowledgement required before interactive use (§5.1).
- **No real-time legal lookups** — reciprocity data ships in YAML and syncs from the community repo on the existing community sync schedule. It is not fetched live.
- **No application workflow** — no help applying for permits, tracking application status, or submitting paperwork.
- **No automatic verification** — permit numbers are typed in; they are never validated against government systems.
- **No coverage map view in v1** — list view only. Map view is deferred to v1.x (see §9).

---

## 2. Community data structure

### 2.1 Folder layout

New `community/licenses/` directory split by country:

```
community/licenses/us/license_types.yaml
community/licenses/us/jurisdictions.yaml
community/licenses/us/reciprocity.yaml
community/licenses/gb/license_types.yaml
community/licenses/gb/jurisdictions.yaml
community/licenses/gb/reciprocity.yaml
community/licenses/ca/license_types.yaml
community/licenses/ca/jurisdictions.yaml
community/licenses/ca/reciprocity.yaml
```

### 2.2 Country code convention

**ISO 3166-1 alpha-2** lowercase folder names (`us`, `gb`, `ca`). `gb` not `uk` for ISO purity — avoids re-litigating naming for every future country.

### 2.3 Jurisdiction sub-divisions

Use **ISO 3166-2** codes: `US-CA`, `US-NY`, `GB-ENG`, `CA-ON`. Nesting depth is capped at three (country → primary subdivision → secondary subdivision). Beyond that, the user's free-text issuing-authority field captures detail.

### 2.4 v1 seed scope

US (complete), Canada (complete), UK (complete). Other countries arrive as community contributions. Schema supports them without changes.

---

## 3. Data model

### 3.1 `license_types` table

Community-maintained taxonomy.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `community_key` | TEXT | UNIQUE. Stable identifier across instances. E.g. `us-fl-ccw`, `gb-fac`, `ca-pal-restricted`. |
| `country_code` | TEXT | ISO 3166-1 alpha-2 (lowercase). `us`, `gb`, `ca`. |
| `display_name` | TEXT | Locally-correct name. "Florida Concealed Weapon License", "UK Firearms Certificate", "Texas License to Carry". |
| `short_name` | TEXT | Nullable. Common abbreviation. "FL CWL", "FAC", "TX LTC". |
| `purpose` | TEXT | `carry` \| `own` \| `transport` \| `hunt` \| `instructor` \| `dealer` \| `prerequisite` \| `nfa_stamp` \| `other`. |
| `issuing_level` | TEXT | `national` \| `state` \| `provincial` \| `county` \| `municipal` \| `federal`. Drives form prompts and reciprocity logic. |
| `coverage_model` | TEXT | `reciprocity_graph` \| `cross_recognized` \| `issuing_jurisdiction_only` \| `none`. See coverage model semantics below. |
| `links_to_firearms` | TEXT | `none` \| `optional` \| `required`. CA CCW, NY pistol permit, UK FAC entries are `required`; NFA stamps are `optional`; most US carry permits are `none`. |
| `can_be_entity_owned` | BOOLEAN | True for NFA stamps and FFL credentials; false for carry permits (always individual). |
| `typical_term_years` | INTEGER | Nullable. Display hint only. The user's actual expiration date always comes from their card, never derived. |
| `authority_website` | TEXT | Nullable. Default link to issuing authority. Users can override per record. |
| `default_jurisdiction_code` | TEXT | Nullable. ISO 3166-2 sub-division if the license type is jurisdiction-locked. `US-FL` for "Florida CWL". |
| `description` | TEXT | Free-text from the YAML. |
| `is_imported` | BOOLEAN | True if imported from community YAML; false if user-created. |
| `source` | TEXT | `community` \| `user`. |
| `is_active` | BOOLEAN | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

**Coverage model semantics:**

- `reciprocity_graph` — uses the directed-graph reciprocity table (US carry permits).
- `cross_recognized` — automatically valid in a defined set of jurisdictions without per-state reciprocity entries (EU European Firearms Pass, Australia inter-state).
- `issuing_jurisdiction_only` — valid only in its issuing jurisdiction (UK FAC, Canada PAL, CA FSC).
- `none` — purpose isn't about coverage (NFA stamps, hunting licenses, instructor credentials).

### 3.2 `jurisdictions` table

Community-maintained list of countries / states / provinces / counties with permitless-carry data.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `code` | TEXT | UNIQUE. ISO 3166-1 alpha-2 (`us`) or ISO 3166-2 (`US-CA`, `US-CA-LA` for county). |
| `parent_code` | TEXT | Nullable. References another `jurisdictions.code`. `US-CA-LA`'s parent is `US-CA`; `US-CA`'s parent is `us`. |
| `name` | TEXT | Display name. "California", "Los Angeles County", "United States". |
| `level` | TEXT | `country` \| `state` \| `province` \| `county` \| `municipal`. |
| `permitless_carry` | BOOLEAN | True if jurisdiction allows carry without a permit (US: Vermont, Texas, Arizona, etc.). |
| `permitless_carry_conditions` | TEXT (JSON) | Array of free-text conditions. E.g. `["21+ years of age", "Not a prohibited person under federal or state law", "Handgun must be carried in a holster"]`. |
| `last_verified` | DATE | When the community-maintained data was last confirmed. Surfaced in the coverage view as "data as of [date]". |
| `community_key` | TEXT | Stable cross-instance identifier. |
| `is_imported` | BOOLEAN | |
| `source` | TEXT | `community` \| `user`. |
| `is_active` | BOOLEAN | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

### 3.3 `license_reciprocity` table

Directed graph: jurisdiction A's law says it honors permits from B / C / D.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `honoring_jurisdiction_code` | TEXT | FK → `jurisdictions.code`. The jurisdiction whose law is being described. |
| `honored_license_type_id` | INTEGER | Nullable. FK → `license_types.id`. NULL means "any qualifying permit from `honored_jurisdiction_code`". |
| `honored_jurisdiction_code` | TEXT | FK → `jurisdictions.code`. The jurisdiction issuing the honored permit. |
| `resident_only` | BOOLEAN | True if the honoring state only honors permits issued to residents of the issuing state. **Common gotcha** — e.g. SC and CO honor resident permits only. |
| `min_age` | INTEGER | Nullable. Minimum age the honoring state requires. NULL = no override beyond issuing state's rules. |
| `must_notify_leo` | BOOLEAN | True if the honoring state requires the carrier to inform LEO on contact. |
| `excludes_non_resident_permits` | BOOLEAN | True if non-resident-issued permits from the honored jurisdiction are NOT recognized. |
| `additional_conditions` | TEXT | Free-text for the long tail of conditions (specific carry methods, weapon-type restrictions, place restrictions, etc.). |
| `last_verified` | DATE | |
| `community_key` | TEXT | |
| `is_imported` | BOOLEAN | |
| `source` | TEXT | `community` \| `user`. |
| `is_active` | BOOLEAN | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

### 3.4 `licenses` table

User data — what the user actually holds.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `owner_id` | INTEGER | FK → `users.id`. The AmmoLedger user managing this record. |
| `license_type_id` | INTEGER | FK → `license_types.id`. |
| `legal_owner_id` | INTEGER | Nullable. FK → `legal_owners.id`. Only meaningful when the parent license type has `can_be_entity_owned = TRUE` (NFA stamps, FFL). Carry permits leave this NULL — carry permits are always individual. |
| `linked_firearm_id` | INTEGER | Nullable. FK → `firearms.id`. Used for NFA stamps and similar `links_to_firearms = optional` cases where exactly one firearm is the target. Multi-firearm links use the join table in §3.5. |
| `license_number` | TEXT | User-typed permit number, certificate number, stamp number. |
| `issuing_authority` | TEXT | Free-text. "Florida Department of Agriculture", "Sacramento County Sheriff's Department", "Avon and Somerset Police". Prefilled from `license_types.authority_website` when available but always editable. |
| `issuing_jurisdiction_code` | TEXT | FK → `jurisdictions.code`. Defaults from `license_types.default_jurisdiction_code` when set. Allowed to be more specific than the default (e.g. license type defaults to `US-CA`, user pins to `US-CA-LA` for the county). |
| `is_resident_permit` | BOOLEAN | Default TRUE. False for non-resident permits (FL Non-Resident, UT Non-Resident — common in carry portfolios). Drives reciprocity logic. |
| `issue_date` | DATE | Nullable. |
| `expiration_date` | DATE | Nullable. NULL for permits that don't expire (e.g. NFA stamps post-approval). |
| `reminder_offsets_days` | TEXT (JSON) | E.g. `[90, 60, 30, 7]`. When to alert before expiration. |
| `notes` | TEXT | Free-text. UK FAC ammunition allowance per entry goes here (not modeled as a structured column). |
| `is_active` | BOOLEAN | |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

### 3.5 `license_firearm_links` table

For `links_to_firearms = required` licenses (CA CCW listed firearms, UK FAC entries by serial, NY pistol permit handguns) and the multi-firearm case of `optional`.

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `license_id` | INTEGER | FK → `licenses.id`. CASCADE delete. |
| `firearm_id` | INTEGER | FK → `firearms.id`. CASCADE delete. |
| `added_date` | DATE | When this firearm was added to the license. |
| `removed_date` | DATE | Nullable. When the firearm was removed (CA permit amendment, FAC slot retired). Set rather than deleted to preserve history. |
| `authority_reference` | TEXT | Nullable. Amendment number, FA-10 number, FAC entry line. |
| `notes` | TEXT | UK FAC ammunition allowance for this entry, NY pistol permit coupon notes, etc. |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

The UK FAC ammunition allowance is deliberately NOT modeled as structured columns in v1. Use `notes`. Schema can be revisited in v2 if a UK-focused feature demands it.

### 3.6 User disclaimer acknowledgement

New columns on `users`:

- `licenses_disclaimer_acknowledged_at` DATETIME, nullable.
- `licenses_disclaimer_version` INTEGER, nullable. Bumped when disclaimer copy materially changes; users are re-prompted.

---

## 4. RBAC

Licenses follow the existing `owner_id` pattern. There is no `is_shared` on a license — carry permits and credentials are personal. Each user sees their own licenses; admins see all licenses globally.

**License-firearm links:** visibility on the link follows the *firearm's* RBAC, not the license's. When displaying linked-firearms for a license, filter to firearms the viewing user can see. When displaying linked-licenses for a firearm, filter to licenses the viewing user owns (or is admin).

**Legal owner referenced by a license:** follows its own RBAC. When a viewing user can see the license but not the legal owner, the entity name renders as "Entity (not visible to you)".

Full permission grid: see `../PRD.md` §5.2 — **Licenses** sub-matrix.

---

## 5. UX surfaces

### 5.1 First-visit disclaimer modal

Required acknowledgement before the `/licenses` page is interactive. Modal text covers: community-sourced data, no legal advice, verify with the issuing authority and with counsel for any consequential decision. Acknowledgement stored on the user record (`licenses_disclaimer_acknowledged_at`). Re-prompts if `licenses_disclaimer_version` bumps. A "View disclaimer" link in the page footer lets users re-read it. Strictly per-user — admin acknowledging does not bind members.

### 5.2 Licenses list page

Sidebar entry: Licenses. Route `/licenses`. Grouped or filterable by `purpose`. Carry permits are the primary focus; NFA stamps, ownership licenses, hunting, instructor, prerequisite all coexist. Each row shows: type, jurisdiction, status badge (active / expiring soon / expired), expiration date, photo thumbnail if set.

### 5.3 License detail page

Sections: details (form fields), linked firearms (if any), expiration timeline, photo gallery, optional legal owner. For `required`-type licenses, the linked-firearms section is prominent (top half of the page) with Add/Remove affordances and the `authority_reference` field surfaced inline.

### 5.4 Coverage view

List-view-only in v1 (map view deferred to §9). Operates only on license types with `coverage_model = 'reciprocity_graph'` or `'cross_recognized'`. For every jurisdiction in the relevant scope, surfaces:

- **Covered** — which of the user's licenses applies.
- **Permitless Carry** — distinct visual treatment, applies regardless of permits held, conditions on hover/expand.
- **Not Covered**.
- **Conditional** — covered with caveats (resident-only mismatch, age requirement, must-notify-LEO, etc.).

"Data as of [date]" surfaces the oldest `last_verified` date among the relevant rows.

### 5.5 Firearm detail page integration

When a firearm is linked to one or more licenses (e.g. CA-listed for CCW), surfaces an "Authorized under" section with license name, jurisdiction, and expiration. Visible to viewers per the license-link RBAC rule in §4.

### 5.6 Add Firearm form integration

When adding a firearm, if the user has any `links_to_firearms = required` licenses, offer (don't force) a "Link to existing license?" prompt. Skip silently when irrelevant.

### 5.7 Reminders

**Phase 9 Notifications is NOT STARTED.** Ship Licenses v1 with in-app reminders only.

The **Aggregated Upcoming Deadlines widget** (introduced in Legal Owners L1, see `legal-owners.md` §4.5) gains a new source in L2: license expirations. The widget is polymorphic — it surfaces firearm cleaning deadlines + entity filing deadlines + license expirations from a single query.

License expiration also surfaces as a persistent banner at the top of `/licenses` when any license is expired or in its reminder window.

When Phase 9 ships, license expirations register as a notification source and gain Discord / email delivery. The data model already supports this — `reminder_offsets_days` on the license is the input; the delivery mechanism is Phase 9's concern.

---

## 6. License photos

### 6.1 Storage location

`${UPLOADS_PATH}/license_photos/<license_id>/`. Same on-disk pattern as firearm photos (v0.3.0).

### 6.2 Processing

Same Pillow normalization as firearm photos: JPEG q85, longest side ≤ 2048 px, 256 px thumbnail, EXIF orientation honored, HEIC rejected with export-as-JPEG hint.

### 6.3 Delivery

Auth-gated streaming endpoints, not public static paths. Same security model as firearm photos.

### 6.4 Backup opt-in flag

**`backup.include_license_photos`, default `false`.** License photos are deliberately more sensitive than firearm photos: a photo of a carry permit shows full legal name, permit number, and often address. A photo of a firearm shows a firearm. Default-off prevents accidental inclusion in backups that may be stored on cloud drives or shared NAS. Operators who want license photos in backups opt in explicitly.

### 6.5 Existing flag unchanged

The existing `backup.include_photos` flag continues to control firearm photos only. The two flags are independent.

---

## 7. v1 seed data scope

### 7.1 US — complete

~50 states + DC + territories. Every carry permit type. NFA stamp types (Form 1, Form 4, Form 5). CA-specific prerequisites (FSC). Full reciprocity graph with `resident_only` / `min_age` / `must_notify_leo` / `excludes_non_resident_permits` populated where known. Permitless-carry flags set on all qualifying states with conditions.

### 7.2 Canada — complete

PAL Non-Restricted, PAL Restricted (RPAL), Authority to Transport (where still distinct), provincial hunting licenses. `coverage_model = 'issuing_jurisdiction_only'` for the federal licenses; no reciprocity graph (national authority).

### 7.3 United Kingdom — complete

Shotgun Certificate (SGC), Firearms Certificate (FAC). Both `coverage_model = 'issuing_jurisdiction_only'`. `links_to_firearms = required` for FAC. Police force list as `level = state` jurisdictions under `gb`.

### 7.4 Future countries

Arrive as community contributions. Schema supports them without changes.

---

## 8. Sequencing

This document specifies **Phase L2** of a two-phase feature area. Depends on Legal Owners (L1) shipping first for the `legal_owners` table and `legal_owner_id` column pattern.

L2 ships:

- Community YAML schema and parser for license types, jurisdictions, reciprocity
- Database tables: `license_types`, `jurisdictions`, `license_reciprocity`, `licenses`, `license_firearm_links`, plus disclaimer-acknowledgement columns on `users`
- Backend `/licenses` router with full CRUD
- Backend `/jurisdictions`, `/license-types`, `/reciprocity` lookup routers
- Coverage computation endpoint
- Frontend Licenses list page, detail page, coverage view (list mode), disclaimer modal
- Firearm form integration (link picker)
- License photo storage + opt-in backup flag (`backup.include_license_photos`)
- US / GB / CA community seed YAML
- Aggregated Upcoming Deadlines widget gains license-expiration source (L1 widget extended)

---

## 9. Future considerations

- **Map view of coverage** (v1.x). The list view is the source of truth; the map is a visualization layer on the same data.
- **Additional countries** — Australia, New Zealand, EU member states, European Firearms Pass cross-recognition.
- **UK FAC structured ammunition allowance columns.** Currently in `notes`. Promote to columns when a UK-focused feature warrants it.
- **NY pistol permit coupon system** — `coupons_remaining` integer on the license-firearm link, with decrement logic.
- **License renewal application workflow** — pre-fill renewal forms, track application status. Out of scope for v1.
- **CSV import/export of licenses.** Out of scope for v1.
