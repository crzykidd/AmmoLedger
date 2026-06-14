---
name: 2026-06-12-fix-data-integrity-cleanstate-and-export
status: done
created: 2026-06-12
model: sonnet
completed: 2026-06-13
result: All 5 items resolved. Items 1/2/4 fixed in code; item 3 documented as zip-only by design; item 5 confirmed real and fixed by moving _consume_token to after all import_db commits. 234 tests pass (1 pre-existing failure unchanged). Ruff clean.
---

# Task: Fix firearm clean-state drift, backup export coverage, and import accounting

Backend data-integrity fixes: a denormalized counter that drifts, a lookup table missing
from backup export (silent data loss), and two import-accounting issues.

## Before you start

- Read `CLAUDE.md` → "Firearms Domain Conventions" (the
  `_recalculate_firearm_clean_state` invariant) and the Database Rules about
  `_EXPORT_TABLES` being the source of truth for JSON export coverage.
- Read `backend/routers/range_sessions.py` (`_apply_session_line` ~156–161,
  `_reverse_session_line` ~194, PATCH ~746–800), `backend/routers/backup.py`
  (`_EXPORT_TABLES` ~43–92), `backend/routers/importer.py` (~582 token consume, ~593 the
  separate `import_db` session, ~734 commit, ~791–794 `lookup_values_created`),
  `backend/models.py` (firearms denormalized fields + `firearm_condition_id` FK ~220).

## Working tree check

Run `git status --porcelain`, cross-reference the files below, ask before touching dirty
ones. This prompt file is exempt.

## What to do

1. **Firearm clean-state drift on range-session apply** (High). `_apply_session_line`
   (range_sessions.py:156–161) increments `firearm.rounds_lifetime` and
   `firearm.rounds_since_clean` directly and does NOT call
   `_recalculate_firearm_clean_state`, while the reversal path DOES. This asymmetry means a
   firearm that has a cleaning logged shows a `rounds_since_clean` (and ok/due_soon/overdue
   status) that silently jumps to a different value the next time any line is edited or
   deleted. **Fix:** call `_recalculate_firearm_clean_state(firearm, db)` + `db.add(firearm)`
   after the increment in the apply path so apply and reversal use the same source-of-truth
   recalc. Verify the recalc derives `rounds_since_clean` from `rounds_lifetime` minus the
   last cleaning's `rounds_at_event` and that calling it post-increment yields the correct
   number. Add/extend a test that fires rounds *after* a logged cleaning and asserts
   `rounds_since_clean` is stable across a subsequent unrelated line edit.
2. **`firearm_conditions` missing from `_EXPORT_TABLES`** (High, silent data loss).
   It's a full-CRUD user-editable lookup (`lookups.py`, registered in the dispatch maps) and
   `firearms.firearm_condition_id` FKs to it, yet it's omitted from export while its five
   sibling firearm-attribute lookups are all included. On full-replace JSON import the table
   isn't repopulated, leaving imported firearms pointing at whatever the target happens to
   have. **Fix:** add `"firearm_conditions"` to `_EXPORT_TABLES` in the firearm-lookups group
   (before `firearm_models`) with a comment. (Adding a table is backward-safe — preview
   already handles `tables_added_empty`.)
3. **Decide and document `firearm_photos` in JSON export** (Low/Medium). It's omitted from
   `_EXPORT_TABLES`; zip backup carries photo rows via the embedded `.db`, but a JSON export
   silently drops all firearm-photo associations. Make the choice explicit: either add
   `firearm_photos` to the export, or add a comment in the exclusion block stating photos are
   zip-only by design (so a future reader doesn't think it was forgotten). Prefer the comment
   unless adding it is trivially safe — note your decision in `docs/decisions.md`.
4. **`new_lookup_values_created` over-counts** (Low, cosmetic). `importer.py:791–794` sums
   ALL user-source lookup rows, inflating the "new lookups created" number with pre-existing
   ones. **Fix:** count only rows actually inserted during this import (track inserts in the
   resolve-or-create path, or snapshot counts before/after).
5. **Import token consumed on a different session than the writes** (Medium, suspected —
   confirm first). `importer.py:582` commits/consumes the validation token on the request
   `db` session, but the actual inserts run in a separate `Session(engine)` committed later
   (~734). If the import raises after the token is consumed but before the inserts commit,
   the token is spent with nothing imported (a pre-import backup is taken, so it's not
   corruption — but it's a confusing dead-token state). **Fix:** consume the token in the
   same transaction as the inserts, or re-issue/roll back the token on failure. Verify the
   actual control flow before changing — if a failure path already rolls this back, downgrade
   to a comment.

## Conventions to honor

- Don't add a parallel ammo-deduction or firearm-counter path — extend existing ones.
- Run the backend test suite (CLAUDE.md invocation) — items 1 and 2 are testable. Run
  `ruff check backend/`. Add CHANGELOG `[Unreleased]` **Fixed** entries (clean-state drift,
  backup export coverage, import counts).

## When done

Per `prompts/TEMPLATE.md`: update frontmatter, `git mv` to `done/`/`failed/`, record the
firearm_photos decision (and any others) in `docs/decisions.md`, and (spawned agent) prepare
the tree and report the proposed ONE commit back — no commit, no push. Suggested message:
`fix: recompute firearm clean-state on range apply and close backup/import data gaps`.
