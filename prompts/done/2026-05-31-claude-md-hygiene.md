---
name: 2026-05-31-claude-md-hygiene
status: completed
created: 2026-05-31
model: sonnet            # opus = research/planning, sonnet = coding
completed: 2026-05-31
result: Added Where-things-live, schemas convention, and Run/Test/Migrate/Lint sections; amended Code Context; corrected test invocation (startup events require env vars)
---

# Task: Add orientation + command sections to CLAUDE.md

CLAUDE.md is operationally dense on process but has no "where things live" map and no
Run/Test/Migrate/Lint commands — agents re-derive the test invocation from auto-memory
every cold start, and the new `schemas/` package convention is undocumented. Add three
short sections and soften the now-stale vexp pointer. Docs-only; no code changes.

## Before you start

- Read the current `CLAUDE.md` so the new sections match its tone and don't duplicate
  existing ones (Stack, Configuration, Database Rules, Firearms Domain Conventions, etc.).
- All commands below were taken from authoritative repo sources, not guessed — preserve
  them verbatim:
  - test invocation derived from `backend/tests/conftest.py` (in-memory SQLite, flat
    imports require running from `backend/` via `python -m pytest`)
  - lint / migrate / compose commands copied from `.github/workflows/ci.yml`
  - frontend commands from `frontend/package.json` scripts
- Do NOT touch the vexp operational-rules block — it is a verbatim-pasted standard
  snippet governed by `standards.md` and will be retired through the standard later.

## Working tree check

Before editing, run `git status --porcelain`. If `CLAUDE.md` has uncommitted changes,
list them and ask before touching. Surface unrelated dirty files once; don't block. This
prompt file is exempt.

## What to do

1. Create/use a branch off `dev` per CLAUDE.md conventions.
2. **Insert a new `## Where things live` section immediately after `## Stack`:**

