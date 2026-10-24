"""
Albums router — Create, manage albums and organize media into collections.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Album, AlbumMedia, Media
from app.schemas import (
    AlbumAddMediaRequest,
    AlbumCreate,
    AlbumOut,
    AlbumUpdate,
    MediaListResponse,
    MediaOut,
)

router = APIRouter(prefix="/api/albums", tags=["albums"])


@router.get("", response_model=list[AlbumOut])
async def list_albums(
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> list[AlbumOut]:
    """List all user-created albums with item counts and cover thumbnail URLs."""
    stmt = (
        select(
            Album,
            func.count(AlbumMedia.media_id).label("media_count"),
        )
        .outerjoin(AlbumMedia, Album.id == AlbumMedia.album_id)
        .group_by(Album.id)
        .order_by(Album.updated_at.desc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    output = []
    for album, count in rows:
        cover_url = None
        # If no explicit cover set, use the first media item in album
        cover_uuid = album.cover_media_uuid
        if not cover_uuid and count > 0:
            first_media_stmt = (
                select(Media.uuid)
                .join(AlbumMedia, Media.id == AlbumMedia.media_id)
                .where(AlbumMedia.album_id == album.id)
                .order_by(AlbumMedia.sort_order.asc(), AlbumMedia.added_at.desc())
                .limit(1)
            )
            cover_uuid = (await db.execute(first_media_stmt)).scalar()

        if cover_uuid:
            cover_url = f"/api/media/{cover_uuid}/thumbnail"

        output.append(
            AlbumOut(
                id=album.id,
                name=album.name,
                description=album.description,
                cover_media_uuid=cover_uuid,
                cover_thumbnail_url=cover_url,
                media_count=count,
                created_at=album.created_at,
                updated_at=album.updated_at,
            )
        )

    return output


@router.post("", response_model=AlbumOut, status_code=status.HTTP_201_CREATED)
async def create_album(
    payload: AlbumCreate,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> AlbumOut:
    """Create a new album."""
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Album name cannot be empty")

    album = Album(
        name=name,
        description=payload.description.strip() if payload.description else None,
        cover_media_uuid=payload.cover_media_uuid,
    )
    db.add(album)
    await db.commit()
    await db.refresh(album)

    cover_url = (
        f"/api/media/{album.cover_media_uuid}/thumbnail"
        if album.cover_media_uuid
        else None
    )

    return AlbumOut(
        id=album.id,
        name=album.name,
        description=album.description,
        cover_media_uuid=album.cover_media_uuid,
        cover_thumbnail_url=cover_url,
        media_count=0,
        created_at=album.created_at,
        updated_at=album.updated_at,
    )


@router.get("/{album_id}", response_model=AlbumOut)
async def get_album(
    album_id: int,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> AlbumOut:
    """Get album metadata."""
    album = (await db.execute(select(Album).where(Album.id == album_id))).scalars().first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    count_stmt = select(func.count(AlbumMedia.media_id)).where(AlbumMedia.album_id == album.id)
    count = (await db.execute(count_stmt)).scalar() or 0

    cover_uuid = album.cover_media_uuid
    if not cover_uuid and count > 0:
        first_media_stmt = (
            select(Media.uuid)
            .join(AlbumMedia, Media.id == AlbumMedia.media_id)
            .where(AlbumMedia.album_id == album.id)
            .order_by(AlbumMedia.sort_order.asc(), AlbumMedia.added_at.desc())
            .limit(1)
        )
        cover_uuid = (await db.execute(first_media_stmt)).scalar()

    cover_url = f"/api/media/{cover_uuid}/thumbnail" if cover_uuid else None

    return AlbumOut(
        id=album.id,
        name=album.name,
        description=album.description,
        cover_media_uuid=cover_uuid,
        cover_thumbnail_url=cover_url,
        media_count=count,
        created_at=album.created_at,
        updated_at=album.updated_at,
    )


@router.patch("/{album_id}", response_model=AlbumOut)
async def update_album(
    album_id: int,
    payload: AlbumUpdate,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> AlbumOut:
    """Update album details."""
    album = (await db.execute(select(Album).where(Album.id == album_id))).scalars().first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    if payload.name is not None and payload.name.strip():
        album.name = payload.name.strip()
    if payload.description is not None:
        album.description = payload.description.strip() or None
    if payload.cover_media_uuid is not None:
        album.cover_media_uuid = payload.cover_media_uuid or None

    await db.commit()
    await db.refresh(album)

    count_stmt = select(func.count(AlbumMedia.media_id)).where(AlbumMedia.album_id == album.id)
    count = (await db.execute(count_stmt)).scalar() or 0
    cover_url = (
        f"/api/media/{album.cover_media_uuid}/thumbnail"
        if album.cover_media_uuid
        else None
    )

    return AlbumOut(
        id=album.id,
        name=album.name,
        description=album.description,
        cover_media_uuid=album.cover_media_uuid,
        cover_thumbnail_url=cover_url,
        media_count=count,
        created_at=album.created_at,
        updated_at=album.updated_at,
    )


@router.delete("/{album_id}", status_code=status.HTTP_200_OK)
async def delete_album(
    album_id: int,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> dict:
    """Delete an album (does not delete media files)."""
    album = (await db.execute(select(Album).where(Album.id == album_id))).scalars().first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    # Remove media associations
    assoc = (await db.execute(select(AlbumMedia).where(AlbumMedia.album_id == album_id))).scalars().all()
    for a in assoc:
        await db.delete(a)

    await db.delete(album)
    await db.commit()
    return {"ok": True, "message": f"Album '{album.name}' deleted"}


@router.post("/{album_id}/media", status_code=status.HTTP_200_OK)
async def add_media_to_album(
    album_id: int,
    payload: AlbumAddMediaRequest,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> dict:
    """Add one or more media items to an album."""
    album = (await db.execute(select(Album).where(Album.id == album_id))).scalars().first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")

    added_count = 0
    for uuid in payload.media_uuids:
        media = (await db.execute(select(Media).where(Media.uuid == uuid))).scalars().first()
        if not media:
            continue

        existing = (
            await db.execute(
                select(AlbumMedia).where(
                    AlbumMedia.album_id == album.id, AlbumMedia.media_id == media.id
                )
            )
        ).scalars().first()

        if not existing:
            db.add(AlbumMedia(album_id=album.id, media_id=media.id))
            added_count += 1

    await db.commit()
    return {"ok": True, "added_count": added_count}


@router.delete("/{album_id}/media/{uuid}", status_code=status.HTTP_200_OK)
async def remove_media_from_album(
    album_id: int,
    uuid: str,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> dict:
    """Remove a media item from an album."""
    media = (await db.execute(select(Media).where(Media.uuid == uuid))).scalars().first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    link = (
        await db.execute(
            select(AlbumMedia).where(
                AlbumMedia.album_id == album_id, AlbumMedia.media_id == media.id
            )
        )
    ).scalars().first()

    if link:
        await db.delete(link)
        await db.commit()

    return {"ok": True, "message": "Media removed from album"}
