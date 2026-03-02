"""
Ryzm Terminal — Admin API Routes
#23 Revenue metrics (MRR, churn, growth)
#24 Feature flags management
Infographic generation, briefing publishing, admin page, user management, system monitoring.
"""
import json
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Request, Query, Body
from fastapi.templating import Jinja2Templates

from app.core.logger import logger
from app.core.config import (
    DISCORD_WEBHOOK_URL, InfographicRequest, BriefingRequest, SetTierRequest,
    AdminChangeTierRequest, AdminAnnouncementRequest, AdminToggleAnnouncementRequest,
)
from app.core.cache import cache
from app.core.database import (
    db_session, utc_now_str, update_user_tier, get_user_by_uid,
    admin_get_users, admin_get_stats, admin_get_system_info, admin_delete_user,
    admin_create_announcement, admin_get_announcements, admin_toggle_announcement,
    admin_get_revenue_metrics, get_feature_flags, set_feature_flag,
)
from app.core.security import require_admin
from app.core.ai_client import call_gemini

router = APIRouter()
templates = Jinja2Templates(directory="templates")


@router.post("/api/admin/generate-infographic")
def generate_infographic_api(request: InfographicRequest, http_request: Request):
    """Generate Ryzm-style SVG infographic."""
    require_admin(http_request)
    topic = request.topic or "Bitcoin Market Cycle"
    if not topic.strip():
        raise HTTPException(status_code=400, detail="Topic is required")

    prompt = f"""
    You are a visionary UI Data Designer for 'Ryzm Terminal'.
    Create a **Cyberpunk-style SVG Infographic** explaining: "{topic}".
    
    [Design System Specs]
    - Canvas: 800x500 pixels.
    - Background: #05050a (Deep Void).
    - Palette: Neon Cyan (#06b6d4), Magenta (#ec4899), Yellow (#facc15).
    - Font: sans-serif (ensure readable text).
    
    [Content Requirement]
    1. **Central Visual**: A minimal, geometric abstraction representing '{topic}'.
    2. **Title**: Large, centered at top ("{topic}").
    3. **Key Points**: 3 short bullet points at the bottom.
    4. **Watermark**: "Ryzm Terminal Analysis" (bottom right, small, opacity 0.5).
    
    [Output]
    Return ONLY the raw <svg>...</svg> code. No markdown formatting.
    """

    try:
        svg_code = call_gemini(prompt, json_mode=False, max_tokens=2048)
        svg_code = svg_code.replace("```svg", "").replace("```xml", "").replace("```", "").strip()
        logger.info(f"[Admin] Generated infographic for topic: {topic}")
        return {"status": "success", "svg": svg_code}
    except Exception as e:
        logger.error(f"[Admin] Infographic generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate infographic: {str(e)}")


