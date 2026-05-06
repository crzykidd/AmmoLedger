# Archived Migrations

These migrations represent the pre-v0.1.9 schema evolution of AmmoLedger.
They have been collapsed into the active `0001_initial_schema.py` and are
kept here as historical reference only.

**Do not run these migrations.** They are not part of the active migration
chain. Alembic will not discover them in this directory.

For the rationale behind the squash, see [docs/HISTORY.md](../../../docs/HISTORY.md).
For the feature-level changelog of pre-v0.1.9 development, see
[docs/CHANGELOG-pre-v0.1.9.md](../../../docs/CHANGELOG-pre-v0.1.9.md).

## Original migration chain

| Rev | Description |
|-----|-------------|
| 0001 | Initial schema — calibers, manufacturers, ammo_box, expenditure_log, users, locations, containers |
| 0002 | Add product_name to ammo_box |
| 0003 | Add app_settings table |
| 0004 | Add legacy_id, split_from_id, is_archived, archive_reason to ammo_box |
| 0005 | Add log_type, related_ids to expenditure_log |
| 0006 | Add invitations table |
| 0007 | Add password_history table |
| 0008 | Add notifications table |
| 0009 | Add database indexes for search and filter performance |
| 0010 | Add first_name, last_name to users |
| 0011 | Add must_change_password to users |
| 0012 | Add ammo_conditions table and ammo_condition_id to ammo_box |
| 0013 | Add url to manufacturers |
| 0014 | Three-tier threshold system (caliber_thresholds, location_thresholds) |
| 0015 | Add password_reset_tokens table |
| 0016 | Add is_active and source to locations and containers |
| 0017 | Add location_id to ammo_box |
| 0018 | Add products table and product_id to ammo_box |
| 0019 | Add task_history and task_registry tables |
| 0020 | Add community sync fields to lookup tables |
| 0021 | Add missing FK indexes on ammo_box |
| 0022 | Rename db_analyze task to db_optimize |
