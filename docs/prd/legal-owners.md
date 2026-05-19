<!-- This document is part of the AmmoLedger PRD. See ../PRD.md for the master document. -->

# Legal Owners — Trusts, LLCs, and Recurring Filings

**Status:** DRAFT — design committed at the architectural level. Not yet scheduled to a release. This document and licenses.md were designed together; this one ships first because it is a prerequisite for the NFA-stamp half of the Licenses feature.

**Scope:** This document specifies how AmmoLedger records non-individual legal owners (gun trusts, LLCs, corporations) for firearms and licenses, and how it tracks the recurring filings those entities require (annual reports, franchise taxes, registered agent renewals). It does NOT define the carry permit, reciprocity, or coverage features — those live in `licenses.md`.

**Cross-references:**
- Ownership model and RBAC: see `../PRD.md` §3 and §5.
- Licenses feature that depends on this entity layer: see `licenses.md`.
- Notification delivery for filing reminders (not yet started): see `../PRD.md` Phase 9 Notifications.
- Firearm photos storage pattern (same on-disk layout used by future license photos): see `../PRD.md` §6.7.

---

## 1. Overview

### 1.1 The problem

AmmoLedger today models a firearm's owner as a single user, but real-world firearm ownership often runs through a legal entity — a gun trust for NFA items, an LLC for asset protection, a corporation holding a collection. The existing `owner_id` FK on firearms conflates two different questions: who can see and edit the record in the app (RBAC) versus who legally owns the item in the real world (documentary). This feature separates those questions by adding a first-class entity layer for non-individual legal owners.

### 1.2 The design at a glance

- New `legal_owners` table records entities (trusts, LLCs, corporations) managed by an AmmoLedger user.
- Optional `legal_owner_id` FK on `firearms` (and, via `licenses.md`, on `licenses`) points at the owning entity.
- User-managed under Settings → Legal Owners — not a lookup table, not admin-only.
- Each entity tracks its recurring filings (annual reports, franchise taxes, registered agent renewals) via a `legal_owner_filings` sub-table with auto-recurrence and configurable reminder offsets.
- Aggregated Upcoming Deadlines dashboard widget surfaces due filings alongside other time-sensitive items.

### 1.3 What this feature does NOT do

- **No legal advice** — record-keeping only. AmmoLedger records what the user tells it; it does not validate or interpret the documents.
- **No member roster on entities in v1.** No structured responsible-persons list, no roles table, no trustees table. Co-trustees, LLC members, and responsible persons go in the entity's `notes` field. See §7 for future considerations.
- **No shared entities across users in v1.** Each `legal_owners` row is private to its creator. A family LLC edited by multiple AmmoLedger users is a v2 scenario (see §7).
- **No ammo legal-owner field.** Ammo boxes are intentionally excluded — this feature scopes to firearms and licenses only.
- **No completion log on filings in v1.** `last_filed_date` on the filing record is the only completion artifact. A permanent `legal_owner_filing_log` table is deferred (see §7).
- **No seed data for common filing types in v1.** Wrong seed data is worse than no seed data. Deferred (see §7).

---

## 2. Data model

### 2.1 `legal_owners` table

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `owner_id` | INTEGER | FK → `users.id`. The AmmoLedger user who created and manages this record. Used for RBAC. |
| `entity_type` | TEXT | `individual` \| `llc` \| `trust` \| `corporation` \| `other`. Drives form behavior. |
| `display_name` | TEXT | Required. Free-text. "Smith Family Gun Trust" / "Acme Holdings LLC" / personal legal name. |
| `formed_date` | DATE | Nullable. Optional for `entity_type = individual`. |
| `jurisdiction` | TEXT | Nullable. State / country of formation. Free-text. |
| `identifier` | TEXT | Nullable. **Single free-text field** holding whatever ID is relevant — EIN, state filing number, trust ID. Sensitive data; see §5. |
| `notes` | TEXT | Nullable. Free-form. The place to record co-trustees / members / responsible-persons by name without a structured roster. |
| `is_active` | BOOLEAN | Soft-delete flag. |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

`legal_owners.identifier` is a single free-text field by design. Asking the user whether their state filing number goes in column A or column B is friction for zero benefit; the field is documentary, not used for lookup.

### 2.2 `legal_owner_filings` table

One legal owner can have many filings (LLC annual report + franchise tax + federal Form 1065 = three filings).

| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER | Primary key |
| `legal_owner_id` | INTEGER | FK → `legal_owners.id`. CASCADE delete. |
| `filing_name` | TEXT | User-supplied. "WA Annual Report", "Franchise Tax", "Form 1065". |
| `filing_type` | TEXT | `annual_report` \| `tax_return` \| `franchise_tax` \| `registered_agent` \| `other`. Drives default reminder offsets and icons. |
| `frequency` | TEXT | `monthly` \| `quarterly` \| `semi_annual` \| `annual` \| `one_time`. Drives auto-recurrence. |
| `next_due_date` | DATE | When the next instance is due. Bumped forward by `frequency` when user records a filing as completed. |
| `last_filed_date` | DATE | Nullable. Optional record of last completion. Manually set in v1 (no completion log). |
| `reminder_offsets_days` | TEXT (JSON) | E.g. `[60, 30, 7]`. When to alert before due. |
| `authority` | TEXT | Nullable. "WA Secretary of State", "IRS". Free-text. |
| `authority_url` | TEXT | Nullable. Link to filing portal. |
| `estimated_cost` | DECIMAL | Nullable. For budgeting. |
| `notes` | TEXT | Nullable. |
| `is_active` | BOOLEAN | Soft-disable without deleting history. |
| `created_at` | DATETIME | |
| `updated_at` | DATETIME | |

