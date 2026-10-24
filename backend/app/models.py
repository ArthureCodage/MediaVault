"""
SQLAlchemy ORM models for MediaVault.
"""

import uuid as _uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_uuid() -> str:
    return str(_uuid.uuid4())


class LibraryFolder(Base):
    """Represents a configured root directory/library (Plex/Jellyfin style)."""

    __tablename__ = "library_folders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    path: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    last_scanned_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def __repr__(self) -> str:
        return f"<LibraryFolder {self.id} — {self.name} ({self.path})>"


class Media(Base):
    """Represents a single indexed media file."""

    __tablename__ = "media"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    uuid: Mapped[str] = mapped_column(String, unique=True, index=True, default=_new_uuid)
    folder_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    file_path: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    file_name: Mapped[str] = mapped_column(String, nullable=False)
    media_type: Mapped[str] = mapped_column(String, nullable=False)          # "image" | "video" | "text"
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)     # seconds, videos only
    thumbnail_path: Mapped[str | None] = mapped_column(String, nullable=True)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    file_date: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)

    def __repr__(self) -> str:
        return f"<Media {self.uuid} — {self.file_name}>"


class Tag(Base):
    """User-defined or auto-generated tag."""

    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    color: Mapped[str] = mapped_column(String, default="#8b5cf6", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)


class MediaTag(Base):
    """Association table between Media and Tag."""

    __tablename__ = "media_tags"

    media_id: Mapped[int] = mapped_column(Integer, index=True, primary_key=True)
    tag_id: Mapped[int] = mapped_column(Integer, index=True, primary_key=True)


class Album(Base):
    """User-created manual album or collection."""

    __tablename__ = "albums"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    cover_media_uuid: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow, onupdate=_utcnow)


class AlbumMedia(Base):
    """Association table between Album and Media."""

    __tablename__ = "album_media"

    album_id: Mapped[int] = mapped_column(Integer, index=True, primary_key=True)
    media_id: Mapped[int] = mapped_column(Integer, index=True, primary_key=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utcnow)
