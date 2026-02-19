"""
Ryzm Terminal — Daily Briefing Bot
Scheduled job: sends a market summary to Discord every morning at 09:00 KST.
"""
import requests
from datetime import datetime, timezone, timedelta

from app.core.logger import logger
from app.core.config import DISCORD_WEBHOOK_URL
from app.core.cache import cache

KST = timezone(timedelta(hours=9))


def _build_briefing_text() -> str:
    """Aggregate cached data into a concise daily briefing string."""
    lines = ["**RYZM DAILY BRIEFING**", f"_{datetime.now(KST).strftime('%Y-%m-%d %H:%M KST')}_\n"]

    # ── Fear & Greed ──
    fg = cache.get("fear_greed", {}).get("data")
    if fg and isinstance(fg, dict):
        lines.append(f"**Fear & Greed Index:** {fg.get('score', '?')} — {fg.get('label', '?')}")

    # ── Market overview (BTC, ETH, SOL) ──
    market = cache.get("market", {}).get("data")
    if market and isinstance(market, dict):
        for sym in ("BTC", "ETH", "SOL"):
            info = market.get(sym, {})
            price = info.get("price")
            chg = info.get("change")
            if price is not None:
                arrow = "▲" if (chg or 0) >= 0 else "▼"
                lines.append(f"**{sym}:** ${price:,.2f}  {arrow} {chg:+.2f}%")

    # ── Funding Rates ──
    fr_data = cache.get("funding_rate", {}).get("data")
    if fr_data and isinstance(fr_data, list):
        rates = []
        for item in fr_data:
            sym = item.get("symbol", "")
            rate = item.get("rate")
            if sym and rate is not None:
                rates.append(f"{sym}: {rate:.4f}%")
        if rates:
            lines.append(f"**Funding:** {' | '.join(rates)}")

    # ── Risk Gauge ──
    risk = cache.get("risk_gauge", {}).get("data")
    if risk and isinstance(risk, dict):
        score = risk.get("score")
        label = risk.get("label", "")
        if score is not None:
            lines.append(f"**Risk Gauge:** {score}  ({label})")

    # ── Kimchi Premium ──
    kimchi = cache.get("kimchi", {}).get("data")
    if kimchi and isinstance(kimchi, dict):
        prem = kimchi.get("premium")
        if prem is not None:
            lines.append(f"**Kimchi Premium:** {prem:+.2f}%")

    if len(lines) <= 2:
        lines.append("_No cached data available yet. Briefing will improve as data populates._")

    lines.append("\n— *Ryzm Terminal  ·  macro · charts · reality checks*")
    return "\n".join(lines)


def send_daily_briefing():
    """Generate and send daily market briefing to Discord + cache + DB."""
    text = _build_briefing_text()
    title = f"Daily Briefing — {datetime.now(KST).strftime('%Y-%m-%d')}"
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")

    # Always populate cache for /api/briefing
    cache["latest_briefing"] = {"title": title, "content": text, "time": now_str}

    # Also store in DB for history
    try:
        from app.core.database import db_session
        import sqlite3
        with db_session() as (conn, c):
            c.execute("INSERT INTO briefings (title, content, created_at_utc) VALUES (?, ?, ?)",
                      (title, text, now_str))
    except Exception as db_err:
        logger.warning(f"[Briefing] DB save failed: {db_err}")

    if not DISCORD_WEBHOOK_URL or "YOUR_DISCORD" in DISCORD_WEBHOOK_URL.upper():
        logger.info("[Briefing] Briefing cached (Discord webhook not configured).")
        return

    try:
        payload = {
            "username": "Ryzm Daily Briefing",
            "avatar_url": "https://i.imgur.com/8QZ7r7s.png",
            "embeds": [{
                "title": "Daily Market Briefing",
                "description": text,
                "color": 0xC9A96E,  # Ryzm gold
                "footer": {"text": "Ryzm Terminal — Automated Report"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }],
        }
        resp = requests.post(DISCORD_WEBHOOK_URL, json=payload, timeout=15)
        resp.raise_for_status()
        logger.info("[Briefing] Daily briefing sent successfully.")
    except Exception as e:
        logger.error(f"[Briefing] Failed to send daily briefing: {e}")


def setup_daily_scheduler():
    """Register APScheduler cron job: 09:00 KST every day."""
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger

        scheduler = BackgroundScheduler(daemon=True)
        trigger = CronTrigger(hour=9, minute=0, timezone=KST)  # 09:00 KST
        scheduler.add_job(send_daily_briefing, trigger, id="daily_briefing", replace_existing=True)
        scheduler.start()
        logger.info("[Briefing] Daily briefing scheduler started — 09:00 KST")
    except ImportError:
        logger.warning("[Briefing] APScheduler not installed — daily briefing disabled.")
    except Exception as e:
        logger.error(f"[Briefing] Scheduler setup failed: {e}")
