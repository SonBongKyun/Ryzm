"""
Ryzm Terminal — Payment API Routes (Stripe)
Checkout session, webhooks, customer portal, subscription status.
Stripe is lazy-loaded so the app runs fine without STRIPE_SECRET_KEY.
"""
import os

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.core.logger import logger
from app.core.auth import get_current_user
from app.core.database import (
    get_user_by_id, update_user_tier, update_user_stripe_customer,
    create_subscription, update_subscription_status,
    get_active_subscription, get_subscription_by_stripe_id,
)

router = APIRouter(prefix="/api/payments", tags=["payments"])

# ── Stripe Config (optional — app works without it) ──
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRICE_ID_PRO = os.getenv("STRIPE_PRICE_ID_PRO", "")
SITE_URL = os.getenv("SITE_URL", "http://localhost:8000")

_stripe = None


def _get_stripe():
    """Lazy-import stripe SDK. Raises 503 if not configured."""
    global _stripe
    if _stripe is None:
        if not STRIPE_SECRET_KEY:
            raise HTTPException(503, "Payment system not configured. Set STRIPE_SECRET_KEY.")
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        _stripe = stripe
    return _stripe


# ────────────────────────────────────────
@router.post("/create-checkout")
def create_checkout(request: Request):
    """Create a Stripe Checkout Session for Pro subscription."""
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Login required to subscribe")

    stripe = _get_stripe()
    user = get_user_by_id(int(user_data["sub"]))
    if not user:
        raise HTTPException(404, "User not found")
    if user["tier"] == "pro":
        raise HTTPException(400, "Already a Pro subscriber")

    try:
        customer_id = user.get("stripe_customer_id")
        if not customer_id:
            customer = stripe.Customer.create(email=user["email"])
            customer_id = customer.id
            update_user_stripe_customer(user["id"], customer_id)

        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=[{"price": STRIPE_PRICE_ID_PRO, "quantity": 1}],
            success_url=f"{SITE_URL}/?payment=success",
            cancel_url=f"{SITE_URL}/?payment=canceled",
            metadata={"user_id": str(user["id"])},
        )
        return {"checkout_url": session.url}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Stripe] Checkout error: {e}")
        raise HTTPException(500, "Failed to create checkout session")


@router.post("/webhook")
async def stripe_webhook(request: Request):
    """Handle Stripe webhook events (subscription lifecycle)."""
    stripe = _get_stripe()
    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig, STRIPE_WEBHOOK_SECRET)
    except Exception as e:
        logger.error(f"[Stripe] Webhook verification failed: {e}")
        raise HTTPException(400, "Invalid webhook signature")

    etype = event["type"]
    data = event["data"]["object"]
    logger.info(f"[Stripe] Webhook: {etype}")

    if etype == "checkout.session.completed":
        user_id = int(data["metadata"].get("user_id", 0))
        sub_id = data.get("subscription")
        if user_id and sub_id:
            try:
                sub = stripe.Subscription.retrieve(sub_id)
                create_subscription(
                    user_id=user_id,
                    stripe_sub_id=sub_id,
                    plan="pro",
                    period_end=str(sub.get("current_period_end", "")),
                )
                update_user_tier(user_id, "pro")
                logger.info(f"[Stripe] User {user_id} upgraded to Pro")
            except Exception as e:
                logger.error(f"[Stripe] Subscription creation error: {e}")

    elif etype in ("customer.subscription.updated", "customer.subscription.deleted"):
        sub_id = data.get("id")
        status = data.get("status", "canceled")
        period_end = str(data.get("current_period_end", ""))
        update_subscription_status(sub_id, status, period_end)

        if status in ("canceled", "unpaid", "past_due"):
            sub_record = get_subscription_by_stripe_id(sub_id)
            if sub_record:
                update_user_tier(sub_record["user_id"], "free")
                logger.info(f"[Stripe] User {sub_record['user_id']} downgraded to free")

    elif etype == "invoice.payment_failed":
        logger.warning(f"[Stripe] Payment failed for customer {data.get('customer')}")

    return {"received": True}


@router.get("/status")
def get_payment_status(request: Request):
    """Get current subscription status."""
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Login required")

    user = get_user_by_id(int(user_data["sub"]))
    sub = get_active_subscription(int(user_data["sub"]))

    return {
        "tier": user["tier"] if user else "free",
        "subscription": {
            "plan": sub["plan"],
            "status": sub["status"],
            "period_end": sub["current_period_end"],
        } if sub else None,
    }


@router.get("/portal")
def get_portal(request: Request):
    """Get Stripe Customer Portal URL for managing subscription."""
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Login required")

    stripe = _get_stripe()
    user = get_user_by_id(int(user_data["sub"]))
    if not user or not user.get("stripe_customer_id"):
        raise HTTPException(400, "No active subscription found")

    try:
        session = stripe.billing_portal.Session.create(
            customer=user["stripe_customer_id"],
            return_url=f"{SITE_URL}/",
        )
        return {"portal_url": session.url}
    except Exception as e:
        logger.error(f"[Stripe] Portal error: {e}")
        raise HTTPException(500, "Failed to create portal session")
