---
name: 2026-06-12-fix-ssrf-upload-limits-product-rbac
status: completed
created: 2026-06-12
model: sonnet
completed: 2026-06-12
result: Added SSRF guard (ssrf_guard.py), upload size caps (10 MB) before file.read() in all 4 import/upload endpoints, and read_only block in product _check_write.
---

# Task: SSRF guard on image preview, upload size caps, and product read-only gate

Three request/upload-hardening fixes in the routers, all independent.

## Before you start

- Read `CLAUDE.md` → Firearms Domain Conventions (per-router `_check_write` shape) and the
  Database/Logging rules (not central here, but stay consistent).
- Read `backend/routers/products.py` (`preview_product_image` ~682–717, `_check_write`
  ~151–155, `create_product` ~316), `backend/routers/importer.py` (`await file.read()` at
  ~472 and ~551), `backend/routers/firearm_photos.py` (`upload_photo` ~94, note it already
  has `MAX_UPLOAD_BYTES` but reads the whole file first), and `backend/routers/firearms_importer.py`.

## Working tree check

Run `git status --porcelain`, cross-reference the files below, and ask before touching any
that are already dirty. This prompt file is exempt.

## What to do

1. **SSRF in product image preview** (`products.py:682–717`, High). The endpoint fetches a
   user-supplied `source_url` server-side with `follow_redirects=True` and only validates the
   `http(s)` scheme. Add an outbound-request guard that:
   - Resolves the hostname and rejects loopback, RFC1918 private, link-local
     (169.254.0.0/16, incl. cloud metadata 169.254.169.254), ULA, and other non-public
     ranges **before connecting**.
   - Re-validates after **each redirect** (or disables redirects and validates the final
     target), since a public URL can 302 into an internal one.
   - Keeps the existing `Content-Type: image/*` and size checks.
   Put the IP/host validation in a small reusable helper (it may be wanted elsewhere later).
   If `image_search`/`community_sync`/`version_check` make outbound calls to
   *operator-controlled or hardcoded* hosts they are out of scope — only the
   *user-supplied-URL* path needs this guard.
2. **Upload size caps** (importer + photo endpoints, Low/DoS). Several handlers do
   `content = await file.read()` with no limit, loading an arbitrarily large upload into
   memory. Enforce a max upload size **before** the full read on every import/upload entry
   point — check `Content-Length` and/or stream with a running cap and reject with 413 when
   exceeded. Reuse the existing `MAX_UPLOAD_BYTES` constant if present; otherwise add a
   configurable limit with a sane default. Cover: `importer.py` validate/confirm,
   `firearms_importer.py` validate/confirm, and `firearm_photos.py:upload_photo` (move its
   cap to before/while reading).
3. **Product `_check_write` should block `read_only`** (`products.py:151–155`, Low/latent).
   Unlike `ammo.py`/`firearms.py`/`range_sessions.py`, product `_check_write` allows any
   non-admin owner to write and never rejects the `read_only` role. Add the
   `if user.role == "read_only": raise HTTPException(403, ...)` check to match the other
   domains, so a member demoted to read_only loses write/delete/image control over products.

## Conventions to honor

- Match the existing error-raising style (HTTPException with the codes the frontend expects).
- Keep `_check_write` per-router (do not refactor into a shared base — that's deliberate
  per CLAUDE.md).
- Add CHANGELOG `[Unreleased]` entries under **Security** (SSRF, read_only gate) and
  **Fixed**/**Changed** (upload caps). Run `ruff check backend/` and the backend test suite
  (CLAUDE.md has the exact invocation).

## When done

Per `prompts/TEMPLATE.md`: update frontmatter, `git mv` to `done/`/`failed/`, log any
non-obvious decision in `docs/decisions.md`, and (as a spawned agent) prepare the tree and
report the proposed ONE commit back — do not commit or push. Suggested message:
`fix: block SSRF on image preview, cap upload sizes, deny read-only product writes`.
