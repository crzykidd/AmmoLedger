---
name: 2026-06-12-fix-session-secret-and-cookie-hardening
status: completed        # pending | completed | failed
created: 2026-06-12
model: sonnet            # opus = research/planning, sonnet = coding
completed: 2026-06-12
result: Session cookies are now signed from config (AL_SESSION_SECRET), hardened with https_only/max_age/same_site, and CORS origin is driven by base_url.
---

# Task: Wire the session secret to config and harden the session cookie

**CRITICAL security fix.** The session-cookie signing key is read from the wrong
environment variable, so production deployments sign cookies with a public hardcoded
fallback — anyone can forge an admin session. Also harden cookie flags and CORS.

## Before you start

- Read `CLAUDE.md` → Configuration section, and `backend/utils/config.py` (the
  `_ENV_OVERRIDES` table at line ~30, validation at ~205–330, `get_config()` flow).
- Read `backend/main.py:47–63` (current middleware wiring).
- Honor the project's `code-checkin-and-pr` rules: work on `dev`, conventional-commit
  prefixes, no `Co-authored-by`.

## Working tree check

Run `git status --porcelain` and cross-reference the files below. If any have
uncommitted changes, list them and ask before touching. This prompt file is exempt.

## The bug (confirmed)

- `backend/main.py:50` — `SESSION_SECRET = os.getenv("SESSION_SECRET", "dev-secret-change-in-production")`
- `backend/main.py:63` — `app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET)`
- But `backend/utils/config.py:30` maps `AL_SESSION_SECRET` → `security.session_secret`,
  and that is the variable the prod `docker-compose.yml`, `config.template.yaml`, and all
  docs tell operators to set. Nothing bridges config's `session_secret` (or
  `AL_SESSION_SECRET`) to the `SESSION_SECRET` env var the middleware reads. The config
  validation that rejects the default value (`config.py:325–330`) is therefore moot — it
  validates a value that never reaches the signer.

## What to do

1. **Source the signing key from the loaded config**, not a bare `os.getenv`. In
   `main.py`, obtain the effective secret via `get_config()` → `security.session_secret`
   (which already honors the `AL_SESSION_SECRET` override and config.yaml). Pass that to
   `SessionMiddleware`. Remove the `SESSION_SECRET` env-var read, or keep it only as a
   documented legacy alias that is clearly lower-priority than config — but the canonical
   path must be the config value. Make sure import/startup ordering still works (config is
   loaded before the app/middleware is constructed).
2. **Fail closed on the default in production.** If the effective secret is empty or equals
   the known default placeholder and the app is in a production posture, refuse to start
   with a clear error (reuse the existing validation in `config.py` if it already raises;
   otherwise raise at startup). A self-hosted app must never silently boot with a public key.
3. **Harden the session cookie.** `SessionMiddleware` is currently added with only
   `secret_key`. Add:
   - `https_only=True` when the configured base URL is https (drive from `AL_BASE_URL` /
     `app.base_url` if available; otherwise make it configurable, default safe).
   - `max_age` derived from `app.session_timeout_hours` (currently the configured timeout
     is silently ignored at the cookie layer).
   - an explicit `same_site` value (keep `"lax"` unless there's a reason for `"strict"`).
4. **Fix CORS.** `main.py:56–62` hardcodes `allow_origins=["http://localhost:5173"]` with
   `allow_credentials=True` and wildcard methods/headers. Drive the allowed origin from
   config (`AL_BASE_URL` / `app.base_url`), falling back to the localhost dev origin only
   when no base URL is set. Do not pair `allow_credentials=True` with `allow_origins=["*"]`.

## Conventions to honor

- Keep config access consistent with how the rest of `main.py` reads config.
- Update `docs/INSTALL.md` and `backend/config.template.yaml` if the canonical secret var
  name or behavior changes (docs ship in the same commit per CLAUDE.md). Note in the
  CHANGELOG `[Unreleased]` under **Security** that session cookies are now signed with the
  configured secret and the cookie is hardened.
- Manually sanity-check startup with and without `AL_SESSION_SECRET` set (see CLAUDE.md
  backend run instructions). Run `ruff check backend/`.

## When done

Follow `prompts/TEMPLATE.md` "When done": update frontmatter, `git mv` to `prompts/done/`
(or `prompts/failed/`), record any non-obvious decision in `docs/decisions.md`, and — as a
spawned agent — prepare the tree and report the proposed ONE commit (files + message) back
to the orchestrator. Do not commit, do not push. Suggested message:
`fix: sign session cookies with configured secret and harden cookie/CORS`.
