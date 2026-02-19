"""
Ryzm Terminal — Resilient HTTP Client
429 backoff, circuit breaker, JSON envelope.
"""
import time
import requests
from collections import defaultdict
from datetime import datetime, timezone
from urllib.parse import urlparse

from app.core.logger import logger

# ── Per-domain state ──
_api_429_backoff: dict = {}           # domain -> earliest retry time
_api_fail_count: dict = defaultdict(int)  # domain -> consecutive fail count


def resilient_get(url: str, timeout: int = 15, **kwargs) -> requests.Response:
    """HTTP GET with 429 backoff and exponential retry awareness."""
    domain = urlparse(url).netloc
    now = time.time()

    if domain in _api_429_backoff and now < _api_429_backoff[domain]:
        wait = _api_429_backoff[domain] - now
        logger.warning(f"[HTTP] {domain} in backoff for {wait:.0f}s more — skipping")
        raise requests.exceptions.ConnectionError(f"{domain} rate-limited, backing off")

    try:
        resp = requests.get(url, timeout=timeout, **kwargs)
        if resp.status_code == 429:
            fails = _api_fail_count[domain] + 1
            _api_fail_count[domain] = fails
            retry_after = 0
            ra_header = resp.headers.get("Retry-After")
            if ra_header:
                try:
                    retry_after = int(ra_header)
                except (ValueError, TypeError):
                    pass
            # Shorter backoff for shared cloud IPs (Render, Railway)
            backoff = max(retry_after, min(45, 10 * (2 ** (fails - 1))))
            _api_429_backoff[domain] = now + backoff
            logger.warning(f"[HTTP] 429 from {domain} — backing off {backoff}s (fail #{fails})")
            raise requests.exceptions.HTTPError(
                f"429 Too Many Requests from {domain}", response=resp
            )
        elif resp.status_code == 418:
            _api_fail_count[domain] = _api_fail_count.get(domain, 0) + 1
            # 90s cooldown (not 600s) — on shared IPs the ban rotates quickly
            _api_429_backoff[domain] = now + 90
            logger.error(f"[HTTP] 418 IP BAN from {domain} — 90s cooldown")
            raise requests.exceptions.HTTPError(
                f"418 IP Ban from {domain}", response=resp
            )
        else:
            if _api_fail_count.get(domain, 0) > 0:
                _api_fail_count[domain] = 0
                logger.info(f"[HTTP] {domain} recovered from rate limit")
        return resp
    except requests.exceptions.RequestException as exc:
        if not (hasattr(exc, 'response') and exc.response is not None
                and exc.response.status_code in (429, 418)):
            _api_fail_count[domain] = _api_fail_count.get(domain, 0) + 1
        raise


def get_api_health() -> dict:
    """Return API source health status for monitoring."""
    now = time.time()
    health = {}
    for domain, earliest in _api_429_backoff.items():
        health[domain] = {
            "status": "backoff" if now < earliest else "ok",
            "fails": _api_fail_count.get(domain, 0),
            "backoff_remaining": max(0, round(earliest - now))
        }
    return health


def http_get_json(url: str, timeout: int = 10, **kwargs) -> tuple:
    """HTTP GET → JSON with standardized metadata envelope."""
    source = urlparse(url).netloc
    start = time.time()
    meta = {
        "source": source,
        "fetched_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "latency_ms": 0,
        "is_estimate": False,
        "error": None,
    }
    try:
        resp = resilient_get(url, timeout=timeout, **kwargs)
        resp.raise_for_status()
        meta["latency_ms"] = round((time.time() - start) * 1000)
        return resp.json(), meta
    except Exception as e:
        meta["latency_ms"] = round((time.time() - start) * 1000)
        meta["error"] = str(e)[:200]
        meta["is_estimate"] = True
        return None, meta
