"""
Ryzm Terminal — Cache Manager
#8 Redis cache with in-memory fallback.
Dict-based cache with TTL awareness.
"""
import json
import time
from datetime import datetime, timezone

from app.core.config import CACHE_TTL, REDIS_URL
from app.core.logger import logger


# ── Redis cache backend (optional) ──
_redis_cache = None
_redis_cache_available = False

def _init_redis_cache():
    """Try to connect to Redis for caching. Falls back to in-memory dict."""
    global _redis_cache, _redis_cache_available
    if not REDIS_URL:
        return
    try:
        import redis
        _redis_cache = redis.from_url(REDIS_URL, decode_responses=True, socket_timeout=2, db=1)
        _redis_cache.ping()
        _redis_cache_available = True
        logger.info("[Cache] Redis cache backend connected")
    except Exception as e:
        _redis_cache = None
        _redis_cache_available = False
        logger.warning(f"[Cache] Redis unavailable, using in-memory: {e}")

_init_redis_cache()


def redis_cache_set(key: str, data, ttl: int = None):
    """Set a value in Redis cache (JSON serialized)."""
    if not _redis_cache_available or not _redis_cache:
        return False
    try:
        _redis_cache.setex(f"ryzm:{key}", ttl or CACHE_TTL, json.dumps(data, default=str))
        return True
    except Exception:
        return False


def redis_cache_get(key: str):
    """Get a value from Redis cache."""
    if not _redis_cache_available or not _redis_cache:
        return None
    try:
        val = _redis_cache.get(f"ryzm:{key}")
        return json.loads(val) if val else None
    except Exception:
        return None


# ── Singleton cache dict (primary in-memory store) ──
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
    "risk_gauge": {"data": {}, "updated": 0},
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
