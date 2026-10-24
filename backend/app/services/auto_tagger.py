"""
Smart auto-tagging service.

Automatically detects and suggests tags based on media metadata, aspect ratio,
duration, and file path context.
"""

from pathlib import Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Media, MediaTag, Tag

TAG_COLORS = {
    "vertical": "#8b5cf6",
    "widescreen": "#6366f1",
    "short": "#f59e0b",
    "4k": "#f43f5e",
    "hd": "#3b82f6",
    "capture": "#0284c7",
    "gaming": "#10b981",
    "social": "#ec4899",
}


async def auto_tag_media(session: AsyncSession, media: Media):
    """Analyze media attributes and automatically assign smart tags."""
    tags_to_apply: list[str] = []

    name_lower = media.file_name.lower()
    path_lower = media.file_path.lower()

    # 1. Orientation & Aspect Ratio
    if media.width and media.height:
        if media.height > media.width:
            tags_to_apply.append("vertical")
        elif media.width > media.height * 1.5:
            tags_to_apply.append("widescreen")

        if media.width >= 3840 or media.height >= 2160:
            tags_to_apply.append("4k")
        elif media.width >= 1920 or media.height >= 1080:
            tags_to_apply.append("hd")

    # 2. Video Duration
    if media.media_type == "video" and media.duration:
        if media.duration <= 60:
            tags_to_apply.append("short")

    # 3. Content heuristics from filename / folder path
    if any(k in name_lower or k in path_lower for k in ["capture", "screenshot", "screen"]):
        tags_to_apply.append("capture")

    if any(k in name_lower or k in path_lower for k in ["clip", "discord", "game", "replay", "nvidia"]):
        tags_to_apply.append("gaming")

    if any(k in name_lower or k in path_lower for k in ["tiktok", "reel", "shorts", "instagram"]):
        tags_to_apply.append("social")

    if not tags_to_apply:
        return

    # Create/link tags
    for tag_name in tags_to_apply:
        tag = (
            await session.execute(select(Tag).where(Tag.name.ilike(tag_name)))
        ).scalars().first()

        if not tag:
            tag = Tag(name=tag_name, color=TAG_COLORS.get(tag_name, "#8b5cf6"))
            session.add(tag)
            await session.flush()

        # Check if already linked
        existing_link = (
            await session.execute(
                select(MediaTag).where(
                    MediaTag.media_id == media.id, MediaTag.tag_id == tag.id
                )
            )
        ).scalars().first()

        if not existing_link:
            session.add(MediaTag(media_id=media.id, tag_id=tag.id))

    await session.commit()
