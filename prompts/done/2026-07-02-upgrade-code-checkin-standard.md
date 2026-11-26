---
name: 2026-07-02-upgrade-code-checkin-standard
status: completed
created: 2026-07-02
model: sonnet
completed: 2026-07-02
result: Upgraded code-checkin-and-pr pin 1.1.0 → 1.2.0; added the required backend test-suite CI job + a CodeQL SAST workflow, fixed the one stale test assertion, and synced CLAUDE.md/standards.md.
---

# Task: Upgrade code-checkin-and-pr standard 1.1.0 → 1.2.0

Re-implement AmmoLedger against `code-checkin-and-pr` v1.2.0. The delta from v1.1.0 is
two new required PR checks: (6) **test suite** and (7) **static analysis / code scanning
(SAST)**. AmmoLedger already satisfies checks 1–5.

## Before you start

- Read the standard: `homelab-configs/standards/code-checkin-and-pr/README.md` §"Required
  checks on every PR to `main`" (items 6 and 7).
- The per-session CLAUDE-snippet (operational rules) is **unchanged** 1.1.0→1.2.0 — do not
  touch the "Code check-in (operational rules)" section of CLAUDE.md.

## What to do

1. **Backend test-suite CI job.** Add a `test-backend` job to `.github/workflows/ci.yml`
   that installs `backend/requirements.txt` (pytest is in it), then — mirroring the local
   invocation in CLAUDE.md → Run/Test — creates a data dir, runs `alembic upgrade head`
   against a file DB, and runs `python -m pytest` with `DATABASE_URL` / `CONFIG_PATH` /
   `DEFAULTS_PATH` / `BACKUP_PATH` / `UPLOADS_PATH` set (conftest overrides the route
   session but not the startup engine, so real env vars are required). Pin actions to SHAs
   like the existing jobs.
2. **Fix the one stale test.** `test_firearm_photos.py::test_zip_restore_rejects_path_traversal`
   asserted `"unsafe" in detail`, but `_sanitize_zip_entry_name` rejects `..` parts with
   `"Parent-directory escape in zip: ..."` (400, before extraction). The security behaviour
   is correct; only the assertion is stale. Update it to `"escape" in detail`.
3. **CodeQL SAST workflow.** Add `.github/workflows/codeql.yml` analyzing `python` +
   `javascript-typescript` on push (main/dev), PR (main), and a weekly schedule. The gate is
   that the scan completes; findings surface in Security → Code scanning and don't fail the
   check. Pin `github/codeql-action/*` to a real commit SHA (resolve via
   `gh api repos/github/codeql-action/releases/latest`).
4. **Doc sync.** In CLAUDE.md: remove the now-fixed stale-failure note in Run/Test, and
   update the "CI runs …" summary to include the test suite + CodeQL SAST. Bump the
   `standards.md` code-checkin row pin 1.1.0 → 1.2.0 with notes.

## Decisions

- **Frontend is exempt** from the test-suite check — no vitest / no test files. The
  standard exempts repos with no suite; the Dockerfile image-build (PR) already proves the
  frontend compiles. No frontend CI job added.
- **Stale test fixed, not xfail'd** — the fix is a one-line assertion correction matching
  the (correct) impl behaviour, so the whole suite runs green.
- **Branch protection is a manual follow-up.** Adding `test-backend` + the CodeQL analyze
  jobs to `main`'s required status checks needs repo admin and can only be done after the
  jobs have run once on a PR. Record in decisions.md; flag to the user.

## Conventions to honor

- Pin GitHub Actions to commit SHAs with a `# version` comment (repo convention).
- `code-checkin-and-pr` applies: commit on `dev`, `chore:` prefix, no `Co-authored-by`.
