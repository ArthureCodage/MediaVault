"""Smoke tests for the main API flows."""

import io

import pytest
from PIL import Image
from starlette.websockets import WebSocketDisconnect


def _png(w: int = 40, h: int = 80) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (120, 40, 200)).save(buf, "PNG")
    return buf.getvalue()


def test_health(client):
    assert client.get("/").json()["status"] == "running"


def test_login_rejects_bad_password(client):
    r = client.post("/api/auth/login", json={"username": "tester", "password": "nope"})
    assert r.status_code == 401


def test_media_requires_auth(client):
    assert client.get("/api/media").status_code == 401


def test_upload_cannot_escape_media_dir(client, auth, media_dir):
    r = client.post(
        "/api/media/upload",
        headers=auth,
        files={"file": ("../../escape.png", _png(), "image/png")},
    )
    assert r.status_code == 201, r.text
    assert r.json()["file_name"] == "escape.png"
    assert (media_dir / "escape.png").exists()
    assert not (media_dir.parent.parent / "escape.png").exists()


def test_upload_is_indexed_tagged_and_linked_to_library(client, auth):
    r = client.post("/api/media/upload", headers=auth, files={"file": ("portrait.png", _png(), "image/png")})
    assert r.status_code == 201
    uuid = r.json()["uuid"]
    assert r.json()["folder_id"] is not None

    detail = client.get(f"/api/media/{uuid}", headers=auth).json()
    assert "vertical" in [t["name"] for t in detail["tags"]]


def test_delete_removes_tag_links(client, auth):
    uuid = client.post(
        "/api/media/upload", headers=auth, files={"file": ("to-delete.png", _png(), "image/png")}
    ).json()["uuid"]
    r = client.post(f"/api/media/{uuid}/tags", headers=auth, json={"name": "temp-tag"})
    assert r.status_code == 201
    tag_id = r.json()["id"]

    assert client.delete(f"/api/media/{uuid}", headers=auth).status_code == 200

    tags = {t["id"]: t for t in client.get("/api/tags", headers=auth).json()}
    assert tags[tag_id]["media_count"] == 0


def test_library_counts(client, auth):
    libs = client.get("/api/libraries", headers=auth).json()
    assert libs and libs[0]["images_count"] == libs[0]["total_items"] >= 2


def test_upload_rejects_unknown_extension(client, auth):
    r = client.post("/api/media/upload", headers=auth, files={"file": ("evil.exe", b"MZ", "application/octet-stream")})
    assert r.status_code == 400


def test_websocket_requires_token(client, auth):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/api/ws") as ws:
            ws.receive_text()

    token = auth["Authorization"].split()[1]
    with client.websocket_connect(f"/api/ws?token={token}"):
        pass
