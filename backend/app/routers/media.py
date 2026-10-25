"""
Media router — CRUD, streaming, scanning, favorites, upload.
"""

import math
import shutil
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import AlbumMedia, LibraryFolder, Media, MediaTag, Tag
from app.schemas import (
    DeleteResponse,
    FavoriteResponse,
    MediaListResponse,
    MediaOut,
    ScanResponse,
    TagOut,
)
from app.services.scanner import scan_media_directory, _classify, ALL_EXTENSIONS
from app.services.auto_tagger import auto_tag_media
from app.services.media_ops import purge_media
from app.services.notifier import manager
from app.services.thumbnail import generate_thumbnail, get_video_metadata

router = APIRouter(prefix="/api/media", tags=["media"])


# ───────────────────────── helpers ────────────────────────────

def _media_to_out(m: Media, tags: list[TagOut] | None = None) -> MediaOut:
    """Convert an ORM Media instance to the API response schema."""
    return MediaOut(
        uuid=m.uuid,
        folder_id=m.folder_id,
        file_name=m.file_name,
        media_type=m.media_type,
        mime_type=m.mime_type,
        file_size=m.file_size,
        width=m.width,
        height=m.height,
        duration=m.duration,
        is_favorite=m.is_favorite,
        thumbnail_url=f"/api/media/{m.uuid}/thumbnail" if m.thumbnail_path else None,
        file_url=f"/api/media/{m.uuid}/file",
        file_date=m.file_date,
        created_at=m.created_at,
        tags=tags or [],
    )


SORT_MAP = {
    "date_desc": Media.file_date.desc(),
    "date_asc": Media.file_date.asc(),
    "name_asc": Media.file_name.asc(),
    "name_desc": Media.file_name.desc(),
    "size_desc": Media.file_size.desc(),
    "size_asc": Media.file_size.asc(),
}


# ──────────────────────── endpoints ───────────────────────────

