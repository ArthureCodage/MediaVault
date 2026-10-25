"""
Async SQLAlchemy engine, session factory, and Base declarative class.
"""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.db_url,
    echo=False,
    connect_args={"check_same_thread": False},
)

async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """SQLAlchemy declarative base for all models."""
    pass


async def get_db() -> AsyncSession:  # type: ignore[misc]
    """FastAPI dependency that yields an async database session."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create all tables if they don't exist and run light SQLite column migrations."""
    from sqlalchemy import text

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Check if folder_id column exists on media
        columns = await conn.execute(text("PRAGMA table_info(media)"))
        col_names = [row[1] for row in columns.fetchall()]
        if "folder_id" not in col_names:
            await conn.execute(text("ALTER TABLE media ADD COLUMN folder_id INTEGER"))

    # Remove tag/album links left behind by older versions that deleted media rows alone
    from app.services.media_ops import cleanup_orphan_links

    async with async_session() as session:
        removed = await cleanup_orphan_links(session)
        await session.commit()
        if removed:
            import logging
            logging.getLogger(__name__).info("Removed %d orphan tag/album links", removed)
