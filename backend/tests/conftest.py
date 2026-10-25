"""Test setup: point MediaVault at throwaway folders before the app is imported."""

import os
import sys
import tempfile
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="mediavault-tests-"))
os.environ["DATA_DIR"] = str(_TMP / "data")
os.environ["MEDIA_DIR"] = str(_TMP / "media")
os.environ["APP_USERNAME"] = "tester"
os.environ["APP_PASSWORD"] = "test-password-123"
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough"

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def auth(client):
    r = client.post("/api/auth/login", json={"username": "tester", "password": "test-password-123"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="session")
def media_dir() -> Path:
    return Path(os.environ["MEDIA_DIR"]).resolve()
