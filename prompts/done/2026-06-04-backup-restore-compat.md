---
name: 2026-06-04-backup-restore-compat
status: completed
created: 2026-06-04
model: opus              # design-sensitive backend + UX work; classify carefully
completed: 2026-06-04
result: Implemented _classify_schema_migration + backup_format_version + older_compatible UX gate + 12 passing tests + docs
---

# Task: Schema-versioned restores + backup format versioning (implements the #14 design)

Replace the blunt equal-or-reject schema check on JSON restore with an informative
classification, add an independent `backup_format_version` to the container, and surface a
"what will be missing/defaulted" confirmation step. The full design — rationale, the
classification table, the additive-since floor + policy, edge cases, and out-of-scope — is
in [`docs/prd/backup-restore-compat.md`](../docs/prd/backup-restore-compat.md). **Read that
first; this prompt is the build order, not the spec.**

## Before you start

- Read `docs/prd/backup-restore-compat.md` end to end, then `../PRD.md` §11 (Backup) and
  `CLAUDE.md` → Database Rules (WAL-safe copy, durable swap, never-ANALYZE-on-restore,
  one-restore-pipeline-two-entry-points, `_EXPORT_TABLES` coverage rule).
- Key existing machinery to reuse, do not reinvent: `_classify_db_revision`
  (`backend/routers/backup.py` ~line 704) already walks the Alembic graph and returns
  `at_head` / `behind` / `ahead` / `unknown` / `missing`. The JSON path's
  `_validate_schema_migration` (~line 409) is what changes. Import flows go through the
  shared `_import_preview_impl` / `_import_commit_impl` (upload + server-side twins both
  call them — keep it one pipeline).
- The current schema head is `0004_firearm_v030_polish`; migrations `0002`–`0004` are
  additive (new tables + nullable columns, no transforms on existing `ammo_box` data), so
  the initial floor is `0001_initial_schema`.

## Working tree check

Run `git status --porcelain`. Files this plan touches: `backend/routers/backup.py`, the
frontend Backup page (`frontend/src/pages/.../Backup*.tsx` — locate it), `docs/PRD.md`,
`CLAUDE.md`, and `CHANGELOG.md`. If any are dirty, list them and ask before touching.

## What to do

1. **Classifier (backend).** Replace `_validate_schema_migration`'s binary check with a
   function that classifies the export's `schema_migration` against the current head using
   the same `script.walk_revisions(base="base", head=head)` ancestor set used by
   `_classify_db_revision`. Outcomes per the design §5.1: `clean` (equal),
   `older_compatible` (older, ancestor-of-head, at/above the floor), or `rejected` with a
   reason (`newer_schema` / `below_floor` / `not_ancestor` / `unsupported_format` /
   `missing_schema_tag`). Add the `JSON_RESTORE_ADDITIVE_SINCE = "0001_initial_schema"`
   constant with a comment explaining the §5.2 policy. Repoint the existing `#14` TODO to
   `docs/prd/backup-restore-compat.md` rather than deleting it.

2. **`backup_format_version` (backend).** Add an integer `backup_format_version` (start at
   `1`) to the `export_backup` JSON envelope, and a format marker to the `.zip` (a manifest
   or `format` field). On import, reject a `backup_format_version` newer than this build
   understands (absent → treat as `1`). Also emit a correctly-spelled version alias
   alongside the legacy `ammologger_version` key, but KEEP reading the old key (don't break
   existing exports).

3. **Preview verdict (backend).** Have `_import_preview_impl` return a compatibility verdict
   object (design §5.4): `verdict`, and for `older_compatible` the `tables_added_empty`
   (current `_EXPORT_TABLES` absent from the export) and `columns_defaulted` (current-schema
   columns absent from the export rows, per table) plus a human summary. For `rejected`,
   the reason + recommended action.

4. **Gated commit (backend).** `_import_commit_impl` accepts the `older_compatible` case
   only behind an explicit `confirm_older` flag from the client; without it, a non-`clean`
   verdict is refused. Verify old-row inserts succeed against the head schema (nullable /
   defaulted columns); new tables stay empty. Preserve every existing restore guard
   (pre-import backup, image rotation, forced logout, durable swap — unchanged).

5. **Frontend.** On the Backup page, render the verdict: `clean` → restore as today;
   `older_compatible` → an explicit confirmation ("from an older schema — firearms/range
   data will be empty, N fields defaulted. Restore anyway?") that sets `confirm_older`;
   `rejected` → a clear, non-dead-end message with the recommended action (usually "restore
   the matching `.db`, which auto-upgrades").

6. **Docs (same commit as the code).** Update `../PRD.md` §11 with the classification,
   `backup_format_version`, and disclose-and-default flow; add a §17 index entry for
   `prd/backup-restore-compat.md` and flip this doc's Status from DRAFT once shipped. Add
   the §5.2 rule to `CLAUDE.md` → Database Rules ("new columns on existing tables must be
   nullable or have a server default, or move `JSON_RESTORE_ADDITIVE_SINCE` to the new
   migration"). Add a `CHANGELOG.md` `[Unreleased]` entry (Added/Changed) in user-facing
   language.

7. **Tests.** Add backend tests: same-schema restore still clean; a synthesized older-schema
   export classifies `older_compatible` and restores with the expected empty tables /
   defaulted columns under `confirm_older`; a newer/below-floor/unknown export is rejected
   with the right reason; a too-new `backup_format_version` is rejected. (Run per
   `CLAUDE.md` → backend test invocation — migrated file DB + data-dir env vars.)

## Conventions to honor

- One restore pipeline, two entry points (upload + server-side) — both must get the new
  behavior via the shared impls; do not fork the zip-extraction logic.
- `_EXPORT_TABLES` stays the source of truth for the table set.
- Never run `ANALYZE` in the restore path; keep the durable-swap and WAL rules intact.
- This is a `feat:` change; docs ride in the same commit.

## When done

1. Update this file's frontmatter (`status`, `completed`, one-line `result`).
2. `git mv` this file into `prompts/done/` (success) or `prompts/failed/` (failure).
3. Record non-obvious calls (e.g. the floor constant, the zip format marker shape) in
   `docs/decisions.md` (newest at top). Flip `docs/prd/backup-restore-compat.md` Status from
   DRAFT.
4. On GitHub, comment on **#14** linking the design doc and the implementing commit/PR, then
   close it (the design supersedes the original framing). Propose ONE commit covering the
   modified paths + this prompt's move; present the file list and a one-line `feat:` message;
   ask before committing. Stage specific paths (never `git add -A`), commit on `dev`, never
   push to `main`.
