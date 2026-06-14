# Changelog

<!-- markdownlint-disable MD024 -->

All notable changes to AmmoLedger are documented here.
Format: [Keep a Changelog](https://keepachangelog.com)
Versioning: [Semantic Versioning](https://semver.org)

> Older releases are archived per minor series — see the [Archived releases](#archived-releases) index at the bottom of this file.

---

## [Unreleased]

<!--
Entries here are on the dev branch but not yet released. When cutting the
next versioned release, change this header to `## [X.Y.Z] — YYYY-MM-DD`
and create a fresh empty `## [Unreleased]` block above it.
-->

## [0.4.0] — 2026-06-13

### Added

- **Older JSON backups can now be restored with an explicit confirmation.** Previously, restoring a JSON export made on an older version of AmmoLedger was rejected with a flat error. Now the Backup page shows exactly what data will be missing: which tables will be empty (firearms, range sessions, etc.) and which fields will use current defaults. If that looks acceptable, a single "I understand" click unlocks the restore. Clean same-version restores are unchanged. Closes #14

- **Backup container format versioning.** JSON exports and zip archives now carry a `backup_format_version` field. If a backup made by a future build arrives at an older install that cannot understand the new format, the import is rejected with a clear "upgrade first" message instead of silently producing bad data.

- **CSV import auto-detects ammo vs. firearms format.** Upload a firearms CSV while the Import page is on the Ammo tab (or vice-versa) and AmmoLedger now recognizes the format from the file's columns, switches to the matching importer automatically, and keeps the file you picked — ready to validate. Previously the upload would just fail validation with no hint that you were on the wrong tab. Fixes #36

### Changed

- **Upgrading from 0.3.x signs you out once.** This release fixes how session cookies are signed (see Security below). Because the signing key changes to the one you configured, every existing session is invalidated on upgrade and all users will need to log in again — a one-time event, no data is affected.

- **De-adopted the `vexp-context-engine` standard (dev tooling; no user-facing change).** vexp is being sunset homelab-wide, so its repo wiring was removed: the `Grep`/`Glob` guard hook, the `mcp__vexp__*` permission allows, the "Context search" agent rules in `CLAUDE.md`, and the `.vexp/` index files. The host-side vexp install is removed separately via the `ansible` `devworkstation` role's opt-in `--tags vexp_teardown` task.

### Fixed

- **Expired sessions now redirect to the login page instead of silently failing.** When a server session expires, the next API call returns 401. The frontend now detects this, clears stale auth state, and redirects to `/login` automatically — no more dead pages where buttons appear to work but requests silently fail. Auth-own endpoints (`/auth/me`, `/auth/login`, etc.) are exempt so the initial logged-out probe and login flow are unaffected.

- **Firearm clean-state counters no longer drift after a range session is edited.** When a range session line was patched (e.g., changing `rounds_fired`), the reversal path correctly recomputed `rounds_since_clean` from the firearm log, but the re-apply path incremented it directly — making the counter wrong whenever a cleaning had been logged. Both paths now use the same `_recalculate_firearm_clean_state` source-of-truth recalc, so service-interval status (`ok` / `due_soon` / `overdue`) remains accurate across edits.

- **Firearm condition values are no longer silently dropped from JSON backup/restore.** `firearm_conditions` was the only full-CRUD firearm-attribute lookup table missing from the JSON export. Importing a backup on a fresh install would leave firearms pointing at condition IDs that don't exist on the target, causing FK mismatches. The table is now exported alongside the other firearm attribute lookups.

- **CSV import "new lookups created" count no longer inflates across repeated imports.** The post-import tally summed all user-source lookup rows in the database, not just the ones created during the current import. Re-importing any file would report dozens of "new" lookups that already existed. The count now reports only rows inserted during the current import run.

- **CSV import token is no longer spent before the data commits.** If an error occurred between the validation-token consumption and the final `import_db.commit()`, the token was gone but no rows were written — leaving the user with a dead token and no data. The token is now consumed only after all imports have successfully committed, so a failure leaves the token valid and the user can retry without re-validating.

- **Upload size is now enforced before the file is fully read into memory.** Previously the CSV import and firearm photo upload endpoints read the entire upload into memory before validating its size, meaning a large enough request could exhaust backend memory before being rejected. All four upload entry points (ammo CSV validate/confirm, firearms CSV validate/confirm, firearm photo upload) now check the `Content-Length` header for an early fast-fail and stream-read in 64 KiB chunks, rejecting with `413` the moment the running total exceeds the limit (10 MB).

### Security

- **Session cookies are now signed with the configured secret.** Previously, `backend/main.py` read the signing key from a bare `SESSION_SECRET` environment variable that nothing in the documented deployment surface ever set — so production deployments silently signed session cookies with a public hardcoded placeholder and the validation in `config.py` that rejects the default was effectively moot. The signing key is now read from the loaded config (`AL_SESSION_SECRET` / `config.yaml → security.session_secret`), which is the variable all deployment docs and Docker Compose examples already tell operators to set. If the secret is absent or the default placeholder in a production-posture app (`app.env: production`), the backend now refuses to start with a clear error instead of booting with a forgeable key. **Upgrade note:** existing sessions are invalidated on upgrade (everyone logs in once); production deployments without a real secret set will now fail to start until one is configured.

- **Session cookie is now hardened.** `SessionMiddleware` is now configured with `https_only=True` when the configured `app.base_url` uses HTTPS, `max_age` derived from `app.session_timeout_hours` (previously the configured timeout was honored by server-side auth logic but ignored at the cookie layer), and an explicit `same_site="lax"`.

- **CORS allowed origin is now driven by `app.base_url`.** Previously hardcoded to `http://localhost:5173` in every deployment. The configured public URL is now used as the CORS allowed origin; the localhost dev origin is retained as a fallback when no base URL is configured. `allow_credentials=True` is never paired with `allow_origins=["*"]`.

- **SSRF guard on product image preview.** The "Preview image from URL" endpoint fetches a user-supplied URL server-side. It now resolves the hostname before connecting and rejects loopback, RFC 1918 private, link-local (169.254.0.0/16, including cloud metadata endpoints), ULA, and other non-public IP ranges. The guard is also enforced on every redirect hop via httpx event hooks so a public URL that 302s into an internal address is caught before the follow happens.

- **Read-only users can no longer modify or delete products.** The product `_check_write` guard previously blocked only non-owners but never explicitly rejected the `read_only` role, so a demoted user retained write/delete/image-upload access to their own products. The guard now rejects `read_only` requests with `403 Forbidden` before the ownership check, matching the behaviour of the ammo, firearms, and range-session domains.

- **`must_change_password` is now enforced server-side.** When an admin force-resets a user's password, the flag is now checked on every authenticated request. Endpoints outside the minimal whitelist (`POST /users/me/change-password`, `GET /auth/me`, `POST /auth/logout`) return `403 MUST_CHANGE_PASSWORD` until the user sets a new password. Previously the flag was only a UI hint; a user with a temporary admin-known password could call the full API without ever changing it.

- **Config reset token compared in constant time.** The emergency admin-recovery token from `config.yaml` was previously compared with a plain `==` operator, which is timing-observable. Both comparison sites in `POST /auth/reset` (validation and commit) now use `secrets.compare_digest`.

- **Production frontend is now a static build served by nginx — the Vite dev server no longer runs in production.** Previously the production Docker image ran `npm run dev` (Vite dev server) with `allowedHosts: true`, which disables Vite's DNS-rebinding protection and is not appropriate for production. The frontend image is now a multi-stage build: `npm ci` + `vite build` produces an optimised static bundle, and nginx serves it with security headers (`X-Content-Type-Options: nosniff`, `Content-Security-Policy` with `frame-ancestors`, `Referrer-Policy`). The nginx `/api/` proxy replaces the Vite dev-proxy; the backend remains on a private network with no published ports (single-ingress topology unchanged). nginx listens on the same `5173` port the prior image used, so reverse-proxy configuration is unchanged. The dev server stage is preserved for `docker-compose.dev.yml`.

---

## Archived releases

Older releases are archived one file per minor series:

- [v0.3.x](docs/CHANGELOG-0.3.x.md) — 0.3.0 → 0.3.10
- [v0.2.x](docs/CHANGELOG-0.2.x.md) — 0.2.0 → 0.2.3
- [v0.1.x](docs/CHANGELOG-0.1.x.md) — 0.1.0 → 0.1.9
