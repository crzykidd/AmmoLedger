# README Update List

**Source:** docs-audit-report.md  
**Target File:** README.md  
**Date:** May 2026  

---

## 1. Version Badge — Update on Each Release

**Location:** Line 9, the version badge.

**Current:** `![Version](https://img.shields.io/badge/version-0.1.8-gold)`

**Action:** Update to `0.2.0` when releasing 0.2.0. This is a routine release-time change, not a one-time fix.

---

## 2. Quick Start — Clarify API Docs URL for Reverse Proxy Users

**Location:** "3. Open in your browser" step in the Quick Start section.

**Current:**
```
- App: <http://localhost:5173>
- API docs: <http://localhost:8000/docs>
```

**Issue:** The API docs URL `http://localhost:8000/docs` is only valid for local (non-proxied) access. Users running behind a reverse proxy (Nginx, Traefik, Cloudflare) would access API docs at `/api/docs`. The port 8000 is bound to `127.0.0.1` in `docker-compose.yml` (not exposed on all interfaces), so it's only reachable locally.

**Replace with:**
```
- App: <http://localhost:5173>
- API docs: <http://localhost:8000/docs> (local access only; behind a reverse proxy: `/api/docs`)
```

---

## 3. Specific Version Pull Example — Update on Release

**Location:** "Pulling a specific version" section.

```bash
docker pull ghcr.io/crzykidd/ammoledger-backend:0.1.8
docker pull ghcr.io/crzykidd/ammoledger-frontend:0.1.8
```

**Action:** Update `0.1.8` to `0.2.0` when releasing 0.2.0.

---

## 4. Project Structure — Major Update Needed

**Location:** The "Project Structure" section shows a minimal file tree that doesn't reflect the current codebase.

**Current tree (partial):**
```
backend/
│   └── routers/
│       └── auth.py     ← only one router shown
```

**Problem:** The actual routers directory has 13 files (`ammo.py`, `auth.py`, `backup.py`, `community.py`, `expenditure.py`, `geo.py`, `importer.py`, `lookups.py`, `products.py`, `tasks.py`, `thresholds.py`, `users.py`, `__init__.py`). The utils directory also has many more files than shown. The tree is misleading.

**Option A (recommended):** Remove the Project Structure section entirely. Contributors can explore the repo directly; the README is for users, not internal contributors.

**Option B:** Replace with an updated tree that accurately shows the current structure:

```
AmmoLedger/
├── backend/
│   ├── main.py              # FastAPI app, startup sequence
│   ├── models.py            # SQLModel database models
│   ├── schemas.py           # Pydantic request/response schemas
│   ├── database.py          # Engine, session, Alembic runner
│   ├── password_utils.py    # Password validation and history
│   ├── version.py           # Single source of truth for app version
│   ├── routers/             # API route handlers (13 files)
│   ├── utils/               # Config, RBAC, logging, scheduler, seeds, tasks
│   ├── migrations/          # Alembic migration files (0001–0020+)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx          # React router, route guards
│   │   ├── pages/           # Page components
│   │   ├── components/      # Shared UI components
│   │   ├── api/             # Typed API client wrappers
│   │   ├── contexts/        # Auth, Theme contexts
│   │   ├── hooks/           # useAuth, useTheme, etc.
│   │   └── types/           # TypeScript type definitions
│   ├── package.json
│   └── vite.config.ts
├── community/               # Community-maintained lookup YAML files
├── data/                    # Runtime data volume (mostly git-ignored)
├── docs/
│   ├── PRD.md
│   ├── INSTALL.md
│   └── HELP.md
├── docker-compose.yml       # Production (GHCR images, named volume)
├── docker-compose.dev.yml   # Development (build from source, live reload)
├── Dockerfile.backend
├── Dockerfile.frontend
└── CLAUDE.md                # AI coding conventions and build status
```

---

## 5. config.yaml Settings Table — Expand

**Location:** "Data Directory" section, the config.yaml key/default/description table.

**Current table shows only 4 settings.** The actual `config.yaml` supports many more. The table is not wrong but is incomplete for users wanting to know what can be configured.

