"""
Ryzm Terminal — Admin API Routes
Infographic generation, briefing publishing, admin page.
"""
import json
from datetime import datetime, timezone

import requests
from fastapi import APIRouter, HTTPException, Request
from fastapi.templating import Jinja2Templates

from app.core.logger import logger
from app.core.config import DISCORD_WEBHOOK_URL, InfographicRequest, BriefingRequest, SetTierRequest
from app.core.cache import cache
from app.core.database import db_session, utc_now_str, update_user_tier, get_user_by_uid
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
        resp = requests.post(DISCORD_WEBHOOK_URL, json=discord_data, timeout=10)
        resp.raise_for_status()
        logger.info("[Admin] Successfully published to Discord")
        return {"status": "success", "message": "Published to Discord & DB"}
    except requests.RequestException as e:
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
