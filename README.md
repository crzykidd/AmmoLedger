<div align="center">
  <img src="frontend/src/assets/brand/logo-full-dark.png"
       alt="AmmoLedger" width="400"/>
</div>

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-0.3.3-gold)
![Docker](https://img.shields.io/badge/docker-ready-blue)
![PRD](https://img.shields.io/badge/docs-PRD-navy)

</div>

# AmmoLedger

> ### 🆕 New in v0.3.0–v0.3.3 — Firearms & Range Sessions
>
> Track your firearms and range trips alongside your ammo. The new **Firearms** page registers each gun with manufacturer, model, caliber, serial, compliance tags, and personal tags. The new **Range** page logs multi-line range days that deduct rounds from ammo boxes and bump per-firearm round counters atomically — and reverse cleanly if you edit or delete a session. **Firearm maintenance log** with cleaning, service, and note events drives a green/amber/red cleaning-status indicator on every firearm and a dedicated dashboard widget for firearms needing service.
>
> **Tip:** firearms and range sessions follow the same ownership model as ammo boxes — members own private records by default; admins can mark items shared so everyone on the install can see them. Read-only users see shared items only.
>
> **v0.3.1:** fixed a firearm detail page crash on first load (React hook order violation). **v0.3.2:** fixed landscape photo cropping in the firearms list view thumbnail cell. **v0.3.3:** fixed range session delete 500 error, firearm clean-state drift on session reversal, date timezone shift in non-UTC installs, and backend validation errors displaying as `[object Object]`.

A self-hosted web application to track your ammunition inventory, firearms, and range sessions. Keep your counts accurate on and off the range.

> 🎯 **AmmoLedger v0.3.0 — Firearms tracking, range session logging, and firearm maintenance log all ship in this release.** Self-hosted, stable, ready for daily use. **Accessories management** is next on the roadmap — see [What's Coming Next](#whats-coming-next).

## What's New in v0.3.0

Highlights since v0.2.x:

- **Firearms registry (`/firearms`)** — track every firearm with manufacturer, model, caliber, serial, barrel length, finish, purchase details, dealer, multi-select compliance tags, and per-user colored personal tags. Built-in catalog of ~25 popular manufacturers and ~100 popular models speeds entry.
- **Range sessions (`/range`)** — multi-line range day log. Each line ties an optional firearm to an optional ammo box; rounds fired deduct from the box through the existing expenditure log and bump the firearm's lifetime and since-clean counters in the same transaction. Editing or deleting a session reverses every side effect.
- **Firearm maintenance log** — cleaning, service, and note events per firearm. Round-based and time-based service intervals drive a green/amber/red cleaning status that surfaces on every firearm card and on the dashboard.
- **Dashboard widgets** — Firearms Needing Service (overdue + due-soon with inline Log Cleaning) and Recent Range Sessions; Quick Actions row for Log Range Day / Add Firearm / Add Ammo Box.
- **CSV exports** — `GET /firearms/export/csv` and `GET /range-sessions/export/csv` plus Export buttons on the Firearms and Range pages.
- **Firearms CSV import** — round-trip with the firearms export. Same validate / preview / confirm flow as ammo, plus cascading model resolution under each manufacturer and synthetic firearm-log entries seeded from imported round counts. Surfaced as a new "Firearms" tab on the Import page.
- **Lookups & admin** — new community-curated lookups for Firearm Models, Action Types, and Compliance Tags, plus a `manufacturers.types` JSON column so a single manufacturer table serves both ammo and firearm domains.
- **Firearm photos** — up to 5 photos per firearm; photo manager with drag-to-reorder; default photo shown on cards and the detail page with a lightbox; photos bundled into zip backups alongside the database.
- **LookupCombobox with inline create** — every form drawer's lookup dropdown gains type-ahead search and an inline "+ Create" affordance with a fuzzy-match guard; members can create new lookup entries directly from the form.
- **At Range session attribution** — the quick-expend popover on At Range gains a three-option control (None / New / Last) plus a firearm picker so a full range day can be logged box-by-box without leaving the At Range page.

See [CHANGELOG.md](./CHANGELOG.md) for the full list.

## What's Coming Next

AmmoLedger covers ammo, firearms, and range sessions. Here's what's on the roadmap next:

### Near-term (v0.3.x)

- **Multi-caliber firearms** — v1 firearms have a single caliber FK plus a free-text `caliber_notes` field. A `firearm_calibers` join table will follow in a future migration.
- **Target photo uploads on range session lines** — schema groundwork is done; the upload UI, image storage, and image management screens land in a follow-on release.
- **Range sessions CSV import** — sessions export-only this release; import will follow when its remap UX is designed.
- **At Range / Range workflow merge** — the mobile quick-expend page (At Range) and the multi-line Range Sessions page remain separate. Future UX research will determine whether to unify them.
- **Additional community lookups** — sight types, finishes, and other taxonomies are currently free-text on firearms. They become candidates for community lookups based on user feedback.

### Accessories (further out)

Track sights, optics, magazines, holsters, slings, and other gear alongside your firearms — including which accessories are mounted on which firearms, and maintenance/replacement reminders.

No firm timeline on either set — watch the [Releases page](https://github.com/crzykidd/AmmoLedger/releases) for updates. Open issues with feedback on what you want first.

## Features

- **First-run setup wizard** — guides new users through adding inventory, setting thresholds, and inviting others
- **Session auth with RBAC** — Admin, Member, and Read-Only roles; bcrypt password hashing; session cookies
- **Firearms registry (`/firearms`)** — register each firearm with manufacturer, model, caliber, serial, barrel length, finish, purchase details, dealer, multi-select compliance tags (CA / NY / MA / NJ / NFA classifications), and per-user colored personal tags. Card-grid or list view with filters by manufacturer, caliber, type, and cleaning status
- **Firearm maintenance log** — per-firearm Cleaning / Service / Note events with backdated entries; round-based and time-based service intervals drive a green/amber/red cleaning status surfaced on every card and on the dashboard
- **Range sessions (`/range`)** — multi-line range day log; each line ties an optional firearm to an optional ammo box; rounds deduct from the box through the existing expenditure log and bump the firearm's counters atomically. Editing or deleting a session reverses every side effect (ammo restored, counters decremented, expenditure rows removed)
- **Range Sessions tab on each firearm** — per-firearm session history and per-firearm rounds totals computed in a single grouped query
- **Full inventory CRUD with bulk edit** — add, edit, delete, archive boxes; select multiple rows and bulk-edit fields in one operation
- **Quick-expend Crosshair icon** — tap the Crosshair icon on any inventory row to log rounds fired inline; smart presets (1, 10, 20, 30, 50) plus recently-used session counts; Shot All empties the box
- **At Range mode** — mobile-optimized /at-range page for fast round logging during range sessions; on-screen number pad, ±1 steppers, large tap targets, session-persistent notes; the quick-expend popover supports inline session attribution (None / New / Last) plus a firearm picker, so a range day can be logged box-by-box without leaving At Range
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
- **Firearms CSV import** — round-trip compatible with the firearms CSV export. Same validate / preview / confirm pattern as ammo, with cascading model resolution under each manufacturer, per-value remap UI for unmatched lookups, and synthetic firearm-log entries seeded from imported round counts. Surfaced as a tab on the Import page.
- **CSV export** — export filtered ammo inventory from the Ammo toolbar or full archive from the Backup page; export firearms and range sessions from their respective page toolbars
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

### Network topology

By default the production compose file puts both services on a private bridge network and binds the frontend to `127.0.0.1:5173` only — nothing reachable from the LAN or internet without a reverse proxy in front of it. The backend has no published ports at all.

If you run a separate reverse-proxy stack (Nginx Proxy Manager, Traefik, Caddy, Cloudflare Tunnel), uncomment the `proxy_net` lines in `docker-compose.yml` so your proxy can reach the AmmoLedger frontend by container name. See PRD §12.5 for the full pattern.

The backend needs outbound internet access for optional features (Find Image, GitHub version check, community lookup sync, Discord / SMTP notifications). See PRD §12.6 for the host allowlist. None of these are required for core ammo / firearm / range tracking — the app runs entirely offline if you want it to.

### Upgrading

```bash
docker compose pull
docker compose up -d
```

Database migrations run automatically on startup. Your data in `data/` is never touched during upgrades.

#### Upgrading from v0.2.x to v0.3.0

v0.3.0 adds three new migrations on top of the v0.1.9 baseline schema:

- `0002_firearms_feature.py` — the entire firearms feature in a single migration: firearm and range-session domain tables, `manufacturers.types` JSON column, `expenditure_log.range_session_line_id` FK
- `0003_add_firearm_photos.py` — `firearm_photos` table for per-firearm photo gallery
- `0004_firearm_v030_polish.py` — `firearm_conditions` lookup table and six new columns on `firearms` (`nickname`, `firearm_condition_id`, `sight_radius_in`, `weight`, `weight_unit`, `twist_rate`)

The new tables are additive and back-compat with existing ammo data — nothing about how you track ammunition changes. Pull the new images and `alembic upgrade head` runs automatically on startup. As always, take a backup before upgrading if you're cautious.

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
