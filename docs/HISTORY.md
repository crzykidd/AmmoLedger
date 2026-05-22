# AmmoLedger Project History

This file documents structural events in the project's history — things that
don't fit neatly in a changelog entry but are worth knowing about.

For the feature-level changelog, see [CHANGELOG.md](../CHANGELOG.md) (active,
v0.3.x onward) and [CHANGELOG-0.1.x.md](./CHANGELOG-0.1.x.md)
(0.1.x archive, v0.1.0–v0.1.9).

---

## Pre-release database migration squash (v0.1.9)

Through v0.1.8, AmmoLedger accumulated 22 Alembic migrations (0001–0022)
during pre-release development. As the project approached its first public
release, these were collapsed into a single initial schema migration.

### Why

Every fresh install was running 22 sequential migrations against an empty
database — slow, noisy in logs, and 22 chances for an Alembic edge case to
bite a new user. With no public users yet (the project's only installations
were the developer's dev and prod environments), this was the last clean
window to consolidate.

### What changed

Migrations 0001–0022 were archived to `backend/migrations/archive/` and
replaced by a single `0001_initial_schema.py` reflecting the v0.1.9-ready
schema. The archived migrations remain in the repo as historical reference
but are not part of the active migration chain — Alembic does not discover
them.

The squashed schema is byte-equivalent to running 0001 → 0022 in sequence.
Every column, constraint, index, and seed insert from the original chain is
present in the new initial migration.

### Impact on existing installs

None for public users (there were none). Both developer environments were
wiped and reinitialized against the squashed schema as part of this
transition.

### Highlights of what the 22 archived migrations built

| Era | Migrations | What landed |
|-----|------------|-------------|
| Foundation | 0001–0008 | Initial schema, app_settings, expanded ammo_box and expenditure_log fields, invitations, password history, notifications |
| Performance | 0009 | First wave of indexes for search and filter performance |
| User model | 0010–0011 | first_name/last_name, must_change_password |
| Lookups expansion | 0012–0013 | Ammo conditions, manufacturer URLs |
| Threshold revamp | 0014 | Three-tier threshold system (global/caliber/location) |
| Auth refinements | 0015 | Password reset tokens |
| Storage model | 0016–0017 | is_active and source on locations/containers, location_id on ammo_box |
| Product catalog | 0018 | Products table and product_id on ammo_box |
| Task system | 0019 | task_history and task_registry tables |
| Community sync | 0020 | community_key, is_imported, dealer geo fields |
| v0.2.0 prep | 0021–0022 | FK indexes, db_analyze → db_optimize rename |

Full migration files are preserved in [backend/migrations/archive/](../backend/migrations/archive/).

---

## First public release (v0.2.0)

v0.2.0 is the first version of AmmoLedger intended for general public use. v0.1.x and v0.1.9 were internal/early-tester releases — v0.1.9 was tagged on 2026-05-05 specifically as a clean baseline (with the squashed initial schema) on which to build the public release.

### Why v0.2.0 is the public milestone

By v0.2.0, the major UX gaps from earlier dev iterations had been closed:

- A focused mobile experience for range use (At Range page).
- Discoverable, low-friction round logging across the inventory (Crosshair icon, smarter presets, session-persistent notes).
- Predictable archive/empty filter semantics (three-state dropdowns instead of ambiguous checkboxes).
- A dashboard that can show both current inventory and lifetime totals.
- Reliable post-import workflows with clear feedback when archived rows are imported.

### What's deferred

Major features that were originally scoped for v0.2.0 but deferred to keep the public-release scope focused:

- Split Box (PRD §9.2.4)
- Restock / Add Same (PRD §9.2.5)
- Add X Copies (PRD §9.2)
- Login rate limiting (PRD §4.2)

These appear in [docs/v030-roadmap.md](./v030-roadmap.md) as carryover items.

### What's next

The next major workstream extends AmmoLedger beyond ammunition into the rest of the collection: a firearms registry, range session logging tied to existing inventory, and cleaning reminders. Accessories are further out. See [docs/v030-roadmap.md](./v030-roadmap.md) for the active roadmap.

---

## The restore-corruption debugging saga (v0.3.7-dev)

A user-reported "restore succeeds but login 500s" bug turned into a multi-layer investigation where each fix revealed a deeper cause, and the final root cause was unrelated to the presenting symptom. Recorded because the misdirection is the lesson.

### The presenting symptom

After a backup-and-restore, login failed with `malformed database schema (sqlite_stat1) - invalid rootpage`. The database appeared restored but every schema-touching query died.

### Layer 1 — the stats table

`sqlite_stat1` (SQLite's query-planner statistics) had a corrupt rootpage. Raw-page inspection of the actual file proved it: the schema recorded `sqlite_stat1` at rootpage 142 in a file only 139 pages long. The missing pages were stranded in the `-wal` sidecar.

### Layer 2 — the WAL was never checkpointed before the move

Restore ran `ANALYZE` on the migrated file (allocating new stat pages into the WAL), then `shutil.move`'d only the main `.db` — leaving the committed-by-reference pages behind in the discarded WAL. Fix: checkpoint and drop out of WAL mode before the move; stop running `ANALYZE` (absent stats is the only state that boots clean; SQLite regenerates them lazily).

### Layer 3 — the move itself wasn't durable

With the stats fixed, a broader `database disk image is malformed` appeared. The zip restore extracted into an overlay-filesystem temp dir, then `shutil.move`'d cross-filesystem onto the `/data` bind mount — a copy with no fsync. On Docker Desktop for Windows (virtiofs → NTFS), the app reopened the file before pages flushed. Fix: stage the copy inside the destination directory (same filesystem), fsync file and directory, `os.replace`, fsync again. This only manifested on Windows bind mounts — native Linux/ext4 (production) masked it via stronger rename/fsync ordering. Without a Windows tester in the loop it would have shipped silently broken for that audience.

### Layer 4 — the real time-sink: logging was broken, which hid everything

Adding audit logging to confirm the fixes revealed that restore "logged nothing" — and neither did anything else from request handlers. An in-worker probe proved that inside the running uvicorn `--reload` worker, the `routers.backup` logger had `disabled == True` and root carried only a bare stderr handler. Cause: `main.py` imports all routers at module top, so each router's module-level logger is created *before* uvicorn applies its own logging config; the reload worker then re-applies a config with `disable_existing_loggers: True` *after* the startup hook runs, so any startup-time logging fix was silently undone. Only `print(flush=True)` ever survived. Fix: self-healing `get_logger()` that re-enables the logger and ensures a single formatted stdout handler on every fetch, plus hot-path handlers fetching their logger at call time so the repair runs inside the request.

### The meta-lesson

The hardest part wasn't any single fix — it was that the broken logging suppressed the diagnostic evidence for the other three layers. Every "it logged nothing" reading was ambiguous: was the code not running, or was the log just not appearing? The breakthrough came only from instrumenting the actual request-serving worker with `print` (which bypasses logging) rather than reasoning from absent logs. When a system's observability is itself broken, fix that first — every other diagnosis is built on sand until you can trust what you're seeing.

### Companion docs

The `.recover` recovery recipe (and the gotcha that distro `sqlite3` builds may lack `.recover`, plus the need to copy `-wal`/`-shm` sidecars alongside the main file) lives in [docs/RECOVERY.md](./RECOVERY.md). The user-facing fixes are in the `[Unreleased]` changelog.
