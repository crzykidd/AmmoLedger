# Decisions

Append-only record of non-obvious engineering decisions for AmmoLedger — approaches
chosen, alternatives rejected, and workarounds. Newest entry at the top. Part of the
[handoff-prompt-workflow](https://gitea.crzynet.com/crzynet/homelab-configs/src/branch/main/standards/handoff-prompt-workflow/README.md)
standard (see `standards.md`).

---

## 2026-05-30 — Dev frontend container runs as the `node` user (uid 1000)

`Dockerfile.frontend` created a custom `appuser` via `adduser`, which landed on **uid
1001** because the `node:20-slim` base image already occupies uid 1000. In dev,
`docker-compose.dev.yml` bind-mounts `./frontend:/app`, so `/app`'s ownership is the
host directory's (uid 1000 / the project-wide PUID default), not the image's. The
build-time `chown appuser /app` is masked by the mount. Result: `appuser` (1001) could
not write Vite's `vite.config.ts.timestamp-*.mjs` temp file into the bind-mounted
`/app`, and the dev server crash-looped with `EACCES`.

- **Chosen:** reuse the base image's built-in `node` user (uid/gid 1000) — `USER node`
  and `chown node:node` on `/app`, `/app/node_modules`, `/app/node_modules/.vite`. uid
  1000 matches the typical host developer and the PUID/PGID=1000 default used elsewhere
  in this project, so the container can write the bind-mounted dir.
- **Rejected — compose `user: "1000:1000"` override only:** fixes the `/app` write but
  the anonymous `node_modules` volume (pre-chowned to appuser 1001 in the image) still
  rejects the `.vite` cache write — just moves the EACCES. The Dockerfile fix makes the
  volume node-owned at the source.
- **Operational note:** because the `node_modules` anonymous volume persists across
  recreates, applying this needs `docker compose -f docker-compose.dev.yml up -d --build
  --renew-anon-volumes frontend` once so the volume re-initializes from the new image.
- **Portability caveat:** this assumes the dev host user is uid 1000. A fully
  host-agnostic version would use a PUID/PGID gosu entrypoint like the backend; deferred
  as out of scope. Dockerfile.frontend is the dev image only (CMD `npm run dev`); prod
  ships prebuilt GHCR images, so this doesn't affect production.

## 2026-05-29 — Scheduled-job timezone via `app.timezone` (#43)

Daily task/backup schedules (`interval_value` `"HH:MM"`) were fired by an
`APScheduler.BackgroundScheduler()` with no explicit timezone, so they ran in the
container's local zone (UTC). The Tasks UI then converted that to the *browser's* zone
for display but left the edit field expecting the raw UTC value — display and edit
disagreed.

- **Chosen:** a single `app.timezone` config key (env `AL_TIMEZONE`, default `TZ` env →
  `UTC`) passed to `BackgroundScheduler(timezone=ZoneInfo(...))`. One zone governs every
  cron job (tasks *and* `scheduled_backup`). The frontend learns it from a new
  `timezone` field on `/system/version` and shows/accepts daily times in that zone,
  labelled — so display and edit finally agree.
- **`next_run_at` stored as naive UTC** (`_to_utc_naive()` converts the aware run-time
  before stripping tzinfo) rather than naive-in-scheduler-zone. Keeps it an absolute
  instant consistent with the app's other naive-UTC timestamps; a no-op when the zone is
  UTC, correct when it isn't.
- **Rejected — rely on the Docker `TZ` env alone:** `tzlocal` would pick it up for
  APScheduler, but the frontend still needs the value to label/parse, and a first-class
  config key is overrideable independently of the OS and validated (IANA name) by
  `validate_config`. `TZ` is honored as the default source, not the only lever.
- **Default stays `UTC`** so existing deployments are behavior-identical; honoring a
  local zone is opt-in.
- **Not addressed (pre-existing, out of scope):** the frontend parses naive-UTC
  timestamp strings with `new Date(...)`, which treats them as browser-local. Relative
  displays ("in 5 hours") are tolerant of this; a proper app-wide UTC-parse convention
  is a separate change.

## 2026-05-29 — Adopted four crzynet standards

Formalized adoption of `code-checkin-and-pr` (v1.1.0), `release-prep-and-cut` (v1.0.0),
`handoff-prompt-workflow` (v1.5.0), and `repo-sandbox-permissions` (v1.0.0), joining the
already-pinned `vexp-context-engine` (v1.0.1).

- **code-checkin-and-pr** was de-facto present in prose; CI already implements all five
  required checks (the PR-only image-build verification lives in `docker-publish.yml`,
  not `ci.yml`) plus the registry-retention policy. No CI changes were needed — only the
  verbatim `CLAUDE-snippet.md` paste and formalization in `standards.md`.
- **repo-sandbox-permissions** adopted at **local-only** scope: the sandbox block lives
  in `.claude/settings.local.json` (already gitignored), not the committed
  `.claude/settings.json`. Stack registries wired for Python + Node (this is a
  FastAPI + React repo).
