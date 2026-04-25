# AmmoLedger

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

This app is very early and still in development

> **⚠️ Disclaimer**
>
> This project is primarily *vibe coded* — optimized for momentum over perfection.
>
> Code may prioritize “it works” over “it’s elegant.” Refactors welcome.

A self-hosted web application to track your ammunition inventory. Keep your ammo counts accurate on and off the range.



## What's Built

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Alembic migrations, full database schema |
| Phase 2 | ✅ Complete | Auth (login/logout/setup), RBAC, YAML seed data |
| Phase 3 | ✅ Complete | Ammo CRUD API |
| Phase 4 | 🔲 Not started | Frontend basics |
| Phase 5 | 🔲 Not started | Dashboard |
| Phase 6 | 🔲 Not started | Backup system |

## Features

- First-run setup creates the initial admin account
- Login/logout with signed session cookies
- Role-based access control: `admin`, `member`, `readonly`
- Lookup tables (calibers, manufacturers, ammo types, categories, dealers) pre-seeded from `defaults.yaml` on every startup
- Full database schema: users, ammo boxes, expenditure log, storage locations and containers
- Schema migrations run automatically on container start (Alembic)
- Full ammo CRUD API with RBAC enforcement (shared/private ownership model)
- Expenditure logging with round deduction and full history
- Lookup table management (calibers, manufacturers, types, categories, dealers, containers, locations)
- Runs entirely in Docker — no cloud, no subscriptions, your data stays yours

## Documentation

- [Product Requirements Document](docs/PRD.md) — full feature 
  specs, data model, architecture decisions, and roadmap
  
## Tech Stack

- **Backend:** Python + FastAPI (`python:3.12.9-slim-bookworm`)
- **Frontend:** React + Tailwind CSS (`node:20.19.1-slim` dev / `nginx:1.27-alpine` production)
- **Database:** SQLite (single file, easy to back up)
- **Container:** Docker + Docker Compose

## Requirements

- Docker Desktop (with WSL2 on Windows)
- Git

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/AmmoLedger.git
cd AmmoLedger
```

### 2. Start the app

```bash
docker compose up --build
```

### 3. Open in your browser

- **App:** http://localhost:5173
- **API docs:** http://localhost:8000/docs

## Container Images

Pre-built images are published to [GitHub Container Registry (GHCR)](https://ghcr.io). Replace `OWNER` with the repository owner's GitHub username.

| Tag | Updated | Use for |
|-----|---------|---------|
| `:latest` | Official GitHub Releases only | Production deployments |
| `:dev` | Every push to `main` | Testing the latest work-in-progress |
| `:sha-abc1234` | Every push to `main` | Pinning to a specific commit |

```bash
# Stable release
docker pull ghcr.io/OWNER/ammologger-backend:latest
docker pull ghcr.io/OWNER/ammologger-frontend:latest

# Latest development build (may not be stable)
docker pull ghcr.io/OWNER/ammologger-backend:dev
docker pull ghcr.io/OWNER/ammologger-frontend:dev
```

> **Note:** `:latest` only advances when an official release is published on GitHub. `:dev` tracks the tip of `main` and may include incomplete or in-progress changes.

## Development

This project uses VS Code Dev Containers. Open the project in VS Code and when prompted, click **Reopen in Container**. Your full development environment will be running inside Docker automatically.

### Useful commands

```bash
# Start in background
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Rebuild after dependency changes
docker compose up --build
```

> **Note:** The frontend runs a Vite dev server locally (`node:20.19.1-slim`). The production build will use a multi-stage Dockerfile that compiles static assets and serves them with `nginx:1.27-alpine`.

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
|---------|---------|-------------|
| `app.session_timeout_hours` | `8` | Session lifetime |
| `security.reset_token` | `""` | Set to enable `/reset` password recovery; clear after use |
| `backup.schedule` | `"03:00"` | Nightly backup time (24-hour) |
| `backup.retention_days` | `30` | Days to keep backup files |

**To back up:** copy `./data/ammoledger.db` somewhere safe, or use the Admin → Backup Now button (v1.0).

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
│   └── PRD.md
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
└── .gitignore
```

## License

MIT