@router.get("", response_model=MediaListResponse)
async def list_media(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    type: str | None = Query(None, alias="type"),
    folder_id: int | None = Query(None),
    tag_id: int | None = Query(None),
    album_id: int | None = Query(None),
    sort: str = Query("date_desc", description="date_desc, date_asc, name_*, size_* or random"),
    seed: int = Query(0, description="Shuffle seed for sort=random (same seed = same order across pages)"),
    orientation: str | None = Query(None, pattern="^(portrait|landscape)$"),
    favorite: bool | None = Query(None),
    q: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> MediaListResponse:
    """Return a paginated, filterable, sortable list of media items."""
    stmt = select(Media)

    # Filters
    if album_id is not None:
        stmt = stmt.join(AlbumMedia, Media.id == AlbumMedia.media_id).where(AlbumMedia.album_id == album_id)
    if tag_id is not None:
        stmt = stmt.join(MediaTag, Media.id == MediaTag.media_id).where(MediaTag.tag_id == tag_id)
    if folder_id is not None:
        stmt = stmt.where(Media.folder_id == folder_id)
    if type:
        types = [t.strip() for t in type.split(",") if t.strip()]
        stmt = stmt.where(Media.media_type.in_(types))
    if orientation == "portrait":
        stmt = stmt.where(Media.width.is_not(None), Media.height > Media.width)
    elif orientation == "landscape":
        stmt = stmt.where(Media.width.is_not(None), Media.width >= Media.height)
    if favorite is not None:
        stmt = stmt.where(Media.is_favorite == favorite)
    if q:
        stmt = stmt.where(Media.file_name.ilike(f"%{q}%"))

    # Total count (before pagination)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    # Sorting
    if sort == "random":
        # Deterministic shuffle: a cheap hash of the id mixed with the seed keeps
        # pagination stable (no duplicates/missing items between pages).
        mixed = (Media.id * 2654435761 + (seed % 2147483647) * 40503) % 4294967291
        stmt = stmt.order_by(mixed, Media.id)
    else:
        stmt = stmt.order_by(SORT_MAP.get(sort, Media.file_date.desc()), Media.id)

    # Pagination
    offset = (page - 1) * per_page
    stmt = stmt.offset(offset).limit(per_page)

    result = await db.execute(stmt)
    items = [_media_to_out(m) for m in result.scalars().all()]
    pages = max(1, math.ceil(total / per_page))

    return MediaListResponse(items=items, total=total, page=page, per_page=per_page, pages=pages)


@router.get("/{uuid}", response_model=MediaOut)
async def get_media(
    uuid: str,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> MediaOut:
    """Return details for a single media item including its tags."""
    media = await _get_or_404(db, uuid)
    # Fetch tags
    tag_stmt = (
        select(Tag)
        .join(MediaTag, Tag.id == MediaTag.tag_id)
        .where(MediaTag.media_id == media.id)
        .order_by(Tag.name.asc())
    )
    tags_res = await db.execute(tag_stmt)
    tags = [
        TagOut(
            id=t.id,
            name=t.name,
            color=t.color,
            media_count=0,
            created_at=t.created_at,
        )
        for t in tags_res.scalars().all()
    ]
    return _media_to_out(media, tags=tags)


@router.api_route("/{uuid}/file", methods=["GET", "HEAD"])
async def serve_file(
    uuid: str,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> FileResponse:
    """Stream the original media file with full HTTP Range & HEAD support."""
    media = await _get_or_404(db, uuid)
    path = Path(media.file_path)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")
    return FileResponse(
        path=str(path),
        media_type=media.mime_type,
        filename=media.file_name,
    )


@router.api_route("/{uuid}/thumbnail", methods=["GET", "HEAD"])
async def serve_thumbnail(
    uuid: str,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> FileResponse:
    """Serve the generated thumbnail image."""
    media = await _get_or_404(db, uuid)
    if not media.thumbnail_path or not Path(media.thumbnail_path).exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thumbnail not available")
    return FileResponse(path=media.thumbnail_path, media_type="image/jpeg")


@router.patch("/{uuid}/favorite", response_model=FavoriteResponse)
async def toggle_favorite(
    uuid: str,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> FavoriteResponse:
    """Toggle the favorite flag on a media item."""
    media = await _get_or_404(db, uuid)
    media.is_favorite = not media.is_favorite
    media.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return FavoriteResponse(uuid=media.uuid, is_favorite=media.is_favorite)


@router.post("/upload", response_model=MediaOut, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> MediaOut:
    """Upload a file, save it to MEDIA_DIR, index it, and generate a thumbnail."""
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No filename provided")

    # Keep only the base name: "../../evil.jpg" or "C:\x\y.jpg" must not escape MEDIA_DIR
    safe_name = Path(file.filename.replace("\\", "/")).name.strip()
    if not safe_name or safe_name.startswith("."):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filename")

    ext = Path(safe_name).suffix.lower()
    if ext not in ALL_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file extension: {ext}",
        )

    dest = settings.media_path / safe_name
    # Avoid overwriting existing files — append a counter
    stem = Path(safe_name).stem
    counter = 1
    while dest.exists():
        dest = settings.media_path / f"{stem}_{counter}{ext}"
        counter += 1

    # Save to disk
    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            f.write(chunk)

    media_type, mime_type = _classify(ext)
    stat = dest.stat()

    width: int | None = None
    height: int | None = None
    duration: float | None = None

    if media_type == "image":
        from app.services.scanner import _extract_image_dimensions
        width, height = await _extract_image_dimensions(dest)
    elif media_type == "video":
        meta = await get_video_metadata(dest)
        width = meta.get("width")
        height = meta.get("height")
        duration = meta.get("duration")

    library = (
        await db.execute(select(LibraryFolder).where(LibraryFolder.path == str(settings.media_path)))
    ).scalars().first()

    entry = Media(
        folder_id=library.id if library else None,
        file_path=str(dest.resolve()),
        file_name=dest.name,
        media_type=media_type,
        mime_type=mime_type,
        file_size=stat.st_size,
        width=width,
        height=height,
        duration=duration,
        is_favorite=False,
        file_date=datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc),
    )
    db.add(entry)
    await db.flush()

    thumb = await generate_thumbnail(dest, entry.uuid, media_type)
    if thumb:
        entry.thumbnail_path = thumb

    await db.flush()
    await auto_tag_media(db, entry)
    await manager.broadcast(
        "MEDIA_ADDED",
        {"uuid": entry.uuid, "file_name": entry.file_name, "media_type": entry.media_type, "folder_id": entry.folder_id},
    )
    return _media_to_out(entry)


@router.delete("/{uuid}", response_model=DeleteResponse)
async def delete_media(
    uuid: str,
    delete_file: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> DeleteResponse:
    """Delete a media entry from the database and optionally from disk."""
    media = await _get_or_404(db, uuid)
    file_deleted = False

    if delete_file:
        path = Path(media.file_path)
        if path.exists():
            path.unlink()
            file_deleted = True

    await purge_media(db, media)
    await db.flush()
    await manager.broadcast("MEDIA_DELETED", {"uuid": uuid})
    return DeleteResponse(uuid=uuid, deleted=True, file_deleted=file_deleted)


@router.post("/scan", response_model=ScanResponse)
async def scan(
    background_tasks: BackgroundTasks,
    _user: str = Depends(get_current_user),
) -> ScanResponse:
    """Trigger a full rescan of MEDIA_DIR (runs synchronously for the result)."""
    result = await scan_media_directory()
    return ScanResponse(**result)


# ─────────────────── internal helpers ─────────────────────────

async def _get_or_404(db: AsyncSession, uuid: str) -> Media:
    """Fetch a Media row by UUID or raise 404."""
    stmt = select(Media).where(Media.uuid == uuid)
    result = await db.execute(stmt)
    media = result.scalar_one_or_none()
    if media is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media not found")
    return media
