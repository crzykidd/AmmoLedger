---
name: 2026-11-26-security-backend-deps-and-image
status: completed
created: 2026-11-26
model: sonnet
completed: 2026-11-26
result: Backend deps upgraded (FastAPI 0.165/Starlette 1.10, Pillow 13), lifespan conversion, base image to trixie; 235 tests pass; Trivy 0 critical, 0 Python findings
---

# Task: Backend security patch — upgrade Python deps + move base image to Debian trixie

Part 1 of the next release's security batch. Clear every fixable CVE in the **backend**
image: Dependabot (pip) alerts plus Trivy findings in the published
`ghcr.io/crzykidd/ammoledger-backend:dev` image. Goal: **0 critical, and 0 fixable high**
in the backend image's Python packages; OS-package criticals to 0.

## Findings driving this (verified 2026-11-26)

Dependabot (pip, `backend/requirements.txt`):
- `Pillow==11.0.0` — 56 alerts incl. **5 critical** (heap overflows, Ghostscript arg
  injection). Fixed in **13.0.0** (requires Python >=3.11; we're on 3.12).
- `python-multipart==0.0.27` — 4 alerts (1 high). Fixed in **0.0.31** (latest 0.0.34).

Trivy on the built backend image — transitive Python deps Dependabot can't see (no lockfile):
- `starlette 0.37.2` — 3 high, fixed only in **>=1.3.1**. Pinned by `fastapi==0.111.0`
  (`starlette<0.38`), so **FastAPI must move to current (0.165.x, needs starlette>=1.6)**.
- `certifi 2026.6.17` — critical, fixed 2026.10.18. `dnspython 2.8.0` — 2 high, fixed 2.9.2
  (pulled via fastapi 0.111's `email_validator` dep; newer fastapi drops it as a hard dep).
- OS layer (`python:3.12.9-slim-bookworm`): 10 critical (openssl, gnutls, perl, plus
  zlib CVE-2023-45853 and sqlite CVE-2025-7458 which have **no bookworm fix**).
  `python:3.12-slim-trixie` (3.12.16, Debian 13.8) scans **0 critical**.

Latest on PyPI at time of writing: fastapi 0.165.0, starlette 1.10.0, uvicorn 0.54.0,
sqlmodel 0.0.50, python-multipart 0.0.34, httpx 0.29.0, alembic 1.20.1,
apscheduler 3.11.3 (stay on 3.x — 4.x is a rewrite), pydantic 2.14.4.

## Before you start

- Read `CLAUDE.md` (Run/Test section, Logging section, Database Rules), `backend/main.py`
  (startup/shutdown), `backend/tests/conftest.py`, `Dockerfile.backend`.
- **This host has no backend Python deps and no venv.** Run tests inside Docker instead.
  Docker Hub rate-limits this host — pull Python via the ECR mirror:
  `public.ecr.aws/docker/library/python:3.12-slim-trixie`. Example (from repo root):
  ```
  docker run --rm -v "$PWD/backend:/src" -w /src public.ecr.aws/docker/library/python:3.12-slim-trixie sh -c '
    pip install -q -r requirements.txt &&
    D=/tmp/aldata && mkdir -p $D/backups $D/uploads &&
    DATABASE_URL=sqlite:///$D/app.db alembic upgrade head &&
    CONFIG_PATH=$D/config.yaml DEFAULTS_PATH=$PWD/defaults.yaml BACKUP_PATH=$D/backups \
    UPLOADS_PATH=$D/uploads DATABASE_URL=sqlite:///$D/app.db python -m pytest -q'
  ```
  Make sure no root-owned junk (`__pycache__`, `.pytest_cache`) is left in `backend/`
  afterwards (add `-e PYTHONDONTWRITEBYTECODE=1 -p no:cacheprovider` or clean up with a
  follow-up `docker run ... rm -rf`).
- **Baseline first:** run the suite against the *current* requirements before changing
  anything, so you can tell regressions from pre-existing failures.

## Working tree check

Run `git status --porcelain`. Expected: only `D  prompt/startnewsession.md` staged (the
orchestrator's — leave it alone, do not include it in your commit list). If any file you
need is dirty, stop and report.

## What to do

1. **Pin upgrades in `backend/requirements.txt`** to current releases (exact `==` pins,
   matching existing style): fastapi, uvicorn[standard], sqlmodel, python-multipart,
   alembic, httpx, Pillow 13.0.0, and bump the others (bcrypt, itsdangerous, pyyaml,
   apscheduler 3.11.x, pycountry, pytest) to current where it's low-risk. Ensure the
   resolved set gives starlette >=1.3.1, certifi >=2026.10.18, and no dnspython <2.9.2
   (if dnspython is still pulled in, it must resolve >=2.9.2). Don't add packages we
   don't use. If a bump causes breakage that isn't worth chasing, hold that package at
   the lowest version that is CVE-free and note why in decisions.md.
2. **Starlette 1.x removed `@app.on_event`.** Convert `main.py`'s
   `@app.on_event("startup")` / `@app.on_event("shutdown")` handlers to a single
   `lifespan` async context manager passed to `FastAPI(lifespan=...)`, preserving the
   exact ordering and behavior (migrations, seeds, stat-heal, scheduler start/stop,
   logging setup, version check, etc.). Check the comment near `main.py:57` about
   middleware/`on_startup` ordering and keep its intent. Check tests/conftest for
   anything relying on `on_event` semantics (TestClient fires lifespan only when used as
   a context manager or on first request — verify startup still runs in tests the same
   way it did). Grep for any other Starlette/FastAPI APIs removed or changed across
   0.111→0.165 / starlette 0.37→1.x (e.g. `TemplateResponse` signature, middleware
   changes, `SessionMiddleware` args, `Request` imports, `UploadFile` behavior,
   `HTTPException` detail handling, response_model / Pydantic serialization changes) and
   fix what breaks.
3. **Pillow 13:** our usage (`utils/firearm_photos.py`, `routers/products.py`) is
   `open/verify/exif_transpose/convert/thumbnail/crop/paste/split` and
   `Image.LANCZOS` / `Image.Resampling.LANCZOS`. Release-notes review found no breaking
   change for these; confirm via `tests/test_firearm_photos.py` + product image tests.
4. **`Dockerfile.backend`:** `FROM python:3.12.9-slim-bookworm` →
   `FROM python:3.12.16-slim-trixie` (exact patch pin, matching the existing pinning
   convention). Confirm `curl` and `gosu` still install on trixie. Build the image
   locally (`docker build -f Dockerfile.backend -t al-backend:sec ./backend` — check the
   real context in docker-compose.dev.yml/docker-publish.yml; if Docker Hub 429s, a
   temporary `--build-arg`/edit to the ECR mirror is fine for the local build only — the
   committed `FROM` must stay `python:...` on Docker Hub).
5. **Verify:**
   - Full backend suite green in the trixie container (compare against baseline).
   - `ruff check backend/` clean (ruff==0.4.4 — install it in the container).
   - `alembic upgrade head` from empty works.
   - Boot smoke test: run the built image (with `AL_SESSION_SECRET` set and a temp data
     dir) and hit `/health` (or `/api/health` — check) — must return 200, and startup log
     lines must still appear (logging self-heal still works under lifespan).
   - Trivy scan of the built image:
     `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy-cache:/root/.cache aquasec/trivy:latest image -q --severity CRITICAL,HIGH al-backend:sec`
     Target: 0 CRITICAL total; 0 HIGH in Python packages; OS HIGHs only where Debian has
     no fix. Report the before/after counts.
6. **Docs** (same commit, per CLAUDE.md):
   - `CHANGELOG.md` `[Unreleased]` → `### Security`: user-facing entries (Pillow critical
     image-decoding fixes; framework/dependency updates; backend base image moved to
     Debian 13 to pick up OpenSSL/zlib/sqlite fixes). Create the section if absent.
   - `README.md` tech-stack table (~line 206) base image.
   - `docs/PRD.md`: tech-stack table (~line 2876) base image; any sample log line showing
     `python=3.12.9` (~line 1056) → 3.12.16; add a Revision History row dated 2026-11-26.
   - `CLAUDE.md` only if something it states became wrong (e.g. it mentions `on_event`
     or startup events in the test instructions — "startup events fire during
     TestClient" should stay accurate or be reworded for lifespan).
   - `docs/decisions.md` (newest at top): FastAPI/Starlette 1.x jump + on_event→lifespan;
     trixie move rationale (bookworm has no fix for zlib/sqlite criticals); any package
     held back and why.

## Conventions to honor

- Commit prefix `fix:` (security patch); no `Co-authored-by:` trailer.
- Don't touch the frontend, `Dockerfile.frontend`, or `.github/workflows/docker-publish.yml`
  — that's part 2 (`2026-11-26-security-frontend-deps-and-images`).
- Never `git add -A`; never commit; never push.

## When done

1. Update this file's frontmatter: set `status` (completed/failed), `completed` (the
   date), and `result` (one line).
2. `git mv` this file into `prompts/done/` (on success) or `prompts/failed/` (on
   failure). Note: the file is untracked, so `git add` it first, then `git mv` (or just
   `mv` it and list the new path).
3. Record non-obvious decisions in `docs/decisions.md`.
4. **You are a spawned agent: do not commit.** Report back: the file list, proposed
   one-line commit message, test baseline vs after, Trivy before/after counts, and any
   residual (unfixable) findings.
