"""
MediaVault configuration — loads settings from .env via pydantic-settings.
"""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings populated from environment variables / .env file."""

    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parent.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Path to the root media folder that will be scanned
    MEDIA_DIR: str = str(Path.home() / "Pictures")

    # Application data directory (database, thumbnails, etc.)
    DATA_DIR: str = str(Path.home() / ".mediavault")

    # JWT secret key — MUST be changed in production
    SECRET_KEY: str = "mediavault-super-secret-key-change-me"

    # Single-user credentials (using APP_ prefix to avoid collision with Windows %USERNAME% env var)
    APP_USERNAME: str = "admin"
    APP_PASSWORD: str = "admin"

    # JWT token lifetime in minutes (default 24 h)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    # --- derived helpers (not env vars) ---

    @property
    def insecure_defaults(self) -> list[str]:
        """Names of security settings still left at their public default values."""
        issues = []
        if self.SECRET_KEY in {"mediavault-super-secret-key-change-me", "change-this-secret-key-12345",
                               "replace-with-a-secure-random-secret-key"} or len(self.SECRET_KEY) < 16:
            issues.append("SECRET_KEY")
        if self.APP_PASSWORD in {"admin", "password", "changeme"}:
            issues.append("APP_PASSWORD")
        return issues

    @property
    def data_path(self) -> Path:
        """Return DATA_DIR as a Path, creating it if needed."""
        p = Path(self.DATA_DIR)
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def db_url(self) -> str:
        """Async SQLite connection URL."""
        return f"sqlite+aiosqlite:///{self.data_path / 'mediavault.db'}"

    @property
    def thumbnails_path(self) -> Path:
        """Directory for generated thumbnails."""
        p = self.data_path / "thumbnails"
        p.mkdir(parents=True, exist_ok=True)
        return p

    @property
    def media_path(self) -> Path:
        """MEDIA_DIR as a resolved Path."""
        return Path(self.MEDIA_DIR).resolve()


# Singleton instance used throughout the app
settings = Settings()
