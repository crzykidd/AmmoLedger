# AmmoLedger Installation Guide

## Quick Start (Docker Compose)

### Prerequisites

- **Windows:** Docker Desktop with WSL2
- **Linux / macOS:** Docker Engine and Docker Compose v2

### Steps

**1. Clone the repository**

```bash
git clone https://github.com/USERNAME/AmmoLedger
cd AmmoLedger
```

**2. Start the app**

```bash
docker compose up -d
```

**3. First startup**

On first launch, the backend generates `data/config.yaml` from the bundled template and then exits with instructions. You must set a secure session secret before the app will accept connections:

```bash
# Generate a random secret
python -c "import secrets; print(secrets.token_hex(32))"
```

Paste the output as the value of `security.session_secret` in `data/config.yaml`, then restart:

```bash
docker compose restart backend
```

**4. Create your admin account**

Visit [http://localhost:5173](http://localhost:5173). On first launch you will be prompted to create the initial admin account — enter a username and password, then click **Create Account**.

**5. Configure the app**

Edit `data/config.yaml` to adjust:
- `backup.enabled` and `backup.schedule` — nightly backup settings
- `security.registration` — who can register (`invite_only` recommended)
- `notifications.discord` — optional Discord webhook for alerts

Restart the backend after config changes:

```bash
docker compose restart backend
```

---

## Configuration Reference

The full config file with all options and comments is at `backend/config.template.yaml`.

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
http://localhost:8000/docs
```

---

## External Access

For access from phones or outside your home network, see [docs/PRD.md §12](PRD.md#12-reverse-proxy-ssl--external-access) for:

- **Tailscale** (recommended) — private mesh VPN, no port forwarding required
- **Cloudflare Tunnel** — public URL with Cloudflare Access as a second auth layer
- **Self-managed reverse proxy** — Nginx Proxy Manager or Traefik with Let's Encrypt

---

## Upgrading

```bash
docker compose pull
docker compose up -d
```

Alembic migrations run automatically on startup. No manual database work required.

---

## Backup and Restore

See [docs/PRD.md §11](PRD.md#11-database-backup) for full backup specification.

**Manual backup:** Admin panel → Settings → Backup Now

**Scheduled backup:** Configured in `data/config.yaml` under `backup:` — runs nightly at 03:00 by default, retains 30 days.

**Restore:** Admin panel → Settings → Import Backup → upload a `.json` backup file.
