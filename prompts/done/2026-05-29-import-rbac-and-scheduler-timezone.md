---
name: 2026-05-29-import-rbac-and-scheduler-timezone
status: completed
created: 2026-05-29
model: opus
completed: 2026-05-29
result: CSV import gated to admin/member (#12); configurable app.timezone for scheduled jobs end-to-end (#43). 221 backend tests pass (+10 new), frontend typecheck + ruff clean.
---

# Task: Fix CSV-import RBAC (#12) and scheduled-job timezone handling (#43)

Two GitHub issues tackled together this session: a Read-Only privilege violation on
the ammo CSV importer, and the scheduled-task/backup timezone mismatch where the UI
shows local time but the edit form expects UTC.

## Before you start

- Read `standards.md` and the operational-rules blocks in `CLAUDE.md`
  (`code-checkin-and-pr`, `vexp-context-engine`).
- Work on `dev`; never push to `main`. Conventional-commit prefixes; no
  `Co-authored-by:` trailers. Doc updates ship in the same commit as the code.
- Backend tests are NOT run in CI and are container-targeted — see the
  `running-backend-tests` memory for the `CONFIG_PATH`/`DATABASE_URL` env setup
  needed to run pytest locally against a migrated app DB.

## Working tree check

Pre-existing unrelated dirty files at session start: `.claude/hooks/vexp-guard.sh`,
`.github/copilot-instructions.md`, plus untracked editor/dotfile noise and
`AmmoLedger.code-workspace`. None overlap the files below; left untouched.

## What to do

### #12 — CSV import permits Read-Only users (security)

1. In `backend/routers/importer.py`, change `validate_import` and `confirm_import`
   from `Depends(require_auth)` to `Depends(require_role("admin", "member"))`; import
   `require_role` alongside `require_auth`. Leave `/template` on `require_auth`.
2. Add `backend/tests/test_importer_permissions.py`: Read-Only → 403 on both
   endpoints; member → 200 on validate.
3. CHANGELOG `### Security` entry; PRD revision-history row. The §5.2 matrix already
   says Read-Only = ✗ for CSV import — no matrix change, this only aligns enforcement.

### #43 — Timezone for scheduled jobs

1. `backend/utils/config.py`: add `AL_TIMEZONE → ["app","timezone"]` to `_ENV_MAP`;
   add `_is_valid_timezone()`, `get_app_timezone(config)` (resolves `app.timezone` →
   `TZ` env → `UTC`, falls back to UTC on invalid), and an `[app.timezone]` IANA
   validation check in `validate_config`.
2. `backend/utils/scheduler.py`: construct `BackgroundScheduler(timezone=ZoneInfo(get_app_timezone(config)))`
   so daily "HH:MM" schedules fire in the configured zone; add `_to_utc_naive()` and
   use it for both `next_run_at` writes (store an absolute instant as naive UTC).
3. `backend/main.py`: add `"timezone": get_app_timezone(_config)` to
   `_build_version_response` (`/system/version`).
4. Frontend: add `timezone` to `SystemVersionResponse` (`api/system.ts`); in
   `TasksPage.tsx` stop the UTC→browser conversion in `formatInterval`, label daily
   times with the configured zone, thread `timezone` through `TaskRow` /
   `IntervalEditor` (replace the hard-coded "UTC" label); in `BackupPage.tsx` label the
   schedule field with the zone.
5. `backend/config.template.yaml`: document `app.timezone` + `AL_TIMEZONE`.
6. Tests `backend/tests/test_timezone_config.py`; CHANGELOG `### Added`; PRD §9.14
   Timezone subsection + revision row; `docs/INSTALL.md` env reference row.

## Conventions to honor

- Keep a Changelog format, user-facing language. PRD revision-history newest-at-bottom.
- Default `app.timezone: "UTC"` so existing deployments are behavior-identical (opt-in).
- Don't fix the pre-existing `test_zip_restore_rejects_path_traversal` failure here
  (out of scope; tracked in the `stale-zip-traversal-test` memory).

## When done

1. Frontmatter set to completed (above).
2. This file moved into `prompts/done/`.
3. Timezone design recorded in `docs/decisions.md`.
4. Propose the commit(s) — two on `dev`: `fix:` for #12, `feat:` for #43, each with
   its doc + test changes and this prompt move folded into one of them.
