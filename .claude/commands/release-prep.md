---
description: Prepare an AmmoLedger release — bump version, roll changelog, sync docs, validate, commit, push to dev, open PR
argument-hint: <version>   (e.g. 0.3.6)
---

# AmmoLedger — Release Prep

You are preparing release **v$ARGUMENTS** of AmmoLedger. This command does ONLY
the prep + PR steps. It does **not** merge and does **not** create the GitHub
release — that is the human's job (merge) and the `/release-cut` command's job
(tag/release), run after `main` CI is green.

## Execution rules

- Work on the `dev` branch. Never push directly to `main`.
- Do NOT add `Co-authored-by` lines to the commit.
- Do NOT create the GitHub release or tag in this command.
- If any validation step fails, STOP and report — do not commit broken state.
- Make exactly ONE commit covering version + changelog + all doc updates.
- `$ARGUMENTS` is the target version. It SHOULD be bare semver, no `v` prefix
  (e.g. `0.3.6`). If a leading `v` was typed (`v0.3.6`), strip it silently and
  proceed with the bare number. After stripping, if the value is empty or does
  not match `MAJOR.MINOR.PATCH` exactly (three integers, dot-separated, no
  pre-release/build suffix), STOP and ask for a valid version.
- Reminder on the `v` convention: the version is stored and used BARE everywhere
  (`version.py`, changelog header, README badge, image tags). The `v` prefix is
  added in exactly one place — the git tag / GitHub release — and that happens in
  `/release-cut`, not here.

## Step 0 — Preflight

1. Confirm the current branch is `dev`. If not, STOP and report.
2. Confirm the working tree is clean (`git status --porcelain` empty). If there
   are uncommitted changes, STOP and show them — the user must decide.
3. Read the current version from `backend/version.py` (`__version__`). Parse
   both the current version and `$ARGUMENTS` into `(MAJOR, MINOR, PATCH)`
   integer triples for comparison.

### 0a — Hard stops (never proceed past these)

- **Not newer.** If `$ARGUMENTS` is not strictly greater than the current
  version (compared as integer triples, not string compare), STOP and report.
  This blocks re-running an already-shipped version, going backward, or a typo
  that lands on an old number. Equal-to-current also stops.
- **Tag already exists.** Run `git fetch --tags` then check both
  `git tag -l "v$ARGUMENTS"` and `gh release view "v$ARGUMENTS"`. If either
  exists, STOP and report — the release already exists and must not be
  clobbered.

### 0b — Bump-tier classification (warn + confirm)

Classify the jump from current → target. Only a clean single-patch bump
proceeds silently; everything else pauses for explicit confirmation.

- **Patch bump** = MAJOR and MINOR unchanged, PATCH increased.
  - If PATCH increased by exactly 1 (e.g. `0.3.3` → `0.3.4`): proceed, no prompt.
  - If PATCH skipped ahead (e.g. `0.3.3` → `0.3.7`): WARN that
    `N` patch versions were skipped, show the expected next patch
    (current with PATCH+1), and require explicit confirmation before proceeding.

- **Minor bump** = MINOR increased (MAJOR unchanged), e.g. `0.3.3` → `0.4.0`.
  ALWAYS warn and require confirmation, even for the clean `.0` case. Message:
  this is a **new minor release**, which is infrequent — confirm it's intended.
  Note that a new minor also fires the changelog archive trigger (Step 3).
  If the target is a minor bump but PATCH is not `0` (e.g. `0.3.3` → `0.4.2`),
  additionally flag that new minors normally start at `.0`.

- **Major bump** = MAJOR increased, e.g. `0.3.3` → `1.0.0`. ALWAYS warn with
  strong language and require explicit confirmation: this is a **major release**,
  the rarest and most consequential bump, and it produces a new `:<major>` image
  tag. If MINOR or PATCH is not `0` (e.g. `1.2.0`), additionally flag that major
  releases normally start at `X.0.0`.

When warning, always show the three "expected next" successors from the current
version so the user can see what they may have meant:
  next patch (`MAJOR.MINOR.PATCH+1`), next minor (`MAJOR.MINOR+1.0`),
  next major (`MAJOR+1.0.0`).

Do not proceed on any warned tier without a clear affirmative ("yes",
"confirmed", etc.) in the chat. If the user declines, STOP.

### 0c — Remaining setup

4. Determine whether this is a **new minor** (MINOR differs from current) or a
   **patch within the current minor**. This decides whether the archive trigger
   fires (Step 3). (A major bump is also "new minor" for archive purposes — the
   previous minor series gets archived regardless.)
5. Capture today's date as `YYYY-MM-DD` for the changelog header.

## Step 1 — Bump the version

Update `backend/version.py` so `__version__ = "$ARGUMENTS"`. This is the single
source of truth — the Docker workflows and the in-app version display both read
from it. Do not touch the helper functions.

## Step 2 — Roll the changelog

In `CHANGELOG.md`:

1. Change the `## [Unreleased]` header to `## [$ARGUMENTS] — <today>`.
2. Insert a fresh empty `## [Unreleased]` block (with the standard HTML comment
   that is already used in the file) directly above the new version header.
