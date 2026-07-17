# Start-New-Session Briefing — AmmoLedger

_Last updated: 2026-07-17. This is a context handoff for a fresh Claude Code session.
It is **not** a `prompts/` handoff-workflow task (no pending/done lifecycle) — read it,
act on what's still open, then delete or refresh it._

## Reboot readiness (verified 2026-07-17)

**Safe to reboot this host — nothing will be lost.** Confirmed at last update:

- Working tree **clean**, branch `dev`, everything committed.
- `dev` is fully pushed: local `dev` == `origin/dev` @ `1fe9d20` (no unpushed commits).
- **No AmmoLedger containers were running** (`docker compose ls` showed only unrelated
  `filament-bridge`) — so no live app/DB state to preserve for this project.
- Persistent Claude memory lives outside the repo at
  `~/.claude/projects/-home-manderse-projects-AmmoLedger/memory/` — untouched by a reboot.

After reboot, to resume: `cd ~/projects/AmmoLedger`, `git status` (should be clean on `dev`),
then read this file. To bring the dev stack back up:
`docker compose -f docker-compose.dev.yml up -d --build` (serves on `crzydev.home.arpa:5174`
per commit `6e3a27d`). Nothing auto-starts.

## Where things stand

Branch **`dev`** is **6 commits ahead of `main`** and pushed to `origin/dev` (@ `1fe9d20`).
All CI is green. A `dev → main` PR is **deliberately held** by the user — do **not** open it
or push to `main` without an explicit go-ahead.

The 6 unmerged `dev` commits (oldest → newest):

1. `3a5eb65` `chore:` de-adopt **repo-sandbox-permissions** standard — this is now a
   dedicated dev host with a lowered risk profile; sandbox confinement removed. Doc-only
   (standards.md + decisions.md); the sandbox block was already absent from settings.
2. `6e3a27d` `chore:` point dev compose at **crzydev.home.arpa:5174** — host-specific
   `docker-compose.dev.yml` change (hostname + port 5174 + non-loopback bind), committed as-is
   at the user's request.
3. `29e6d06` `chore:` upgrade **release-prep-and-cut → 1.1.0** (summarize-on-archive): archived
   minors now leave a condensed summary block + `[full notes]` deep link in the active
   CHANGELOG instead of moving out wholesale. Touched `.claude/commands/release-prep.md` Step 3
   + CLAUDE.md changelog descriptions + standards.md pin.
4. `bea9272` `chore:` upgrade **code-checkin-and-pr → 1.2.0**: added the required backend
   **`test-backend`** CI job (pytest with migrated file DB), fixed one stale test assertion
   (`test_zip_restore_rejects_path_traversal` — expected `"unsafe"`, real msg is
   `"Parent-directory escape in zip: …"`), synced CLAUDE.md/standards.md + snippet provenance.
5. `2524523` `fix:` drop the redundant CodeQL advanced workflow — see "Gotchas" below.
6. `1fe9d20` `docs:` add this `prompt/startnewsession.md` briefing.

## Still open (needs the user / repo admin)

- **`dev → main` PR is HELD.** Ask before opening it. When opened it bundles all 6 commits above.
- **Branch protection (manual, repo admin).** Add the new **`test-backend`** job to `main`'s
  required status checks (Settings → Branches) now that it has run on `dev`. GitHub only lets
  you require a check it has already seen. CodeQL default-setup results gate via code-scanning
  settings separately, not as a normal status check. Offered to do it via `gh api` (needs admin
  token) — user hadn't decided.
- **Dependabot backlog.** The `dev` push flagged **27 pre-existing** vulnerabilities on the
  default branch (14 high / 6 moderate / 7 low) — unrelated to this work, worth a separate pass.

## Standards status (see `standards.md` for pins)

All AmmoLedger standard pins are now current against the local `homelab-configs` checkout:
- code-checkin-and-pr **1.2.0** ✅ (just upgraded)
- release-prep-and-cut **1.1.0** ✅ (just upgraded)
- handoff-prompt-workflow **2.0.0** ✅
- repo-sandbox-permissions **de-adopted** ✅
- vexp-context-engine **de-adopted** (sunset) ✅

## Gotchas learned this session

- **This dev host has NO backend Python deps installed** (`pytest`, `alembic`, `fastapi`,
  `sqlmodel` are not importable via the system `python3`; there is no venv). You **cannot run
  the backend test suite or migrations locally here** — rely on the `test-backend` CI job for
  verification, or set up a venv first (`pip install -r backend/requirements.txt`).
- **CodeQL is provided by GitHub _default setup_** (enabled in repo Security settings since
  2026-05-18, scans Python + JS/TS on PR + weekly). Default and advanced setups are mutually
  exclusive — do **NOT** add an advanced `.github/workflows/codeql.yml`; its SARIF upload is
  rejected while default setup is on. This is why commit #5 removed the one I initially added.
- **The `homelab-configs` standards source is a local checkout** at
  `/home/manderse/projects/homelab-configs/standards/` — diff its README `version:` fields
  against `standards.md` pins to detect upgrades.

## Conventions (from CLAUDE.md — do not violate)

- Work on `dev`; never push to `main`; PR is the only path to `main`.
- Conventional-commit prefixes; no `Co-authored-by` trailers.
- Doc updates ship in the same commit as the code they describe.
- Bigger-than-2-file changes get a `prompts/` handoff executed by a spawned subagent.
