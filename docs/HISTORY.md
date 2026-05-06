# AmmoLedger Project History

This file documents structural events in the project's history — things that
don't fit neatly in a changelog entry but are worth knowing about.

For the feature-level changelog, see [CHANGELOG.md](../CHANGELOG.md) (active,
v0.1.9 onward) and [CHANGELOG-pre-v0.1.9.md](./CHANGELOG-pre-v0.1.9.md)
(archive, v0.1.0–v0.1.8).

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
