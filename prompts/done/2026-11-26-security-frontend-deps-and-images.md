---
name: 2026-11-26-security-frontend-deps-and-images
status: completed          # pending | completed | failed
created: 2026-11-26
model: sonnet
completed: 2026-11-26
result: target prod + prod-last stage; npm audit 15->0; node 24 trixie / nginx 1.30.8; Trivy 0 crit/high
---

# Task: Frontend security patch — npm deps, Node/nginx base images, and publish the real prod stage

Part 2 of the next release's security batch (part 1 = backend, already done or in
progress in `2026-11-26-security-backend-deps-and-image`). Clear every fixable CVE in the
**frontend** image and fix a release-pipeline bug that ships the Vite dev server as
production.

## Findings driving this (verified 2026-11-26)

**Pipeline bug (most important):** `.github/workflows/docker-publish.yml` "Build and push
frontend" step has **no `target:`**, so buildx builds the *last* stage of
`Dockerfile.frontend`, which is `dev`. Confirmed: published
`ghcr.io/crzykidd/ammoledger-frontend:latest` (v0.4.0, created 2026-06-14) is Debian 12
with `node`, CMD `npm run dev -- --host` — the Vite dev server, not the nginx `prod`
stage v0.4.0 intended (commit `ff122cb`). This also drags npm's own bundled deps (tar,
glob, minimatch, cross-spawn, sigstore, pacote, brace-expansion, ip-address) and the
esbuild Go-stdlib binary into the shipped image.

Dependabot (npm, `frontend/package-lock.json`), current locked → first fully-patched:
- direct: `axios` 1.15.2 → **1.20.0** (28 alerts, 12 high); `vite` 5.4.21 → **6.4.4**
  (no 5.x fix — major bump required); `postcss` 8.5.10 → **8.5.23**; `zod` 4.3.6 →
  **4.6.6**; `react-router-dom`/`react-router` 7.14.2 → **7.18.2**.
- transitive: follow-redirects → 1.16.2, form-data → 4.0.6, nanoid → 3.3.12+,
  browserslist → 4.28.7, source-map-js → 1.2.2, @babel/core → 7.29.6, esbuild → 0.28.1+
  (or whatever vite 6 pulls, if outside the vulnerable range >=0.27.3 <0.28.1),
  postcss-selector-parser → 6.1.5, baseline-browser-mapping → 2.11.0.

Base images (Trivy CRITICAL counts):
- `node:20.19.1-slim` (builder + dev stages): 7 critical; Node 20 is EOL (Apr 2026).
  `node:24-slim` is *still bookworm* and keeps the unfixable zlib critical — use
  **`node:24.22.3-trixie-slim`** (Debian 13.8, 0 critical).
- `nginx:1.27-alpine` (prod stage): 3 critical → **`nginx:1.30.8-alpine`** (Alpine 3.24,
  0 critical, 0 high).

## Before you start

- Read `CLAUDE.md`, `Dockerfile.frontend` (all three stages + comments),
  `frontend/nginx.conf`, `frontend/vite.config.ts`, `.github/workflows/docker-publish.yml`
  (frontend job), `docker-compose.yml` / `docker-compose.dev.yml` frontend services,
  `docs/decisions.md` entry about the nginx prod frontend (~line 131).
- Local Node is v24.16.0 via nvm — `npm` works directly on the host.
- Docker Hub rate-limits this host (429). For local image builds/pulls use the ECR mirror
  (`public.ecr.aws/docker/library/node:...`, `.../nginx:...`) via a temporary edit or
  `docker pull` + `docker tag` to the Docker Hub name. The **committed** `FROM` lines
  must stay on the Docker Hub names.

## Working tree check

Run `git status --porcelain`. Expected: the orchestrator's staged
`D  prompt/startnewsession.md` (leave it alone, not in your commit list) and possibly
part 1's uncommitted backend changes + its moved prompt — **do not touch or include those
either**; list them in your report as "not mine". If a file you need is dirty with
someone else's changes (e.g. CHANGELOG/README/PRD/decisions.md from part 1), **build on
top of it** — append your entries; don't revert theirs.

## What to do

