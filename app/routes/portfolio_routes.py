"""
Ryzm Terminal — Portfolio & Accuracy API Routes
Portfolio tracker CRUD + Council accuracy dashboard.
"""
from fastapi import APIRouter, HTTPException, Request

from app.core.logger import logger
from app.core.auth import get_current_user
from app.core.config import PortfolioHoldingRequest
from app.core.database import (
    get_user_by_id,
    upsert_portfolio_holding,
    get_portfolio_holdings,
    delete_portfolio_holding,
    get_council_accuracy_summary,
    get_multi_horizon_accuracy,
    update_user_onboarding_step,
)
from app.core.cache import cache

router = APIRouter(tags=["portfolio"])


# ── Portfolio CRUD ──
@router.get("/api/portfolio")
def get_portfolio(request: Request):
    """Get user's portfolio holdings with live valuations."""
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Login required")

    user_id = int(user_data["sub"])
    holdings = get_portfolio_holdings(user_id)

    # Enrich with current prices
    market = cache.get("market", {}).get("data", {})
    total_value = 0
    total_cost = 0
    enriched = []

    for h in holdings:
        symbol = h["symbol"].replace("USDT", "")
        price_data = market.get(symbol, {})
        current_price = price_data.get("price", 0)
        change_24h = price_data.get("change", 0)

        value = h["amount"] * current_price
        cost = h["amount"] * h["avg_price"] if h["avg_price"] > 0 else 0
        pnl = value - cost if cost > 0 else 0
        pnl_pct = ((value / cost) - 1) * 100 if cost > 0 else 0

        total_value += value
        total_cost += cost

        enriched.append({
            "symbol": h["symbol"],
            "amount": h["amount"],
            "avg_price": h["avg_price"],
            "current_price": current_price,
            "change_24h": change_24h,
            "value": round(value, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 2),
        })

    # Calculate weights
    for item in enriched:
        item["weight_pct"] = round((item["value"] / total_value) * 100, 1) if total_value > 0 else 0

    return {
        "holdings": enriched,
        "total_value": round(total_value, 2),
        "total_cost": round(total_cost, 2),
        "total_pnl": round(total_value - total_cost, 2),
        "total_pnl_pct": round(((total_value / total_cost) - 1) * 100, 2) if total_cost > 0 else 0,
    }


@router.post("/api/portfolio")
def add_holding(request: Request, body: PortfolioHoldingRequest):
    """Add or update a portfolio holding."""
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Login required")

    ok = upsert_portfolio_holding(
        int(user_data["sub"]),
        body.symbol,
        body.amount,
        body.avg_price
    )
    if not ok:
        raise HTTPException(500, "Failed to save holding")
    return {"status": "ok"}


@router.delete("/api/portfolio/{symbol}")
def remove_holding(symbol: str, request: Request):
    """Remove a portfolio holding."""
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Login required")

    deleted = delete_portfolio_holding(int(user_data["sub"]), symbol)
    if not deleted:
        raise HTTPException(404, "Holding not found")
    return {"status": "ok"}


# ── Council Accuracy Dashboard ──
@router.get("/api/council/accuracy")
def council_accuracy():
    """Get Council prediction accuracy stats."""
    summary = get_council_accuracy_summary()
    horizon = get_multi_horizon_accuracy()
    return {
        "summary": summary,
        "horizons": horizon,
    }


# ── Onboarding Progress ──
@router.post("/api/onboarding/step")
async def update_onboarding(request: Request):
    """Update user's onboarding step."""
    user_data = get_current_user(request)
    if not user_data:
        return {"status": "ok"}  # Silent fail for anonymous users

    try:
        import json
        body = await request.json()
        step = int(body.get("step", 0))
        update_user_onboarding_step(int(user_data["sub"]), step)
        return {"status": "ok", "step": step}
    except Exception:
        return {"status": "ok"}
