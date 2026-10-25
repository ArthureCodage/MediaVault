"""
Shared helpers for removing media cleanly.

The association tables (media_tags, album_media) have no foreign keys, so a
media row must never be deleted on its own: its links and thumbnail go with it.
Otherwise SQLite can reuse the freed id and a new file inherits old tags/albums.
"""

import logging
from pathlib import Path

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Album, AlbumMedia, Media, MediaTag

logger = logging.getLogger(__name__)


async def purge_media(session: AsyncSession, media: Media) -> None:
    """Delete a media row together with its tag/album links and thumbnail."""
    await session.execute(delete(MediaTag).where(MediaTag.media_id == media.id))
    await session.execute(delete(AlbumMedia).where(AlbumMedia.media_id == media.id))
    await session.execute(
        update(Album).where(Album.cover_media_uuid == media.uuid).values(cover_media_uuid=None)
    )
    if media.thumbnail_path:
        try:
            Path(media.thumbnail_path).unlink(missing_ok=True)
        except OSError:
            logger.warning("Could not remove thumbnail %s", media.thumbnail_path)
    await session.delete(media)


async def cleanup_orphan_links(session: AsyncSession) -> int:
    """Remove tag/album links pointing to media that no longer exist."""
    media_ids = select(Media.id)
    r1 = await session.execute(delete(MediaTag).where(MediaTag.media_id.not_in(media_ids)))
    r2 = await session.execute(delete(AlbumMedia).where(AlbumMedia.media_id.not_in(media_ids)))
    return (r1.rowcount or 0) + (r2.rowcount or 0)
