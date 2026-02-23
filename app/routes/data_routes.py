"""
Ryzm Terminal — Data API Routes
All market/news/onchain/scanner data endpoints.
"""
import os
import time
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.templating import Jinja2Templates

from app.core.logger import logger
from app.core.config import CACHE_TTL, MUSEUM_OF_SCARS
from app.core.cache import cache, build_api_meta
from app.core.database import (
    get_risk_history, db_session, get_risk_component_changes, get_component_sparklines,
    subscribe_briefing as db_subscribe_briefing,
    save_ai_feedback, get_ai_feedback_stats,
    get_watchlist, toggle_watchlist,
    get_notifications, mark_notifications_read, get_unread_count,
)
from app.core.http_client import get_api_health
from app.services.market_service import fetch_multi_timeframe
from app.services.onchain_service import (
    fetch_onchain_data, fetch_liquidation_zones,
)
from app.services.scanner_service import fetch_alpha_scanner
from app.services.analysis_service import (
    fetch_regime_data, fetch_correlation_matrix,
    generate_economic_calendar, compute_risk_gauge,
    simulate_risk_gauge,
)

router = APIRouter()
templates = Jinja2Templates(directory="templates")


# ── Site Pages ──
@router.get("/")
async def read_home(request: Request):
    """Landing page — public website homepage."""
    return templates.TemplateResponse(request=request, name="home.html", context={"request": request, "active_page": "home"})

@router.get("/features")
async def read_features(request: Request):
    return templates.TemplateResponse(request=request, name="features.html", context={"request": request, "active_page": "features"})

@router.get("/pricing")
async def read_pricing(request: Request):
    return templates.TemplateResponse(request=request, name="pricing.html", context={"request": request, "active_page": "pricing"})

@router.get("/about")
async def read_about(request: Request):
    return templates.TemplateResponse(request=request, name="about.html", context={"request": request, "active_page": "about"})

@router.get("/terms")
async def read_terms(request: Request):
    return templates.TemplateResponse(request=request, name="terms.html", context={"request": request, "active_page": "terms"})

@router.get("/privacy")
async def read_privacy(request: Request):
    return templates.TemplateResponse(request=request, name="privacy.html", context={"request": request, "active_page": "privacy"})

