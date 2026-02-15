"""
Ryzm Terminal — Security & Utilities
Rate limiter, admin auth, input sanitization, AI response parsing/validation.
"""
import re
import json
import time
import uuid
from collections import defaultdict
from typing import Dict

from fastapi import HTTPException, Request, Response

from app.core.config import (
    ADMIN_TOKEN, RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_GENERAL,
    RATE_LIMIT_MAX_AI, PRO_FEATURES,
    CouncilResponse, ValidatorResponse, ChatResponse,
)
from app.core.logger import logger


# ── Rate Limiter (in-memory, per-IP) ──
_rate_limits: Dict[str, list] = defaultdict(list)
_rate_limit_last_cleanup = 0


def check_rate_limit(ip: str, category: str = "general") -> bool:
    """Return True if request is allowed, False if rate limited."""
    now = time.time()
    key = f"{ip}:{category}"
    _rate_limits[key] = [t for t in _rate_limits[key] if now - t < RATE_LIMIT_WINDOW]
    max_req = RATE_LIMIT_MAX_AI if category == "ai" else (10 if category == "auth" else RATE_LIMIT_MAX_GENERAL)
    if len(_rate_limits[key]) >= max_req:
        return False
    _rate_limits[key].append(now)
    return True


def cleanup_rate_limits():
    """Remove stale rate-limit keys to prevent memory leak."""
    global _rate_limit_last_cleanup
    now = time.time()
    if now - _rate_limit_last_cleanup < 600:
        return
    _rate_limit_last_cleanup = now
    stale = [k for k, v in _rate_limits.items() if not v or (now - max(v)) > RATE_LIMIT_WINDOW * 2]
    for k in stale:
        del _rate_limits[k]
    if stale:
        logger.debug(f"[RateLimit] Cleaned {len(stale)} stale keys")


# ── Admin Auth ──
def require_admin(request: Request) -> None:
    if not ADMIN_TOKEN:
        logger.error("ADMIN_TOKEN is not configured")
        raise HTTPException(status_code=500, detail="Admin token not configured")
    token = request.headers.get("X-Admin-Token")
    if token != ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


# ── Gemini JSON Parsing ──
def parse_gemini_json(text: str) -> dict:
    """Robustly extract JSON from Gemini response."""
    cleaned = text.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    match = re.search(r'\{[\s\S]*\}', cleaned)
    if match:
        candidate = match.group()
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass
        repaired = candidate
        repaired = re.sub(r',\s*([}\]])', r'\1', repaired)
        repaired = repaired.replace("'", '"')
        repaired = re.sub(r'(?<!\\)\n', ' ', repaired)
        try:
            return json.loads(repaired)
        except json.JSONDecodeError:
            pass
    raise ValueError(f"Could not parse JSON from Gemini response: {cleaned[:200]}")


# ── AI Response Validation ──
def validate_ai_response(raw: dict, model_class):
    """Validate AI JSON response against Pydantic schema with safe degradation."""
    try:
        validated = model_class.model_validate(raw)
        return validated.model_dump()
    except Exception as e:
        logger.warning(f"[AI] Response validation warning ({model_class.__name__}): {e}")
        try:
            defaults = model_class().model_dump()
            if isinstance(raw, dict):
                for key in defaults:
                    if key in raw and raw[key] is not None:
                        defaults[key] = raw[key]
                if "consensus_score" in defaults:
                    defaults["consensus_score"] = max(0, min(100, int(defaults.get("consensus_score", 50))))
                if "overall_score" in defaults:
                    defaults["overall_score"] = max(0, min(100, int(defaults.get("overall_score", 50))))
            defaults["_ai_fallback"] = True
            return defaults
        except Exception:
            fallback = model_class().model_dump()
            fallback["_ai_fallback"] = True
            return fallback


# ── Prompt Injection Defense ──
def sanitize_external_text(text: str, max_len: int = 500) -> str:
    """Sanitize external text before prompt injection."""
    if not isinstance(text, str):
        return ""
    text = text[:max_len]
    injection_patterns = [
        r'(?i)ignore\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts?)',
        r'(?i)you\s+are\s+now\s+',
        r'(?i)system\s*:\s*',
        r'(?i)assistant\s*:\s*',
        r'(?i)return\s+json\s*:?\s*\{',
        r'(?i)output\s*:\s*\{',
    ]
    for pattern in injection_patterns:
        text = re.sub(pattern, '[FILTERED]', text)
    return text


# ── Anonymous UID ──
def get_or_create_uid(request: Request, response: Response) -> str:
    """Get anonymous UID from cookie, or create one."""
    uid = request.cookies.get("ryzm_uid")
    if not uid:
        uid = str(uuid.uuid4())
        response.set_cookie("ryzm_uid", uid, max_age=86400 * 365, httponly=True, samesite="lax")
    return uid


# ── Pro Feature Gating ──
def get_user_tier(uid: str) -> str:
    """Return 'free' or 'pro' based on DB lookup."""
    from app.core.database import get_user_by_uid
    user = get_user_by_uid(uid)
    if user:
        return user.get("tier", "free")
    return "free"


def check_pro(uid: str, feature: str) -> bool:
    """Return True if user can access this feature."""
    if feature not in PRO_FEATURES:
        return True
    return get_user_tier(uid) == "pro"
