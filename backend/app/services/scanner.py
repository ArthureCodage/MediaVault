"""
Media directory scanner.

Walks configured library folders (or settings.MEDIA_DIR) recursively,
indexes new files into the database, removes entries whose files no longer exist,
and generates thumbnails.
"""

import logging
import mimetypes
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from PIL import Image

from app.config import settings
from app.database import async_session
from app.models import LibraryFolder, Media
from app.services.auto_tagger import auto_tag_media
from app.services.thumbnail import generate_thumbnail, get_video_metadata

logger = logging.getLogger(__name__)

# Supported extensions (lower-case)
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"}
VIDEO_EXTENSIONS = {".mp4", ".mkv", ".avi", ".mov", ".webm"}
TEXT_EXTENSIONS = {".txt"}
ALL_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS | TEXT_EXTENSIONS


def _classify(ext: str) -> tuple[str, str]:
    """Return (media_type, mime_type) for a given lowercase extension."""
    if ext in IMAGE_EXTENSIONS:
        mime = mimetypes.types_map.get(ext, "image/jpeg")
        return "image", mime
    if ext in VIDEO_EXTENSIONS:
        mime = mimetypes.types_map.get(ext, "video/mp4")
        return "video", mime
    if ext in TEXT_EXTENSIONS:
        return "text", "text/plain"
    return "unknown", "application/octet-stream"


async def _extract_image_dimensions(file_path: Path) -> tuple[int | None, int | None]:
    """Open an image with Pillow to get its dimensions."""
    import asyncio

    def _dims() -> tuple[int | None, int | None]:
        try:
            with Image.open(file_path) as img:
                return img.width, img.height
        except Exception:
            logger.warning("Could not read image dimensions for %s", file_path)
            return None, None

    return await asyncio.to_thread(_dims)


async def ensure_default_library(session: AsyncSession) -> LibraryFolder:
    """Ensure at least one default library exists in database."""
    result = await session.execute(select(LibraryFolder))
    existing = result.scalars().first()
    if existing:
        return existing

    # Create default library pointing to settings.MEDIA_DIR
    default_lib = LibraryFolder(
        name="Bibliothèque principale",
        path=str(settings.media_path),
        is_enabled=True,
    )
    session.add(default_lib)
    await session.commit()
    await session.refresh(default_lib)
    logger.info("Initialized default library pointing to %s", default_lib.path)
    return default_lib


async def scan_media_directory(folder_id: int | None = None) -> dict:
    """Scan configured library folder(s), index new files, purge stale entries.

    If folder_id is specified, scans only that folder.
    Otherwise, scans all enabled library folders.
    """
    new_files = 0
    removed_entries = 0

    async with async_session() as session:
        # 1. Ensure default library exists
        await ensure_default_library(session)

        # 2. Retrieve folders to scan
        if folder_id is not None:
            stmt = select(LibraryFolder).where(LibraryFolder.id == folder_id)
        else:
            stmt = select(LibraryFolder).where(LibraryFolder.is_enabled == True)

        folders_res = await session.execute(stmt)
        folders = list(folders_res.scalars().all())

        if not folders:
            logger.warning("No active library folders to scan")
            return {"new_files": 0, "removed_entries": 0, "total": 0}

        # 3. Collect files from all target folders
        disk_files: dict[str, tuple[Path, int]] = {}  # resolved_str -> (Path, folder_id)
        for folder in folders:
            f_path = Path(folder.path)
            if not f_path.exists():
                logger.warning("Library folder does not exist: %s", folder.path)
                continue

            try:
                for p in f_path.rglob("*"):
                    if p.is_file() and p.suffix.lower() in ALL_EXTENSIONS:
                        resolved_str = str(p.resolve())
                        disk_files[resolved_str] = (p, folder.id)
            except Exception as e:
                logger.error("Error scanning folder %s: %s", folder.path, e)

            # Update last scanned time
            folder.last_scanned_at = datetime.now(timezone.utc)

        # 4. Check existing media
        if folder_id is not None:
            db_stmt = select(Media).where(Media.folder_id == folder_id)
        else:
            db_stmt = select(Media)

        result = await session.execute(db_stmt)
        all_media: list[Media] = list(result.scalars().all())

        # Remove entries whose files no longer exist on disk
        for media in all_media:
            if media.file_path not in disk_files:
                # Double check disk directly
                if not Path(media.file_path).exists():
                    await session.delete(media)
                    removed_entries += 1

        await session.flush()

        # 5. Index new files
        existing_paths_result = await session.execute(select(Media.file_path))
        existing_paths: set[str] = {row[0] for row in existing_paths_result.all()}

        for path_str, (file_path, f_id) in disk_files.items():
            if path_str in existing_paths:
                # Update folder_id if missing
                continue

            ext = file_path.suffix.lower()
            media_type, mime_type = _classify(ext)

            try:
                stat = file_path.stat()
                file_size = stat.st_size
                file_date = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
            except Exception:
                continue

            width: int | None = None
            height: int | None = None
            duration: float | None = None

            if media_type == "image":
                width, height = await _extract_image_dimensions(file_path)
            elif media_type == "video":
                meta = await get_video_metadata(file_path)
                width = meta.get("width")
                height = meta.get("height")
                duration = meta.get("duration")

            entry = Media(
                folder_id=f_id,
                file_path=path_str,
                file_name=file_path.name,
                media_type=media_type,
                mime_type=mime_type,
                file_size=file_size,
                width=width,
                height=height,
                duration=duration,
                is_favorite=False,
                file_date=file_date,
            )
            session.add(entry)
            await session.flush()

            # Thumbnail
            thumb = await generate_thumbnail(file_path, entry.uuid, media_type)
            if thumb:
                entry.thumbnail_path = thumb

            # Auto tagging
            await auto_tag_media(session, entry)

            new_files += 1

        # Also assign folder_id to existing media items that don't have one
        for folder in folders:
            folder_prefix = str(Path(folder.path).resolve())
            await session.execute(
                update(Media)
                .where(Media.folder_id == None, Media.file_path.startswith(folder_prefix))
                .values(folder_id=folder.id)
            )

        await session.commit()

        # Total count
        total_result = await session.execute(select(Media))
        total = len(total_result.scalars().all())

    logger.info(
        "Scan complete — new: %d, removed: %d, total: %d",
        new_files,
        removed_entries,
        total,
    )
    return {"new_files": new_files, "removed_entries": removed_entries, "total": total}
