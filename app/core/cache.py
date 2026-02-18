"""
Ryzm Terminal — Cache Manager
Dict-based cache with TTL awareness (Redis-ready interface).
"""
import time
from datetime import datetime, timezone

from app.core.config import CACHE_TTL
from app.core.logger import logger


# ── Singleton cache dict ──
cache = {
    "news": {"data": [], "updated": 0},
    "market": {"data": {}, "updated": 0},
    "fear_greed": {"data": {}, "updated": 0},
    "kimchi": {"data": {}, "updated": 0},
    "long_short_ratio": {"data": {}, "updated": 0},
    "long_short_history": {"data": {}, "updated": 0},
    "funding_rate": {"data": [], "updated": 0},
    "liquidations": {"data": [], "updated": 0},
    "heatmap": {"data": [], "updated": 0},
    "multi_tf": {"data": {}, "updated": 0},
    "onchain": {"data": {}, "updated": 0},
    "auto_council": {"data": {}, "updated": 0},
    "scanner": {"data": [], "updated": 0},
    "regime": {"data": {}, "updated": 0},
    "correlation": {"data": {}, "updated": 0},
    "whale_wallets": {"data": [], "updated": 0},
    "liq_zones": {"data": {}, "updated": 0},
    "latest_briefing": {"title": "", "content": "", "time": ""},
}


def build_api_meta(cache_key: str, sources: list = None, extra: dict = None) -> dict:
    """Build standardized _meta dict from cache state for API responses."""
    entry = cache.get(cache_key, {})
    updated = entry.get("updated", 0)
    age_s = round(time.time() - updated) if updated > 0 else -1
    data = entry.get("data")

    is_est = False
    if isinstance(data, dict):
        is_est = data.get("_is_estimate", False) or data.get("error", False)
    if age_s < 0:
        is_est = True

    meta = {
        "sources": sources or [cache_key],
        "fetched_at_utc": (
            datetime.fromtimestamp(updated, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            if updated > 0 else None
        ),
        "age_seconds": age_s,
        "is_stale": age_s > CACHE_TTL * 2 if age_s >= 0 else True,
        "is_estimate": is_est,
    }
    if extra:
        meta.update(extra)
    return meta
