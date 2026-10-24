"""
WebSocket connection manager for real-time notifications to frontend clients.
"""

import json
import logging
from typing import Any
from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Manages active WebSocket connections and broadcasts events."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info("WebSocket client connected (total: %d)", len(self.active_connections))

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
            logger.info("WebSocket client disconnected (remaining: %d)", len(self.active_connections))

    async def broadcast(self, event: str, data: Any = None):
        """Broadcast a message to all connected clients."""
        if not self.active_connections:
            return

        payload = json.dumps({"event": event, "data": data})
        stale_connections = []

        for connection in self.active_connections:
            try:
                await connection.send_text(payload)
            except Exception:
                stale_connections.append(connection)

        for stale in stale_connections:
            self.disconnect(stale)


manager = ConnectionManager()
