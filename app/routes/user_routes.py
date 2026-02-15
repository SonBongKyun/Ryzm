"""
Ryzm Terminal — User API Routes
Usage stats, feature gating, price alerts, layout persistence, data export.
"""
import csv
import io
import json
import uuid

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse, StreamingResponse

from app.core.logger import logger
from app.core.config import DAILY_FREE_LIMITS, DAILY_PRO_LIMITS, MAX_FREE_ALERTS, MAX_PRO_ALERTS, PriceAlertRequest, LayoutSaveRequest
from app.core.database import (
    db_connect, _db_lock, utc_now_str, count_usage_today,
    get_user_by_id, get_council_history,
)
from app.core.security import get_or_create_uid, get_user_tier, check_pro
from app.core.auth import get_current_user

router = APIRouter()


@router.get("/api/me")
def get_me(request: Request):
    """Return user identity + daily usage stats (supports both anonymous & authenticated)."""
    auth_user = get_current_user(request)
    uid = request.cookies.get("ryzm_uid") or str(uuid.uuid4())
    tier = "free"
    user_info = None

    if auth_user:
        user = get_user_by_id(int(auth_user["sub"]))
        if user:
            tier = user["tier"]
            uid = user.get("uid") or uid
            user_info = {
                "user_id": user["id"],
                "email": user["email"],
                "display_name": user["display_name"],
            }

    limits = DAILY_PRO_LIMITS if tier == "pro" else DAILY_FREE_LIMITS
    usage = {}
    for ep, limit in limits.items():
        used = count_usage_today(uid, ep)
        usage[ep] = {"used": used, "limit": limit, "remaining": max(0, limit - used)}

    content = {"uid": uid, "usage": usage, "tier": tier}
    if user_info:
        content["user"] = user_info

    response = JSONResponse(content=content)
    if not request.cookies.get("ryzm_uid"):
        response.set_cookie("ryzm_uid", uid, max_age=86400 * 365, httponly=True, samesite="lax", secure=True)
    return response


@router.get("/api/check-feature/{feature}")
def check_feature(feature: str, request: Request):
    """Check if current user can access a Pro feature."""
    uid = request.cookies.get("ryzm_uid") or "anonymous"
    tier = get_user_tier(uid)
    allowed = check_pro(uid, feature)
    return {"feature": feature, "allowed": allowed, "tier": tier}


# ─── Price Alert System ───
@router.get("/api/alerts")
def get_alerts(request: Request):
    """Get all active (un-triggered) alerts for this user."""
    uid = request.cookies.get("ryzm_uid")
    if not uid:
        return {"alerts": [], "triggered": []}
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute(
                "SELECT id, symbol, target_price, direction, note, created_at_utc FROM price_alerts WHERE uid = ? AND triggered = 0 ORDER BY created_at_utc DESC",
                (uid,)
            )
            active = [{"id": r[0], "symbol": r[1], "target_price": r[2], "direction": r[3], "note": r[4], "created_at": r[5]} for r in c.fetchall()]
            c.execute(
                "SELECT id, symbol, target_price, direction, note, triggered_at_utc FROM price_alerts WHERE uid = ? AND triggered = 1 ORDER BY triggered_at_utc DESC LIMIT 20",
                (uid,)
            )
            triggered = [{"id": r[0], "symbol": r[1], "target_price": r[2], "direction": r[3], "note": r[4], "triggered_at": r[5]} for r in c.fetchall()]
            conn.close()
        return {"alerts": active, "triggered": triggered}
    except Exception as e:
        logger.error(f"[Alerts] Fetch error: {e}")
        return {"alerts": [], "triggered": []}