1. **Fix the publish target.** Add `target: prod` to the frontend build-push step in
   `docker-publish.yml`. Check every frontend build invocation in all workflows (PR
   build-only path too). Verify the `prod` stage gets whatever build-args/labels the
   version display needs (`GIT_SHA`, `GIT_BRANCH`) — those must be consumed in the
   `builder` stage (the bundle is static now), not only in `dev`. If the About page /
   version display depends on runtime env that only the dev server provided, fix it so
   the static build still shows correct version info, or report clearly if it needs a
   follow-up. Consider making `prod` the *last* stage in `Dockerfile.frontend` (move
   `dev` above it) as belt-and-braces so a missing `target:` can never ship dev again —
   do it if `docker-compose.dev.yml` uses `target: dev` (check).
2. **npm deps.** In `frontend/`: bump package.json ranges and refresh the lockfile so
   every listed package resolves to a patched version — axios ^1.20.0, vite ^6.4.4 (stay
   on 6.x; vite 7+ is out of scope), postcss ^8.5.23, zod ^4.6.6, react-router-dom
   ^7.18.2, plus `@vitejs/plugin-react` to a version that supports vite 6. Then
   `npm audit` and `npm audit fix` (**no `--force`**) for transitives; use `overrides`
   only as a last resort for a stuck transitive. Target: `npm audit` reports 0 vulns (or
   list each remaining one with why it can't be fixed). Check vite 6 migration notes
   against `vite.config.ts` (e.g. `resolve.conditions`, Sass API, `json.stringify`
   defaults, dev-server `server.allowedHosts` — dev compose serves on
   `crzydev.home.arpa:5174`, so make sure the dev server still accepts that host).
3. **Base images in `Dockerfile.frontend`:** both node stages →
   `node:24.22.3-trixie-slim`; prod → `nginx:1.30.8-alpine`. Confirm the dev stage's
   `apt-get install curl` and the `node` user (uid 1000) assumptions still hold on the
   trixie image.
4. **Verify:**
   - `cd frontend && npm run build` (tsc + vite build) succeeds, `npm run typecheck` clean.
   - `docker build -f Dockerfile.frontend --target prod -t al-frontend:sec ./frontend`
     (check the real context) builds; run it with `AL_BACKEND_URL` pointing somewhere
     harmless and confirm nginx serves `/` with 200 and the SPA fallback works for a deep
     route (e.g. `/inventory`).
   - Also build `--target dev` and confirm `npm run dev` starts.
   - Build with **no** `--target` and confirm it yields the prod (nginx) image if you
     reordered stages.
   - Trivy scan `al-frontend:sec`:
     `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy-cache:/root/.cache aquasec/trivy:latest image -q --severity CRITICAL,HIGH al-frontend:sec`
     Target: 0 CRITICAL, 0 HIGH. Report before/after (before = the published `:latest`:
     7 OS critical + 1 Node critical + 2 esbuild-stdlib critical).
   - `docker compose config --quiet` still passes.
5. **Docs** (same commit; part 1 may already have added a `### Security` section under
   `[Unreleased]` — add to it):
   - `CHANGELOG.md` `[Unreleased]`: `### Security` entries for frontend dependency fixes
     and base-image updates; `### Fixed` entry: "The published frontend image now serves
     the production nginx build; v0.4.0 images were mistakenly running the development
     server." Add an upgrade note if anything changes for users (port, env vars, health
     check).
   - `README.md` tech-stack table (~line 207).
   - `docs/PRD.md`: tech-stack table (~line 2876), sample log line `node=v20.19.1`
     (~line 1057) if still representative, Revision History row dated 2026-11-26.
   - `docs/decisions.md` (newest at top): missing `target:` root cause + stage-reorder
     guard; Node 24 trixie choice (24-slim is still bookworm); vite 6 (not 7) choice.

## Conventions to honor

- Commit prefix `fix:`; no `Co-authored-by:` trailer.
- Don't touch backend files or `Dockerfile.backend`.
- Never `git add -A`; never commit; never push.

## When done

1. Update this file's frontmatter: `status`, `completed`, `result`.
2. `git add` this (untracked) file then `git mv` it into `prompts/done/` or
   `prompts/failed/`.
3. Record non-obvious decisions in `docs/decisions.md`.
4. **You are a spawned agent: do not commit.** Report back: the file list (only yours),
   proposed one-line commit message, `npm audit` before/after, Trivy before/after, and
   any residual findings or follow-ups (e.g. version-display behavior in the static
   build).
