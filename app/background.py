"""
Ryzm Terminal — Background Tasks
Cache refresh loop, Discord alerts, price alert checking.
"""
import time
import threading
from datetime import datetime, timezone

import requests

from app.core.logger import logger
from app.core.config import (
    CACHE_TTL, AUTO_COUNCIL_INTERVAL, CRITICAL_ALERT_COOLDOWN,
    DISCORD_WEBHOOK_URL,
)
from app.core.cache import cache
from app.core.database import (
    db_connect, _db_lock, utc_now_str,
    save_council_record, store_price_snapshot,
    evaluate_council_accuracy,
)
from app.core.security import cleanup_rate_limits

# Services
from app.services.news_service import fetch_news
from app.services.market_service import (
    fetch_market_data, fetch_fear_greed, fetch_kimchi_premium,
    fetch_heatmap_data, fetch_multi_timeframe,
)
from app.services.onchain_service import (
    fetch_long_short_ratio, fetch_funding_rate, fetch_whale_trades,
    fetch_whale_wallets, fetch_liquidation_zones, fetch_onchain_data,
)
from app.services.scanner_service import fetch_alpha_scanner
from app.services.analysis_service import (
    fetch_regime_data, fetch_correlation_matrix, compute_risk_gauge,
)
from app.services.ai_service import generate_council_debate


# ── Module-level state ──
_last_auto_council = 0
_last_critical_alert = 0
_bg_started = False


def send_discord_alert(title, message, color=0xdc2626):
    """Send alert to Discord webhook."""
    if not DISCORD_WEBHOOK_URL or DISCORD_WEBHOOK_URL == "YOUR_DISCORD_WEBHOOK_URL_HERE":
        return
    try:
        payload = {
            "username": "Ryzm Alert",
            "avatar_url": "https://i.imgur.com/8QZ7r7s.png",
            "embeds": [{
                "title": title,
                "description": message[:2000],
                "color": color,
                "footer": {"text": "Ryzm Terminal Auto-Alert"},
                "timestamp": datetime.now(timezone.utc).isoformat()
            }]
        }
        requests.post(DISCORD_WEBHOOK_URL, json=payload, timeout=10)
        logger.info(f"[Discord] Alert sent: {title}")
    except Exception as e:
        logger.error(f"[Discord] Alert error: {e}")


def check_price_alerts():
    """Check all active alerts against current market prices."""
    try:
        market = cache["market"]["data"]
        if not market or not isinstance(market, dict):
            return
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute("SELECT id, uid, symbol, target_price, direction FROM price_alerts WHERE triggered = 0")
            alerts = c.fetchall()
            now_str = utc_now_str()
            triggered_count = 0
            for alert_id, uid, symbol, target, direction in alerts:
                current = market.get(symbol.upper(), {}).get("price")
                if current is None:
                    continue
                hit = False
                if direction == "above" and current >= target:
                    hit = True
                elif direction == "below" and current <= target:
                    hit = True
                if hit:
                    c.execute("UPDATE price_alerts SET triggered = 1, triggered_at_utc = ? WHERE id = ?", (now_str, alert_id))
                    triggered_count += 1
                    logger.info(f"[Alerts] TRIGGERED #{alert_id}: {symbol} {direction} ${target} (current: ${current})")
            if triggered_count > 0:
                conn.commit()
            conn.close()
    except Exception as e:
        logger.error(f"[Alerts] Check error: {e}")


