"""Integration tests for the firearm photos API + zip backup."""
import io
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlmodel import Session, select

from models import (
    Caliber,
    Firearm,
    FirearmPhoto,
    Manufacturer,
    User,
)
from utils.security import hash_password


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def temp_uploads_path(tmp_path, monkeypatch):
    """Redirect UPLOADS_PATH at all relevant module sites to a temp dir.

    UPLOADS_PATH is read at module import time, so re-binding the constant
    on `utils.config` alone is not enough — every module that did
    `from utils.config import UPLOADS_PATH` holds its own reference.
    """
    uploads = tmp_path / "uploads"
    uploads.mkdir()
    monkeypatch.setenv("UPLOADS_PATH", str(uploads))
    import utils.config as config_mod  # noqa: PLC0415
    import utils.firearm_photos as photo_mod  # noqa: PLC0415
    import routers.backup as backup_mod  # noqa: PLC0415
    monkeypatch.setattr(config_mod, "UPLOADS_PATH", str(uploads))
    monkeypatch.setattr(photo_mod, "UPLOADS_PATH", str(uploads))
    monkeypatch.setattr(backup_mod, "UPLOADS_PATH", str(uploads))
    yield uploads


def _login(c: TestClient, email: str, password: str) -> None:
    r = c.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text


def _make_user(db: Session, email: str, role: str = "member") -> User:
    user = User(
        username=email,
        email=email,
        first_name=email.split("@")[0].title(),
        last_name="User",
        password_hash=hash_password("MemberPass1!"),
        role=role,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def firearm_mfr(db_session: Session) -> Manufacturer:
    m = Manufacturer(name="Glock", types='["firearm"]')
    db_session.add(m)
    db_session.commit()
    db_session.refresh(m)
    return m


@pytest.fixture
def caliber(db_session: Session) -> Caliber:
    c = Caliber(name="9mm Luger")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    return c


def _make_firearm(
    db: Session,
    owner_id: int,
    mfr_id: int,
    caliber_id: int,
    is_shared: bool = False,
) -> Firearm:
    f = Firearm(
        owner_id=owner_id,
        is_shared=is_shared,
        manufacturer_id=mfr_id,
        custom_model_name="Test Firearm",
        firearm_type="pistol",
        caliber_id=caliber_id,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


def _png_bytes(width: int = 200, height: int = 200, color=(255, 0, 0)) -> bytes:
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_bytes(width: int = 200, height: int = 200, color=(0, 128, 0)) -> bytes:
    img = Image.new("RGB", (width, height), color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def _upload(c: TestClient, firearm_id: int, content: bytes, name: str, ctype: str):
    return c.post(
        f"/firearms/{firearm_id}/photos",
        files={"file": (name, content, ctype)},
    )


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

def test_upload_jpeg_first_becomes_default(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber, temp_uploads_path
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    r = _upload(client, f.id, _jpeg_bytes(), "a.jpg", "image/jpeg")
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["is_default"] is True
    assert body["sort_order"] == 0
    assert body["content_type"] == "image/jpeg"
    assert body["url"] == f"/firearms/{f.id}/photos/{body['id']}"
    assert body["thumb_url"].endswith("/thumb")

    # Files exist on disk
    photo_dir = temp_uploads_path / "firearm_photos" / str(f.id)
    assert photo_dir.exists()
    files = list(photo_dir.iterdir())
    assert len(files) == 2  # full + thumb


def test_upload_png_normalized_to_jpeg(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    r = _upload(client, f.id, _png_bytes(), "a.png", "image/png")
    assert r.status_code == 201, r.text
    assert r.json()["content_type"] == "image/jpeg"


def test_upload_heic_rejected(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    r = _upload(client, f.id, b"junk", "a.heic", "image/heic")
    assert r.status_code == 422
    assert "HEIC" in r.json()["detail"] or "JPEG" in r.json()["detail"]


def test_upload_unsupported_type_rejected(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    r = _upload(client, f.id, b"%PDF-1.4\n", "a.pdf", "application/pdf")
    assert r.status_code == 422


def test_upload_corrupt_image_rejected(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    r = _upload(client, f.id, b"not actually a jpeg", "a.jpg", "image/jpeg")
    assert r.status_code == 422


def test_upload_resizes_oversized(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    r = _upload(client, f.id, _jpeg_bytes(width=4000, height=3000), "big.jpg", "image/jpeg")
    assert r.status_code == 201, r.text
    body = r.json()
    assert max(body["width"], body["height"]) <= 2048


def test_cap_at_5(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    for i in range(5):
        r = _upload(client, f.id, _jpeg_bytes(), f"a{i}.jpg", "image/jpeg")
        assert r.status_code == 201, r.text
    r = _upload(client, f.id, _jpeg_bytes(), "a6.jpg", "image/jpeg")
    assert r.status_code == 422
    assert "maximum" in r.json()["detail"]


# ---------------------------------------------------------------------------
# List + read bytes
# ---------------------------------------------------------------------------

def test_list_photos_returns_in_sort_order(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    for i in range(3):
        _upload(client, f.id, _jpeg_bytes(), f"a{i}.jpg", "image/jpeg")
    r = client.get(f"/firearms/{f.id}/photos")
    assert r.status_code == 200
    photos = r.json()
    assert len(photos) == 3
    assert [p["sort_order"] for p in photos] == [0, 1, 2]
    assert photos[0]["is_default"] is True


def test_get_photo_bytes_unauthenticated_blocked(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    upload = _upload(client, f.id, _jpeg_bytes(), "a.jpg", "image/jpeg").json()

    # Drop session
    client.cookies.clear()
    r = client.get(f"/firearms/{f.id}/photos/{upload['id']}")
    assert r.status_code in (401, 403)


def test_get_photo_bytes_returns_image_data(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    upload = _upload(client, f.id, _jpeg_bytes(), "a.jpg", "image/jpeg").json()
    r = client.get(f"/firearms/{f.id}/photos/{upload['id']}")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("image/jpeg")
    assert r.content[:2] == b"\xff\xd8"  # JPEG SOI


def test_thumb_endpoint_returns_data(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    upload = _upload(client, f.id, _jpeg_bytes(width=2000, height=2000), "a.jpg", "image/jpeg").json()
    full = client.get(f"/firearms/{f.id}/photos/{upload['id']}").content
    thumb = client.get(f"/firearms/{f.id}/photos/{upload['id']}/thumb").content
    assert len(thumb) > 0
    assert len(thumb) < len(full)


def test_get_photo_404_for_other_firearm(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f1 = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    f2 = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    upload = _upload(client, f1.id, _jpeg_bytes(), "a.jpg", "image/jpeg").json()
    r = client.get(f"/firearms/{f2.id}/photos/{upload['id']}")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Default + reorder + delete
# ---------------------------------------------------------------------------

def test_set_default(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    p1 = _upload(client, f.id, _jpeg_bytes(), "a.jpg", "image/jpeg").json()
    p2 = _upload(client, f.id, _jpeg_bytes(), "b.jpg", "image/jpeg").json()

    r = client.patch(f"/firearms/{f.id}/photos/{p2['id']}/default")
    assert r.status_code == 200, r.text
    photos = client.get(f"/firearms/{f.id}/photos").json()
    by_id = {p["id"]: p for p in photos}
    assert by_id[p1["id"]]["is_default"] is False
    assert by_id[p2["id"]]["is_default"] is True


def test_delete_default_promotes_next(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    p1 = _upload(client, f.id, _jpeg_bytes(), "a.jpg", "image/jpeg").json()
    p2 = _upload(client, f.id, _jpeg_bytes(), "b.jpg", "image/jpeg").json()

    r = client.delete(f"/firearms/{f.id}/photos/{p1['id']}")
    assert r.status_code == 204
    photos = client.get(f"/firearms/{f.id}/photos").json()
    assert len(photos) == 1
    assert photos[0]["id"] == p2["id"]
    assert photos[0]["is_default"] is True


def test_reorder_persists(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    p1 = _upload(client, f.id, _jpeg_bytes(), "a.jpg", "image/jpeg").json()
    p2 = _upload(client, f.id, _jpeg_bytes(), "b.jpg", "image/jpeg").json()
    p3 = _upload(client, f.id, _jpeg_bytes(), "c.jpg", "image/jpeg").json()

    r = client.post(
        f"/firearms/{f.id}/photos/reorder",
        json={"items": [
            {"photo_id": p3["id"], "sort_order": 0},
            {"photo_id": p1["id"], "sort_order": 1},
            {"photo_id": p2["id"], "sort_order": 2},
        ]},
    )
    assert r.status_code == 200, r.text
    photos = client.get(f"/firearms/{f.id}/photos").json()
    assert [p["id"] for p in photos] == [p3["id"], p1["id"], p2["id"]]


def test_reorder_rejects_extraneous_id(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    p1 = _upload(client, f.id, _jpeg_bytes(), "a.jpg", "image/jpeg").json()
    r = client.post(
        f"/firearms/{f.id}/photos/reorder",
        json={"items": [
            {"photo_id": p1["id"], "sort_order": 0},
            {"photo_id": 9999, "sort_order": 1},
        ]},
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Visibility + RBAC
# ---------------------------------------------------------------------------

def test_member_cannot_upload_to_other_members_firearm(
    client: TestClient, db_session: Session, firearm_mfr, caliber
):
    alice = _make_user(db_session, "alice@test.com")
    _make_user(db_session, "bob@test.com")
    f = _make_firearm(db_session, alice.id, firearm_mfr.id, caliber.id)

    _login(client, "bob@test.com", "MemberPass1!")
    r = _upload(client, f.id, _jpeg_bytes(), "a.jpg", "image/jpeg")
    # Bob can't see Alice's private firearm — visibility filter says 404.
    assert r.status_code == 404


def test_readonly_can_view_shared_photos_but_not_upload(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    _make_user(db_session, "reader@test.com", role="read_only")
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id, is_shared=True)

    _login(client, "admin@test.com", "AdminPass1!")
    upload = _upload(client, f.id, _jpeg_bytes(), "a.jpg", "image/jpeg").json()
    client.cookies.clear()

    _login(client, "reader@test.com", "MemberPass1!")
    # Read OK
    assert client.get(f"/firearms/{f.id}/photos").status_code == 200
    assert client.get(f"/firearms/{f.id}/photos/{upload['id']}").status_code == 200
    # Write blocked
    assert _upload(client, f.id, _jpeg_bytes(), "b.jpg", "image/jpeg").status_code == 403


# ---------------------------------------------------------------------------
# FirearmRead enrichment + cascade
# ---------------------------------------------------------------------------

def test_firearm_read_includes_photo_count_and_default_url(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    _upload(client, f.id, _jpeg_bytes(), "a.jpg", "image/jpeg")
    _upload(client, f.id, _jpeg_bytes(), "b.jpg", "image/jpeg")

    r = client.get(f"/firearms/{f.id}")
    assert r.status_code == 200
    body = r.json()
    assert body["photo_count"] == 2
    assert body["default_photo_url"] is not None
    assert body["default_photo_thumb_url"] is not None
    assert body["default_photo_thumb_url"].endswith("/thumb")


def test_csv_export_includes_photo_count(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    _upload(client, f.id, _jpeg_bytes(), "a.jpg", "image/jpeg")

    r = client.get("/firearms/export/csv")
    assert r.status_code == 200
    body = r.text
    assert "photo_count" in body.splitlines()[0]


def test_cascade_delete_removes_photo_rows_and_files(
    client: TestClient, db_session: Session, admin_user: User, firearm_mfr, caliber, temp_uploads_path
):
    f = _make_firearm(db_session, admin_user.id, firearm_mfr.id, caliber.id)
    _login(client, "admin@test.com", "AdminPass1!")
    _upload(client, f.id, _jpeg_bytes(), "a.jpg", "image/jpeg")
    _upload(client, f.id, _jpeg_bytes(), "b.jpg", "image/jpeg")
    photo_dir = temp_uploads_path / "firearm_photos" / str(f.id)
    assert photo_dir.exists()

    r = client.delete(f"/firearms/{f.id}")
    assert r.status_code == 204

    rows = db_session.exec(
        select(FirearmPhoto).where(FirearmPhoto.firearm_id == f.id)
    ).all()
    assert rows == []
    assert not photo_dir.exists()


# ---------------------------------------------------------------------------
# Backup zip integration
# ---------------------------------------------------------------------------

def test_backup_zip_helper_creates_archive_with_photos(
    db_session: Session, admin_user: User, firearm_mfr, caliber, tmp_path, temp_uploads_path
):
    """Direct exercise of `_backup_to_zip` — bundles a SQLite file plus
    the photos directory under the expected archive layout."""
    from routers.backup import _backup_to_zip  # noqa: PLC0415

    # Drop a fake "photo" file under the redirected uploads root.
    photos_root = Path(temp_uploads_path) / "firearm_photos" / "1"
    photos_root.mkdir(parents=True)
    (photos_root / "abc.jpg").write_bytes(b"\xff\xd8\xff\xe0fake-jpeg")

    # Need a real on-disk SQLite file for the WAL-safe copy step. Spin up
    # a throwaway DB next to the uploads dir.
    import sqlite3 as _sql  # noqa: PLC0415
    src_db = tmp_path / "live.db"
    con = _sql.connect(str(src_db))
    con.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)")
    con.commit()
    con.close()

    dest = tmp_path / "out.zip"
    _backup_to_zip(src_db, dest)

    assert dest.is_file()
    with zipfile.ZipFile(dest) as zf:
        names = zf.namelist()
    assert "ammoledger.db" in names
    assert any(n.endswith("firearm_photos/1/abc.jpg") for n in names)


def test_zip_restore_rejects_path_traversal(tmp_path):
    """Crafted zip with `../` entries should fail with 400 before extraction."""
    from routers.backup import _restore_zip_impl  # noqa: PLC0415
    from fastapi import HTTPException  # noqa: PLC0415
    import asyncio  # noqa: PLC0415

    bad_zip = tmp_path / "evil.zip"
    with zipfile.ZipFile(bad_zip, "w") as zf:
        zf.writestr("ammoledger.db", b"x" * 200)
        zf.writestr("../etc/passwd", b"root:x:0:0::/root:/bin/sh\n")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(_restore_zip_impl(bad_zip.read_bytes()))
    assert exc_info.value.status_code == 400
    assert "unsafe" in str(exc_info.value.detail).lower()


# ---------------------------------------------------------------------------
# Path-validation unit tests
# ---------------------------------------------------------------------------

from utils.firearm_photos import (  # noqa: E402
    _photo_paths,
    _safe_resolve_under_root,
    _validate_filename,
    _validate_firearm_id,
    delete_firearm_photo_dir,
    read_photo_bytes,
)


# _validate_firearm_id

def test_validate_firearm_id_accepts_positive():
    _validate_firearm_id(1)
    _validate_firearm_id(99999)


def test_validate_firearm_id_accepts_zero():
    _validate_firearm_id(0)


def test_validate_firearm_id_rejects_negative():
    with pytest.raises(ValueError, match="non-negative"):
        _validate_firearm_id(-1)


def test_validate_firearm_id_rejects_string():
    with pytest.raises(ValueError, match="must be int"):
        _validate_firearm_id("42")  # type: ignore[arg-type]


def test_validate_firearm_id_rejects_bool():
    # bool is a subclass of int in Python — make sure we don't accept True/False.
    with pytest.raises(ValueError, match="must be int"):
        _validate_firearm_id(True)  # type: ignore[arg-type]


# _validate_filename

def test_validate_filename_accepts_valid_uuid_jpg():
    _validate_filename("a" * 32 + ".jpg")
    _validate_filename("0123456789abcdef0123456789abcdef.jpg")


def test_validate_filename_accepts_thumb_variant():
    _validate_filename("a" * 32 + "_thumb.jpg")


def test_validate_filename_rejects_path_traversal():
    with pytest.raises(ValueError, match="Invalid photo filename"):
        _validate_filename("../etc/passwd")


def test_validate_filename_rejects_absolute_path():
    with pytest.raises(ValueError, match="Invalid photo filename"):
        _validate_filename("/etc/passwd")


def test_validate_filename_rejects_wrong_extension():
    with pytest.raises(ValueError):
        _validate_filename("a" * 32 + ".png")
    with pytest.raises(ValueError):
        _validate_filename("a" * 32 + ".jpg.exe")


def test_validate_filename_rejects_short_stem():
    with pytest.raises(ValueError):
        _validate_filename("abc.jpg")


def test_validate_filename_rejects_uppercase_hex():
    # The regex is case-sensitive — uuid4().hex returns lowercase
    with pytest.raises(ValueError):
        _validate_filename("A" * 32 + ".jpg")


def test_validate_filename_rejects_null_byte():
    with pytest.raises(ValueError):
        _validate_filename("a" * 32 + ".jpg\x00")


# _photo_paths integration

def test_photo_paths_rejects_invalid_filename():
    with pytest.raises(ValueError):
        _photo_paths(1, "../../../etc/passwd")


def test_photo_paths_rejects_negative_firearm_id():
    with pytest.raises(ValueError):
        _photo_paths(-1, "a" * 32 + ".jpg")


# _safe_resolve_under_root

def test_safe_resolve_under_root_accepts_valid_path(tmp_path, monkeypatch):
    """A path inside the configured root resolves cleanly."""
    monkeypatch.setattr("utils.firearm_photos.UPLOADS_PATH", str(tmp_path))
    photo_root = tmp_path / "firearm_photos"
    photo_root.mkdir()
    candidate = photo_root / "1" / "abc.jpg"
    candidate.parent.mkdir()
    candidate.touch()

    resolved = _safe_resolve_under_root(candidate)
    assert resolved == candidate.resolve()


def test_safe_resolve_under_root_rejects_escape(tmp_path, monkeypatch):
    """A path that resolves outside the root must be rejected."""
    monkeypatch.setattr("utils.firearm_photos.UPLOADS_PATH", str(tmp_path))
    photo_root = tmp_path / "firearm_photos"
    photo_root.mkdir()

    # Construct a path that would escape via ..
    bad = photo_root / ".." / "evil.jpg"
    with pytest.raises(ValueError, match="escapes the firearm_photos root"):
        _safe_resolve_under_root(bad)


def test_safe_resolve_under_root_rejects_symlink_escape(tmp_path, monkeypatch):
    """If the firearm subdir is a symlink pointing outside the root,
    resolution detects it."""
    monkeypatch.setattr("utils.firearm_photos.UPLOADS_PATH", str(tmp_path))
    photo_root = tmp_path / "firearm_photos"
    photo_root.mkdir()

    # Create a target outside the root
    outside = tmp_path / "outside"
    outside.mkdir()

    # Symlink a firearm dir to the outside target
    symlinked = photo_root / "1"
    try:
        symlinked.symlink_to(outside)
    except (OSError, NotImplementedError):
        pytest.skip("Symlinks not supported on this platform")

    with pytest.raises(ValueError, match="escapes the firearm_photos root"):
        _safe_resolve_under_root(symlinked / "anything.jpg")


# read_photo_bytes

def test_read_photo_bytes_rejects_invalid_filename():
    with pytest.raises(ValueError):
        read_photo_bytes(1, "../../../etc/passwd")


# delete_firearm_photo_dir

def test_delete_firearm_photo_dir_skips_symlinked_escape(tmp_path, monkeypatch):
    """If a firearm photo dir is a symlink pointing outside the root,
    delete_firearm_photo_dir refuses and logs."""
    from unittest.mock import patch  # noqa: PLC0415
    monkeypatch.setattr("utils.firearm_photos.UPLOADS_PATH", str(tmp_path))
    photo_root = tmp_path / "firearm_photos"
    photo_root.mkdir()

    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "sentinel.txt").write_text("do not delete me")

    symlinked = photo_root / "1"
    try:
        symlinked.symlink_to(outside)
    except (OSError, NotImplementedError):
        pytest.skip("Symlinks not supported on this platform")

    with patch("utils.firearm_photos.logger") as mock_logger:
        delete_firearm_photo_dir(1)

    # Sentinel should still exist; the helper refused to follow the symlink.
    assert (outside / "sentinel.txt").exists()
    # Verify the refusal was logged at ERROR level.
    mock_logger.error.assert_called_once()
    assert "Refusing to rmtree" in mock_logger.error.call_args[0][0]