3. Leave the rolled section's entries exactly as written by the dev work — do
   not rewrite them, but DO sanity-check that every entry is user-facing prose
   and sits under a correct category heading (Added / Changed / Fixed /
   Security / Deprecated / Removed). Fix obvious miscategorisation only.
4. If the `[Unreleased]` section is empty (no entries to ship), STOP and report
   — there is nothing to release.

## Step 3 — Per-minor archive trigger (NEW MINOR ONLY)

Only if Step 0 determined this is the **first release of a new minor**
(e.g. cutting `0.4.0` while the active file holds `0.3.x`):

1. Move the entire previous minor series (all `0.3.x` blocks, in this example)
   out of `CHANGELOG.md` into a new `docs/CHANGELOG-<prev-minor>.x.md`
   (e.g. `docs/CHANGELOG-0.3.x.md`), newest-first within that file, matching the
   format of the existing `docs/CHANGELOG-0.2.x.md` archive.
2. Prepend a link to the new archive in the "Archived releases" index at the
   bottom of `CHANGELOG.md`.
3. Confirm the active `CHANGELOG.md` now holds only `[Unreleased]` plus the new
   current minor series (just the `$ARGUMENTS` block at this point).

For a **patch release** (e.g. `0.3.6`), do NOT archive anything — skip this step
entirely.

## Step 4 — Sync the README

In `README.md`:

1. Update the version badge: `version-<old>-gold` → `version-$ARGUMENTS-gold`.
2. Add a `### v$ARGUMENTS (<today>)` entry at the top of the **What's New**
   section, summarising this release in user-facing language drawn from the
   changelog entries you just rolled. Keep it consistent with the voice of the
   existing entries.
3. Update the top-of-file new-in banner / one-line status blurb to reference
   `$ARGUMENTS` if it currently names a specific version.

## Step 5 — Sync the PRD

In `docs/PRD.md`:

1. Add a row to the Revision History table with today's date and a brief
   description of what this release changed (one line, drawn from the
   changelog).
2. If any feature shipped in this release is annotated in the PRD as a future
   version (e.g. "(planned)" or a different version tag), update that
   annotation to "($ARGUMENTS — shipped)". Do not invent PRD sections — only
   adjust version annotations that already exist.

## Step 6 — Sync CLAUDE.md build status

In `CLAUDE.md`, under **Build Status**:

1. Update `Current release target:` and `Last shipped public release:` so they
   are consistent with `$ARGUMENTS` (target becomes `$ARGUMENTS`; last-shipped
   stays whatever the previous shipped version was until `/release-cut` runs —
   OR, if you prefer a single update point, note that `/release-cut` will set
   last-shipped. Be explicit in the commit body about which convention you used).
2. Add a one-line status entry for this release's headline change if the file's
   phase/release log convention calls for it.

## Step 7 — Validate locally BEFORE committing

Run the same checks CI will run, so a red PR is caught now:

1. `ruff check backend/` — must pass clean.
2. `cd backend && alembic upgrade head` against a throwaway SQLite DB
   (`DATABASE_URL=sqlite:///./_release_check.db`), then `alembic heads` and
   `alembic current`. Delete the throwaway DB afterwards.
3. `docker compose config --quiet` — must succeed.
4. Validate the two YAML files CI checks:
   `python -c "import yaml; yaml.safe_load(open('backend/defaults.yaml'))"` and
   the same for `backend/config.template.yaml`.
5. Grep for version-string drift: confirm no stale `<old-version>` references
   remain in `README.md` badge, `backend/version.py`, or the CLAUDE.md build
   target. Report any other occurrences you find rather than blindly editing.

If ANY check fails, STOP, report exactly what failed, and do not commit.

## Step 8 — Commit

Stage everything and make ONE commit. Use a conventional-commit subject and a
body that lists what changed. Template:

```
chore(release): prepare v$ARGUMENTS

- version.py bumped to $ARGUMENTS
- CHANGELOG: rolled [Unreleased] → [$ARGUMENTS] — <today>
- README: version badge + What's New entry
- PRD: revision history row (+ any version annotations)
- CLAUDE.md: build status updated
<- archive line ONLY if a new-minor archive was performed>
```

No `Co-authored-by` lines.

## Step 9 — Push and open the PR

1. `git push origin dev`.
2. Open a PR `dev` → `main` with `gh pr create`:
   - Title: `Release v$ARGUMENTS`
   - Body: this release's CHANGELOG section (the `[$ARGUMENTS]` block you just
     rolled), so the PR description is the release notes. This is the same text
     `/release-cut` will use as the GitHub release body — single source of truth.
3. Capture the PR URL.

## Step 10 — Report and STOP

Print a short summary:

- The PR URL.
- Confirmation that local validation passed.
- The exact next steps for the human, verbatim:
  1. Review the PR on GitHub and wait for CI to go green.
  2. Merge the PR into `main` (squash or merge per your preference).
  3. Wait for the push-to-`main` Docker build to publish `:latest` to GHCR.
  4. Run `/release-cut $ARGUMENTS` to tag and publish the GitHub release.

Do NOT proceed past this point. Do not merge. Do not tag.
