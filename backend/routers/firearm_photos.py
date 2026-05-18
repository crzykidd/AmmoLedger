"""Firearm photo CRUD: upload, list (embedded in firearm read), set-default,
reorder, delete. Bytes served through auth-gated stream endpoints."""
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, update
from sqlmodel import Session, select

from database import get_session
from models import FirearmPhoto, User
from schemas import FirearmPhotoRead, FirearmPhotoReorderRequest
from utils.firearm_photos import (
    delete_photo_files,
    process_and_save_upload,
    read_photo_bytes,
)
from utils.logging import get_logger, log_safe
from utils.rbac import require_auth

# Visibility helpers live next door — share the firearm-side check.
from routers.firearms import _check_write, _get_visible_firearm

logger = get_logger(__name__)

router = APIRouter(prefix="/firearms", tags=["firearm_photos"])

MAX_PHOTOS_PER_FIREARM = 5


def _photo_to_read(photo: FirearmPhoto) -> FirearmPhotoRead:
    base = f"/firearms/{photo.firearm_id}/photos/{photo.id}"
    return FirearmPhotoRead(
        id=photo.id,
        firearm_id=photo.firearm_id,
        original_name=photo.original_name,
        content_type=photo.content_type,
        size_bytes=photo.size_bytes,
        width=photo.width,
        height=photo.height,
        is_default=photo.is_default,
        sort_order=photo.sort_order,
        uploaded_by=photo.uploaded_by,
        uploaded_at=photo.uploaded_at,
        url=base,
        thumb_url=f"{base}/thumb",
    )


