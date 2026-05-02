# AmmoLedger Installation Guide

## Quick Start (Docker Compose)

End users only need the `docker-compose.yml` file — no source code required. Images are pulled automatically from GHCR.

### Prerequisites

- **Windows:** Docker Desktop with WSL2
- **Linux / macOS:** Docker Engine and Docker Compose v2

### Steps

**1. Download the compose file**

```bash
curl -O https://raw.githubusercontent.com/crzykidd/AmmoLedger/main/docker-compose.yml
```

Or copy `docker-compose.yml` from the repository root manually.

**2. Start the app**

```bash
docker compose up -d
```

Docker pulls the latest images from GHCR automatically on first run.

**3. First startup**

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

**4. Create your admin account**

Visit [http://localhost:5173](http://localhost:5173). On first launch you will be prompted to create the initial admin account — enter a name, email, and password, then click **Create Account**.

**5. Configure the app**

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

## Configuration Reference

The full config file with all options and comments is bundled in the backend image at `/app/config.template.yaml`. Extract it with:

```bash
docker compose run --rm backend cat /app/config.template.yaml
```

### Generating a secure session secret

**Linux / macOS:**
```bash
openssl rand -hex 32
```

**Windows PowerShell:**
```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

---

## Accessing the API Documentation

FastAPI auto-generates interactive API docs at:

```
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
