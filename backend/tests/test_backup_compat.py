"""Tests for schema-versioned JSON import (backup/restore compatibility).

See docs/prd/backup-restore-compat.md for the full design.

Note: these tests use the in-memory conftest DB. The backup router's direct
sqlite3 connections hit a fresh empty DB (no alembic_version table), so
cur_migration comes back as "unknown". _classify_schema_migration compares
against script.get_current_head() — the Alembic scripts on disk — so
classification is correct regardless of the live DB state.
"""

import io
import json
from typing import Any

from fastapi.testclient import TestClient


CURRENT_HEAD = "0004"
OLDER_REV = "0001"


def _make_export(
    schema_migration: str | None = CURRENT_HEAD,
    backup_format_version: int | None = None,
    tables: dict | None = None,
    include_schema_key: bool = True,
) -> bytes:
    data: dict[str, Any] = {
        "ammologger_version": "0.3.10",
        "ammoledger_version": "0.3.10",
        "exported_at": "2025-01-01T00:00:00",
        "tables": tables if tables is not None else {},
    }
    if include_schema_key and schema_migration is not None:
        data["schema_migration"] = schema_migration
    if backup_format_version is not None:
        data["backup_format_version"] = backup_format_version
    return json.dumps(data).encode()


def _post_preview(client: TestClient, contents: bytes):
    return client.post(
        "/backup/import/preview",
        files={"file": ("export.json", io.BytesIO(contents), "application/json")},
    )


def _post_commit(client: TestClient, contents: bytes, confirm_older: bool = False):
    return client.post(
        "/backup/import/commit",
        files={"file": ("export.json", io.BytesIO(contents), "application/json")},
        data={"confirm_older": "true" if confirm_older else "false"},
    )


class TestPreviewCompatibilityVerdict:
    def test_clean_verdict_for_current_head(self, authed_client: TestClient):
        r = _post_preview(authed_client, _make_export(CURRENT_HEAD))
        assert r.status_code == 200
        compat = r.json()["compatibility"]
        assert compat["verdict"] == "clean"

    def test_older_compatible_verdict_for_known_ancestor(self, authed_client: TestClient):
        r = _post_preview(authed_client, _make_export(OLDER_REV))
        assert r.status_code == 200
        compat = r.json()["compatibility"]
        assert compat["verdict"] == "older_compatible"
        assert "tables_added_empty" in compat
        assert isinstance(compat["tables_added_empty"], list)
        assert "columns_defaulted" in compat
        assert isinstance(compat["columns_defaulted"], dict)
        assert "summary" in compat
        assert compat["summary"]

    def test_older_compatible_tables_added_empty_nonempty(self, authed_client: TestClient):
        # Export has no tables at all — all _EXPORT_TABLES should appear as empty.
        r = _post_preview(authed_client, _make_export(OLDER_REV, tables={}))
        assert r.status_code == 200
        compat = r.json()["compatibility"]
        assert compat["verdict"] == "older_compatible"
        # Every table in _EXPORT_TABLES should be listed as added-empty
        assert len(compat["tables_added_empty"]) > 0

    def test_rejected_verdict_for_unknown_revision(self, authed_client: TestClient):
        r = _post_preview(authed_client, _make_export("9999_future_migration"))
        assert r.status_code == 200
        compat = r.json()["compatibility"]
        assert compat["verdict"] == "rejected"
        assert compat["reason"] in ("not_ancestor", "newer_schema")
        assert "recommended_action" in compat

    def test_rejected_verdict_for_missing_schema_tag(self, authed_client: TestClient):
        contents = _make_export(include_schema_key=False)
        r = _post_preview(authed_client, contents)
        assert r.status_code == 200
        compat = r.json()["compatibility"]
        assert compat["verdict"] == "rejected"
        assert compat["reason"] == "missing_schema_tag"


class TestBackupFormatVersion:
    def test_absent_format_version_treated_as_1(self, authed_client: TestClient):
        # No backup_format_version key → treated as 1, no error
        r = _post_preview(authed_client, _make_export(CURRENT_HEAD))
        assert r.status_code == 200

    def test_format_version_1_accepted(self, authed_client: TestClient):
        r = _post_preview(authed_client, _make_export(CURRENT_HEAD, backup_format_version=1))
        assert r.status_code == 200

    def test_format_version_too_new_rejected_on_preview(self, authed_client: TestClient):
        r = _post_preview(authed_client, _make_export(CURRENT_HEAD, backup_format_version=9999))
        assert r.status_code == 400
        detail = r.json()["detail"]
        assert detail["reason"] == "unsupported_format"

    def test_format_version_too_new_rejected_on_commit(self, authed_client: TestClient):
        r = _post_commit(authed_client, _make_export(CURRENT_HEAD, backup_format_version=9999))
        assert r.status_code == 400


class TestCommitSchemaGating:
    def test_rejected_schema_returns_400(self, authed_client: TestClient):
        r = _post_commit(authed_client, _make_export("9999_future"))
        assert r.status_code == 400

    def test_older_compatible_without_confirm_returns_422(self, authed_client: TestClient):
        r = _post_commit(authed_client, _make_export(OLDER_REV), confirm_older=False)
        assert r.status_code == 422
        detail = r.json()["detail"]
        assert detail["verdict"] == "older_compatible"

    def test_missing_schema_tag_returns_400_on_commit(self, authed_client: TestClient):
        contents = _make_export(include_schema_key=False)
        r = _post_commit(authed_client, contents)
        assert r.status_code == 400
