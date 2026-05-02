# AmmoLedger Installation Guide

## Quick Start (Docker Compose)

End users only need the `docker-compose.yml` file — no source code required. Images are pulled automatically from GHCR.

### Prerequisites

- **Windows:** Docker Desktop with WSL2
- **Linux / macOS:** Docker Engine and Docker Compose v2

### Steps

#### 1. Download the compose file

```bash
curl -O https://raw.githubusercontent.com/crzykidd/AmmoLedger/main/docker-compose.yml
```

Or copy `docker-compose.yml` from the repository root manually.

#### 2. Start the app

```bash
docker compose up -d
```

Docker pulls the latest images from GHCR automatically on first run.

#### 3. First startup

On first launch, the backend generates `/data/config.yaml` from the bundled template and then exits with instructions. You must set a secure session secret before the app will accept connections:

```bash
# Generate a random secret
python -c "import secrets; print(secrets.token_hex(32))"
```

Edit the config inside the running container or copy it out:

```bash
docker compose cp backend:/data/config.yaml ./config.yaml
# Edit config.yaml — set security.session_secret
docker compose cp ./config.yaml backend:/data/config.yaml
docker compose restart backend
```

#### 4. Create your admin account

Visit [http://localhost:5173](http://localhost:5173). On first launch you will be prompted to create the initial admin account — enter a name, email, and password, then click **Create Account**.

#### 5. Configure the app

Adjust settings inside `data/config.yaml` (inside the `ammoledger_data` Docker volume):

- `backup.enabled` and `backup.schedule` — nightly backup settings
- `security.registration` — who can register (`invite_only` recommended)
- `notifications.discord` — optional Discord webhook for alerts

Restart the backend after config changes:

```bash
docker compose restart backend
```

---

## Accessing the App

| Service  | URL                                          |
|----------|----------------------------------------------|
| Web UI   | <http://localhost:5173>                      |
| API docs | <http://localhost:5173/api/docs>             |

For reverse proxy / external access, point your proxy at port **5173**.

---

## Data Persistence

All data is stored in the named Docker volume `ammoledger_data`. This volume persists across container restarts and upgrades.

```bash
# Inspect volume location
docker volume inspect ammoledger_data
```

---

## Upgrading

```bash
docker compose pull
docker compose up -d
```

Alembic migrations run automatically on startup. No manual database work required.

---

## Configuration Options

AmmoLedger supports three configuration approaches. All share the same settings; pick whichever fits your deployment:

### Option A — config.yaml (default)

Edit the config file that is generated on first startup. This is the recommended approach for home-server deployments.

```bash
# Copy the config out, edit it, copy it back
docker compose cp backend:/data/config.yaml ./config.yaml
# Set security.session_secret to the output of: openssl rand -hex 32
docker compose cp ./config.yaml backend:/data/config.yaml
docker compose restart backend
```

### Option B — Environment variables

Set configuration via environment variables in your `docker-compose.yml`. Useful for container management tools like Komodo, Portainer, or Kubernetes — secrets never touch the filesystem.

```yaml
services:
  backend:
    image: ghcr.io/crzykidd/ammoledger-backend:latest
    environment:
      - AL_SESSION_SECRET=your-64-char-random-secret-here
      - AL_BASE_URL=https://ammo.example.com
      - AL_BACKUP_ENABLED=true
      - AL_BACKUP_SCHEDULE=03:00
      - AL_BACKUP_RETENTION_DAYS=30
```

When `AL_SESSION_SECRET` is set, `config.yaml` is **not required**. The app starts using built-in defaults for all other settings.

### Option C — Mixed (recommended for production)

Keep non-sensitive settings in `config.yaml` and supply secrets via environment variables:

```yaml
# docker-compose.yml — secrets only
environment:
  - AL_SESSION_SECRET=your-64-char-random-secret-here
```

```yaml
# config.yaml — everything else
app:
  env: "production"
  base_url: "https://ammo.example.com"
backup:
  schedule: "02:30"
  retention_days: 60
```

ENV values always take priority over `config.yaml` when both are present.

### Environment Variable Reference

| Variable | config.yaml equivalent | Default | Description |
| --- | --- | --- | --- |
| `AL_SESSION_SECRET` | `security.session_secret` | (required) | Session signing key — min 32 chars; generate with `openssl rand -hex 32` |
| `AL_RESET_TOKEN` | `security.reset_token` | `""` | Emergency admin password reset token; clear after use |
| `AL_APP_NAME` | `app.name` | `AmmoLedger` | Application display name |
| `AL_BASE_URL` | `app.base_url` | `http://localhost:5173` | Public URL used in invite links and QR codes |
| `AL_BACKUP_ENABLED` | `backup.enabled` | `true` | Enable nightly scheduled backups |
| `AL_BACKUP_SCHEDULE` | `backup.schedule` | `03:00` | Nightly backup time (HH:MM, 24-hour) |
| `AL_BACKUP_RETENTION_DAYS` | `backup.retention_days` | `30` | Days to keep old backup files |
| `AL_BACKUP_PATH` | `backup.path` | `/data/backups` | Backup storage directory |
| `AL_BACKEND_URL` | (frontend only) | `http://backend:8000` | Container-internal URL the frontend proxy uses to reach the backend. Change only if your backend runs on a different service name or port. |

---

## Configuration Reference

The full config file with all options and comments is bundled in the backend image at `/app/config.template.yaml`. Extract it with:

```bash
docker compose run --rm backend cat /app/config.template.yaml
```

### Generating a secure session secret

Linux / macOS:

```bash
openssl rand -hex 32
```

Windows PowerShell:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## Accessing the API Documentation

FastAPI auto-generates interactive API docs at:

```text
http://localhost:5173/api/docs
```

---

## External Access

For access from phones or outside your home network, see [docs/PRD.md §12](PRD.md#12-reverse-proxy-ssl--external-access) for:

- **Tailscale** (recommended) — private mesh VPN, no port forwarding required
- **Cloudflare Tunnel** — public URL with Cloudflare Access as a second auth layer
- **Self-managed reverse proxy** — Nginx Proxy Manager or Traefik with Let's Encrypt

---

## Password Recovery

AmmoLedger supports two password reset flows — no email server required.

### Admin generates a reset link for a user

1. Go to **Admin → Users**
2. Click the link icon (↗) next to the user
3. Copy the generated URL and send it to the user
4. The link expires after 24 hours and can only be used once

### Admin self-recovery (locked out of your account)

If you cannot log in as admin, set a temporary recovery token in `config.yaml`:

```bash
# Edit config.yaml inside the container
docker compose cp backend:/data/config.yaml ./config.yaml
```

Add a random token under the `security` section:

```yaml
security:
  reset_token: "your-random-token-here"  # generate with: openssl rand -hex 32
```

Copy it back and restart:

```bash
docker compose cp ./config.yaml backend:/data/config.yaml
docker compose restart backend
```

Visit `http://localhost:5173/reset?token=your-random-token-here`, enter your admin email, and set a new password. **Clear the token from `config.yaml` immediately after use** and restart the backend.

---

## Backup and Restore

**Manual backup:** Admin panel → Settings → Backup Now

**Scheduled backup:** Configured in `config.yaml` under `backup:` — runs nightly at 03:00 by default, retains 30 days.

**Restore:** Admin panel → Settings → Import Backup → upload a `.json` backup file.

---

## Development Setup

Developers who want to build from source should use `docker-compose.dev.yml`:

```bash
git clone https://github.com/crzykidd/AmmoLedger
cd AmmoLedger
docker compose -f docker-compose.dev.yml up -d
```

This mounts local source directories for live reload.

---

## Troubleshooting

### Permission denied on /data

If you see `ERROR: /data directory is not writable` in the container logs, the container user (UID 1000) does not have write access to your mounted data directory.

Fix by setting ownership on the host path you mounted to `/data`:

```bash
sudo chown -R 1000:1000 /path/to/your/data
```

Replace the path with whatever you have in your `docker-compose.yml`:

```yaml
volumes:
  - /var/docker/ammoledger/data:/data
```

Then restart the container:

```bash
docker compose restart backend
```

### Why UID 1000?

AmmoLedger runs as a non-root user (`appuser`, UID 1000) inside the container for security. Your host directory must be owned by UID 1000 so the container process can write to it.