# ── App (Dashboard) — always serve fresh HTML, never cache ──
@router.get("/app")
async def read_app(request: Request):
    """Serve the main trading dashboard."""
    response = templates.TemplateResponse(request=request, name="index.html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

@router.get("/verify-email")
async def verify_email_page(request: Request):
    """Serve index.html — frontend JS handles email verification via URL params."""
    response = templates.TemplateResponse(request=request, name="index.html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

@router.get("/reset-password")
async def reset_password_page(request: Request):
    """Serve index.html — frontend JS handles password reset via URL params."""
    response = templates.TemplateResponse(request=request, name="index.html")
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response

@router.get("/manifest.json")
async def get_manifest():
    return FileResponse("manifest.json", media_type="application/manifest+json")

@router.get("/service-worker.js")
async def get_sw():
    return FileResponse(
        "static/service-worker.js",
        media_type="application/javascript",
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )

# Module-level start time for health check uptime
_HEALTH_START_TIME = time.time()


@router.get("/health")
async def health_check():
    import os
    from datetime import datetime, timezone
    uptime_sec = round(time.time() - _HEALTH_START_TIME)
    return {
        "status": "ok",
        "ryzm_os": "online",
        "version": os.getenv("APP_VERSION", "1.0.0"),
        "time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "uptime_sec": uptime_sec,
    }


# ── Data Endpoints ──
@router.get("/api/long-short")
async def get_long_short():
    try:
        from app.services.onchain_service import fetch_long_short_ratio as _fetch_ls
        data = cache["long_short_ratio"]["data"]
        if not data:
            data = _fetch_ls()
            if data:
                cache["long_short_ratio"]["data"] = data
                cache["long_short_ratio"]["updated"] = time.time()
        resp = dict(data) if isinstance(data, dict) else {"ratio": data}
        # Include L/S history if available
        hist = cache.get("long_short_history", {}).get("data", {})
        if hist:
            resp["history"] = hist
        resp["_meta"] = build_api_meta("long_short_ratio", sources=["fapi.binance.com"])
        return resp
    except Exception as e:
        logger.error(f"[API] L/S endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch L/S data")


@router.get("/api/briefing")
def get_briefing():
    try:
        import sqlite3
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute("SELECT id, title, content, created_at_utc FROM briefings ORDER BY id DESC LIMIT 1")
            row = c.fetchone()
        if row:
            return {"status": "ok", "title": row["title"], "content": row["content"], "time": row["created_at_utc"]}
        briefing = cache["latest_briefing"]
        if not briefing.get("title"):
            return {"status": "empty", "title": "", "content": "", "time": ""}
        return {"status": "ok", **briefing}
    except Exception as e:
        logger.error(f"[API] Briefing endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch briefing")


@router.get("/api/briefing/history")
def get_briefing_history(days: int = 7):
    try:
        from datetime import datetime, timezone, timedelta
        import sqlite3
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
        with db_session(row_factory=sqlite3.Row) as (conn, c):
            c.execute(
                """SELECT id, title, content, created_at_utc
                   FROM briefings
                   WHERE created_at_utc >= ?
                   ORDER BY id DESC""",
                (cutoff,)
            )
            rows = [dict(r) for r in c.fetchall()]
        return {"status": "ok", "briefings": rows, "days": days}
    except Exception as e:
        logger.error(f"[API] Briefing history error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch briefing history")


@router.get("/api/funding-rate")
async def get_funding_rate():
    try:
        from app.services.onchain_service import fetch_funding_rate as _fetch_fr
        data = cache["funding_rate"]["data"]
        if not data:
            data = _fetch_fr()
            if data:
                cache["funding_rate"]["data"] = data
                cache["funding_rate"]["updated"] = time.time()
        return {
            "rates": data,
            "_meta": build_api_meta("funding_rate", sources=["fapi.binance.com"])
        }
    except Exception as e:
        logger.error(f"[API] Funding rate error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch funding rate")


@router.get("/api/liquidations")
async def get_liquidations():
    try:
        from app.services.onchain_service import fetch_whale_trades as _fetch_wt
        data = cache["liquidations"]["data"]
        if not data:
            data = _fetch_wt()
            if data:
                cache["liquidations"]["data"] = data
                cache["liquidations"]["updated"] = time.time()
        return {
            "trades": data,
            "_meta": build_api_meta("liquidations", sources=["fapi.binance.com"])
        }
    except Exception as e:
        logger.error(f"[API] Liquidations error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch liquidation data")


@router.get("/api/calendar")
async def get_calendar():
    try:
        upcoming = generate_economic_calendar()[:8]
        return {"events": upcoming}
    except Exception as e:
        logger.error(f"[API] Calendar error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch calendar")


@router.get("/api/risk-gauge")
def get_risk_gauge():
    try:
        # Use cached result if fresh (< 90s), otherwise recompute
        cached = cache.get("risk_gauge", {})
        import time as _time
        if cached.get("data") and (_time.time() - cached.get("updated", 0)) < 90:
            return cached["data"]
        result = compute_risk_gauge()
        cache["risk_gauge"] = {"data": result, "updated": _time.time()}
        return result
    except Exception as e:
        logger.error(f"[API] Risk gauge error: {e}")
        raise HTTPException(status_code=500, detail="Failed to compute risk gauge")


@router.get("/api/risk-gauge/history")
def get_risk_gauge_history(days: int = 30):
    try:
        rows = get_risk_history(days)
        return {
            "history": rows,
            "count": len(rows),
            "_meta": {
                "days_requested": days,
                "fetched_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "source": "council_history.db/risk_history",
            }
        }
    except Exception as e:
        logger.error(f"[API] Risk history error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch risk history")


@router.post("/api/risk-gauge/simulate")
async def post_risk_simulate(request: Request):
    """Scenario simulator: compute hypothetical risk score."""
    try:
        body = await request.json()
        result = simulate_risk_gauge(body)
        return result
    except Exception as e:
        logger.error(f"[API] Risk simulate error: {e}")
        raise HTTPException(status_code=500, detail="Simulation failed")


@router.get("/api/scars")
async def get_museum_of_scars():
    return {"scars": MUSEUM_OF_SCARS}


@router.get("/api/heatmap")
async def get_heatmap():
    try:
        data = cache["heatmap"]["data"] or {}
        # v2: data is now a dict {coins, btc_dominance, total_mcap}
        coins = data.get("coins", data) if isinstance(data, dict) else data
        return {
            "coins": coins if isinstance(coins, list) else [],
            "btc_dominance": data.get("btc_dominance") if isinstance(data, dict) else None,
            "total_mcap": data.get("total_mcap") if isinstance(data, dict) else None,
            "_meta": build_api_meta("heatmap", sources=["api.coingecko.com"])
        }
    except Exception as e:
        logger.error(f"[API] Heatmap error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch heatmap")


@router.get("/api/health-check")
async def health_check_sources():
    now = time.time()
    sources = [
        {"name": "CoinGecko", "key": "market", "icon": "🟢"},
        {"name": "RSS News", "key": "news", "icon": "🟢"},
        {"name": "Fear/Greed", "key": "fear_greed", "icon": "🟢"},
        {"name": "Upbit/KP", "key": "kimchi", "icon": "🟢"},
        {"name": "Binance L/S", "key": "long_short_ratio", "icon": "🟢"},
        {"name": "Binance FR", "key": "funding_rate", "icon": "🟢"},
        {"name": "Whale Trades", "key": "liquidations", "icon": "🟢"},
        {"name": "Heatmap", "key": "heatmap", "icon": "🟢"},
    ]
    active = 0
    for s in sources:
        updated = cache.get(s["key"], {}).get("updated", 0)
        age = now - updated if updated else 9999
        if age < CACHE_TTL * 2:
            s["status"] = "ok"
            s["icon"] = "🟢"
            s["age"] = round(age)
            active += 1
        elif age < CACHE_TTL * 5:
            s["status"] = "stale"
            s["icon"] = "🟡"
            s["age"] = round(age)
        else:
            s["status"] = "offline"
            s["icon"] = "🔴"
            s["age"] = -1
    return {
        "sources": sources, "active": active, "total": len(sources),
        "status": "ok" if active >= len(sources) // 2 else "degraded",
        "version": os.getenv("APP_VERSION", "1.0.0"),
        "_meta": {"fetched_at_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    }


@router.get("/api/source-health")
async def api_source_health():
    return get_api_health()


@router.get("/api/news")
async def get_news():
    try:
        return {
            "news": cache["news"]["data"],
            "_meta": build_api_meta("news", sources=["coindesk.com", "cointelegraph.com"])
        }
    except Exception as e:
        logger.error(f"[API] News endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch news data")


@router.get("/api/market")
async def get_market():
    try:
        mdata = cache["market"]["data"]
        has_est = any(
            isinstance(v, dict) and v.get("est")
            for v in (mdata.values() if isinstance(mdata, dict) else [])
        )
        return {
            "market": mdata,
            "_meta": build_api_meta("market",
                sources=["api.coingecko.com", "query1.finance.yahoo.com", "api.exchangerate-api.com"],
                extra={"is_estimate": has_est} if has_est else None)
        }
    except Exception as e:
        logger.error(f"[API] Market endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch market data")


@router.get("/api/fear-greed")
async def get_fear_greed():
    try:
        fg = cache["fear_greed"]["data"]
        resp = dict(fg) if isinstance(fg, dict) else {"score": 50, "label": "Neutral", "history": []}
        resp["_meta"] = build_api_meta("fear_greed", sources=["api.alternative.me"])
        return resp
    except Exception as e:
        logger.error(f"[API] Fear/Greed endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch fear & greed data")


@router.get("/api/kimchi")
async def get_kimchi():
    try:
        kp = cache["kimchi"]["data"]
        resp = dict(kp) if isinstance(kp, dict) else {"premium": 0, "upbit_price": 0, "binance_price": 0, "usd_krw": 0}
        resp["_meta"] = build_api_meta("kimchi",
            sources=["api.upbit.com", "api.binance.com", "api.exchangerate-api.com"])
        return resp
    except Exception as e:
        logger.error(f"[API] Kimchi premium endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch kimchi premium data")


@router.get("/api/multi-timeframe")
def get_multi_timeframe():
    try:
        return cache["multi_tf"]["data"] or fetch_multi_timeframe()
    except Exception as e:
        logger.error(f"[API] MTF error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch multi-timeframe data")


@router.get("/api/onchain")
def get_onchain():
    try:
        data = cache["onchain"]["data"] or fetch_onchain_data()
        # Bundle funding rate + liquidation zones from their own caches
        result = dict(data) if data else {}
        try:
            result["funding_rates"] = cache.get("funding_rate", {}).get("data") or []
        except Exception:
            result["funding_rates"] = []
        try:
            result["liq_zones"] = cache.get("liq_zones", {}).get("data") or {}
        except Exception:
            result["liq_zones"] = {}
        return result
    except Exception as e:
        logger.error(f"[API] On-chain error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch on-chain data")


@router.get("/api/scanner")
def get_scanner():
    try:
        data = cache["scanner"]["data"]
        if not data:
            data = fetch_alpha_scanner()
        return {
            "alerts": data,
            "count": len(data),
            "ts": int(time.time()),
            "_meta": build_api_meta("scanner", sources=["fapi.binance.com"])
        }
    except Exception as e:
        logger.error(f"[API] Scanner error: {e}")
        raise HTTPException(status_code=500, detail="Failed to scan markets")


@router.get("/api/regime")
def get_regime():
    try:
        data = cache["regime"]["data"]
        return data if data else fetch_regime_data()
    except Exception as e:
        logger.error(f"[API] Regime error: {e}")
        raise HTTPException(status_code=500, detail="Failed to detect regime")


@router.get("/api/correlation")
def get_correlation():
    try:
        data = cache["correlation"]["data"]
        return data if data else fetch_correlation_matrix()
    except Exception as e:
        logger.error(f"[API] Correlation error: {e}")
        raise HTTPException(status_code=500, detail="Failed to compute correlation")


@router.get("/api/whale-wallets")
def get_whale_wallets():
    try:
        from app.services.onchain_service import fetch_whale_wallets as _fetch_ww
        data = cache["whale_wallets"]["data"]
        if not data:
            data = _fetch_ww()
            if data:
                cache["whale_wallets"]["data"] = data
                cache["whale_wallets"]["updated"] = time.time()
        return {
            "transactions": data,
            "count": len(data),
            "_meta": build_api_meta("whale_wallets", sources=["blockchain.info"])
        }
    except Exception as e:
        logger.error(f"[API] WhaleWallet error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch whale wallets")


@router.get("/api/liq-zones")
def get_liq_zones():
    try:
        data = cache["liq_zones"]["data"]
        return data if data else fetch_liquidation_zones()
    except Exception as e:
        logger.error(f"[API] LiqZones error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch liquidation zones")


# ── Public App Config (for frontend to detect beta mode, etc.) ──
@router.get("/api/config")
def get_public_config():
    """Return non-secret app configuration flags for frontend."""
    beta_code = os.getenv("BETA_INVITE_CODE", "")
    stripe_configured = bool(os.getenv("STRIPE_SECRET_KEY", ""))
    return {
        "beta_mode": bool(beta_code),
        "stripe_configured": stripe_configured,
        "version": os.getenv("APP_VERSION", "1.0.0"),
    }


# ── Daily Briefing Subscription ──
@router.post("/api/subscribe-briefing")
async def subscribe_briefing_endpoint(request: Request):
    """Store email subscription for daily briefing."""
    import re
    from app.core.security import check_rate_limit
    if not check_rate_limit(request.client.host, "auth"):
        return {"status": "error", "message": "Too many requests. Please wait a moment."}
    try:
        body = await request.json()
        email = (body.get("email") or "").strip().lower()
        if not email or not re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
            return {"status": "error", "message": "Please enter a valid email address."}
        result = db_subscribe_briefing(email)
        logger.info(f"[Briefing] Subscription: {email} → {result['status']}")
        return result
    except Exception as e:
        logger.error(f"[Briefing] Subscribe error: {e}")
        return {"status": "error", "message": "Subscription failed. Please try again."}

# ── AI Feedback (#5) ──
@router.post("/api/ai-feedback")
async def submit_ai_feedback(request: Request):
    """Submit thumbs up/down feedback on AI results."""
    from app.core.security import get_or_create_uid
    from fastapi import Response as Resp
    resp = Resp()
    uid = get_or_create_uid(request, resp)
    try:
        body = await request.json()
        feature = body.get("feature", "council")
        vote = int(body.get("vote", 0))
        reference_id = body.get("reference_id", None)
        if vote not in (1, -1):
            return {"status": "error", "message": "Vote must be 1 or -1"}
        save_ai_feedback(uid, feature, vote, reference_id)
        return {"status": "ok", "message": "Thanks for the feedback!"}
    except Exception as e:
        logger.error(f"[API] AI Feedback error: {e}")
        return {"status": "error", "message": "Feedback failed."}


@router.get("/api/ai-feedback/stats")
async def get_feedback_stats(feature: str = None):
    """Get AI feedback stats."""
    return get_ai_feedback_stats(feature)


# ── Watchlist (#13) ──
@router.get("/api/watchlist")
async def get_user_watchlist(request: Request):
    """Get user's watchlist."""
    from app.core.security import get_or_create_uid
    from fastapi import Response as Resp
    resp = Resp()
    uid = get_or_create_uid(request, resp)
    return {"symbols": get_watchlist(uid)}


@router.post("/api/watchlist/toggle")
async def toggle_user_watchlist(request: Request):
    """Add/remove symbol from watchlist."""
    from app.core.security import get_or_create_uid
    from fastapi import Response as Resp
    resp = Resp()
    uid = get_or_create_uid(request, resp)
    try:
        body = await request.json()
        symbol = (body.get("symbol") or "").upper().strip()
        if not symbol or len(symbol) > 20:
            return {"status": "error", "message": "Invalid symbol"}
        added = toggle_watchlist(uid, symbol)
        return {"status": "ok", "added": added, "symbol": symbol}
    except Exception as e:
        logger.error(f"[API] Watchlist toggle error: {e}")
        return {"status": "error", "message": "Watchlist update failed."}


# ── Notifications (#12) ──
@router.get("/api/notifications")
async def get_user_notifications(request: Request):
    """Get user's notifications."""
    from app.core.security import get_or_create_uid
    from fastapi import Response as Resp
    resp = Resp()
    uid = get_or_create_uid(request, resp)
    return {"notifications": get_notifications(uid), "unread": get_unread_count(uid)}


@router.post("/api/notifications/read")
async def mark_user_notifications_read(request: Request):
    """Mark all notifications as read."""
    from app.core.security import get_or_create_uid
    from fastapi import Response as Resp
    resp = Resp()
    uid = get_or_create_uid(request, resp)
    mark_notifications_read(uid)
    return {"status": "ok"}


# ── #11 Telegram Bot ──
from app.services.telegram_service import is_configured as tg_configured, send_message as tg_send


@router.post("/api/telegram/send")
async def telegram_send_endpoint(request: Request):
    """Send a message via Telegram bot (admin only)."""
    from app.core.config import ADMIN_TOKEN
    body = await request.json()
    token = body.get("admin_token", "")
    if not ADMIN_TOKEN or token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Unauthorized")
    if not tg_configured():
        raise HTTPException(status_code=503, detail="Telegram not configured")
    text = body.get("text", "")
    chat_id = body.get("chat_id", None)
    ok = tg_send(text, chat_id)
    return {"status": "sent" if ok else "failed"}


@router.get("/api/telegram/status")
async def telegram_status():
    """Check if Telegram bot is configured."""
    return {"configured": tg_configured()}


# ── #15 Prometheus-style Metrics ──
from fastapi.responses import PlainTextResponse

@router.get("/metrics")
async def prometheus_metrics(request: Request):
    """Expose Prometheus-style metrics (admin only via query param or internal)."""
    from app.core.config import ADMIN_TOKEN
    token = request.query_params.get("token", "")
    if ADMIN_TOKEN and token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Unauthorized")

    from app.main import _metrics
    import time as _time

    lines = []
    lines.append("# HELP http_requests_total Total HTTP requests")
    lines.append("# TYPE http_requests_total counter")
    for (method, path, status), count in sorted(_metrics["http_requests_total"].items()):
        lines.append(f'http_requests_total{{method="{method}",path="{path}",status="{status}"}} {count}')

    # Uptime
    uptime = _time.time() - _metrics.get("start_time", _time.time())
    lines.append("# HELP ryzm_uptime_seconds Server uptime in seconds")
    lines.append("# TYPE ryzm_uptime_seconds gauge")
    lines.append(f"ryzm_uptime_seconds {uptime:.0f}")

    # Average latency from recent requests
    durations = _metrics.get("http_request_duration_seconds", [])
    if durations:
        avg = sum(d[0] for d in durations) / len(durations)
        lines.append("# HELP http_request_duration_avg_seconds Average request duration")
        lines.append("# TYPE http_request_duration_avg_seconds gauge")
        lines.append(f"http_request_duration_avg_seconds {avg:.4f}")

    # Cache health
    for key, entry in cache.items():
        age = _time.time() - entry.get("ts", 0)
        lines.append(f'ryzm_cache_age_seconds{{key="{key}"}} {age:.0f}')

    # API health
    health = get_api_health()
    for domain, info in health.items():
        lines.append(f'ryzm_api_fails{{domain="{domain}"}} {info["fails"]}')
        lines.append(f'ryzm_api_backoff_remaining{{domain="{domain}"}} {info["backoff_remaining"]}')

    return PlainTextResponse("\n".join(lines) + "\n", media_type="text/plain; version=0.0.4")


# ── #17 Backtest Simulator ──
from app.core.database import get_council_history


@router.get("/api/council/backtest")
async def council_backtest(limit: int = 100):
    """Return council history with BTC price for backtest charting."""
    records = get_council_history(limit=min(limit, 500))
    # Build backtest data: each record has timestamp, verdict, score, btc_price, btc_price_after, hit
    data = []
    for r in records:
        verdict = r.get("prediction") or r.get("vibe_status") or "NEUTRAL"
        data.append({
            "ts": r.get("timestamp") or r.get("timestamp_ms"),
            "verdict": verdict,
            "score": r.get("consensus_score", 50),
            "btc_price": r.get("btc_price"),
            "btc_price_after": r.get("btc_price_after"),
            "hit": r.get("hit"),
        })
    # Simulate simple PnL: +1% on correct, -1% on wrong
    capital = 10000
    equity_curve = []
    for d in reversed(data):
        hit = d.get("hit")
        if hit == 1:
            capital *= 1.01
        elif hit == 0:
            capital *= 0.99
        equity_curve.append({"ts": d["ts"], "equity": round(capital, 2), "btc": d["btc_price"]})
    return {"backtest": data, "equity_curve": equity_curve, "final_capital": round(capital, 2)}