@router.post("/api/alerts")
def create_alert(request: PriceAlertRequest, http_request: Request, response: Response):
    """Create a new price alert."""
    uid = get_or_create_uid(http_request, response)
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute("SELECT COUNT(*) FROM price_alerts WHERE uid = ? AND triggered = 0", (uid,))
            count = c.fetchone()[0]
            conn.close()
        if count >= MAX_FREE_ALERTS and get_user_tier(uid) != "pro":
            raise HTTPException(status_code=403, detail=f"Free tier limit: {MAX_FREE_ALERTS} active alerts. Upgrade to Pro for unlimited.")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Alerts] Count error: {e}")

    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute(
                "INSERT INTO price_alerts (uid, symbol, target_price, direction, note, created_at_utc) VALUES (?, ?, ?, ?, ?, ?)",
                (uid, request.symbol.upper(), request.target_price, request.direction, request.note, utc_now_str())
            )
            alert_id = c.lastrowid
            conn.commit()
            conn.close()
        logger.info(f"[Alerts] Created alert #{alert_id}: {request.symbol} {request.direction} ${request.target_price}")
        return {"status": "created", "id": alert_id}
    except Exception as e:
        logger.error(f"[Alerts] Create error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create alert")


@router.delete("/api/alerts/{alert_id}")
def delete_alert(alert_id: int, request: Request):
    """Delete a price alert (only owner can delete)."""
    uid = request.cookies.get("ryzm_uid")
    if not uid:
        raise HTTPException(status_code=401, detail="No user identity")
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute("DELETE FROM price_alerts WHERE id = ? AND uid = ?", (alert_id, uid))
            deleted = c.rowcount
            conn.commit()
            conn.close()
        if deleted == 0:
            raise HTTPException(status_code=404, detail="Alert not found")
        return {"status": "deleted", "id": alert_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Alerts] Delete error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete alert")


# ─── Layout Server Save ───
@router.get("/api/layout")
def get_layout(request: Request):
    """Get saved dashboard layout for this user."""
    uid = request.cookies.get("ryzm_uid")
    if not uid:
        return {"layout": None}
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute("SELECT layout_json FROM user_layouts WHERE uid = ? ORDER BY updated_at_utc DESC LIMIT 1", (uid,))
            row = c.fetchone()
            conn.close()
        if row:
            return {"layout": json.loads(row[0])}
        return {"layout": None}
    except Exception as e:
        logger.error(f"[Layout] Fetch error: {e}")
        return {"layout": None}


@router.post("/api/layout")
def save_layout(request: LayoutSaveRequest, http_request: Request, response: Response):
    """Save dashboard panel layout for this user."""
    uid = get_or_create_uid(http_request, response)
    layout_json = json.dumps(request.panels)
    try:
        with _db_lock:
            conn = db_connect()
            c = conn.cursor()
            c.execute(
                "INSERT OR REPLACE INTO user_layouts (uid, layout_json, updated_at_utc) VALUES (?, ?, ?)",
                (uid, layout_json, utc_now_str())
            )
            conn.commit()
            conn.close()
        logger.info(f"[Layout] Saved for uid={uid[:8]}...")
        return {"status": "saved"}
    except Exception as e:
        logger.error(f"[Layout] Save error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save layout")


# ─── Pro Feature: CSV Export ───
@router.get("/api/export/council-history")
def export_council_csv(request: Request, response: Response):
    """Export council prediction history as CSV (Pro feature)."""
    uid = get_or_create_uid(request, response)
    tier = get_user_tier(uid)
    if tier != "pro":
        raise HTTPException(status_code=403, detail="Pro subscription required for data export. Upgrade to unlock.")
    records = get_council_history(limit=500)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id", "timestamp", "consensus_score", "prediction", "confidence", "btc_price", "btc_price_after", "hit", "return_pct", "vibe_status"])
    for r in records:
        writer.writerow([
            r.get("id"), r.get("timestamp"), r.get("consensus_score"),
            r.get("prediction"), r.get("confidence"),
            r.get("btc_price"), r.get("btc_price_after"),
            r.get("hit"), r.get("return_pct"), r.get("vibe_status"),
        ])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=ryzm_council_history.csv"},
    )
