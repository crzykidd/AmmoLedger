<!-- This document is part of the AmmoLedger PRD. See ../PRD.md for the master document. -->

# Backup / Restore Compatibility — Schema-Versioned Restores and Format Versioning

**Status:** DRAFT — design committed. Supersedes the bare "relax the equality check"
framing of issue #14. Not yet scheduled to a release.

**Scope:** How AmmoLedger decides whether a backup can be restored into the current
installation, and what it tells the admin when it can't fully. Covers the JSON
full-replace export and the `.db` / `.zip` snapshot restore. Excludes cross-installation
row-level merge (different `users` tables) — that was issue #10, has no safe answer, and
is explicitly not revisited here.

**Cross-references:**
- Backup formats and restore pipeline: see `../PRD.md` §11.
- RBAC (restore/import are admin-only): see `../PRD.md` §5.
- Database rules for WAL-safe copy / durable swap / no-ANALYZE: see `CLAUDE.md` → Database Rules.

---

## 1. The problem

Restoring an older backup is rejected with a blunt `400` and no explanation of *what*
would be missing. Issue #14 originally framed the fix as "relax the strict
`schema_migration` equality check once migration 0002 ships." That framing is too narrow.
The real questions are:

1. What is the correct **compatibility key** for a restore — the app version, or the
   schema?
2. When a backup *can't* be restored cleanly, how do we tell the admin **what data will
   be missing or defaulted** instead of a flat rejection?
3. Is the **container format** (the JSON envelope shape, the zip layout) versioned
   independently of the database schema, so we can evolve the file format without
   conflating it with schema drift?

## 2. What a backup carries today (baseline)

**JSON export envelope** (`backend/routers/backup.py::export_backup`):

```json
{
  "ammologger_version": "0.3.10",                 // app version — recorded, NOT used on restore
  "schema_migration": "0004_firearm_v030_polish", // alembic head — the ONLY field restore checks
  "exported_at": "...",
  "tables": { "...": [ ... ] }
}
```

> Note: the `ammologger_version` key is a long-standing misspelling of *ammoledger*. It is
> preserved for read-compatibility with existing exports; new code may emit a correctly
> spelled alias alongside it but must keep reading the old key.

**`.db` / `.zip` snapshot:** the schema is embedded — the `alembic_version` table lives
inside the SQLite file. The `.zip` adds `firearm_photos/` and `products/` directories.

**Restore validation today:**
- **JSON path** (`import_preview` / `import_commit`): `_validate_schema_migration` rejects
  any `export_migration != current` (exact string equality).
- **`.db` / `.zip` path** (`_classify_db_revision` + `_migrate_to_head_if_needed`):
  **already** classifies the embedded revision as `at_head` / `behind` / `ahead` /
  `unknown` / `missing` and **auto-runs `alembic upgrade head`** on a `behind` backup,
  rejecting `ahead` / `unknown` / `missing`. This capability landed *after* #14 was filed
  and reframes the whole issue.

## 3. The compatibility key is the schema head — and that is correct

The restore key is the **Alembic migration head, not the app version.** This is the right
design and it already delivers the "vXXX–vYYY just work" behavior:

> Because compatibility is keyed on schema, app-version bumps that don't change the schema
> never break restore. Migrations stop at `0004`, which shipped in **v0.3.0** — so every
> release **v0.3.0 → v0.3.10** sits at head `0004`. A JSON export from v0.3.4 already
> restores into v0.3.10 today, under the strict check. Friction appears *only* across a
> schema boundary (a v0.2.x export at `0001` → a v0.3.x install at `0004`).

So we do **not** introduce an app-version compatibility band. We keep the schema head as
the key and make the cross-schema case informative instead of binary.

## 4. The two gaps to close

1. **Cross-schema restore is a blunt rejection.** No breakdown of which tables would be
   empty (firearms / range data) or which columns would default. We want informed consent.
2. **The container format is not versioned independently of the schema.** The JSON
   envelope shape and the zip layout have no explicit `backup_format_version`. If we change
   the *file* format (not the DB schema) there is nothing to gate on.

## 5. Design

### 5.1 Three-way (really four-way) restore classification

Replace equal-or-reject with a classification, reusing the existing Alembic graph-walk
(`script.walk_revisions(base="base", head=head)`) already used by `_classify_db_revision`:

| Export schema vs current | Behavior |
|---|---|
| **Equal** | Clean restore — today's happy path; covers all same-schema versions (e.g. v0.3.0–v0.3.10). |
| **Older, ancestor-of-head, at/above the additive-since floor** | **Allowed with disclosure** — preview enumerates new tables that will be empty and columns that will be defaulted; requires explicit admin confirm. |
| **Older, below the floor, or not an ancestor of head** | **Reject** — "not supported; restore the matching `.db`, which auto-upgrades, instead." |
| **Newer (descendant of head) / unknown / missing** | **Reject** — the app cannot translate a future schema backward. |