**Add a note after the table:**

> For the full list of configuration options including notifications, SMTP, import settings, and security policy, see [Configuration Options](docs/INSTALL.md#configuration-options) and the annotated `config.template.yaml` in the repository.

---

## 6. Features Section — Add Missing Features

**Location:** The "Features" bullet list.

The features list is accurate and comprehensive for v0.1.8. However, the following items should be verified as present and correctly described at the time of 0.2.0 release:

**Add (for 0.2.0 release):**
- `**Split Box** — split an existing box into two tracking records; original rounds are distributed across the new boxes; full audit trail written to expenditure log`
- `**Restock / Add Same** — open the Add Box form pre-filled from an existing box's details; quickly reorder the same product without re-entering all fields`

---

## 7. What's Built Section — Keep Current, Update for 0.2.0

The "What's Built" summary at the top of the README (the condensed bullet list before the detailed Features section) is accurate for v0.1.8.

**Update for 0.2.0 release:** Add entries for Split Box and Restock/Add Same once they ship.

---

## 8. Pre-1.0 Warning — Update Text

**Location:** The callout box at the top of the README:

> Pre-1.0: schema migrations are tested on every release but data model changes are still happening. Back up before upgrading.

**No change needed** — this warning is accurate and appropriate for v0.1.x and v0.2.x.

---

## 9. Backup / Data Directory — Minor Correction

**Location:** The Backup section showing the `data/` directory tree.

```
data/
├── ammoledger.db    ← your database
├── config.yaml      ← your settings
├── defaults.yaml    ← lookup table defaults
├── backups/         ← automated backups
└── uploads/         ← product images
```

**Issue:** `defaults.yaml` is shown in the data directory. In the Docker volume structure, `defaults.yaml` is bundled inside the container image at `/app/defaults.yaml` (the backend's `DEFAULTS_PATH`). The `/data/defaults.yaml` is a copy that may or may not be present depending on startup behavior. A user backing up should focus on `ammoledger.db` and `config.yaml`.

**Recommended correction:** Either remove `defaults.yaml` from the backup tree (it's auto-regenerated from the bundled copy) or add a note:

```
data/
├── ammoledger.db    ← your database (back this up)
├── config.yaml      ← your settings (back this up)
├── backups/         ← automated backups
└── uploads/         ← product images (back this up if you use product images)
```

---

## 10. Development Workflow — Add npm install note

**Location:** Developer Requirements / Development Quick Start.

**The README does not mention this constraint but it should be noted:**

> **Note:** Never run `npm install` on the host machine for package changes. Update `package.json` manually then rebuild with `docker compose exec frontend npm install` or restart the dev container. Running npm on the host creates a native `node_modules` that conflicts with the container.

This is noted in the project memory (`feedback_npm_install.md`) and should be visible to developers. Add it to the "Development workflow" section or as a note in "Developer Requirements".

---

## 11. Documentation Links — Add HELP.md Reference

**Location:** The Documentation section:

```markdown
## Documentation

- [Product Requirements Document](docs/PRD.md) — full feature specs, data model, architecture decisions, and roadmap
- [Installation Guide](docs/INSTALL.md) — detailed setup, external access, and upgrade instructions
```

**Add:**
- `[CONTRIBUTING.md](CONTRIBUTING.md) — how to contribute community lookup data (calibers, manufacturers, dealers, ammo types)`

The CONTRIBUTING.md is already referenced in the "Community Data" section further down the page but not in the Documentation section.

---

## Summary of Priority

| Priority | Change | Effort |
|----------|--------|--------|
| High | Project Structure tree — outdated/misleading | 15 min |
| High | Add Split Box + Restock entries for 0.2.0 | 5 min |
| Medium | Version badge update on release | 1 min |
| Medium | Specific version pull example update on release | 1 min |
| Low | config.yaml table note about full config docs | 5 min |
| Low | npm install dev note | 5 min |
| Low | API docs URL clarification for proxy users | 2 min |
| Low | Backup tree correction (defaults.yaml) | 2 min |
| Low | Documentation links — add CONTRIBUTING.md | 1 min |
