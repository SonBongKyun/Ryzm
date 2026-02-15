"""
Ryzm Terminal — Data API Routes
All market/news/onchain/scanner data endpoints.
"""
import time
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.templating import Jinja2Templates

from app.core.logger import logger
from app.core.config import CACHE_TTL, MUSEUM_OF_SCARS
from app.core.cache import cache, build_api_meta
from app.core.database import get_risk_history, db_connect, _db_lock
from app.core.http_client import get_api_health
from app.services.market_service import fetch_multi_timeframe
from app.services.onchain_service import (
    fetch_onchain_data, fetch_liquidation_zones,
)
from app.services.scanner_service import fetch_alpha_scanner
from app.services.analysis_service import (
    fetch_regime_data, fetch_correlation_matrix,
    generate_economic_calendar, compute_risk_gauge,
)

import sqlite3

router = APIRouter()
templates = Jinja2Templates(directory="templates")


# ── Static Pages ──
@router.get("/")
async def read_index(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@router.get("/manifest.json")
async def get_manifest():
    return FileResponse("manifest.json", media_type="application/manifest+json")

@router.get("/service-worker.js")
async def get_sw():
    return FileResponse("static/service-worker.js", media_type="application/javascript")

@router.get("/health")
async def health_check():
    return {"status": "ok", "ryzm_os": "online"}


# ── Data Endpoints ──
@router.get("/api/long-short")
async def get_long_short():
    try:
        return cache["long_short_ratio"]["data"]
    except Exception as e:
        logger.error(f"[API] L/S endpoint error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch L/S data")


@router.get("/api/briefing")
def get_briefing():
    try:
        with _db_lock:
            conn = db_connect()
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute("SELECT id, title, content, created_at_utc FROM briefings ORDER BY id DESC LIMIT 1")
            row = c.fetchone()
            conn.close()
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
        with _db_lock:
            conn = db_connect()
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            c.execute(
                """SELECT id, title, content, created_at_utc
                   FROM briefings
                   WHERE datetime(created_at_utc) >= datetime('now', ?)
                   ORDER BY id DESC""",
                (f"-{days} days",)
            )
            rows = [dict(r) for r in c.fetchall()]
            conn.close()
        return {"status": "ok", "briefings": rows, "days": days}
    except Exception as e:
        logger.error(f"[API] Briefing history error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch briefing history")


@router.get("/api/funding-rate")
async def get_funding_rate():
    try:
        return {"rates": cache["funding_rate"]["data"]}
    except Exception as e:
        logger.error(f"[API] Funding rate error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch funding rate")


@router.get("/api/liquidations")
async def get_liquidations():
    try:
        return {"trades": cache["liquidations"]["data"]}
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
        return compute_risk_gauge()
    except Exception as e:
        logger.error(f"[API] Risk gauge error: {e}")
        raise HTTPException(status_code=500, detail="Failed to compute risk gauge")


@router.get("/api/risk-gauge/history")
def get_risk_gauge_history(days: int = 30):
    try:
        rows = get_risk_history(days)
        return {"history": rows, "count": len(rows)}
    except Exception as e:
        logger.error(f"[API] Risk history error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch risk history")


@router.get("/api/scars")
async def get_museum_of_scars():
    return {"scars": MUSEUM_OF_SCARS}


@router.get("/api/heatmap")
async def get_heatmap():
    try:
        return {"coins": cache["heatmap"]["data"]}
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
        return cache["onchain"]["data"] or fetch_onchain_data()
    except Exception as e:
        logger.error(f"[API] On-chain error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch on-chain data")


@router.get("/api/scanner")
def get_scanner():
    try:
        data = cache["scanner"]["data"]
        if not data:
            data = fetch_alpha_scanner()
        return {"alerts": data, "count": len(data), "ts": int(time.time())}
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
        data = cache["whale_wallets"]["data"]
        return {"transactions": data, "count": len(data)}
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
