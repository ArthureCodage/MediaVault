"""
Pydantic schemas (request bodies & response models) for MediaVault.
"""

from datetime import datetime
from pydantic import BaseModel, Field


# ──────────────────────────── Auth ────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserInfo(BaseModel):
    username: str


# ──────────────────────────── Tags ────────────────────────────

class TagCreate(BaseModel):
    name: str
    color: str = "#8b5cf6"


class TagOut(BaseModel):
    id: int
    name: str
    color: str
    media_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class MediaAttachTagRequest(BaseModel):
    tag_id: int | None = None
    name: str | None = None
    color: str | None = None


# ──────────────────────────── Media ───────────────────────────

class MediaOut(BaseModel):
    """Single media item returned to the client."""
    uuid: str
    folder_id: int | None = None
    file_name: str
    media_type: str
    mime_type: str
    file_size: int
    width: int | None = None
    height: int | None = None
    duration: float | None = None
    is_favorite: bool = False
    thumbnail_url: str | None = None
    file_url: str | None = None
    file_date: datetime
    created_at: datetime
    tags: list[TagOut] = []

    model_config = {"from_attributes": True}


# ──────────────────────────── Libraries ────────────────────────

class LibraryFolderCreate(BaseModel):
    name: str
    path: str


class LibraryFolderUpdate(BaseModel):
    name: str | None = None
    is_enabled: bool | None = None


class LibraryFolderOut(BaseModel):
    id: int
    name: str
    path: str
    is_enabled: bool
    exists_on_disk: bool
    total_items: int = 0
    images_count: int = 0
    videos_count: int = 0
    texts_count: int = 0
    created_at: datetime
    last_scanned_at: datetime | None = None

    model_config = {"from_attributes": True}


class DirectoryBrowseResponse(BaseModel):
    current_path: str
    parent_path: str | None
    drives: list[str]
    directories: list[str]


class MediaListResponse(BaseModel):
    """Paginated list of media items."""
    items: list[MediaOut]
    total: int
    page: int
    per_page: int
    pages: int


class FavoriteResponse(BaseModel):
    uuid: str
    is_favorite: bool


class ScanResponse(BaseModel):
    """Result returned after a media scan."""
    new_files: int
    removed_entries: int
    total: int


class DeleteResponse(BaseModel):
    uuid: str
    deleted: bool
    file_deleted: bool = False


# ──────────────────────────── Albums ──────────────────────────

class AlbumCreate(BaseModel):
    name: str
    description: str | None = None
    cover_media_uuid: str | None = None


class AlbumUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    cover_media_uuid: str | None = None


class AlbumOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    cover_media_uuid: str | None = None
    cover_thumbnail_url: str | None = None
    media_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AlbumAddMediaRequest(BaseModel):
    media_uuids: list[str]
