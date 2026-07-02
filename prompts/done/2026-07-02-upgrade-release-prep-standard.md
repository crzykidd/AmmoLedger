---
name: 2026-07-02-upgrade-release-prep-standard
status: completed
created: 2026-07-02
model: sonnet
completed: 2026-07-02
result: Upgraded release-prep-and-cut pin 1.0.0 → 1.1.0; rewrote the changelog archive rule from move-and-link to summarize-on-archive in the slash-command template, CLAUDE.md, and standards.md.
---

# Task: Upgrade release-prep-and-cut standard 1.0.0 → 1.1.0

Re-implement AmmoLedger against `release-prep-and-cut` v1.1.0. The only behavioural
delta from v1.0.0 is the changelog archive rule: **summarize-on-archive** replaces
move-and-link. When a minor is archived, the active `CHANGELOG.md` now keeps a condensed
summary block (one bullet per major feature/fix + a deep link to the archived full
section) instead of leaving nothing behind, and archiving clears **every** closed minor
still in the active file in one pass (not just the immediately-prior one).

## Before you start

- Read the standard: `homelab-configs/standards/release-prep-and-cut/README.md` §"Per-minor
  changelog archive trigger (summarize-on-archive)" and §"/release-prep — required steps" step 6.
- The per-session CLAUDE-snippet (operational rules) is **unchanged** 1.0.0→1.1.0 — do not
  touch the "Release process (operational rules)" section of CLAUDE.md.

## What to do

1. **`.claude/commands/release-prep.md` — Step 3.** Rewrite the archive step from
   move-and-link to summarize-on-archive: move full detail to `docs/CHANGELOG-<prev-minor>.x.md`,
   AND leave a `## [<version>] — <date> (summary)` block in the active file with one bullet
   per major feature/fix (drop trivial entries) ending in a deep link to the archived full
   section. Clarify it fires for every closed minor still in the active file, minor/major
   bumps only, never patch.
2. **`CLAUDE.md`** — update the "Release Process → Archive trigger" bullet and the "Changelog
   Process → Rolling per-minor archive" bullets to describe summarize-on-archive (active file
   = `[Unreleased]` + current minor in full + older minors as summary blocks).
3. **`standards.md`** — bump the release-prep-and-cut row pin 1.0.0 → 1.1.0, update Adopted
   date and Notes.

## Decision

- **Do NOT retrofit** summary blocks for the already-archived 0.3.x / 0.2.x / 0.1.x minors —
  they were moved out under the old rule and rewriting shipped history is churn. The new rule
  applies at the next minor bump (0.5.0), which will summarize 0.4.x. Record this in decisions.md.

## Conventions to honor

- Map-not-copy: the slash command is AmmoLedger's tailored copy of the template; keep its
  existing voice and placeholder substitutions.
- `code-checkin-and-pr` applies: commit on `dev`, `chore:` prefix, no `Co-authored-by`.
