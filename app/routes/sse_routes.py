"""
Ryzm Terminal — Server-Sent Events (SSE) Route
Pushes real-time updates to connected clients: alerts, council results, notifications.
"""
import asyncio
import json
import time
from collections import deque
from typing import AsyncGenerator

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.core.logger import logger
from app.core.cache import cache

router = APIRouter(tags=["sse"])

# ── Shared event bus (in-memory) ──
_event_subscribers: list = []
_MAX_SSE_CLIENTS = 500
_MAX_QUEUE_SIZE = 100


def broadcast_event(event_type: str, data: dict):
    """Push an event to all connected SSE clients."""
    event = {"type": event_type, "data": data, "ts": time.time()}
    # Add to queue for each subscriber (bounded deque)
    dead = []
    for i, q in enumerate(_event_subscribers):
        try:
            q.append(event)  # deque auto-evicts oldest if maxlen exceeded
        except Exception:
            dead.append(i)
    # Clean dead subscribers
    for i in reversed(dead):
        try:
            _event_subscribers.pop(i)
        except Exception:
            pass


async def _event_generator(request: Request) -> AsyncGenerator[str, None]:
    """SSE generator that yields events to a single client."""
    queue = deque(maxlen=_MAX_QUEUE_SIZE)
    _event_subscribers.append(queue)
    client_id = id(queue)
    logger.info(f"[SSE] Client connected #{client_id} (total: {len(_event_subscribers)})")

    try:
        # Send initial connection event
        yield f"event: connected\ndata: {json.dumps({'clients': len(_event_subscribers)})}\n\n"

        last_market_ts = 0
        last_council_ts = 0
        last_risk_ts = 0
        last_ls_ts = 0

        while True:
            # Check for broadcast events
            while queue:
                event = queue.popleft()
                yield f"event: {event['type']}\ndata: {json.dumps(event['data'])}\n\n"

            # Periodic market snapshot (every 30s)
            market_ts = cache.get("market", {}).get("updated", 0)
            if market_ts > last_market_ts and market_ts > 0:
                last_market_ts = market_ts
                market = cache.get("market", {}).get("data", {})
                btc = market.get("BTC", {})
                eth = market.get("ETH", {})
                if btc:
                    yield f"event: market\ndata: {json.dumps({'BTC': btc.get('price', 0), 'ETH': eth.get('price', 0), 'ts': market_ts})}\n\n"

            # Risk gauge push (when cache updated)
            risk_ts = cache.get("risk_gauge", {}).get("updated", 0)
            if risk_ts > last_risk_ts and risk_ts > 0:
                last_risk_ts = risk_ts
                risk_data = cache.get("risk_gauge", {}).get("data", {})
                if risk_data:
                    yield f"event: risk_gauge\ndata: {json.dumps(risk_data, default=str)}\n\n"

            # L/S ratio push (when cache updated)
            ls_ts = cache.get("long_short_ratio", {}).get("updated", 0)
            if ls_ts > last_ls_ts and ls_ts > 0:
                last_ls_ts = ls_ts
                ls_data = cache.get("long_short_ratio", {}).get("data", {})
                if ls_data:
                    yield f"event: long_short\ndata: {json.dumps(ls_data, default=str)}\n\n"

            # Check for new auto-council
            council_ts = cache.get("auto_council", {}).get("updated", 0)
            if council_ts > last_council_ts and council_ts > 0:
                last_council_ts = council_ts
                council = cache.get("auto_council", {}).get("data", {})
                if council:
                    yield f"event: council\ndata: {json.dumps({'score': council.get('consensus_score', 50), 'vibe': council.get('vibe', {}).get('status', '')})}\n\n"

            # Heartbeat every 15s
            yield f"event: heartbeat\ndata: {json.dumps({'ts': time.time()})}\n\n"

            await asyncio.sleep(15)

            # Check if client disconnected
            if await request.is_disconnected():
                break

    except asyncio.CancelledError:
        pass
    finally:
        try:
            _event_subscribers.remove(queue)
        except ValueError:
            pass
        logger.info(f"[SSE] Client disconnected #{client_id} (remaining: {len(_event_subscribers)})")


@router.get("/api/events")
async def sse_stream(request: Request):
    """SSE endpoint for real-time event streaming."""
    if len(_event_subscribers) >= _MAX_SSE_CLIENTS:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "Too many SSE connections"}, status_code=503)
    return StreamingResponse(
        _event_generator(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Nginx compatibility
        }
    )


@router.get("/api/events/status")
def sse_status():
    """Get SSE connection stats."""
    return {
        "connected_clients": len(_event_subscribers),
    }