def refresh_cache():
    """Cache refresh loop (every 60s)."""
    global _last_auto_council, _last_critical_alert
    logger.info("[Cache] Background refresh thread started")

    while True:
        now = time.time()

        try:
            if now - cache["news"]["updated"] > CACHE_TTL:
                cache["news"]["data"] = fetch_news()
                cache["news"]["updated"] = now
                logger.info(f"[Cache] News refreshed: {len(cache['news']['data'])} articles")
        except Exception as e:
            logger.error(f"[Cache] News refresh error: {e}")

        try:
            if now - cache["market"]["updated"] > CACHE_TTL:
                cache["market"]["data"] = fetch_market_data()
                cache["market"]["updated"] = now
                logger.info("[Cache] Market data refreshed")
        except Exception as e:
            logger.error(f"[Cache] Market refresh error: {e}")

        try:
            if now - cache["fear_greed"]["updated"] > CACHE_TTL:
                cache["fear_greed"]["data"] = fetch_fear_greed()
                cache["fear_greed"]["updated"] = now
                logger.info(f"[Cache] Fear/Greed refreshed: score={cache['fear_greed']['data'].get('score')}")
        except Exception as e:
            logger.error(f"[Cache] F&G refresh error: {e}")

        try:
            if now - cache["kimchi"]["updated"] > CACHE_TTL:
                cache["kimchi"]["data"] = fetch_kimchi_premium()
                cache["kimchi"]["updated"] = now
                logger.info(f"[Cache] Kimchi Premium refreshed: {cache['kimchi']['data'].get('premium', 0)}%")
        except Exception as e:
            logger.error(f"[Cache] KP refresh error: {e}")

        try:
            if now - cache["long_short_ratio"]["updated"] > CACHE_TTL:
                cache["long_short_ratio"]["data"] = fetch_long_short_ratio()
                cache["long_short_ratio"]["updated"] = now
                logger.info("[Cache] L/S Ratio refreshed")
        except Exception as e:
            logger.error(f"[Cache] L/S Ratio refresh error: {e}")

        try:
            if now - cache["funding_rate"]["updated"] > CACHE_TTL:
                cache["funding_rate"]["data"] = fetch_funding_rate()
                cache["funding_rate"]["updated"] = now
                logger.info("[Cache] Funding Rate refreshed")
        except Exception as e:
            logger.error(f"[Cache] Funding Rate refresh error: {e}")

        try:
            if now - cache["liquidations"]["updated"] > 120:
                cache["liquidations"]["data"] = fetch_whale_trades()
                cache["liquidations"]["updated"] = now
                logger.info(f"[Cache] Whale trades refreshed: {len(cache['liquidations']['data'])} trades")
        except Exception as e:
            logger.error(f"[Cache] Whale trades refresh error: {e}")

        try:
            if now - cache["heatmap"]["updated"] > CACHE_TTL:
                cache["heatmap"]["data"] = fetch_heatmap_data()
                cache["heatmap"]["updated"] = now
                logger.info(f"[Cache] Heatmap refreshed: {len(cache['heatmap']['data'])} coins")
        except Exception as e:
            logger.error(f"[Cache] Heatmap refresh error: {e}")

        try:
            if now - cache["multi_tf"]["updated"] > CACHE_TTL:
                cache["multi_tf"]["data"] = fetch_multi_timeframe()
                cache["multi_tf"]["updated"] = now
                logger.info("[Cache] Multi-timeframe refreshed")
        except Exception as e:
            logger.error(f"[Cache] MTF refresh error: {e}")

        try:
            if now - cache["onchain"]["updated"] > CACHE_TTL:
                cache["onchain"]["data"] = fetch_onchain_data()
                cache["onchain"]["updated"] = now
                logger.info("[Cache] On-chain data refreshed")
        except Exception as e:
            logger.error(f"[Cache] On-chain refresh error: {e}")

        # Auto Council (hourly)
        try:
            if now - _last_auto_council > AUTO_COUNCIL_INTERVAL:
                market = cache["market"]["data"]
                news = cache["news"]["data"]
                if market:
                    logger.info("[AutoCouncil] Running scheduled analysis...")
                    result = generate_council_debate(market, news)
                    cache["auto_council"]["data"] = result
                    cache["auto_council"]["updated"] = now
                    _last_auto_council = now
                    btc_price = market.get("BTC", {}).get("price", 0.0) if isinstance(market, dict) else 0.0
                    save_council_record(result, btc_price)
                    score = result.get("consensus_score", 50)
                    vibe = result.get("vibe", {}).get("status", "UNKNOWN")
                    send_discord_alert(
                        f"\U0001f9e0 Auto Council — Score: {score}/100",
                        f"**Vibe:** {vibe}\n**Score:** {score}/100\n\n" +
                        "\n".join([f"• {a['name']}: {a['message']}" for a in result.get("agents", [])[:4]]),
                        color=0x06b6d4
                    )
                    logger.info(f"[AutoCouncil] Completed — score={score}, vibe={vibe}")
        except Exception as e:
            logger.error(f"[Cache] Auto-council error: {e}")

        # Alpha Scanner (every 60s)
        try:
            if now - cache["scanner"]["updated"] > 60:
                cache["scanner"]["data"] = fetch_alpha_scanner()
                cache["scanner"]["updated"] = now
                cnt = len(cache["scanner"]["data"])
                if cnt > 0:
                    logger.info(f"[Scanner] Found {cnt} opportunities")
        except Exception as e:
            logger.error(f"[Scanner] Error: {e}")

        # Regime Detector (every 5 mins)
        try:
            if now - cache["regime"]["updated"] > CACHE_TTL:
                cache["regime"]["data"] = fetch_regime_data()
                cache["regime"]["updated"] = now
                logger.info(f"[Regime] {cache['regime']['data'].get('regime')}")
        except Exception as e:
            logger.error(f"[Regime] Error: {e}")

        # Correlation Matrix (every 10 mins)
        try:
            if now - cache["correlation"]["updated"] > 600:
                cache["correlation"]["data"] = fetch_correlation_matrix()
                cache["correlation"]["updated"] = now
                logger.info("[Correlation] Matrix refreshed")
        except Exception as e:
            logger.error(f"[Correlation] Error: {e}")

        # Whale Wallet Tracker (every 2 mins)
        try:
            if now - cache["whale_wallets"]["updated"] > 120:
                cache["whale_wallets"]["data"] = fetch_whale_wallets()
                cache["whale_wallets"]["updated"] = now
                logger.info(f"[WhaleWallet] {len(cache['whale_wallets']['data'])} large txs")
        except Exception as e:
            logger.error(f"[WhaleWallet] Error: {e}")

        # Liquidation Zones (every 2 mins)
        try:
            if now - cache["liq_zones"]["updated"] > 120:
                cache["liq_zones"]["data"] = fetch_liquidation_zones()
                cache["liq_zones"]["updated"] = now
                logger.info("[LiqZones] Zones refreshed")
        except Exception as e:
            logger.error(f"[LiqZones] Error: {e}")

        # Risk gauge critical alert
        try:
            risk = compute_risk_gauge()
            if risk.get("level") == "CRITICAL":
                if now - _last_critical_alert > CRITICAL_ALERT_COOLDOWN:
                    send_discord_alert(
                        "\U0001f6a8 CRITICAL RISK ALERT",
                        f"Risk Score: {risk['score']}\nLevel: {risk['label']}\n\nImmediate attention required!",
                        color=0xdc2626
                    )
                    _last_critical_alert = now
                    logger.warning(f"[Alert] CRITICAL risk alert sent (score={risk['score']})")
        except Exception:
            pass

        # BTC price snapshot (every 1 min)
        try:
            store_price_snapshot("BTC", "binance")
        except Exception as e:
            logger.error(f"[Snapshot] Error: {e}")

        # Check price alerts (every 1 min)
        try:
            check_price_alerts()
        except Exception as e:
            logger.error(f"[Alerts] Check loop error: {e}")

        # Cleanup stale rate-limit keys (every 10 min)
        try:
            cleanup_rate_limits()
        except Exception as e:
            logger.error(f"[RateLimit] Cleanup error: {e}")

        # Evaluate council predictions — multi-horizon
        try:
            evaluate_council_accuracy([15, 60, 240, 1440])
        except Exception as e:
            logger.error(f"[Eval] Error: {e}")

        time.sleep(60)


def startup_background_tasks():
    """Start background refresh thread (guarded against multi-worker duplication)."""
    global _bg_started
    if not _bg_started:
        _bg_started = True
        bg_thread = threading.Thread(target=refresh_cache, daemon=True)
        bg_thread.start()
        logger.info("[Startup] Background refresh thread started")
