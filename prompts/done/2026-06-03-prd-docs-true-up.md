---
name: 2026-06-03-prd-docs-true-up
status: completed        # pending | completed | failed
created: 2026-06-03
model: sonnet            # mechanical doc edits, no design work
completed: 2026-06-03
result: PRD §2 roadmap reconciled to Shipped/Planned, §15.1 ENV table gained AL_TIMEZONE, revision history renumbered 3.40–3.62 + new 3.63, header bumped to 3.63, frontend/package.json aligned to 0.3.10. Single docs commit on dev.
---

# Task: True up PRD / docs against the shipped v0.3.10 codebase

An audit on 2026-06-03 found the codebase sitting cleanly at **v0.3.10**
(`backend/version.py`). Since the `v0.3.10` tag the only changes are dev tooling
(vexp de-adoption) and the `schemas.py` → `schemas/` package split — both already
captured in `CLAUDE.md`. README, CHANGELOG, INSTALL.md, migrations (4), routers, and
the 37 models are all in sync. The drift is confined to a handful of spots in
`docs/PRD.md` plus one stale version string in `frontend/package.json`. This task
applies the five fixes already approved by the user.

## Before you start

- Read `CLAUDE.md` (doc-sync rules, commit style, `dev`-only branch policy).
- This is a `docs:`-class change. The only code file touched is
  `frontend/package.json` (a version string — not the version source of truth, which
  is `backend/version.py`).
- Do **not** re-run the audit from scratch; the findings below are the work list.

## Working tree check

Run `git status --porcelain` first. The files this plan modifies are `docs/PRD.md`
and `frontend/package.json`. If either has uncommitted changes, list them and ask
before touching. Surface unrelated dirty files once as awareness; don't block.

## What to do

All edits are in `docs/PRD.md` unless noted.

1. **§2 Version Roadmap table — restructure to shipped/planned** (around `docs/PRD.md:177-184`).
   The §10 sub-headings were already updated to "(v0.3.0 — shipped)" but the §2 table
   was never reconciled. Rework the `Version` column to reflect *actual* release
   history:
   - `Firearms Registry`, `Range Sessions`, `Cleaning Reminders` → **v0.3.0 (shipped)**
     (all three shipped in v0.3.0 — confirm against §10.1/§10.2/§10.3 headings).
   - `Target Photo Uploads`, `Session Sharing` → mark **Planned** (deferred — see §10.8).
   - `Notifications` and `Label Printing` are currently mislabeled **v1.0** but neither
     is built (no notifications router; `CLAUDE.md` Phase 9/10 = "NOT STARTED"; label
     printing is §10.7 "future"). Mark both **Planned**.
   - `Reporting`, `Cost Analytics` (v2.0), `Accessories Module` (v3.0) → **Planned**.
   - The remaining "v1.0" rows (auth, ammo CRUD, expenditure, CSV import, backup,
     migrations, Split Box, Restock, etc.) have all shipped across v0.1.9–v0.3.x →
     mark **Shipped**.
   Use a simple, consistent label scheme (e.g. a `Status` column of
   `Shipped` / `Planned`, optionally noting the shipping version for shipped rows).
   Keep it faithful: the v1.0/v2.0/v3.0 milestone labels never mapped to real releases
   (the project shipped v0.1.9 → v0.3.10; there is no "v1.0" release), so don't preserve
   them as if they were release tags.

2. **PRD header metadata** (`docs/PRD.md:3-5`). Currently:
   `**Version:** 3.40 — Working Draft` / `**Date:** April 2026` / `**Status:** In Review`.
   Bump to the new latest revision number from step 4 (`3.63` if the renumber below is
   unchanged), date `2026-06-03`, and a status reflecting that v0.3.10 has shipped
   (e.g. `Living Document`).

3. **§15.1 Supported ENV Variables table** (`docs/PRD.md:2915-2928`). Add the missing
   `AL_TIMEZONE` row — the timezone setting (v0.3.10, #43) is documented in §9.14,
   §15.2, and INSTALL.md but absent from this table. Match INSTALL.md line ~195:
   | `AL_TIMEZONE` | `app.timezone` | string | IANA timezone for interpreting daily
   task/backup schedule times and labelling times in the admin UI; falls back to the
   container `TZ`, then `UTC`. |
   (PUID/PGID are correctly handled separately in §15.2 — leave them.)

4. **Revision-history numbering** (table at `docs/PRD.md:13-103`). There are two `3.40`
   rows, two `3.48` rows, and the `3.56/3.57/3.58` rows are out of sequence. Renumber
   the tail sequentially in file order, starting at the first `3.40` row. This script
   does it deterministically (it failed in the audit only due to a heredoc-escaping
   artifact — the logic is sound; run it from a real `.py` file, not an inline heredoc):

   ```python
   import re
   path = "docs/PRD.md"
   lines = open(path, encoding="utf-8").read().split("\n")
   start = next(i for i,l in enumerate(lines) if l.startswith("## Revision History"))
   end   = next(i for i,l in enumerate(lines) if l.startswith("## Table of Contents"))
   row_re = re.compile(r"^\| (\d+(?:\.\d+)?) \| (.*?) \| (.*) \|\s*$")
   triggered = False
   counter = 40
   for i in range(start, end):
       m = row_re.match(lines[i])
       if not m:
           continue
       ver = m.group(1)
       if not triggered:
           if ver == "3.40":
               triggered = True
           else:
               continue
       lines[i] = f"| 3.{counter} | {m.group(2)} | {m.group(3)} |"
       counter += 1
   open(path, "w", encoding="utf-8").write("\n".join(lines))
   print(f"last assigned 3.{counter-1}")
   ```
   This maps the 23 tail rows to `3.40 … 3.62` in file order (fixes both duplicates and
   the monotonicity). Rows `≤ 3.39` are untouched. After running, **append one new
   revision row** documenting this true-up:
   `| 3.63 | 2026-06-03 | Docs true-up: §2 Version Roadmap reconciled to shipped/planned (firearms/range/cleaning shipped in v0.3.0; notifications/label printing marked planned); §15.1 ENV table gains AL_TIMEZONE; revision-history numbering de-duplicated; PRD header bumped. frontend/package.json version aligned to 0.3.10. No schema/code change. |`
   Then make the header (step 2) read `3.63`.

5. **`frontend/package.json`** — bump `"version": "0.3.6"` → `"0.3.10"` to align with the
   source of truth (`backend/version.py`). String change only.

## Conventions to honor

- Doc-only change in spirit; the package.json bump rides along in the same commit.
- No CHANGELOG entry needed — these are doc-sync/metadata fixes, not user-facing
  behavior. (If you disagree, a one-liner under `[Unreleased]` → `Changed` is
  acceptable, but err toward no entry.)
- Keep PRD prose style consistent with surrounding tables.

## When done

1. Update this file's frontmatter: `status: completed` (or `failed`), `completed: 2026-06-03`,
   and a one-line `result`.
2. `git mv` this file into `prompts/done/` (success) or `prompts/failed/` (failure).
3. Record any non-obvious call (e.g. the chosen §2 Status column scheme) in
   `docs/decisions.md` (newest at top).
4. Propose ONE commit covering `docs/PRD.md`, `frontend/package.json`, this prompt's
   move, and any `docs/decisions.md` edit. Suggested message:
   `docs: true up PRD roadmap + ENV table, align frontend version to 0.3.10`.
   Stage those specific paths (never `git add -A`), commit on `dev`, never push.
