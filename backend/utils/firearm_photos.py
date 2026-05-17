"""Filesystem and image-processing helpers for firearm photos.

Storage layout:
  ${UPLOADS_PATH}/firearm_photos/<firearm_id>/
    <photo_uuid>.jpg            (resized full)
    <photo_uuid>_thumb.jpg      (256px thumbnail)

Filenames are server-generated UUIDs with a forced .jpg extension regardless
of source format — Pillow normalizes everything to JPEG q85 on resize. This
sidesteps PNG transparency questions, WebP browser-compat questions, and
ensures one consistent code path for serving.
"""
import io
import re
import shutil
import uuid
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from utils.config import UPLOADS_PATH
from utils.logging import get_logger

logger = get_logger(__name__)

MAX_DIMENSION = 2048             # longest side after resize
THUMB_DIMENSION = 256
JPEG_QUALITY = 85
MAX_UPLOAD_BYTES = 10 * 1024 * 1024   # 10 MB
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
HEIC_HINT_TYPES = {"image/heic", "image/heif"}

# Strict filename whitelist matching what process_and_save_upload generates.
# 32 hex chars (uuid4().hex), optional _thumb suffix, .jpg extension.
# Examples that match:   "a1b2c3...d4e5.jpg"   "a1b2c3...d4e5_thumb.jpg"
# Examples that don't:   "../etc/passwd"        "photo.png"   "a1b2.jpg"
_FILENAME_PATTERN = re.compile(r"^[0-9a-f]{32}(_thumb)?\.jpg$")


def _validate_firearm_id(firearm_id: int) -> None:
    """Sanity-check the firearm id. FastAPI's int typing handles type
    enforcement at the route boundary, but the helpers should be safe
    to call from anywhere — including future code paths that don't go
    through FastAPI."""
    if not isinstance(firearm_id, int) or isinstance(firearm_id, bool):
        raise ValueError(f"firearm_id must be int, got {type(firearm_id).__name__}")
    if firearm_id < 0:
        raise ValueError(f"firearm_id must be non-negative, got {firearm_id}")


def _validate_filename(filename: str) -> None:
    """Reject anything that isn't a UUID-hex JPEG we ourselves generated.
    Closes path-traversal attempts via the filename field."""
    if not isinstance(filename, str) or not _FILENAME_PATTERN.match(filename):
        raise ValueError(f"Invalid photo filename: {filename!r}")


def _photo_root() -> Path:
    """The base directory all firearm-photo paths must live inside."""
    return (Path(UPLOADS_PATH) / "firearm_photos").resolve()


def _safe_resolve_under_root(candidate: Path) -> Path:
    """Resolve a candidate path and confirm it stays under _photo_root().
    Returns the resolved path. Raises ValueError on escape (symlink,
    .., absolute outside, etc.).

    This is the path-containment guard — even if validation earlier in
    the chain missed something, this catches the escape before any
    filesystem operation."""
    root = _photo_root()
    try:
        resolved = candidate.resolve()
    except (OSError, RuntimeError) as exc:
        raise ValueError(f"Could not resolve path {candidate}: {exc}") from exc

    # Path.is_relative_to is 3.9+; the project targets 3.12 so this is fine.
    if not resolved.is_relative_to(root):
        raise ValueError(
            f"Path {resolved} escapes the firearm_photos root {root}"
        )
    return resolved


def _firearm_dir(firearm_id: int) -> Path:
    _validate_firearm_id(firearm_id)
    return Path(UPLOADS_PATH) / "firearm_photos" / str(firearm_id)


def _photo_paths(firearm_id: int, filename: str) -> tuple[Path, Path]:
    """Returns (full_path, thumb_path). Validates both inputs."""
    _validate_firearm_id(firearm_id)
    _validate_filename(filename)
    base = _firearm_dir(firearm_id) / filename
    stem = base.stem
    thumb = base.parent / f"{stem}_thumb{base.suffix}"
    return base, thumb


