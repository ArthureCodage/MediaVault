"""
Libraries router — Manage file locations/folders (Plex/Jellyfin style).
"""

import asyncio
import os
import string
import sys
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import LibraryFolder, Media
from app.schemas import (
    DirectoryBrowseResponse,
    LibraryFolderCreate,
    LibraryFolderOut,
    LibraryFolderUpdate,
    ScanResponse,
)
from app.services.scanner import scan_media_directory, ensure_default_library
from app.services.media_ops import purge_media
from app.services.watcher import library_watcher

router = APIRouter(prefix="/api/libraries", tags=["libraries"])


def _get_available_drives() -> list[str]:
    """Return available drive letters on Windows, or root on Linux."""
    if sys.platform == "win32":
        drives = []
        for letter in string.ascii_uppercase:
            drive_str = f"{letter}:\\"
            if os.path.exists(drive_str):
                drives.append(drive_str)
        return drives
    return ["/"]


async def _restart_watcher(db: AsyncSession) -> None:
    """Restart the file watcher on the currently enabled folders."""
    enabled = (
        await db.execute(select(LibraryFolder).where(LibraryFolder.is_enabled == True))  # noqa: E712
    ).scalars().all()
    library_watcher.start(asyncio.get_running_loop(), list(enabled))


@router.get("", response_model=list[LibraryFolderOut])
async def list_libraries(
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> list[LibraryFolderOut]:
    """List all configured library folders with media stats."""
    # Ensure default library is populated
    await ensure_default_library(db)

    result = await db.execute(select(LibraryFolder).order_by(LibraryFolder.id.asc()))
    folders = list(result.scalars().all())

    # One grouped query for every folder/type count
    counts: dict[int, dict[str, int]] = {}
    count_rows = await db.execute(
        select(Media.folder_id, Media.media_type, func.count(Media.id))
        .where(Media.folder_id.is_not(None))
        .group_by(Media.folder_id, Media.media_type)
    )
    for fid, mtype, n in count_rows.all():
        counts.setdefault(fid, {})[mtype] = n

    output = []
    for f in folders:
        f_path = Path(f.path)
        exists = f_path.exists() and f_path.is_dir()

        by_type = counts.get(f.id, {})
        img_count = by_type.get("image", 0)
        vid_count = by_type.get("video", 0)
        txt_count = by_type.get("text", 0)
        total_count = sum(by_type.values())

        output.append(
            LibraryFolderOut(
                id=f.id,
                name=f.name,
                path=f.path,
                is_enabled=f.is_enabled,
                exists_on_disk=exists,
                total_items=total_count,
                images_count=img_count,
                videos_count=vid_count,
                texts_count=txt_count,
                created_at=f.created_at,
                last_scanned_at=f.last_scanned_at,
            )
        )

    return output


@router.post("", response_model=LibraryFolderOut, status_code=status.HTTP_201_CREATED)
async def add_library(
    payload: LibraryFolderCreate,
    bg_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> LibraryFolderOut:
    """Add a new library folder and trigger a scan."""
    clean_path = str(Path(payload.path.strip()).resolve())

    # Check existence
    p = Path(clean_path)
    if not p.exists() or not p.is_dir():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"The path '{clean_path}' does not exist or is not a directory.",
        )

    # Check if duplicate path
    existing = (
        await db.execute(select(LibraryFolder).where(LibraryFolder.path == clean_path))
    ).scalars().first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"This folder path is already added under name '{existing.name}'.",
        )

    folder = LibraryFolder(
        name=payload.name.strip() or p.name or clean_path,
        path=clean_path,
        is_enabled=True,
    )
    db.add(folder)
    await db.commit()
    await db.refresh(folder)

    # Run scan in background
    bg_tasks.add_task(scan_media_directory, folder.id)

    await _restart_watcher(db)

    return LibraryFolderOut(
        id=folder.id,
        name=folder.name,
        path=folder.path,
        is_enabled=folder.is_enabled,
        exists_on_disk=True,
        total_items=0,
        images_count=0,
        videos_count=0,
        texts_count=0,
        created_at=folder.created_at,
        last_scanned_at=None,
    )


@router.patch("/{folder_id}", response_model=LibraryFolderOut)
async def update_library(
    folder_id: int,
    payload: LibraryFolderUpdate,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> LibraryFolderOut:
    """Update name or enabled state of a library folder."""
    folder = (
        await db.execute(select(LibraryFolder).where(LibraryFolder.id == folder_id))
    ).scalars().first()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library not found")

    if payload.name is not None and payload.name.strip():
        folder.name = payload.name.strip()
    if payload.is_enabled is not None:
        folder.is_enabled = payload.is_enabled

    await db.commit()
    await db.refresh(folder)

    if payload.is_enabled is not None:
        await _restart_watcher(db)

    return LibraryFolderOut(
        id=folder.id,
        name=folder.name,
        path=folder.path,
        is_enabled=folder.is_enabled,
        exists_on_disk=Path(folder.path).exists(),
        created_at=folder.created_at,
        last_scanned_at=folder.last_scanned_at,
    )


@router.delete("/{folder_id}", status_code=status.HTTP_200_OK)
async def delete_library(
    folder_id: int,
    delete_media: bool = Query(True, description="Remove indexed media entries from DB"),
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> dict:
    """Remove a library folder and optionally remove indexed items from DB."""
    folder = (
        await db.execute(select(LibraryFolder).where(LibraryFolder.id == folder_id))
    ).scalars().first()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library not found")

    if delete_media:
        # Delete media belonging to this folder from DB
        media_items = (
            await db.execute(select(Media).where(Media.folder_id == folder_id))
        ).scalars().all()
        for m in media_items:
            await purge_media(db, m)

    await db.delete(folder)
    await db.commit()
    await _restart_watcher(db)

    return {"ok": True, "message": f"Library '{folder.name}' removed"}


@router.post("/{folder_id}/scan", response_model=ScanResponse)
async def scan_single_library(
    folder_id: int,
    db: AsyncSession = Depends(get_db),
    _user: str = Depends(get_current_user),
) -> ScanResponse:
    """Trigger an immediate scan of a specific library folder."""
    folder = (
        await db.execute(select(LibraryFolder).where(LibraryFolder.id == folder_id))
    ).scalars().first()
    if not folder:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Library not found")

    result = await scan_media_directory(folder_id=folder.id)
    return ScanResponse(**result)


@router.get("/browse", response_model=DirectoryBrowseResponse)
async def browse_directories(
    path: str | None = Query(None, description="Path to browse"),
    _user: str = Depends(get_current_user),
) -> DirectoryBrowseResponse:
    """Browse server directories to easily select folders (Plex/Jellyfin style)."""
    drives = _get_available_drives()

    if not path or not path.strip():
        # Default to user home or first drive
        target_path = Path.home()
    else:
        target_path = Path(path.strip())

    try:
        resolved = target_path.resolve()
        current_str = str(resolved)
        parent_str = str(resolved.parent) if resolved.parent != resolved else None

        subdirs = []
        if resolved.exists() and resolved.is_dir():
            for item in resolved.iterdir():
                try:
                    if item.is_dir() and not item.name.startswith("."):
                        subdirs.append(item.name)
                except PermissionError:
                    continue
        subdirs.sort(key=lambda s: s.lower())

        return DirectoryBrowseResponse(
            current_path=current_str,
            parent_path=parent_str,
            drives=drives,
            directories=subdirs,
        )
    except Exception as e:
        # Fallback to home
        home = Path.home()
        return DirectoryBrowseResponse(
            current_path=str(home),
            parent_path=None,
            drives=drives,
            directories=[],
        )