@router.post("/api/admin/publish-briefing")
def publish_briefing(request: BriefingRequest, http_request: Request):
    """Save briefing to DB + send to Discord."""
    require_admin(http_request)
    if not request.title or not request.content:
        raise HTTPException(status_code=400, detail="Title and content are required")

    title = request.title
    content = request.content
    ts_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    try:
        with db_session() as (conn, c):
            c.execute(
                "INSERT INTO briefings (title, content, created_at_utc) VALUES (?, ?, ?)",
                (title, content, datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"))
            )
    except Exception as e:
        logger.error(f"[Admin] Briefing DB save error: {e}")

    cache["latest_briefing"] = {"title": title, "content": content, "time": ts_utc}
    logger.info(f"[Admin] Briefing saved: {title}")

    if not DISCORD_WEBHOOK_URL or DISCORD_WEBHOOK_URL == "YOUR_DISCORD_WEBHOOK_URL_HERE":
        logger.warning("[Admin] Discord webhook URL not configured")
        return {"status": "warning", "message": "Saved to DB. Discord webhook URL not configured."}

    discord_data = {
        "username": "Ryzm Operator",
        "avatar_url": "https://i.imgur.com/8QZ7r7s.png",
        "embeds": [{
            "title": f"📜 {title}",
            "description": content,
            "color": 5763719,
            "footer": {"text": "Ryzm Terminal • Daily Insight"}
        }]
    }

    try:
        with httpx.Client(timeout=10) as client:
            resp = client.post(DISCORD_WEBHOOK_URL, json=discord_data)
            resp.raise_for_status()
        logger.info("[Admin] Successfully published to Discord")
        return {"status": "success", "message": "Published to Discord & DB"}
    except httpx.HTTPError as e:
        logger.error(f"[Admin] Discord publish error: {e}")
        return {"status": "partial", "message": f"Saved to DB but Discord failed: {str(e)}"}


@router.get("/admin")
def admin_page(request: Request):
    require_admin(request)  # PR-3: protect admin page
    return templates.TemplateResponse(request=request, name="admin.html")


@router.post("/api/admin/set-tier")
def admin_set_tier(request: Request, body: SetTierRequest):
    """Admin endpoint to change a user's subscription tier."""
    require_admin(request)
    user = get_user_by_uid(body.uid)
    if not user:
        raise HTTPException(status_code=404, detail=f"User with uid={body.uid} not found")
    update_user_tier(user["id"], body.tier)
    logger.info(f"[Admin] Set tier for uid={body.uid[:8]}... → {body.tier}")
    return {"status": "ok", "uid": body.uid, "tier": body.tier}


# ───────────────────────────────────────
# Phase 1: Admin Dashboard APIs
# ───────────────────────────────────────

@router.get("/api/admin/users")
def api_admin_users(
    request: Request,
    search: str = Query("", max_length=200),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """Paginated user list with search."""
    require_admin(request)
    return admin_get_users(search=search, page=page, per_page=per_page)


@router.get("/api/admin/stats")
def api_admin_stats(request: Request):
    """Dashboard statistics — user counts, usage, trends."""
    require_admin(request)
    return admin_get_stats()


@router.get("/api/admin/system")
def api_admin_system(request: Request):
    """System monitoring — cache status, DB size."""
    require_admin(request)
    return admin_get_system_info()


@router.post("/api/admin/users/{user_id}/tier")
def api_admin_change_tier(user_id: int, body: AdminChangeTierRequest, request: Request):
    """Change user tier by user_id."""
    require_admin(request)
    update_user_tier(user_id, body.tier)
    logger.info(f"[Admin] User {user_id} tier → {body.tier}")
    return {"status": "ok", "user_id": user_id, "tier": body.tier}


@router.delete("/api/admin/users/{user_id}")
def api_admin_delete_user(user_id: int, request: Request):
    """Delete a user and all associated data."""
    require_admin(request)
    ok = admin_delete_user(user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="User not found")
    return {"status": "deleted", "user_id": user_id}


@router.get("/api/admin/announcements")
def api_admin_announcements(request: Request, all: bool = Query(False)):
    """Get announcements (active only by default)."""
    require_admin(request)
    return admin_get_announcements(active_only=not all)


@router.post("/api/admin/announcements")
def api_admin_create_announcement(body: AdminAnnouncementRequest, request: Request):
    """Create announcement."""
    require_admin(request)
    ann_id = admin_create_announcement(body.title, body.content, body.level)
    if not ann_id:
        raise HTTPException(status_code=500, detail="Failed to create announcement")
    return {"status": "created", "id": ann_id}


@router.post("/api/admin/announcements/{ann_id}/toggle")
def api_admin_toggle_announcement(ann_id: int, body: AdminToggleAnnouncementRequest, request: Request):
    """Toggle announcement active/inactive."""
    require_admin(request)
    ok = admin_toggle_announcement(ann_id, body.active)
    if not ok:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return {"status": "ok", "id": ann_id, "active": body.active}


# ── Public: Get active announcements (no admin token required) ──
@router.get("/api/announcements")
def api_public_announcements():
    """Get active announcements for all users."""
    return admin_get_announcements(active_only=True)


# ───────────────────────────────────────
# #23 Revenue Metrics
# ───────────────────────────────────────
@router.get("/api/admin/revenue")
def api_admin_revenue(request: Request):
    """Revenue dashboard — MRR, churn, growth metrics."""
    require_admin(request)
    return admin_get_revenue_metrics()


# ───────────────────────────────────────
# #24 Feature Flags
# ───────────────────────────────────────
@router.get("/api/admin/feature-flags")
def api_admin_get_feature_flags(request: Request):
    """Get all feature flags."""
    require_admin(request)
    return get_feature_flags()


@router.post("/api/admin/feature-flags/{flag_key}")
def api_admin_set_feature_flag(
    flag_key: str,
    request: Request,
    body: dict = Body(default={}),
):
    """Set or update a feature flag."""
    require_admin(request)
    enabled = body.get("enabled", True)
    rollout_pct = body.get("rollout_pct", 100)
    ok = set_feature_flag(flag_key, bool(enabled), int(rollout_pct))
    if not ok:
        raise HTTPException(500, "Failed to set feature flag")
    logger.info(f"[Admin] Feature flag '{flag_key}' -> enabled={enabled}, rollout={rollout_pct}%")
    return {"status": "ok", "key": flag_key, "enabled": enabled, "rollout_pct": rollout_pct}


# ── Public: Feature flags for client ──
@router.get("/api/feature-flags")
def api_public_feature_flags():
    """Get enabled feature flags (public — for frontend feature gating)."""
    flags = get_feature_flags()
    return {k: v["enabled"] for k, v in flags.items()}