```markdown
   ## Where things live

   Backend (`backend/`, flat package — run with `backend/` on `sys.path`, imports are
   bare like `from models import X`, never `from backend.models`):
   - `main.py` — FastAPI app, startup/shutdown, router registration, `/system/*` endpoints
   - `models.py` — **the data-model source of truth.** All SQLModel table definitions
     (~37 tables) and their FKs live here. To understand the schema, read this file — do
     not maintain a separate schema doc (it would go stale against migrations).
   - `schemas/` — Pydantic API-contract schemas, split per domain (see convention below)
   - `routers/` — HTTP endpoints, one module per domain (ammo, firearms, backup, lookups,
     range_sessions, products, importer, …). Visibility/`_check_write` helpers are
     per-router by design (see Firearms Domain Conventions).
   - `utils/` — cross-cutting services (config, logging, rbac, scheduler, seeds,
     version_check, community_sync, image_search)
   - `database.py` — engine, session, migrations runner, WAL pragma listener, stat-heal
   - `migrations/versions/` — active Alembic chain (starts at the v0.1.9 squash);
     `migrations/archive/` is pre-squash reference only, NOT in the chain. Don't read
     archive/ unless investigating pre-release history.

   Frontend (`frontend/src/`):
   - `pages/` — route-level screens (one per URL); `components/` — reusable pieces grouped
     by domain (inventory, firearms, range, …); `lib/utils.ts` — the `cn()` helper imported
     almost everywhere; `types/index.ts` — shared TS types; `contexts/` + `hooks/` — app
     state (theme, mobile-nav)
```

3. **Add a `## schemas/ package convention (v0.3.10+)` section** directly after the one
   above:

```markdown
   ## schemas/ package convention (v0.3.10+)

   Pydantic schemas live per-domain under `backend/schemas/`, re-exported through
   `schemas/__init__.py`. Two rules for agents:
   - **Import from the submodule**, not a catch-all: `from schemas.ammo import AmmoBoxRead`.
     (`from schemas import AmmoBoxRead` still resolves via the re-export shim, but the
     submodule import is cheaper to read and states intent.)
   - **A new schema goes in its domain module** (`schemas/ammo.py`, `schemas/firearms.py`,
     `schemas/lookups.py`, `schemas/products.py`, `schemas/range.py`, `schemas/users.py`,
     `schemas/thresholds.py`, `schemas/system.py`). Shared base (`_OrmBase`, the `_Date`
     alias, `_NAIVE_ISO_RE`) lives in `schemas/_base.py` — don't duplicate it. Do NOT
     recreate a single mega `schemas.py`; that monolith was deliberately split.
```

4. **Add a `## Run / Test / Migrate / Lint` section** after the schemas convention:

```markdown
   ## Run / Test / Migrate / Lint

   All backend commands run from `backend/`. Tests use in-memory SQLite and self-default
   `SESSION_SECRET`/`DATABASE_URL` (see `tests/conftest.py`) — no env setup needed.

   - **Backend tests:** `cd backend && python -m pytest` (the `python -m` form puts
     `backend/` on the path so the flat imports resolve; bare `pytest` from the repo root
     will fail on `from main import app`). Single file: `python -m pytest tests/test_firearms.py`.
   - **Backend lint (matches CI):** `ruff check backend/` — pinned `ruff==0.4.4`, rule set
     `E4/E7/E9/F` (see `backend/ruff.toml`).
   - **Migrate to head:** `cd backend && alembic upgrade head`. Check head/current:
     `alembic heads && alembic current`. (CI does NOT run `alembic check` — SQLite +
     SQLModel emits TEXT-vs-AutoString false positives; it verifies upgrade-to-head instead.)
   - **Frontend build / typecheck:** `cd frontend && npm run build` (runs `tsc -b && vite
     build`); type-only check: `npm run typecheck` (`tsc --noEmit`). Dev server: `npm run dev`.
   - **Full dev stack:** `docker compose -f docker-compose.dev.yml up -d --build`.
     Validate compose (matches CI): `docker compose config --quiet`.

   CI (`.github/workflows/ci.yml`) runs: backend lint, YAML validation, migrate-to-head,
   and `docker compose config`. **CI does not run the test suite or frontend build** — run
   those locally before opening a PR.
```

5. **Amend the existing `## Code Context` section.** Replace its current body:

```markdown
   ## Code Context

   - Always use vexp index when available for
     file lookups and understanding the codebase
   - Read relevant source files before making
     changes — don't assume structure
```

   with:

```markdown
   ## Code Context

   - Read relevant source files before making changes — don't assume structure.
   - The codebase is ~170 files / ~49K LOC with a clean tree-shaped import topology;
     ripgrep + Read traverses it cheaply. Start from the "Where things live" map above.
```

   Leave the separate "Context search (operational rules)" vexp block untouched.

## Conventions to honor

- Docs-only change → `docs:` commit prefix. `dev` branch, never `main`. No `Co-authored-by:`.
- Match CLAUDE.md's existing heading style and prose density.
- Do not touch the vexp operational-rules snippet, `standards.md`, or any code/config.
- The command strings are authoritative (sourced from conftest.py / ci.yml /
  package.json) — paste verbatim, don't paraphrase or "improve" them.

## Verification

1. `git diff CLAUDE.md` shows only the three added sections + the Code Context edit;
   nothing else changed.
2. Sanity-run the three commands you just documented to confirm they're correct as
   written: `cd backend && python -m pytest` (green), `ruff check backend/` (clean),
   `cd backend && alembic upgrade head` (reaches head). If any fails as documented, fix
   the doc to match reality before committing — that's the whole point of this task.

## When done

1. Update this file's frontmatter: `status`, `completed`, `result`.
2. `git mv` this file into `prompts/done/` (success) or `prompts/failed/` (failure).
3. Record any non-obvious decision in `docs/decisions.md` (newest at top) — e.g. the
   choice to point at `models.py` as schema authority rather than maintain a separate
   data-model doc, and that documenting commands surfaced/verified the auto-memory test
   recipe. Skip if nothing non-obvious came up.
4. Propose ONE commit covering the modified paths (including the prompt move). Present the
   file list and ask `commit these as "docs: add orientation + command sections to
   CLAUDE.md"? (y/n)`. On `y`, stage those specific paths and commit on `dev`. Never
   `git add -A`. Never push.
