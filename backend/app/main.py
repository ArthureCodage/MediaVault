"""
MediaVault — FastAPI application entry point.

Startup events initialise the database, ensure data directories exist,
and kick off a background scan of the configured media directory.
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.auth import verify_token
from app.config import settings
from app.database import async_session, init_db
from app.models import LibraryFolder
from app.routers import albums as albums_router
from app.routers import auth as auth_router
from app.routers import libraries as libraries_router
from app.routers import media as media_router
from app.routers.tags import router as tags_router, media_tags_router
from app.services.notifier import manager
from app.services.scanner import refresh_video_metadata, scan_media_directory
from app.services.watcher import library_watcher

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle handler."""
    # ── Startup ──
    logger.info("DATA_DIR  : %s", settings.data_path)
    logger.info("MEDIA_DIR : %s", settings.media_path)
    for name in settings.insecure_defaults:
        logger.warning("⚠ %s utilise encore la valeur par défaut — changez-la dans backend/.env", name)

    # Ensure directories exist
    settings.data_path.mkdir(parents=True, exist_ok=True)
    settings.thumbnails_path.mkdir(parents=True, exist_ok=True)
    settings.media_path.mkdir(parents=True, exist_ok=True)

    # Create database tables
    await init_db()
    logger.info("Database initialised")

    # Non-blocking initial scan
    asyncio.create_task(_initial_scan())

    # Start Real-time File System Watcher
    loop = asyncio.get_running_loop()
    async with async_session() as session:
        folders_res = await session.execute(select(LibraryFolder).where(LibraryFolder.is_enabled == True))
        folders = list(folders_res.scalars().all())
        library_watcher.start(loop, folders)

    yield  # ← app is running

    # ── Shutdown ──
    library_watcher.stop()
    logger.info("MediaVault shutting down")


async def _initial_scan() -> None:
    """Run the first media scan in the background so startup isn't blocked."""
    try:
        result = await scan_media_directory()
        logger.info(
            "Initial scan finished — new: %d, removed: %d, total: %d",
            result["new_files"],
            result["removed_entries"],
            result["total"],
        )
    except Exception:
        logger.exception("Initial scan failed")

    try:
        await refresh_video_metadata()
    except Exception:
        logger.exception("Video metadata refresh failed")


app = FastAPI(
    title="MediaVault",
    description="Self-hosted media vault API",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──
app.include_router(auth_router.router)
app.include_router(media_router.router)
app.include_router(libraries_router.router)
app.include_router(tags_router)
app.include_router(media_tags_router)
app.include_router(albums_router.router)


@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket, token: str | None = None):
    """Real-time event stream for library changes (requires ?token=<jwt>)."""
    if verify_token(token) is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        manager.disconnect(websocket)


@app.get("/", tags=["health"])
async def root():
    """Simple health-check / landing endpoint."""
    return {"app": "MediaVault", "status": "running"}
