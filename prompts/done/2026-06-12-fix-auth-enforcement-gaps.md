---
name: 2026-06-12-fix-auth-enforcement-gaps
status: completed
created: 2026-06-12
model: sonnet
completed: 2026-06-12
result: Enforced must_change_password in require_auth with 3-path whitelist; replaced both config-token == comparisons with secrets.compare_digest.
---

# Task: Enforce must_change_password server-side and use constant-time token compare

Two small auth-enforcement fixes in the auth/user paths.

## Before you start

- Read `backend/routers/auth.py` (`login` ~172–200, `reset_password` ~437–483 incl. the
  config-token compares at ~437 and ~463), `backend/routers/users.py` (`reset-password`
  ~175 sets `must_change_password = True`), and `backend/utils/rbac.py` (the `require_auth`
  dependency — likely the right enforcement point).

## Working tree check

Run `git status --porcelain`, cross-reference the files below, ask before touching dirty
ones. This prompt file is exempt.

## What to do

1. **Enforce `must_change_password`** (Low, but real). Admin force-reset and password reset
   set `must_change_password = True`, and `login` returns the flag, but no backend endpoint
   enforces it — a user with a temporary admin-known password can use the whole API without
   ever changing it. Add server-side enforcement: when the authenticated user has
   `must_change_password == True`, reject mutating/normal requests with a 403 carrying a
   code the frontend already understands, while still allowing the change-password endpoint
   and `/auth/me` (and logout). Implement in `require_auth` (or an adjacent dependency) so
   it applies uniformly; whitelist exactly the endpoints needed to complete the password
   change. Confirm the frontend handles the chosen 403 code (check how it currently reacts
   to the `must_change_password` flag from `login`) and align.
2. **Constant-time config-token compare** (Low). `auth.py:437` and `:463` compare the admin
   config reset token with plain `==` (`token == config_token`), which short-circuits and is
   timing-observable; that token can reset an admin password. Replace both with
   `secrets.compare_digest(...)`. Guard for `None`/empty so you don't pass non-str to
   `compare_digest`.

## Conventions to honor

- Don't broaden the reset/login surface; keep the whitelist minimal.
- Add a CHANGELOG `[Unreleased]` **Security** note. Run `ruff check backend/` and the
  backend tests (esp. anything covering auth/login/reset).

## When done

Per `prompts/TEMPLATE.md`: update frontmatter, `git mv` to `done/`/`failed/`, record
non-obvious decisions in `docs/decisions.md`, and (spawned agent) prepare the tree and
report the proposed ONE commit back — no commit, no push. Suggested message:
`fix: enforce must_change_password and use constant-time reset-token compare`.
