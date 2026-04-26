<div align="center">
  <img src="frontend/src/assets/brand/logo-full-dark.png"
       alt="AmmoLedger" width="400"/>
</div>

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-0.1.0-gold)
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



## What's Built

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Alembic migrations, full database schema |
| Phase 2 | ✅ Complete | Auth (login/logout/setup), RBAC, YAML seed data |
| Phase 3 | ✅ Complete | Ammo CRUD API |
| Phase 4.1 | ✅ Complete | Frontend shell — router, auth, login/setup pages, AppShell |
| Phase 4.2 | ✅ Complete | Inventory page — table, cards, form panel, RBAC edit/delete |
| Phase 4.3 | ✅ Complete | Expenditure logging — Log Use dialog, round deduction, toast notifications |
| Phase 4.4 | ✅ Complete | Stock thresholds — per-caliber alerts, low-stock banner, caliber summary, settings page |
| Phase 4.5 | ✅ Complete | Dashboard — stats cards, caliber breakdown, low-stock list, recent activity, getting started flow |
| Phase 4.6 | ✅ Complete | User management — invite system, registration page, admin UI (users/invites), profile/password-change, 40 backend tests |
| Phase 4 | 🔲 In Progress | Frontend basics (remaining pages) |
| Phase 6 | 🔲 Not started | Backup system |
| Phase 7 | 🔲 Not started | User management UI |

## Features

- First-run setup creates the initial admin account
- Login/logout with signed session cookies
- Role-based access control: `admin`, `member`, `read_only`
- **User management** — admin lists users, changes roles, deactivates accounts, and force-resets passwords via `/admin/users`
- **Invitation system** — admin generates time-limited, single-use invite links via `/admin/invites`; invited users self-register at `/register?token=…`
- **Password policy** — 12-char minimum with uppercase, lowercase, digit, and special character; live strength checklist on all password forms; last 5 passwords blocked from reuse
- **Profile page** (`/settings/profile`) — change your own password with live strength indicator; force-reset banner shown when admin has reset your password
- Lookup tables (calibers, manufacturers, ammo types, categories, dealers) pre-seeded from `defaults.yaml` on every startup
- Full database schema: users, ammo boxes, expenditure log, storage locations and containers
- Schema migrations run automatically on container start (Alembic)
- Full ammo CRUD API with RBAC enforcement (shared/private ownership model)
- Expenditure logging with round deduction and full history
- Lookup table management (calibers, manufacturers, types, categories, dealers, containers, locations)
- **Dashboard** — stats cards (total rounds, boxes, calibers, low-stock count), caliber proportion bars, running-low list, recent-activity feed, getting-started checklist on first login
- **Inventory page** — sortable table (desktop) and card list (mobile), expandable rows, real-time search, stats bar
- **Add / Edit ammo boxes** via side drawer form with all fields and validation
- **RBAC-enforced actions** — admin edits all boxes, members edit their own, read-only gets view-only
- **Expenditure logging** — Log Use button on every row and card, records rounds fired and deducts from stock, toast confirmation
- **Stock thresholds** — configurable low-stock alerts per caliber (localStorage); amber indicators on low rows/cards; dismissible banner; caliber summary panel
- **Settings → Stock Thresholds** — set default and per-caliber round thresholds with live save
- Runs entirely in Docker — no cloud, no subscriptions, your data stays yours

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
