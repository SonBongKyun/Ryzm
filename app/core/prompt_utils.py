"""
Ryzm Terminal — Prompt Utilities
Compresses market/news data to minimise AI token usage (Phase 2).
"""
from __future__ import annotations

from app.core.security import sanitize_external_text

# ── Token-budget constants (Gemini 2.0 Flash) ──
COUNCIL_MAX_OUTPUT = 1024
VALIDATE_MAX_OUTPUT = 800
CHAT_MAX_OUTPUT = 256


def compress_market(market: dict | None) -> str:
    """Convert full market dict to a compact one-liner.

    >>> {'BTC': {'price': 97234.5, 'change': 2.3, 'volume': ...}, ...}
    → 'BTC $97,234 +2.3% | ETH $3,842 -1.2% | SOL $234 +5.1%'
    """
    if not market or not isinstance(market, dict):
        return "N/A"
    priority = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA"]
    parts: list[str] = []

    def _fmt(sym: str, info: dict) -> str:
        p = info.get("price", 0)
        c = info.get("change", 0)
        sign = "+" if c >= 0 else ""
        if p >= 1000:
            return f"{sym} ${p:,.0f} {sign}{c:.1f}%"
        if p >= 1:
            return f"{sym} ${p:.2f} {sign}{c:.1f}%"
        return f"{sym} ${p:.4f} {sign}{c:.1f}%"

    for s in priority:
        if s in market and isinstance(market[s], dict):
            parts.append(_fmt(s, market[s]))
    for s, v in market.items():
        if s not in priority and isinstance(v, dict):
            parts.append(_fmt(s, v))
    return " | ".join(parts) or "N/A"


def compress_news(news: list | None, n: int = 5) -> str:
    """Headlines only, numbered, max *n* items, ≤80 chars each."""
    if not news:
        return "None"
    lines: list[str] = []
    for i, item in enumerate(news[:n]):
        t = item.get("title", "") if isinstance(item, dict) else str(item)
        t = sanitize_external_text(t)[:80]
        if t:
            lines.append(f"{i + 1}. {t}")
    return "\n".join(lines) or "None"


def generation_config(max_tokens: int = 1024) -> dict:
    """Return a Gemini GenerationConfig dict with JSON mime type + token cap."""
    return {
        "response_mime_type": "application/json",
        "max_output_tokens": max_tokens,
        "temperature": 0.7,
    }