def process_and_save_upload(
    firearm_id: int,
    raw_bytes: bytes,
    content_type: str,
) -> dict:
    """Resize, write full + thumb, return metadata.

    Returns: {filename, content_type, size_bytes, width, height}
    Raises: ValueError on validation failure.
    """
    if content_type in HEIC_HINT_TYPES:
        raise ValueError(
            "HEIC/HEIF images are not supported. Export as JPEG from your "
            "phone's photo app and try again."
        )
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValueError(
            f"Unsupported file type '{content_type}'. Use JPEG, PNG, or WebP."
        )
    if len(raw_bytes) > MAX_UPLOAD_BYTES:
        raise ValueError(
            f"File is too large ({len(raw_bytes) // (1024 * 1024)} MB). "
            f"Max upload size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
        )

    try:
        probe = Image.open(io.BytesIO(raw_bytes))
        probe.verify()  # detect corruption
        img = Image.open(io.BytesIO(raw_bytes))   # reopen after verify
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError(f"Could not read image: {exc}") from exc

    # Honor EXIF orientation so portrait phone photos land upright.
    img = ImageOps.exif_transpose(img)

    # Convert to RGB (handles RGBA PNG, palette images, etc.).
    if img.mode != "RGB":
        img = img.convert("RGB")

    # Resize if needed (longest side ≤ MAX_DIMENSION).
    img.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.LANCZOS)

    out_dir = _firearm_dir(firearm_id)
    # Defense-in-depth: even though _firearm_dir builds the path from a
    # validated int firearm_id, run the containment check so a future
    # regression can't escape the photos root.
    #
    # Parent must exist for .resolve() to do realpath substitution on
    # symlinked components. If the dir doesn't exist yet, resolve the
    # parent and re-add the leaf.
    if out_dir.exists():
        _safe_resolve_under_root(out_dir)
    else:
        parent_resolved = (
            _safe_resolve_under_root(out_dir.parent)
            if out_dir.parent.exists()
            else _photo_root()
        )
        if not (parent_resolved / out_dir.name).resolve().parent.is_relative_to(_photo_root()):
            raise ValueError(f"out_dir {out_dir} would escape photos root")
    out_dir.mkdir(parents=True, exist_ok=True)

    photo_id = uuid.uuid4().hex
    filename = f"{photo_id}.jpg"
    full_path, thumb_path = _photo_paths(firearm_id, filename)

    # Final containment check on the actual write targets.
    _safe_resolve_under_root(full_path.parent)
    _safe_resolve_under_root(thumb_path.parent)

    img.save(str(full_path), "JPEG", quality=JPEG_QUALITY, optimize=True)
    width, height = img.size

    thumb = img.copy()
    thumb.thumbnail((THUMB_DIMENSION, THUMB_DIMENSION), Image.LANCZOS)
    thumb.save(str(thumb_path), "JPEG", quality=JPEG_QUALITY, optimize=True)

    size_bytes = full_path.stat().st_size
    logger.info(
        "Saved firearm photo: firearm_id=%d filename=%s %dx%d %d bytes",
        firearm_id, filename, width, height, size_bytes,
    )

    return {
        "filename": filename,
        "content_type": "image/jpeg",
        "size_bytes": size_bytes,
        "width": width,
        "height": height,
    }


def delete_photo_files(firearm_id: int, filename: str) -> None:
    """Remove full + thumb. Idempotent."""
    full_path, thumb_path = _photo_paths(firearm_id, filename)
    for p in (full_path, thumb_path):
        try:
            # Containment check: file might not exist yet (idempotent path),
            # so only resolve if it does. If it doesn't, the unlink will
            # FileNotFoundError-out cleanly.
            if p.exists():
                _safe_resolve_under_root(p)
            p.unlink()
        except FileNotFoundError:
            pass
        except ValueError as exc:
            # Path escape — refuse to delete and log loudly.
            logger.error("Refusing to delete suspicious path %s: %s", p, exc)
        except OSError as exc:
            logger.warning("Could not delete %s: %s", p, exc)


def delete_firearm_photo_dir(firearm_id: int) -> None:
    """Remove the entire per-firearm directory. Used on firearm deletion."""
    d = _firearm_dir(firearm_id)
    if d.exists():
        # Containment check before rmtree. If this fails it's a bug or
        # an attack; either way, refuse and log.
        try:
            safe_d = _safe_resolve_under_root(d)
        except ValueError as exc:
            logger.error(
                "Refusing to rmtree suspicious firearm photo dir %s: %s",
                d, exc,
            )
            return
        shutil.rmtree(safe_d, ignore_errors=True)


def read_photo_bytes(firearm_id: int, filename: str, thumb: bool = False) -> bytes:
    """Read full or thumb. Raises FileNotFoundError if missing,
    ValueError if path validation fails."""
    full_path, thumb_path = _photo_paths(firearm_id, filename)
    path = thumb_path if thumb else full_path
    # Containment check before read. _photo_paths already validated the
    # filename regex; this is the second line of defense.
    _safe_resolve_under_root(path)
    return path.read_bytes()
