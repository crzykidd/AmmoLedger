---
description: Cut an AmmoLedger GitHub release after the dev→main PR has merged and main CI is green
argument-hint: <version>   (e.g. 0.3.6 — must match what /release-prep prepared)
---

# AmmoLedger — Release Cut

You are publishing the GitHub release for **v$ARGUMENTS**. Run this ONLY after:

- `/release-prep $ARGUMENTS` has merged into `main`, and
- the push-to-`main` CI + Docker build is green and `:latest` images are on GHCR.

Publishing the release triggers the `release: published` workflow, which builds
and pushes the production `:latest`, `:$ARGUMENTS`, and `:<major>` images. So
this step is the point of no return for production images — verify before tagging.

## Execution rules

- `$ARGUMENTS` SHOULD be bare semver (no `v` prefix). If a leading `v` was
  typed (`v0.3.6`), strip it silently. After stripping, if the value does not
  match `MAJOR.MINOR.PATCH` exactly, STOP and ask for a valid version.
- The bare value MUST equal `__version__` in `backend/version.py` on `main`.
  If it does not, STOP.
- The release tag is `v$ARGUMENTS` (with the `v` prefix — matches the existing
  tag convention and the Docker `type=semver` extraction). Before calling `gh`,
  assert the tag string matches `^v[0-9]+\.[0-9]+\.[0-9]+$` exactly. If it does
  not, STOP — never create a malformed tag.
- Do NOT add `Co-authored-by` lines anywhere.
- If any verification step fails, STOP and report. Do not create the tag.

## Step 1 — Verify we are releasing the right commit

1. `git fetch origin` and check out `main`: `git checkout main && git pull`.
2. Confirm `backend/version.py` `__version__` equals `$ARGUMENTS`. If not, the
   prep PR is not merged (or the wrong version was passed) — STOP.
3. Confirm the working tree is clean.
4. Confirm `git log` shows the `chore(release): prepare v$ARGUMENTS` commit on
   `main`. If absent, STOP — the PR has not been merged.

## Step 2 — Verify CI is green on main

Use `gh` to confirm the latest CI run on `main` for this commit succeeded:

1. `gh run list --branch main --limit 5` and confirm the most recent run for the
   release commit concluded `success` for both the CI and Docker-publish
   workflows.
2. If a run is still in progress, tell the user to wait and STOP — do not tag a
   commit whose images may not exist yet.
3. If a run failed, STOP and report which job failed.

## Step 3 — Confirm the version tag does not already exist

`git tag -l "v$ARGUMENTS"` and `gh release view v$ARGUMENTS` — if either exists,
STOP and report. Never overwrite an existing release/tag.

## Step 4 — Assemble the release notes

Extract the `## [$ARGUMENTS] — <date>` section from `CHANGELOG.md` (everything
from that header up to, but not including, the next `## [` header). This is the
release body — the changelog is the single source of truth, matching the PR
description `/release-prep` created.

## Step 5 — Create the release

Create an annotated tag on the current `main` HEAD and publish the release in one
step with `gh`:

```
gh release create v$ARGUMENTS \
  --target main \
  --title "v$ARGUMENTS" \
  --notes-file <the extracted changelog section>
```

(Write the extracted section to a temp file and pass it via `--notes-file`; do
not try to inline multi-line notes.)

## Step 6 — Update last-shipped marker (optional, per your convention)

If your convention is to record the shipped version in `CLAUDE.md` only at
release time: on `dev` (not `main`), update `Last shipped public release:` to
`v$ARGUMENTS (<today>)`, commit as `docs: mark v$ARGUMENTS shipped`, and push to
`dev`. Skip this step if `/release-prep` already handled it.

## Step 7 — Verify the production build fired

1. `gh run list --workflow "Build and publish Docker images" --limit 3` and
   confirm a run triggered by the `release` event for `v$ARGUMENTS` has started
   or succeeded.
2. Report its status.

## Step 8 — Report

Print:

- The release URL (`gh release view v$ARGUMENTS --web` URL, or the URL `gh`
  printed on create).
- The tag created (`v$ARGUMENTS`).
- The status of the production image build.
- A reminder of the expected GHCR tags once the build finishes:
  `:latest`, `:$ARGUMENTS`, and `:<major>` for both `-backend` and `-frontend`.

Done — the release is live.