**Indexes:** `INDEX (legal_owner_id)`, `INDEX (next_due_date) WHERE is_active = TRUE`.

### 2.3 `firearms.legal_owner_id` column

- New nullable FK column on `firearms` pointing at `legal_owners.id`.
- When NULL, the firearm's user-owner (`owner_id`) is implicitly the legal owner.
- When set, the legal owner is the entity; `owner_id` is still the AmmoLedger custodian for RBAC.
- **No equivalent column on `ammo_box`.** Ammo is intentionally not part of this feature.
- The licenses feature will also gain a `legal_owner_id` column on its `licenses` table; that work is specified in `licenses.md`.

### 2.4 What we explicitly do NOT add

- **`entity_members` table** — no structured roster of trustees / LLC members / responsible persons in v1. Co-trustees and members go in the entity's `notes` field. Revisit if multi-user-LLC use cases turn out to be common (see §7).
- **`legal_owner_filing_log` table** — no per-completion history table in v1. The `last_filed_date` field on the filing record is the only completion artifact. Filing record-keeping is a v2 enhancement.

---

## 3. RBAC

`legal_owners.owner_id` controls visibility and write access. Each entity is private to its creator. Admins can view all entities globally (consistent with existing admin role semantics). There is no `is_shared` flag on entities in v1.

Any firearm that references a `legal_owners` row must have its `legal_owner_id` resolvable by the viewing user; otherwise the firearm UI displays the legal owner as "Entity (not visible to you)" — the firearm itself remains visible per existing firearm RBAC. This is an edge case: in practice the firearm's `owner_id` and the entity's `owner_id` will be the same user.

Filings inherit the parent entity's RBAC. No separate visibility rules.

Full permission grid: see `../PRD.md` §5.2 — **Legal Owners** sub-matrix.

---

## 4. UX surfaces

### 4.1 Settings → Legal Owners

New sub-page under Settings, alongside Profile / Thresholds. Lists the user's entities with type, name, jurisdiction, and a status indicator if any filings need attention. "Add Entity" button opens a drawer with the entity form.

### 4.2 Entity detail view

Two-section layout: (a) entity details (form fields), (b) Filings sub-section with a list and an "Add Filing" affordance. When a user records a filing as completed, prompt to confirm the auto-calculated next due date (with manual override).

### 4.3 Firearm form

Add/Edit Firearm drawer gains an optional "Legal Owner" dropdown. Default option: "Me" (i.e. NULL `legal_owner_id`). Other options: all entities the current user owns. Inline "+ Create new" affordance mirroring the LookupCombobox pattern.

### 4.4 Firearm detail page

When a legal owner is set, surfaces the entity name in the Overview tab with a link to the entity detail page.

### 4.5 Aggregated Upcoming Deadlines widget

Dashboard widget — polymorphic from day one. Designed to display entries from any time-sensitive source (firearm cleaning, license expirations, entity filings). Filing entries surface as "Filing X due in N days for [Entity Name]". Widget hidden when nothing is in any warning window. The Licenses feature (see `licenses.md`) plugs license expirations into the same widget when L2 ships.

---

## 5. Sensitive data

The `identifier` field on `legal_owners` may hold an EIN, state filing number, or trust ID. EIN is treated by the IRS as semi-sensitive (similar to SSN exposure for fraud purposes). Trust documents naming responsible persons are deliberately non-public for asset-protection reasons.

- **Backup behavior:** legal owner records are user data and ship in JSON exports unconditionally, same standard as user PII. No special opt-out in v1.
- **CSV firearm export** should NOT include the legal owner's `identifier` by default — only the `display_name`. Confirm during implementation.
- **Logs and error messages** must never include `identifier`, EIN, or filing numbers, even in stack traces. Same standard as passwords.

---

## 6. Sequencing

This document specifies **Phase L1** of a two-phase feature area. L1 ships:

- The `legal_owners` and `legal_owner_filings` tables and all backend CRUD
- The `firearms.legal_owner_id` column
- The Settings sub-page (entity list + entity detail + filings sub-section)
- The firearm form integration (the legal owner dropdown)
- The aggregated Upcoming Deadlines dashboard widget (with filings as the first source)

**L2** is specified in `licenses.md` and ships the full Licenses feature. L2 reuses L1's `legal_owner_id` mechanism for NFA tax stamps and plugs license expirations into the Upcoming Deadlines widget.

---

## 7. Future considerations

- **Member rosters on entities** — trustees, LLC members, responsible persons as a structured sub-table. Defer until multi-user use cases demand it.
- **Filing completion log** — adds a `legal_owner_filing_log` table for permanent history of each completed filing. Useful for proving "entity in good standing since X."
- **Shared entities** — a family LLC that is edited by multiple AmmoLedger users on the same instance. Schema-additive (add an `is_shared` flag; `owner_id` follows the existing ammo/firearm pattern).
- **Seeded filing-type suggestions** — community YAML providing common filings (e.g. "WA LLC annual report — every June 30") as autocomplete hints by entity type + jurisdiction. Defer; wrong seed data is worse than no seed data.
