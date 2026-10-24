"""
Real-time file system watcher service.

Watches all active library directories using watchdog and automatically indexes
new files, removes deleted ones, and notifies WebSocket clients in real time.
"""

import asyncio
import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from threading import Timer

from watchdog.events import FileSystemEventHandler, FileSystemEvent
from watchdog.observers import Observer
from sqlalchemy import select

from app.database import async_session
from app.models import LibraryFolder, Media
from app.services.auto_tagger import auto_tag_media
from app.services.notifier import manager
from app.services.scanner import _classify, ALL_EXTENSIONS, _extract_image_dimensions
from app.services.thumbnail import generate_thumbnail, get_video_metadata

logger = logging.getLogger(__name__)


class MediaEventHandler(FileSystemEventHandler):
    """Handles file system events for library folders."""

    def __init__(self, loop: asyncio.AbstractEventLoop, folder_id: int):
        super().__init__()
        self.loop = loop
        self.folder_id = folder_id
        self._pending_files: dict[str, Timer] = {}

    def on_created(self, event: FileSystemEvent):
        if event.is_directory:
            return
        self._schedule_process(event.src_path)

    def on_modified(self, event: FileSystemEvent):
        if event.is_directory:
            return
        self._schedule_process(event.src_path)

    def on_deleted(self, event: FileSystemEvent):
        if event.is_directory:
            return
        file_path = str(Path(event.src_path).resolve())
        # Cancel any pending creation timers
        if file_path in self._pending_files:
            self._pending_files[file_path].cancel()
            del self._pending_files[file_path]
        asyncio.run_coroutine_threadsafe(self._handle_deleted(file_path), self.loop)

    def _schedule_process(self, path_str: str):
        resolved = str(Path(path_str).resolve())
        ext = Path(resolved).suffix.lower()
        if ext not in ALL_EXTENSIONS:
            return

        # Debounce: cancel previous timer if file still being written
        if resolved in self._pending_files:
            self._pending_files[resolved].cancel()

        timer = Timer(1.5, self._trigger_index, args=[resolved])
        self._pending_files[resolved] = timer
        timer.start()

    def _trigger_index(self, path_str: str):
        if path_str in self._pending_files:
            del self._pending_files[path_str]
        asyncio.run_coroutine_threadsafe(self._handle_created_or_modified(path_str), self.loop)

    async def _handle_created_or_modified(self, path_str: str):
        file_path = Path(path_str)
        if not file_path.exists() or not file_path.is_file():
            return

        ext = file_path.suffix.lower()
        if ext not in ALL_EXTENSIONS:
            return

        media_type, mime_type = _classify(ext)

        try:
            stat = file_path.stat()
            file_size = stat.st_size
            file_date = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
        except Exception:
            return

        async with async_session() as session:
            existing = (
                await session.execute(select(Media).where(Media.file_path == path_str))
            ).scalars().first()

            if existing:
                # Already indexed
                return

            width = None
            height = None
            duration = None

            if media_type == "image":
                width, height = await _extract_image_dimensions(file_path)
            elif media_type == "video":
                meta = await get_video_metadata(file_path)
                width = meta.get("width")
                height = meta.get("height")
                duration = meta.get("duration")

            entry = Media(
                folder_id=self.folder_id,
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

            # Generate thumbnail
            thumb = await generate_thumbnail(file_path, entry.uuid, media_type)
            if thumb:
                entry.thumbnail_path = thumb

            await session.commit()
            await session.refresh(entry)

            # Run auto-tagger
            await auto_tag_media(session, entry)

            logger.info("Real-time Watcher auto-indexed new file: %s", entry.file_name)

            # Broadcast to WebSocket clients!
            await manager.broadcast(
                "MEDIA_ADDED",
                {
                    "uuid": entry.uuid,
                    "file_name": entry.file_name,
                    "media_type": entry.media_type,
                    "folder_id": entry.folder_id,
                },
            )

    async def _handle_deleted(self, path_str: str):
        async with async_session() as session:
            existing = (
                await session.execute(select(Media).where(Media.file_path == path_str))
            ).scalars().first()

            if existing:
                uuid = existing.uuid
                await session.delete(existing)
                await session.commit()
                logger.info("Real-time Watcher purged deleted file: %s", path_str)

                await manager.broadcast("MEDIA_DELETED", {"uuid": uuid, "file_path": path_str})


class LibraryWatcherService:
    """Manages Watchdog observers for active library folders."""

    def __init__(self):
        self.observer: Observer | None = None
        self.watch_descriptors: dict[int, Any] = {}

    def start(self, loop: asyncio.AbstractEventLoop, folders: list[LibraryFolder]):
        if self.observer is not None:
            self.stop()

        self.observer = Observer()
        for f in folders:
            if not f.is_enabled:
                continue
            path_obj = Path(f.path)
            if not path_obj.exists() or not path_obj.is_dir():
                continue

            try:
                handler = MediaEventHandler(loop, f.id)
                wd = self.observer.schedule(handler, str(path_obj), recursive=True)
                self.watch_descriptors[f.id] = wd
                logger.info("Started real-time watcher on: %s", f.path)
            except Exception as e:
                logger.warning("Could not watch path %s: %s", f.path, e)

        self.observer.start()

    def stop(self):
        if self.observer:
            try:
                self.observer.stop()
                self.observer.join(timeout=2)
            except Exception:
                pass
            self.observer = None
            self.watch_descriptors.clear()
            logger.info("Real-time file watcher stopped")


library_watcher = LibraryWatcherService()
