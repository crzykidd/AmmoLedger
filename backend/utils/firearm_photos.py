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


def _firearm_dir(firearm_id: int) -> Path:
    return Path(UPLOADS_PATH) / "firearm_photos" / str(firearm_id)


def _photo_paths(firearm_id: int, filename: str) -> tuple[Path, Path]:
    """Returns (full_path, thumb_path)."""
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
    out_dir.mkdir(parents=True, exist_ok=True)

    photo_id = uuid.uuid4().hex
    filename = f"{photo_id}.jpg"
    full_path, thumb_path = _photo_paths(firearm_id, filename)

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
            p.unlink()
        except FileNotFoundError:
            pass
        except OSError as exc:
            logger.warning("Could not delete %s: %s", p, exc)


def delete_firearm_photo_dir(firearm_id: int) -> None:
    """Remove the entire per-firearm directory. Used on firearm deletion."""
    d = _firearm_dir(firearm_id)
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)


def read_photo_bytes(firearm_id: int, filename: str, thumb: bool = False) -> bytes:
    """Read full or thumb. Raises FileNotFoundError if missing."""
    full_path, thumb_path = _photo_paths(firearm_id, filename)
    path = thumb_path if thumb else full_path
    return path.read_bytes()
