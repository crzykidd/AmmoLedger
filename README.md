<div align="center">
  <img src="frontend/src/assets/brand/logo-full-dark.png"
       alt="AmmoLedger" width="400"/>
</div>

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-0.1.8-gold)
![Docker](https://img.shields.io/badge/docker-ready-blue)
![PRD](https://img.shields.io/badge/docs-PRD-navy)

</div>

# AmmoLedger

A self-hosted web application to track your ammunition inventory. Keep your ammo counts accurate on and off the range.

> Pre-1.0: schema migrations are tested on every release but data model changes are still happening. Back up before upgrading.


## What's Built

- **Authentication & RBAC** — session auth with Admin / Member / Read-Only roles; bcrypt hashing; invite-based registration; password history and strength enforcement
- **Full inventory CRUD** — add, edit, archive, and delete ammo boxes; expandable rows with expenditure history; sortable and filterable table
- **Bulk operations** — checkbox multi-select; bulk-edit Manufacturer, Type, Category, Condition, Dealer, Location, Container, Shared status, Cost, and Notes in one operation
- **Product catalog** — reusable product templates with images; auto-fill Add Box from a product; Auto-Generate products from existing inventory
- **Three-tier threshold system** — global default, per-caliber overrides, and per-location overrides stored server-side; admin-only writes; caliber threshold drawer on dashboard and inventory
- **Advanced search and filters** — field-scoped search dropdown, per-column filters with range operators, Group By (8 options) with collapsible group headers
- **Dashboard** — stats cards, By Caliber breakdown (Mix and Stock views with color-coded bars), Running Low panel with direct links and inline threshold editing
- **CSV import** — two-step validate/confirm flow, fuzzy matching with interactive resolution, legacy ID mode, ownership toggle
- **CSV export** — export filtered inventory or full archive from the Backup page
- **Backup and restore** — manual SQLite backup (WAL-safe via `Connection.backup()`), JSON export, scheduled nightly backup, restore from `.db`, import from JSON
- **Datasets page** — accordion UI for all 8 lookup tables; community-maintained calibers, manufacturers, ammo types, and dealers synced from GitHub; pending-import review; Contribute button
- **User management** — list users, change roles, deactivate accounts; generate and revoke invite links; admin-generated password reset links; emergency config-token self-recovery
- **Admin Tasks** — view all scheduled background jobs, trigger on demand with Run Now, edit intervals, browse execution history
- **Help system** — searchable FAQ, contextual HelpTip tooltips on key form fields
- **About page** — version info, GitHub Releases update check, post-upgrade What's New modal

## Community Data

AmmoLedger ships with community-maintained lookup tables for dealers, manufacturers, calibers, and ammo types. These are synced automatically from the `community/` directory in this repository.

- On startup, AmmoLedger fetches the latest YAML files from GitHub (falls back to bundled files if offline)
- New entries appear as **pending** on the Admin → Lookups page; admins review and import them
- Admins can also click **Check for Updates** on the Lookups page to pull the latest at any time
- User-created entries can be contributed back via the **Contribute** button on each lookup section

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add dealers, manufacturers, calibers, or ammo types.

## Features

- **First-run setup wizard** — guides new users through adding inventory, setting thresholds, and inviting others
- **Session auth with RBAC** — Admin, Member, and Read-Only roles; bcrypt password hashing; session cookies
- **Full inventory CRUD with bulk edit** — add, edit, delete, archive boxes; select multiple rows and bulk-edit fields in one operation
- **Product catalog** — reusable product templates with images; auto-fill Add Box from a product; Auto-Generate products from existing inventory
- **Group By with 8 options** — group by Caliber, Manufacturer, Category, Type, Location, Container, or Condition; collapsible group headers with summary stats
- **Field-scoped search** — dropdown next to the search box lets users narrow results to a specific field (Caliber, Manufacturer, Type, Location, etc.)
- **Per-column filters** — filter by ID, Caliber, Manufacturer, Gr/Oz, Type, Category, Remaining, Value, and Shared; range operators (`<50`, `>100`, `10-50`) supported
- **Click-to-expend popover** — click the remaining count on any row to log rounds fired inline; Shot All button empties the box
- **Three-tier stock threshold system** — global default, per-caliber overrides, and per-location overrides; stored server-side; admin-only writes; caliber threshold drawer accessible from dashboard and inventory
- **Dashboard By Caliber toggle** — switch between Mix (% of total inventory) and Stock (proximity to threshold) views with color-coded bars; persists across sessions
- **CSV import with legacy ID mode** — two-step validation, fuzzy matching with interactive resolution, optional preservation of existing box IDs from previous tracking systems
- **CSV export** — export filtered inventory from the toolbar or full archive from the Backup page
- **Backup and restore** — manual SQLite backup, JSON export, scheduled nightly backup, restore from `.db`, import from JSON
- **User management with inline invitations** — list users, change roles, deactivate accounts; generate and revoke invite links from the same page
- **Password reset** — admin-generated single-use reset links; emergency self-recovery via `config.yaml` token
- **Help page with searchable FAQ** — covers Getting Started, Inventory, Thresholds, Import, Backup, and User Management; TOC sidebar on desktop; search highlights matching text
- **Contextual help tooltips** — hover or click ⓘ on key form fields to see a brief description
- **About page with version check** — displays current version, checks GitHub Releases API for updates (24-hour cache), shows update-available banner
- **Post-upgrade What's New modal** — automatically shows release notes between the previous and current version after an upgrade; dismissible
- **Structured backend logging** — timestamps, log level, and module name on every entry; full tracebacks in `docker logs` for unhandled errors
- **Datasets page** — accordion UI covering all 8 lookup tables; live search per section, usage counts, hide/unhide and delete entries, inline URL editing for manufacturers and dealers; source badges (community/user/yaml); pending-import banner with cherry-pick dialog; Contribute button to export user-created entries as YAML for pull request submission
- **Community-maintained lookup data** — dealers, manufacturers, calibers, and ammo types synced from GitHub on startup; new entries queued as pending for admin review; admin can trigger manual sync with "Check for Updates"
- **Admin Tasks page** — view all scheduled background jobs, trigger any task on demand with Run Now, edit task intervals, and browse full execution history with expandable error details
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
curl -O https://raw.githubusercontent.com/crzykidd/AmmoLedger/main/docker-compose.yml
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
- Most settings can also be set via environment variables in `docker-compose.yml` — see [Configuration Options](docs/INSTALL.md#configuration-options)
- `AL_BACKEND_URL` (default `http://backend:8000`) controls how the frontend reaches the backend — most users will never need to change this

### Pulling a specific version

```bash
# Latest stable release
docker pull ghcr.io/crzykidd/ammoledger-backend:latest
docker pull ghcr.io/crzykidd/ammoledger-frontend:latest

# Specific version
docker pull ghcr.io/crzykidd/ammoledger-backend:0.1.8
docker pull ghcr.io/crzykidd/ammoledger-frontend:0.1.8

# Latest development build (may be unstable)
docker pull ghcr.io/crzykidd/ammoledger-backend:dev
docker pull ghcr.io/crzykidd/ammoledger-frontend:dev
```

> For stable releases use the `:latest` tag. For development builds use the `:dev` tag. `:latest` advances on every merge to `main` and on every published release. `:dev` tracks the `dev` branch and may include work-in-progress changes.

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
└── uploads/         ← product images
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
git clone https://github.com/crzykidd/AmmoLedger.git
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
└── uploads/             # Product images               ← git-ignored (auto-created)
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
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
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
