"""
Tags router — Create, list, delete, and attach/detach tags to media.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Media, MediaTag, Tag
from app.schemas import MediaAttachTagRequest, TagCreate, TagOut

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.get("", response_model=list[TagOut])
async def list_tags(
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> list[TagOut]:
    """List all tags with their media usage count."""
    stmt = (
        select(
            Tag,
            func.count(MediaTag.media_id).label("media_count"),
        )
        .outerjoin(MediaTag, Tag.id == MediaTag.tag_id)
        .group_by(Tag.id)
        .order_by(Tag.name.asc())
    )
    result = await db.execute(stmt)
    rows = result.all()

    return [
        TagOut(
            id=tag.id,
            name=tag.name,
            color=tag.color,
            media_count=count,
            created_at=tag.created_at,
        )
        for tag, count in rows
    ]


@router.post("", response_model=TagOut, status_code=status.HTTP_201_CREATED)
async def create_tag(
    payload: TagCreate,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> TagOut:
    """Create a new tag."""
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tag name cannot be empty")

    existing = (await db.execute(select(Tag).where(Tag.name.ilike(name)))).scalars().first()
    if existing:
        return TagOut(
            id=existing.id,
            name=existing.name,
            color=existing.color,
            media_count=0,
            created_at=existing.created_at,
        )

    tag = Tag(name=name, color=payload.color)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)

    return TagOut(
        id=tag.id,
        name=tag.name,
        color=tag.color,
        media_count=0,
        created_at=tag.created_at,
    )


@router.delete("/{tag_id}", status_code=status.HTTP_200_OK)
async def delete_tag(
    tag_id: int,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> dict:
    """Delete a tag and detach it from all media."""
    tag = (await db.execute(select(Tag).where(Tag.id == tag_id))).scalars().first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")

    # Remove associations
    assoc = (await db.execute(select(MediaTag).where(MediaTag.tag_id == tag_id))).scalars().all()
    for a in assoc:
        await db.delete(a)

    await db.delete(tag)
    await db.commit()
    return {"ok": True, "message": f"Tag '{tag.name}' deleted"}


# Media tag association endpoints
media_tags_router = APIRouter(prefix="/api/media/{uuid}/tags", tags=["media-tags"])


@media_tags_router.get("", response_model=list[TagOut])
async def get_media_tags(
    uuid: str,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> list[TagOut]:
    """Get all tags attached to a specific media item."""
    media = (await db.execute(select(Media).where(Media.uuid == uuid))).scalars().first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    stmt = (
        select(Tag)
        .join(MediaTag, Tag.id == MediaTag.tag_id)
        .where(MediaTag.media_id == media.id)
        .order_by(Tag.name.asc())
    )
    tags = (await db.execute(stmt)).scalars().all()

    return [
        TagOut(
            id=t.id,
            name=t.name,
            color=t.color,
            media_count=0,
            created_at=t.created_at,
        )
        for t in tags
    ]


@media_tags_router.post("", response_model=TagOut, status_code=status.HTTP_201_CREATED)
async def attach_tag(
    uuid: str,
    payload: MediaAttachTagRequest,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> TagOut:
    """Attach a tag to a media item (creates the tag if given a name that doesn't exist)."""
    media = (await db.execute(select(Media).where(Media.uuid == uuid))).scalars().first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    tag: Tag | None = None
    if payload.tag_id:
        tag = (await db.execute(select(Tag).where(Tag.id == payload.tag_id))).scalars().first()

    if not tag and payload.name and payload.name.strip():
        name = payload.name.strip()
        existing = (await db.execute(select(Tag).where(Tag.name.ilike(name)))).scalars().first()
        if existing:
            tag = existing
        else:
            tag = Tag(name=name, color=payload.color or "#8b5cf6")
            db.add(tag)
            await db.commit()
            await db.refresh(tag)

    if not tag:
        raise HTTPException(status_code=400, detail="Provide a valid tag_id or tag name")

    # Check if already attached
    existing_link = (
        await db.execute(
            select(MediaTag).where(MediaTag.media_id == media.id, MediaTag.tag_id == tag.id)
        )
    ).scalars().first()

    if not existing_link:
        db.add(MediaTag(media_id=media.id, tag_id=tag.id))
        await db.commit()

    return TagOut(
        id=tag.id,
        name=tag.name,
        color=tag.color,
        media_count=0,
        created_at=tag.created_at,
    )


@media_tags_router.delete("/{tag_id}", status_code=status.HTTP_200_OK)
async def detach_tag(
    uuid: str,
    tag_id: int,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> dict:
    """Detach a tag from a media item."""
    media = (await db.execute(select(Media).where(Media.uuid == uuid))).scalars().first()
    if not media:
        raise HTTPException(status_code=404, detail="Media not found")

    link = (
        await db.execute(
            select(MediaTag).where(MediaTag.media_id == media.id, MediaTag.tag_id == tag_id)
        )
    ).scalars().first()

    if link:
        await db.delete(link)
        await db.commit()

    return {"ok": True, "message": "Tag detached"}
