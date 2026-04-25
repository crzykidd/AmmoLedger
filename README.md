# AmmoLedger

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
| Phase 3 | 🔲 Not started | Ammo CRUD API |
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
- Runs entirely in Docker — no cloud, no subscriptions, your data stays yours

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

## Backup

Your data lives in a single file: `./data/ammoledger.db`

To back up, just copy that file somewhere safe.

## Project Structure

```
AmmoLedger/
├── backend/
│   ├── main.py          # FastAPI app and routes
│   ├── models.py        # Database models
│   ├── database.py      # SQLite connection
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── data/                # SQLite database lives here (git ignored)
├── .devcontainer/
│   └── devcontainer.json
├── .github/
│   └── workflows/
│       └── docker-publish.yml
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
└── .gitignore
```

## License

MIT
