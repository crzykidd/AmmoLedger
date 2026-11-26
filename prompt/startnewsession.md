# Start-New-Session Briefing — AmmoLedger

_Last updated: 2026-11-26. Context handoff for a fresh Claude Code session. **Not** a
`prompts/` handoff-workflow task (no pending/done lifecycle): read it, act on what's still
open, then delete or refresh it._

## Where things stand

- **v0.5.0 shipped 2026-11-26**, a security patch release:
  [release](https://github.com/crzykidd/AmmoLedger/releases/tag/v0.5.0), PR #55.
  GHCR has `:latest`, `:0.5.0` and `:0` for both `ammoledger-backend` and
  `ammoledger-frontend`.
- **Branches:** `dev` == `origin/dev` @ `6f745bb` (`docs: mark v0.5.0 shipped`) and the tree
  is clean.
  - `dev` is 1 commit ahead of `main`, docs-only. It can ride along with the next PR; no
    rush.
  - `main` is "2 ahead" of `dev`, but those are only the PR #54/#55 merge commits, so there's
    no content difference.
- **No open PRs. No AmmoLedger containers running.** CI is green on `dev` and `main`.

## Security posture after v0.5.0 (verified 2026-11-26)

- **Dependabot: 0 open alerts.** 129 total are fixed: 5 critical, 67 high, 48 medium, 9 low.
- **Trivy on published images:**

  | Image | Base | Critical | High |
  |---|---|---|---|
  | Backend | Debian 13.8 | 0 | 57 |
  | Frontend | nginx on Alpine 3.24 | 0 | 0 |

  - The 57 backend highs are Debian `affected` / no-fix-yet packages (util-linux, ncurses,
    perl, systemd libs, openssl QUIC).
  - Both Dockerfiles now run `apt-get upgrade` / `apk upgrade`, so rebuilds pick up OS fixes
    as Debian/Alpine ship them. Rescan occasionally.
- **What v0.5.0 changed:**
  - **Backend:** Pillow 11→13, FastAPI 0.111→0.165, Starlette 1.x (`@app.on_event`
    replaced by a FastAPI `lifespan`), python-multipart, uvicorn, etc. Base image is
    `python:3.12.16-slim-trixie`.
  - **Frontend:** axios 1.21, Vite 5→6.4, React Router 7.18, zod, postcss; `npm audit` is
    clean. Base images are `node:24.22.3-trixie-slim` (builder/dev) and
    `nginx:1.30.8-alpine` (prod).
  - **Pipeline bug fixed:** `docker-publish.yml` had no `target:`, so **v0.4.0 shipped the
    Vite dev server as production**. It now builds `target: prod`, and `prod` is the last
    stage in `Dockerfile.frontend`, so even a missing target yields nginx.
- **`main` ruleset "Require PR for Main"** (id `15867570`; a ruleset, not classic branch
  protection) now requires 7 checks: `build-backend`, `build-frontend`, `test-backend`,
  `lint-backend`, `validate-yaml`, `validate-compose`, `check-migrations`. Plus the CodeQL
  code-scanning gate (high+), no force-push, no deletion, PR required.

## Still open / follow-ups

1. **sqlmodel held at 0.0.44** (latest 0.0.50). From 0.0.45, `datetime` maps to a
   tz-aware column that rejects naive values, and the models use naive `datetime.utcnow`
   everywhere: 188 test errors on 0.0.50. Moving on needs a naive→aware datetime
   migration across models/routers. No CVE pressure today. See `docs/decisions.md`.
2. **bcrypt held at 4.3.0** (latest 5.x). bcrypt 5 raises on passwords >72 bytes where 4.x
   silently truncated. There's no password max-length validator, so a long password would
   500. Add a validator (≤72 bytes) and then bump.
3. **Backend container CMD runs `uvicorn ... --reload` in production.** It's a dev flag
   (file watcher plus a reloader process). CLAUDE.md's Logging section ties the logging
   self-heal design to it, so removing it needs care. Worth a hardening look.
4. **Standards change the user plans to make:** `release-prep-and-cut` should make the
   new-minor CHANGELOG archive a **user-defined option**. For v0.5.0 the archive was
   **deliberately skipped** (recorded in `docs/decisions.md`, so don't "fix" it as drift).
   After the standard is updated in `homelab-configs`, re-pin `standards.md` and sync
   `.claude/commands/release-prep.md` Step 3 and CLAUDE.md's archive-trigger text.
5. **Possible future:** if a clean Trivy report on the backend matters, the cheapest path
   is `python:3.12-alpine` + `apk upgrade`. A scan showed 16 highs, all `krb5-libs`, all
   fixable, so ~0/0. Cost: musl wheels check, `gosu`→`su-exec`, `groupadd`/`useradd` →
   Alpine equivalents. **The user chose to leave it for now.** Distroless and Chainguard
   were rejected (no shell for the PUID/PGID entrypoint; free tier is `:latest` only).
   Docker Hardened Images is a later option (needs `dhi.io` login in CI).
6. **README has no "What's New" section**, though `/release-prep` Step 4 expects one. The
   v0.5.0 security notice sits near the top of the README instead. Either add the section
   or adjust the command.

## Gotchas learned

- **No backend Python deps on this host.** Run backend tests/lint/migrations in Docker:
  ```
  docker run --rm -e PYTHONDONTWRITEBYTECODE=1 -v "$PWD:/repo:ro" -w /repo \
    python:3.12.16-slim-trixie sh -c 'pip install -q ruff==0.4.4 -r backend/requirements.txt && cp -r backend /tmp/b && cd /tmp/b && ...'
  ```
  Use the CLAUDE.md test invocation inside. Copying to `/tmp/b` avoids root-owned
  `__pycache__` in the repo.
- **Docker Hub rate-limits this host (429).** Pull via the ECR mirror
  `public.ecr.aws/docker/library/<image>` and `docker tag` it to the Hub name for local
  builds. Committed `FROM` lines stay on Docker Hub names. Local tags already exist for
  `python:3.12.16-slim-trixie`, `node:24.22.3-trixie-slim`, `nginx:1.30.8-alpine`.
- **Trivy via Docker:**
  `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy-cache:/root/.cache aquasec/trivy:latest image -q --severity CRITICAL,HIGH <image>`.
  It also scans `ghcr.io/crzykidd/ammoledger-*:dev|latest` directly.
- **Dependabot only sees direct pins.** The backend has no lockfile, so transitive pip deps
  (starlette, certifi, …) only show up in Trivy on the built image. Scan images, not just
  manifests.
- **Backend build context is the repo root:** `docker build -f Dockerfile.backend .` (it
  copies `backend/...`). Frontend context is `./frontend`.
- **Dependabot alerts track `main`.** They only close after a merge, plus a rescan that can
  lag by tens of minutes.
- **CodeQL is GitHub default setup.** Do NOT add an advanced `codeql.yml`.
- **Standards source:** local checkout at `~/projects/homelab-configs/standards/`. Diff its
  README `version:` fields against `standards.md` pins.

## Conventions (from CLAUDE.md — do not violate)

- Work on `dev`; never push to `main`; a PR is the only path to `main`; tag only from
  `main` via `/release-cut`.
- Conventional-commit prefixes; no `Co-authored-by` trailers.
- Doc updates ship in the same commit as the code they describe.
- Bigger-than-2-file changes get a `prompts/` handoff executed by a spawned subagent.
