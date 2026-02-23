"""
Ryzm Terminal — Telegram Bot Service
Send alerts, briefings, and notifications to Telegram.
"""
import requests
from app.core.config import TELEGRAM_BOT_TOKEN, TELEGRAM_DEFAULT_CHAT_ID
from app.core.logger import logger

_BASE_URL = "https://api.telegram.org/bot{token}"


def _url(method: str) -> str:
    return f"{_BASE_URL.format(token=TELEGRAM_BOT_TOKEN)}/{method}"


def is_configured() -> bool:
    return bool(TELEGRAM_BOT_TOKEN and TELEGRAM_DEFAULT_CHAT_ID)


def send_message(text: str, chat_id: str | None = None, parse_mode: str = "HTML") -> bool:
    """Send a text message to Telegram. Returns True on success."""
    if not TELEGRAM_BOT_TOKEN:
        logger.warning("[Telegram] BOT_TOKEN not configured — skipping send")
        return False
    cid = chat_id or TELEGRAM_DEFAULT_CHAT_ID
    if not cid:
        logger.warning("[Telegram] No chat_id — skipping send")
        return False
    try:
        resp = requests.post(
            _url("sendMessage"),
            json={"chat_id": cid, "text": text, "parse_mode": parse_mode},
            timeout=10,
        )
        if resp.status_code != 200:
            logger.error(f"[Telegram] API error {resp.status_code}: {resp.text[:200]}")
            return False
        return True
    except Exception as e:
        logger.error(f"[Telegram] Send failed: {e}")
        return False


def send_alert(title: str, body: str, chat_id: str | None = None) -> bool:
    """Format and send an alert message."""
    msg = f"🚨 <b>{title}</b>\n\n{body}\n\n<i>— Ryzm Terminal</i>"
    return send_message(msg, chat_id)


def send_briefing(title: str, content: str, chat_id: str | None = None) -> bool:
    """Send a daily briefing summary."""
    msg = f"📊 <b>{title}</b>\n\n{content}\n\n<i>— Ryzm Terminal</i>"
    return send_message(msg, chat_id)


def send_council_result(verdict: str, score: int, summary: str, chat_id: str | None = None) -> bool:
    """Send council analysis result."""
    emoji = "🟢" if verdict == "LONG" else "🔴" if verdict == "SHORT" else "⚪"
    msg = (
        f"{emoji} <b>AI Council Result</b>\n\n"
        f"Verdict: <b>{verdict}</b> (Score: {score}/100)\n"
        f"{summary}\n\n"
        f"<i>— Ryzm Terminal</i>"
    )
    return send_message(msg, chat_id)
