<div align="center">
  <img src="frontend/src/assets/brand/logo-full-dark.png"
       alt="AmmoLedger" width="400"/>
</div>

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-0.2.0-gold)
![Docker](https://img.shields.io/badge/docker-ready-blue)
![PRD](https://img.shields.io/badge/docs-PRD-navy)

</div>

# AmmoLedger

> ### 🆕 New in v0.2.2 — Split Box
>
> Break a single ammo box into multiple smaller tracking records — for example, opening a 1000-round case and tracking each individual box. Supports full or partial splits, equal or custom child sizes, with a labeling view to help you mark physical boxes accurately. Every split is recorded in the parent's notes and audit history.
>
> **Tip:** if you do a lot of splits in one session, run a backup beforehand. Splits write multiple records in one transaction and a backup gives you a clean rollback point.

A self-hosted web application to track your ammunition inventory. Keep your ammo counts accurate on and off the range.

> 🎯 **AmmoLedger v0.2.0 — First public release.** Self-hosted ammunition inventory tracking. Stable, ready for daily use. **Firearms tracking, range session logging, and accessories management** are on the roadmap — see [What's Coming Next](#whats-coming-next).

## What's New in v0.2.0

Highlights since v0.1.9:

- **At Range mode** — mobile-optimized page for fast round logging during range sessions. Search by box ID, on-screen number pad, ±1 steppers, large tap targets, tap to log rounds.
- **Quick-expend everywhere** — Crosshair icon on every inventory row (desktop and mobile) opens a fast popover with smart presets (1, 10, 20, 30, 50 + recently-used counts from your session). Notes persist across the session so you only type "USPSA practice" once.
- **Better archive workflow** — clicking Archive opens a small popover that captures a reason. Empty boxes prefill "Empty Box" and archive in one click; boxes with rounds remaining show a warning and require an explicit reason. Archived boxes can be restored without leaving the page.
- **Ammo filter dropdowns** — "Show Empty" and "Archived" checkboxes replaced with three-state dropdowns (Has rounds / Empty only / All boxes; Active only / Archived only / All boxes). Filter selections persist across reloads.
- **Dashboard scope toggle** — flip between "Current" inventory totals and "All" lifetime totals (including archived and expended rounds). New Total Boxes stat card.
- **Smarter import** — post-import success page shows a breakdown of active vs archived rows and a deep-link button to view archived imports directly.
- **Dev-build version awareness** — running a dev build now correctly detects when newer commits are on `dev` (in addition to the existing release-tag check on stable builds).

See [CHANGELOG.md](./CHANGELOG.md) for the full list.

## What's Coming Next

AmmoLedger started with ammunition, but the goal is to track your whole collection. Here's what's on the roadmap:

### Firearms & Range Tracking (targeted for v0.3.0)

- **Firearms registry** — track your collection by serial number, manufacturer, model, caliber, and acquisition details.
- **Range sessions** — log range trips with date, location, firearms used, and rounds expended per firearm. Ties directly into your existing inventory.
- **Cleaning reminders** — round-count thresholds per firearm so you know when each one is due for maintenance.

### Accessories (further out)

Track sights, optics, magazines, holsters, slings, and other gear alongside your firearms — including which accessories are mounted on which firearms, and maintenance/replacement reminders.

No firm timeline on either set — watch the [Releases page](https://github.com/crzykidd/AmmoLedger/releases) for updates. Open issues with feedback on what you want first.

## Features

- **First-run setup wizard** — guides new users through adding inventory, setting thresholds, and inviting others
- **Session auth with RBAC** — Admin, Member, and Read-Only roles; bcrypt password hashing; session cookies
- **Full inventory CRUD with bulk edit** — add, edit, delete, archive boxes; select multiple rows and bulk-edit fields in one operation
- **Quick-expend Crosshair icon** — tap the Crosshair icon on any inventory row to log rounds fired inline; smart presets (1, 10, 20, 30, 50) plus recently-used session counts; Shot All empties the box
- **At Range mode** — mobile-optimized /at-range page for fast round logging during range sessions; on-screen number pad, ±1 steppers, large tap targets, session-persistent notes
- **Archive workflow with reason capture** — archive confirmation popover captures a reason; empty boxes prefill "Empty Box" and archive in one click; boxes with rounds remaining require an explicit reason; Unarchive action restores boxes without leaving the page
- **Product catalog** — reusable product templates with images; auto-fill Add Box from a product; Auto-Generate products from existing inventory
- **Group By with 9 options** — group by Caliber, Manufacturer, Category, Type, Location, Container, Condition, or Split Parent; collapsible group headers with summary stats; Split Parent headers include an info icon to view parent box details
- **Sort By dropdown** — sort inventory by Box ID, Caliber, Manufacturer, Remaining, Purchase Date, or Updated Date with an asc/desc toggle; persists across reloads; synced with clickable column-header sort arrows
- **Field-scoped search** — dropdown next to the search box lets users narrow results to a specific field (Caliber, Manufacturer, Type, Location, Box ID, etc.)
- **Per-column filters** — filter by ID, Caliber, Manufacturer, Gr/Oz, Type, Category, Remaining, Value, and Shared; range operators (`<50`, `>100`, `10-50`) supported
- **Ammo filter dropdowns** — three-state Empty filter (Has rounds / Empty only / All boxes) and Status filter (Active only / Archived only / All boxes); both persist across reloads
- **Three-tier stock threshold system** — global default, per-caliber overrides, and per-location overrides; stored server-side; admin-only writes; caliber threshold drawer accessible from dashboard and the Ammo page
- **Dashboard By Caliber toggle** — switch between Mix (% of total inventory) and Stock (proximity to threshold) views with color-coded bars; persists across sessions
- **Dashboard Current / All scope toggle** — flip between active inventory totals and lifetime totals including archived and expended rounds; Total Boxes stat card
- **CSV import with legacy ID mode** — two-step validation, fuzzy matching with interactive resolution, optional preservation of existing box IDs; post-import breakdown of active vs archived rows
- **CSV export** — export filtered inventory from the toolbar or full archive from the Backup page
- **Backup and restore** — manual SQLite backup (WAL-safe via `Connection.backup()`), JSON export, scheduled nightly backup, restore from `.db`, import from JSON
- **User management with inline invitations** — list users, change roles, deactivate accounts; generate and revoke invite links from the same page
- **Password reset** — admin-generated single-use reset links; emergency self-recovery via `config.yaml` token
- **Help page with searchable FAQ** — covers Getting Started, Ammo, Thresholds, Import, Backup, and User Management; TOC sidebar on desktop; search highlights matching text
- **Contextual help tooltips** — hover or click ⓘ on key form fields to see a brief description
- **About page with version check** — displays current version, checks GitHub Releases API for updates (24-hour cache), shows update-available banner; dev builds detect newer commits on the `dev` branch
- **Post-upgrade What's New modal** — automatically shows release notes between the previous and current version after an upgrade; dismissible
- **Structured backend logging** — timestamps, log level, and module name on every entry; full tracebacks in `docker logs` for unhandled errors
- **Datasets page** — accordion UI covering all 8 lookup tables; live search per section, usage counts, hide/unhide and delete entries, inline URL editing for manufacturers and dealers; source badges (community/user/yaml); pending-import banner with cherry-pick dialog; Contribute button to export user-created entries as YAML for pull request submission
- **Community-maintained lookup data** — dealers, manufacturers, calibers, and ammo types synced from GitHub on startup; new entries queued as pending for admin review; admin can trigger manual sync with "Check for Updates"
- **Admin Tasks page** — view all scheduled background jobs, trigger any task on demand with Run Now, edit task intervals, and browse full execution history with expandable error details
- **Docker Compose deployment** — single `docker-compose.yml` pulls pre-built images from GHCR; no source code required
- **GHCR image registry** — images published to `ghcr.io/crzykidd/ammoledger-backend` and `ghcr.io/crzykidd/ammoledger-frontend`

## Community Data

AmmoLedger ships with community-maintained lookup tables for dealers, manufacturers, calibers, and ammo types. These are synced automatically from the `community/` directory in this repository.

- On startup, AmmoLedger fetches the latest YAML files from GitHub (falls back to bundled files if offline)
- New entries appear as **pending** on the Admin → Lookups page; admins review and import them
- Admins can also click **Check for Updates** on the Lookups page to pull the latest at any time
- User-created entries can be contributed back via the **Contribute** button on each lookup section

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to add dealers, manufacturers, calibers, or ammo types.

## Documentation

- [Product Requirements Document](docs/PRD.md) — full feature specs, data model, architecture decisions, and roadmap
- [Installation Guide](docs/INSTALL.md) — detailed setup, external access, and upgrade instructions

**Project history:** See [docs/HISTORY.md](./docs/HISTORY.md) for structural events and [docs/CHANGELOG-pre-v0.1.9.md](./docs/CHANGELOG-pre-v0.1.9.md) for the pre-release changelog archive.

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
docker pull ghcr.io/crzykidd/ammoledger-backend:0.2.0
docker pull ghcr.io/crzykidd/ammoledger-frontend:0.2.0

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

### Database Maintenance

AmmoLedger ships with two scheduled SQLite maintenance tasks, visible on the Tasks page (admin only):

- **Database Optimize** — runs `PRAGMA optimize` daily at 04:00. Refreshes query planner statistics for tables with stale data so the database uses indexes efficiently. **Enabled by default.**
- **Database Vacuum** — runs `VACUUM` daily at 04:30. Reclaims unused space and defragments the database file. **Disabled by default** — read the warning below before enabling.

#### ⚠ Before enabling Database Vacuum

VACUUM rewrites the entire database. While it runs:

- It needs roughly **2× the current database size in free disk space** on the volume hosting `/data`. A 200 MB database needs ~200 MB free during the rewrite. If the disk runs out, VACUUM fails and the task records a `failed` entry in task history. Your data is not lost — VACUUM operates on a copy and only swaps after success.
- The database is **locked for writes** for the duration. On typical inventories this is seconds; on very large databases it can be a few minutes. Reads still work in WAL mode.
- The task has `requires_exclusive: true`, so it will not run concurrently with backup or optimize tasks.

To enable: go to the Tasks page, toggle Database Vacuum on, and confirm the warning dialog. You can change the schedule after enabling.

If your server is tight on disk space, leave the task disabled and trigger VACUUM manually via Tasks → Run Now when you can monitor it.

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
│   ├── version.py           # Version string and build info
│   ├── defaults.yaml        # Bundled seed data (shipped in container image)
│   ├── routers/             # API route handlers
│   ├── utils/
│   │   ├── config.py        # load_config(), ensure_data_dirs()
│   │   ├── rbac.py          # require_auth(), require_role() dependencies
│   │   ├── security.py      # hash_password(), verify_password()
│   │   ├── seeds.py         # sync_yaml_seeds()
│   │   └── version_check.py # GitHub version comparison logic
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
│   ├── INSTALL.md
│   ├── HISTORY.md
│   └── archive/             # Archived planning docs
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
└── .gitignore
```

## License

MIT
