<div align="center">
  <img src="frontend/src/assets/brand/logo-full-dark.png"
       alt="AmmoLedger" width="400"/>
</div>

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-0.1.1-gold)
![Docker](https://img.shields.io/badge/docker-ready-blue)
![PRD](https://img.shields.io/badge/docs-PRD-navy)

</div>

# AmmoLedger

This app is very early and still in development
 
> **⚠️ Disclaimer**
>
> This project is primarily *vibe coded* — optimized for momentum over perfection.
>
> Code may prioritize "it works" over "it's elegant." Refactors welcome.

A self-hosted web application to track your ammunition inventory. Keep your ammo counts accurate on and off the range.

**WARNING**
DB will be resest any data added to db before release will be lost on upgrade. 


## What's Built

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Schema + Alembic migrations |
| Phase 2 | ✅ Complete | Auth + RBAC + YAML seeds |
| Phase 3 | ✅ Complete | Ammo CRUD API |
| Phase 4 | ✅ Complete | Frontend — dashboard, inventory, forms |
| Phase 5 | ✅ Complete | Backup & Restore |
| Phase 6 | ✅ Complete | CSV Import + ammo_condition |
| Phase 7 | ✅ Complete | User management + invitations |
| Phase 8 | ✅ Complete | UI polish — sidebar, about, help, lookups |

## Features

- **First-run setup wizard** — guides new users through adding inventory, setting thresholds, and inviting others
- **Session auth with RBAC** — Admin, Member, and Read-Only roles; bcrypt password hashing; session cookies
- **Full inventory CRUD with bulk edit** — add, edit, delete, archive boxes; select multiple rows and bulk-edit fields in one operation
- **Group By with 8 options** — group by Caliber, Manufacturer, Category, Type, Location, Container, or Condition; collapsible group headers with summary stats
- **Per-column filters** — filter by ID, Caliber, Manufacturer, Gr/Oz, Type, Category, Remaining, Value, and Shared; range operators (`<50`, `>100`, `10-50`) supported
- **Click-to-expend popover** — click the remaining count on any row to log rounds fired inline; Shot All button empties the box
- **Three-tier stock threshold system** — global default, per-caliber overrides, and per-location overrides; stored server-side and shared across all users
- **CSV import with legacy ID mode** — two-step validation, fuzzy matching, optional preservation of existing box IDs from previous tracking systems
- **Backup and restore** — manual SQLite backup, JSON export, scheduled nightly backup, restore from `.db`, import from JSON
- **User management with inline invitations** — list users, change roles, deactivate accounts; generate and revoke invite links from the same page
- **Password reset** — admin-generated single-use reset links; emergency self-recovery via `config.yaml` token
- **Help page with searchable FAQ** — covers Getting Started, Inventory, Thresholds, Import, Backup, and User Management; TOC sidebar on desktop; search highlights matching text
- **Contextual help tooltips** — hover or click ⓘ on key form fields to see a brief description
- **About page with version check** — displays current version, checks GitHub Releases API for updates (24-hour cache), shows update-available banner
- **Post-upgrade What's New modal** — automatically shows release notes between the previous and current version after an upgrade; dismissible
- **Structured backend logging** — timestamps, log level, and module name on every entry; full tracebacks in `docker logs` for unhandled errors
- **Admin Lookups** — accordion UI covering all 8 lookup tables; live search per section, usage counts, hide/unhide and delete entries, inline URL editing for manufacturers and dealers
- **Docker Compose deployment** — single `docker-compose.yml` pulls pre-built images from GHCR; no source code required
- **GHCR image registry** — images published to `ghcr.io/crzykidd/ammoledger-backend` and `ghcr.io/crzykidd/ammoledger-frontend`

## Documentation

- [Product Requirements Document](docs/PRD.md) — full feature specs, data model, architecture decisions, and roadmap
- [Installation Guide](docs/INSTALL.md) — detailed setup, external access, and upgrade instructions

---

## For End Users (Running AmmoLedger)

### Requirements

- Docker with Docker Compose
  - **Windows / Mac:** [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  - **Linux:** [Docker Engine](https://docs.docker.com/engine/install/) + [Docker Compose plugin](https://docs.docker.com/compose/install/)
  - **NAS / Home Server:** Synology, Unraid, and TrueNAS all supported

### Quick Start

**1. Download the compose file:**

```bash
curl -O https://raw.githubusercontent.com/YOURUSERNAME/AmmoLedger/main/docker-compose.yml
```

Or manually download `docker-compose.yml` from this repo and save it to a folder on your machine.

**2. Start AmmoLedger:**

```bash
docker compose up -d
```

Docker will automatically pull the latest images from GitHub Container Registry.

**3. Open in your browser:**

- App: <http://localhost:5173>
- API docs: <http://localhost:8000/docs>

**4. First run:**

- You will be prompted to create an admin account
- Set a secure password (12+ characters required)
- Edit `data/config.yaml` to configure backup schedule, notifications, and other settings

### Pulling a specific version

```bash
# Latest stable release
docker pull ghcr.io/YOURUSERNAME/ammologger-backend:latest
docker pull ghcr.io/YOURUSERNAME/ammologger-frontend:latest

# Specific version
docker pull ghcr.io/YOURUSERNAME/ammologger-backend:1.0.0
docker pull ghcr.io/YOURUSERNAME/ammologger-frontend:1.0.0

# Latest development build (may be unstable)
docker pull ghcr.io/YOURUSERNAME/ammologger-backend:dev
docker pull ghcr.io/YOURUSERNAME/ammologger-frontend:dev
```

> `:latest` only advances when an official release is published on GitHub. `:dev` tracks the tip of `main` and may include incomplete or in-progress changes.

### Upgrading

```bash
docker compose pull
docker compose up -d
```

Database migrations run automatically on startup. Your data in `data/` is never touched during upgrades.

### Backup

Your data lives in one folder:

```
data/
├── ammoledger.db    ← your database
├── config.yaml      ← your settings
├── defaults.yaml    ← lookup table defaults
├── backups/         ← automated backups
└── uploads/         ← target photos (v2.0)
```

To back up: copy the entire `data/` folder somewhere safe.

---

## For Developers (Building from Source)

### Developer Requirements

- Docker with Docker Compose
- Git
- Node.js 20+
- Python 3.12+

### Tech Stack

| Layer | Technology |
| ----- | ---------- |
| Backend | Python + FastAPI (`python:3.12.9-slim-bookworm`) |
| Frontend | React + Tailwind CSS (`node:20.19.1-slim` dev / `nginx:1.27-alpine` production) |
| Database | SQLite + SQLModel + Alembic migrations |
| Container | Docker + Docker Compose |

### Development Quick Start

**1. Clone the repo:**

```bash
git clone https://github.com/YOURUSERNAME/AmmoLedger.git
cd AmmoLedger
```

**2. Start the development environment:**

```bash
docker compose up --build
```

**3. Open in your browser:**

- App: <http://localhost:5173>
- API docs: <http://localhost:8000/docs>

**4. VS Code users:**

Install the Dev Containers extension. When prompted, click **Reopen in Container** for a fully configured development environment.

### Development workflow

```bash
# Start in background
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Rebuild after dependency changes
docker compose up --build

# Run database migrations manually
docker compose exec backend alembic upgrade head

# Check migration status
docker compose exec backend alembic current
```

> **Note:** The frontend runs a Vite dev server (`node:20.19.1-slim`). The production build will use a multi-stage Dockerfile that compiles static assets and serves them with `nginx:1.27-alpine`.

### Contributing

- Read `CLAUDE.md` for project conventions and build status
- Read `docs/PRD.md` for full feature specifications
- Add entries to `CHANGELOG.md` `[Unreleased]` with your changes
- Every PR that changes the data model must include an Alembic migration file

---

## Data Directory

All runtime data lives in `./data/` (mounted at `/data` inside the container). Most files are git-ignored. The directory is created automatically on first startup.

```
data/
├── ammoledger.db        # SQLite database            ← git-ignored
├── config.yaml          # App settings and secrets   ← git-ignored (auto-created)
├── defaults.yaml        # Editable seed data         ← kept in git
├── backups/             # Backup JSON files           ← git-ignored (auto-created)
└── uploads/             # Photo uploads (v2.0)       ← git-ignored (auto-created)
```

**config.yaml** is generated on first startup. Key settings:

| Setting | Default | Description |
| ------- | ------- | ----------- |
| `app.session_timeout_hours` | `8` | Session lifetime |
| `security.reset_token` | `""` | Set to enable `/reset` password recovery; clear after use |
| `backup.schedule` | `"03:00"` | Nightly backup time (24-hour) |
| `backup.retention_days` | `30` | Days to keep backup files |

## Project Structure

```
AmmoLedger/
├── backend/
│   ├── main.py              # FastAPI app, startup sequence
│   ├── models.py            # SQLModel database models
│   ├── database.py          # Engine and Alembic runner
│   ├── defaults.yaml        # Bundled seed data (shipped in container image)
│   ├── routers/
│   │   └── auth.py          # Auth routes (setup, login, logout, me)
│   ├── utils/
│   │   ├── config.py        # load_config(), ensure_data_dirs()
│   │   ├── rbac.py          # require_auth(), require_role() dependencies
│   │   ├── security.py      # hash_password(), verify_password()
│   │   └── seeds.py         # sync_yaml_seeds()
│   ├── migrations/          # Alembic migration files
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── data/                    # Runtime data volume (mostly git-ignored)
├── docs/
│   ├── PRD.md
│   └── INSTALL.md
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
└── .gitignore
```

## License

MIT