@router.get("/{firearm_id}/photos", response_model=list[FirearmPhotoRead])
def list_photos(
    firearm_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    _get_visible_firearm(firearm_id, user, db)
    photos = db.exec(
        select(FirearmPhoto)
        .where(FirearmPhoto.firearm_id == firearm_id)
        .order_by(FirearmPhoto.sort_order, FirearmPhoto.id)
    ).all()
    return [_photo_to_read(p) for p in photos]


@router.post(
    "/{firearm_id}/photos",
    response_model=FirearmPhotoRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_photo(
    firearm_id: int,
    file: UploadFile = File(...),
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    firearm = _get_visible_firearm(firearm_id, user, db)
    _check_write(firearm, user)

    existing_count = db.exec(
        select(func.count())
        .select_from(FirearmPhoto)
        .where(FirearmPhoto.firearm_id == firearm_id)
    ).one() or 0
    if existing_count >= MAX_PHOTOS_PER_FIREARM:
        raise HTTPException(
            status_code=422,
            detail=(
                f"This firearm already has the maximum of "
                f"{MAX_PHOTOS_PER_FIREARM} photos. Delete one before "
                f"uploading another."
            ),
        )

    raw = await file.read()
    try:
        meta = process_and_save_upload(firearm_id, raw, file.content_type or "")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    is_default = (existing_count == 0)
    next_sort = existing_count

    photo = FirearmPhoto(
        firearm_id=firearm_id,
        filename=meta["filename"],
        original_name=file.filename,
        content_type=meta["content_type"],
        size_bytes=meta["size_bytes"],
        width=meta["width"],
        height=meta["height"],
        is_default=is_default,
        sort_order=next_sort,
        uploaded_by=user.id,
        uploaded_at=datetime.utcnow(),
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)

    logger.info(
        "Uploaded firearm photo: firearm_id=%s photo_id=%s",
        log_safe(firearm_id), log_safe(photo.id),
    )
    return _photo_to_read(photo)


@router.get("/{firearm_id}/photos/{photo_id}")
def get_photo_bytes(
    firearm_id: int,
    photo_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    """Stream full-size bytes. Auth required so URLs aren't public."""
    _get_visible_firearm(firearm_id, user, db)
    photo = db.get(FirearmPhoto, photo_id)
    if not photo or photo.firearm_id != firearm_id:
        raise HTTPException(status_code=404, detail="Photo not found")
    try:
        data = read_photo_bytes(firearm_id, photo.filename, thumb=False)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404, detail="Photo file missing on disk"
        ) from None
    except ValueError as exc:
        logger.warning("Photo path validation failed: %s", exc)
        raise HTTPException(status_code=404, detail="Photo not found") from None
    return StreamingResponse(
        iter([data]),
        media_type=photo.content_type,
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.get("/{firearm_id}/photos/{photo_id}/thumb")
def get_photo_thumb_bytes(
    firearm_id: int,
    photo_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    """Stream thumbnail bytes."""
    _get_visible_firearm(firearm_id, user, db)
    photo = db.get(FirearmPhoto, photo_id)
    if not photo or photo.firearm_id != firearm_id:
        raise HTTPException(status_code=404, detail="Photo not found")
    try:
        data = read_photo_bytes(firearm_id, photo.filename, thumb=True)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404, detail="Thumbnail file missing on disk"
        ) from None
    except ValueError as exc:
        logger.warning("Photo path validation failed: %s", exc)
        raise HTTPException(status_code=404, detail="Photo not found") from None
    return StreamingResponse(
        iter([data]),
        media_type=photo.content_type,
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.patch("/{firearm_id}/photos/{photo_id}/default", response_model=FirearmPhotoRead)
def set_default_photo(
    firearm_id: int,
    photo_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    firearm = _get_visible_firearm(firearm_id, user, db)
    _check_write(firearm, user)
    photo = db.get(FirearmPhoto, photo_id)
    if not photo or photo.firearm_id != firearm_id:
        raise HTTPException(status_code=404, detail="Photo not found")

    # Clear current default first to avoid violating the partial unique index.
    db.exec(
        update(FirearmPhoto)
        .where(FirearmPhoto.firearm_id == firearm_id)
        .values(is_default=False)
    )
    db.flush()
    photo.is_default = True
    db.add(photo)
    db.commit()
    db.refresh(photo)
    return _photo_to_read(photo)


@router.post("/{firearm_id}/photos/reorder", response_model=list[FirearmPhotoRead])
def reorder_photos(
    firearm_id: int,
    payload: FirearmPhotoReorderRequest,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    firearm = _get_visible_firearm(firearm_id, user, db)
    _check_write(firearm, user)

    photos = list(
        db.exec(
            select(FirearmPhoto).where(FirearmPhoto.firearm_id == firearm_id)
        ).all()
    )
    valid_ids = {p.id for p in photos}
    payload_ids = {item.photo_id for item in payload.items}
    if payload_ids != valid_ids:
        raise HTTPException(
            status_code=422,
            detail=(
                "Reorder payload must include exactly the photos belonging "
                "to this firearm"
            ),
        )

    by_id = {p.id: p for p in photos}
    for item in payload.items:
        by_id[item.photo_id].sort_order = item.sort_order
    for p in photos:
        db.add(p)
    db.commit()

    photos.sort(key=lambda p: (p.sort_order, p.id))
    return [_photo_to_read(p) for p in photos]


@router.delete(
    "/{firearm_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_photo(
    firearm_id: int,
    photo_id: int,
    user: User = Depends(require_auth),
    db: Session = Depends(get_session),
):
    firearm = _get_visible_firearm(firearm_id, user, db)
    _check_write(firearm, user)
    photo = db.get(FirearmPhoto, photo_id)
    if not photo or photo.firearm_id != firearm_id:
        raise HTTPException(status_code=404, detail="Photo not found")

    was_default = photo.is_default
    try:
        delete_photo_files(firearm_id, photo.filename)
    except ValueError as exc:
        logger.warning("Photo path validation failed on delete: %s", exc)
        raise HTTPException(status_code=404, detail="Photo not found") from None
    db.delete(photo)
    db.flush()

    # If we deleted the default, promote the lowest-sort_order remaining photo.
    if was_default:
        replacement = db.exec(
            select(FirearmPhoto)
            .where(FirearmPhoto.firearm_id == firearm_id)
            .order_by(FirearmPhoto.sort_order, FirearmPhoto.id)
            .limit(1)
        ).first()
        if replacement:
            replacement.is_default = True
            db.add(replacement)

    db.commit()