The JSON full-replace inserts old rows into the **current (head) schema** — it does not
migrate the data. So "additive-safe" means precisely: every column absent from the old
rows is nullable or has a server default in the current schema, and new tables are simply
left empty.

### 5.2 The "additive-since" floor + policy

We control the migrations, so a **static, vetted floor constant** is the honest choice —
true dynamic "was this migration additive?" introspection is not reliably available.

- A constant (e.g. `JSON_RESTORE_ADDITIVE_SINCE = "0001_initial_schema"`) marks the oldest
  revision from which an older JSON export is known additive-safe into head.
- **Policy that keeps the floor low:** a new migration that adds a column to an *existing*
  table MUST make it nullable or give it a server default. A migration that violates this
  (e.g. a `NOT NULL` column with no default on `ammo_box`, a data transform, a renamed
  column) **moves the floor up to itself**, and the author updates the constant in the same
  migration. This is enforced by review, documented next to the constant, and called out in
  `CLAUDE.md` → Database Rules.

### 5.3 `backup_format_version` — container format, decoupled from schema

Add an explicit integer `backup_format_version` to the JSON envelope and a marker
(e.g. a `MANIFEST` / `format` field) to the zip. Bumped **only** when the *container*
changes (envelope keys, table-set framing, zip directory layout) — never for a DB schema
change, which `schema_migration` already covers. Restore checks: a newer
`backup_format_version` than the running build understands → reject with a clear "this
backup was made by a newer AmmoLedger; upgrade first" message. Absent field → treated as
format `1` (all existing exports).

### 5.4 Preview disclosure (the UX)

`import_preview` (and its server-side twin) return, in addition to today's user/app-settings
diff, a **compatibility verdict** object:
- `verdict`: `clean` | `older_compatible` | `rejected`
- when `older_compatible`: `tables_added_empty` (current `_EXPORT_TABLES` not present in the
  export), `columns_defaulted` (columns in the current schema absent from the export rows,
  per table), and a human summary string.
- when `rejected`: the reason (`newer_schema` | `below_floor` | `not_ancestor` |
  `unsupported_format` | `missing_schema_tag`) and a recommended action.

The Backup page renders this as an explicit confirmation step for `older_compatible`
("This export is from an older schema — firearms and range data will be empty, N fields
will be defaulted. Restore anyway?") and as a clear, non-dead-end rejection otherwise.

### 5.5 `.db` / `.zip` stays the recommended cross-version path

The auto-migrating snapshot restore already crosses schema versions cleanly (it runs the
real migrations on the data). The coherent story we document:

> **`.db` / `.zip` restore auto-upgrades the schema. JSON restore discloses-and-defaults.**
> For moving between two installs at different versions, prefer the `.db`/`.zip` snapshot.

## 6. Edge cases

- **`NOT NULL` column added to an existing table without a default** — breaks JSON insert of
  old rows. Prevented by the §5.2 policy; if it slips, the floor moves up and those older
  exports are rejected (not silently corrupted).
- **`CHECK` constraints / FKs added later** — old rows may violate them; same floor handling.
- **New tables (firearms, range_sessions, photos)** — simply empty after an older restore;
  enumerated in `tables_added_empty`.
- **Descendant / unknown / missing revision** — always reject; never guess.
- **Renamed or dropped columns / data transforms** — not additive; floor moves up.

## 7. Implementation surface (summary)

- `backend/routers/backup.py`: replace `_validate_schema_migration`'s binary check with a
  classifier that reuses `_classify_db_revision`'s walk; emit the verdict object from
  `_import_preview_impl`; gate `_import_commit_impl` on an explicit `confirm_older` flag for
  the `older_compatible` case; add `backup_format_version` to `export_backup` and validate it
  on import; add the `JSON_RESTORE_ADDITIVE_SINCE` constant.
- Frontend Backup page: render the compatibility verdict + the older-schema confirmation step.
- `../PRD.md` §11: document the classification, `backup_format_version`, and the
  disclose-and-default flow. Add this doc to §17 index.
- `CLAUDE.md` → Database Rules: add the "new columns on existing tables must be nullable or
  defaulted, or move the additive-since floor" rule.

## 8. Out of scope

- **Cross-installation row-level merge** (different `users` tables) — issue #10; no safe
  answer; not revisited.
- **Backward translation of a newer-schema backup** — impossible to do safely; always
  rejected.

## 9. Relationship to issue #14

This design **supersedes** #14's "relax the equality check" framing. #14 stays open,
repointed at this document; the TODO at `backend/routers/backup.py::_validate_schema_migration`
should be repointed here as well rather than deleted.
