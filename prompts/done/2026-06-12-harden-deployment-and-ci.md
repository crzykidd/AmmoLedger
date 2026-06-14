---
name: 2026-06-12-harden-deployment-and-ci
status: done
created: 2026-06-12
model: sonnet
completed: 2026-06-13
result: >
  Multi-stage Dockerfile.frontend (builder → prod nginx, dev target preserved).
  frontend/nginx.conf created: /api proxy to ${AL_BACKEND_URL}, security headers
  (X-Content-Type-Options, CSP with frame-ancestors, Referrer-Policy, no HSTS).
  docker-compose.yml port mapping updated 5173:5173 → 5173:80, healthcheck added.
  docker-compose.dev.yml: target: dev added. All 6 third-party GitHub Actions in
  both workflow files pinned to commit SHAs. CHANGELOG, INSTALL.md, decisions.md
  updated. Both compose files validate; npm run build and typecheck pass.
---

# Task: Ship a real production frontend and harden CI supply-chain

The "production" frontend image runs the Vite **dev server**, and GitHub Actions are pinned
to mutable tags. Fix both. **NOTE: item 1 changes the deployment model — confirm with the
user before dispatching this prompt that they actually want an nginx static build (vs.
keeping the dev server intentionally for this self-hosted app).**

## Before you start

- Read `Dockerfile.frontend` (CMD runs `npm run dev -- --host`), `frontend/vite.config.ts`
  (`allowedHosts: true`, in-process `/api` proxy), `docker-compose.yml` (prod — ships the
  same image on 5173) and `docker-compose.dev.yml`, plus `.github/workflows/ci.yml` and
  `.github/workflows/docker-publish.yml`.
- Read `CLAUDE.md` → Stack / Container section and the URL Structure (reverse proxy routes
  `/` → frontend, `/api/` → backend).

## Working tree check

Run `git status --porcelain`, cross-reference the files below, ask before touching dirty
ones. This prompt file is exempt.

## What to do

1. **Production frontend = static build behind a web server, not the Vite dev server**
   (High). `Dockerfile.frontend` currently runs `npm run dev` and `vite.config.ts` sets
   `allowedHosts: true` (disables Vite's host-header / DNS-rebinding protection); this image
   is what prod `docker-compose.yml` ships. Add a production build stage: `vite build`
   (already `npm run build` per CLAUDE.md) → serve the static `dist/` with nginx. Keep the
   dev-server image/flow for `docker-compose.dev.yml` only (multi-stage Dockerfile or a
   separate dev target). Run `docker compose config --quiet` on both compose files (matches
   CI) to confirm they still validate. Update `docs/INSTALL.md` and any compose docs to
   reflect the production serving model and the now-served port.

   **Deployment topology — preserve the current single-ingress model (the user runs
   Traefik in front, and many users will):**
   - **nginx MUST keep proxying `/api` → backend internally**, exactly as the Vite dev
     server does today. The prod `docker-compose.yml` backend has **no published ports**
     (private bridge) and is reachable only through the frontend; do NOT expose the backend
     or require new Traefik labels. The frontend stays the single front door so an existing
     Traefik router pointed at the frontend keeps working unchanged — this must be a
     transparent swap, not a topology change. Mirror the URL routing in CLAUDE.md (`/` →
     frontend static, `/api/` → backend) inside the nginx config. Wire the upstream from the
     same backend service name/port the dev proxy uses (read `vite.config.ts` for the exact
     target). (Document, but do NOT default to, the alternative where Traefik routes `/api`
     straight to the backend — that would require exposing the backend and is the operator's
     choice, not ours.)
   - **Security headers, TLS-aware:** set `X-Content-Type-Options: nosniff`, a `CSP`
     appropriate to the app (`frame-ancestors` instead of/in addition to X-Frame-Options),
     and `Referrer-Policy`. **Do NOT set HSTS in nginx** — TLS terminates at Traefik (the
     edge), so HSTS belongs there; emitting it from nginx risks duplicate/contradictory
     headers. Don't set `Strict-Transport-Security` or force https redirects in nginx; the
     container serves plain HTTP to the proxy. Keep the CSP permissive enough that the built
     SPA + `/api` calls work (verify against the actual built `dist/`).
2. **Pin third-party GitHub Actions to commit SHAs** (Medium, supply-chain). Actions are
   floated on mutable major tags (`actions/checkout@v5`, `actions/setup-python@v6`,
   `docker/metadata-action@v6`, `docker/login-action@v4`, `docker/build-push-action@v6`,
   `actions/delete-package-versions@v5`). A re-pointed tag runs in a `packages: write`
   context. Pin each to a full commit SHA with the human version in a trailing comment, at
   least for jobs that hold `packages: write`.
3. **Reproducible frontend builds** (Low). `Dockerfile.frontend` uses `npm install`. Switch
   the build stage to `npm ci` against a committed `package-lock.json` (confirm the lockfile
   is committed; if missing, generate and commit it). This pairs naturally with item 1's
   build stage.

## Conventions to honor

- Don't change runtime behavior of the backend container or the dev workflow beyond what's
  needed. Preserve the existing PUID/PGID/gosu drop-privilege pattern.
- This is a `chore:`-flavored change (tooling/deploy) but it includes a security fix; use
  `fix:` if you judge the dev-server-in-prod issue user-facing, else `chore:`. Add a
  CHANGELOG `[Unreleased]` note. Docs ship in the same commit.

## When done

Per `prompts/TEMPLATE.md`: update frontmatter, `git mv` to `done/`/`failed/`, record the
serving-model decision in `docs/decisions.md`, and (spawned agent) prepare the tree and
report the proposed ONE commit back — no commit, no push. Suggested message:
`chore: serve production frontend as static build and pin CI actions to SHAs`.
