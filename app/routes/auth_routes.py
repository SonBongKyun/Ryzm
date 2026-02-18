"""
Ryzm Terminal — Auth API Routes
Registration (with ToS + email verification), login, profile, logout,
forgot‑password, reset‑password.
"""
import re

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.core.logger import logger
from app.core.config import RegisterRequest, LoginRequest, ForgotPasswordRequest, ResetPasswordRequest, UpdateProfileRequest, ChangePasswordRequest, BASE_URL, ADMIN_EMAILS

# ── Beta Invite Code (optional gating) ──
import os
BETA_INVITE_CODE = os.getenv("BETA_INVITE_CODE", "")  # empty = open registration
from app.core.auth import (
    hash_password, verify_password, create_token, get_current_user,
    generate_verification_token, generate_reset_token, get_reset_expiry,
)
from app.core.database import (
    create_user, get_user_by_email, get_user_by_id,
    link_uid_to_user, update_user_login, update_user_tos,
    set_email_verify_token, verify_email_token,
    set_password_reset_token, validate_reset_token, reset_password,
    update_user_display_name, update_user_password_hash,
)
from app.core.email import send_verification_email, send_password_reset_email

from app.core.security import check_rate_limit

router = APIRouter(prefix="/api/auth", tags=["auth"])

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")

# ── Auth rate-limit category: stricter than general (10 req / 60s) ──
RATE_LIMIT_AUTH = "auth"


@router.post("/register")
def register(body: RegisterRequest, request: Request):
    """Register a new account with email + password. Sends verification email."""
    if not check_rate_limit(request.client.host, RATE_LIMIT_AUTH):
        raise HTTPException(429, "Too many requests. Please wait a moment.")
    # Beta invite code gate (if configured)
    if BETA_INVITE_CODE and body.invite_code.strip() != BETA_INVITE_CODE:
        raise HTTPException(403, "Invalid invite code. Ryzm is currently in closed beta.")
    if not _EMAIL_RE.match(body.email):
        raise HTTPException(400, "Invalid email format")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    if get_user_by_email(body.email):
        raise HTTPException(409, "Email already registered")

    anonymous_uid = request.cookies.get("ryzm_uid")
    pw_hash = hash_password(body.password)
    user_id = create_user(
        email=body.email,
        password_hash=pw_hash,
        display_name=body.display_name,
        uid=anonymous_uid,
    )
    if not user_id:
        raise HTTPException(500, "Registration failed")

    # Mark ToS acceptance
    update_user_tos(user_id)

    # Link anonymous usage data to new account
    if anonymous_uid:
        link_uid_to_user(anonymous_uid, user_id)

    # Send verification email
    verify_token = generate_verification_token()
    set_email_verify_token(user_id, verify_token)
    send_verification_email(body.email, verify_token)

    is_admin = body.email.lower() in ADMIN_EMAILS
    effective_tier = "pro" if is_admin else "free"
    token = create_token(user_id, body.email, effective_tier)
    resp = JSONResponse(content={
        "status": "registered",
        "user_id": user_id,
        "email": body.email,
        "tier": effective_tier,
        "is_admin": is_admin,
        "token": token,
        "email_verified": False,
        "message": "Verification email sent. Please check your inbox.",
    })
    resp.set_cookie("ryzm_token", token, max_age=86400 * 7, httponly=True, samesite="lax", secure=request.url.scheme == "https")
    logger.info(f"[Auth] User registered: {body.email}")
    return resp


@router.post("/login")
def login(body: LoginRequest, request: Request):
    """Login with email + password → JWT token."""
    if not check_rate_limit(request.client.host, RATE_LIMIT_AUTH):
        raise HTTPException(429, "Too many attempts. Please wait a moment.")
    user = get_user_by_email(body.email)
    if not user:
        raise HTTPException(401, "Invalid credentials")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")

    update_user_login(user["id"])
    from app.core.config import ADMIN_EMAILS
    is_admin = user["email"].lower() in ADMIN_EMAILS
    effective_tier = "pro" if is_admin else user["tier"]
    token = create_token(user["id"], user["email"], effective_tier)
    resp = JSONResponse(content={
        "status": "ok",
        "user_id": user["id"],
        "email": user["email"],
        "display_name": user["display_name"],
        "tier": effective_tier,
        "is_admin": is_admin,
        "token": token,
    })
    resp.set_cookie("ryzm_token", token, max_age=86400 * 7, httponly=True, samesite="lax", secure=request.url.scheme == "https")
    logger.info(f"[Auth] Login: {body.email}")
    return resp


@router.get("/profile")
def get_profile(request: Request):
    """Get authenticated user profile."""
    from app.core.config import ADMIN_EMAILS
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Not authenticated")
    user = get_user_by_id(int(user_data["sub"]))
    if not user:
        raise HTTPException(404, "User not found")
    is_admin = user["email"].lower() in ADMIN_EMAILS
    effective_tier = "pro" if is_admin else user["tier"]
    return {
        "user_id": user["id"],
        "email": user["email"],
        "display_name": user["display_name"],
        "tier": effective_tier,
        "is_admin": is_admin,
        "email_verified": bool(user.get("email_verified", 0)),
        "tos_accepted": bool(user.get("tos_accepted_at")),
        "created_at": user["created_at_utc"],
    }


@router.post("/logout")
def logout():
    """Clear auth cookie."""
    resp = JSONResponse(content={"status": "logged_out"})
    resp.delete_cookie("ryzm_token")
    return resp


@router.get("/verify-email")
def verify_email(token: str):
    """Verify email using the token from verification email."""
    if not token:
        raise HTTPException(400, "Token required")
    user_id = verify_email_token(token)
    if not user_id:
        raise HTTPException(400, "Invalid or expired verification token")
    logger.info(f"[Auth] Email verified for user {user_id}")
    return {"status": "verified", "message": "Email verified successfully!"}


@router.post("/resend-verification")
def resend_verification(request: Request):
    """Resend email verification for the current user."""
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Not authenticated")
    user = get_user_by_id(int(user_data["sub"]))
    if not user:
        raise HTTPException(404, "User not found")
    if user.get("email_verified"):
        return {"status": "already_verified"}

    verify_token = generate_verification_token()
    set_email_verify_token(user["id"], verify_token)
    send_verification_email(user["email"], verify_token)
    return {"status": "sent", "message": "Verification email resent."}


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, request: Request):
    """Send password reset email. Always returns 200 to avoid email enumeration."""
    if not check_rate_limit(request.client.host, RATE_LIMIT_AUTH):
        raise HTTPException(429, "Too many requests. Please wait a moment.")
    user = get_user_by_email(body.email)
    if user:
        reset_token = generate_reset_token()
        expires = get_reset_expiry(hours=1)
        set_password_reset_token(body.email, reset_token, expires)
        send_password_reset_email(body.email, reset_token)
        logger.info(f"[Auth] Password reset requested: {body.email}")
    # Always return success to prevent email enumeration
    return {"status": "ok", "message": "If this email is registered, a reset link has been sent."}


@router.post("/reset-password")
def do_reset_password(body: ResetPasswordRequest):
    """Reset password using token from email."""
    if len(body.new_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    user_info = validate_reset_token(body.token)
    if not user_info:
        raise HTTPException(400, "Invalid or expired reset token")

    new_hash = hash_password(body.new_password)
    success = reset_password(body.token, new_hash)
    if not success:
        raise HTTPException(500, "Failed to reset password")

    logger.info(f"[Auth] Password reset completed for {user_info['email']}")
    return {"status": "ok", "message": "Password reset successfully. You can now login."}


@router.post("/update-profile")
def update_profile(body: UpdateProfileRequest, request: Request):
    """Update display name for the current user."""
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Not authenticated")
    user = get_user_by_id(int(user_data["sub"]))
    if not user:
        raise HTTPException(404, "User not found")
    success = update_user_display_name(user["id"], body.display_name)
    if not success:
        raise HTTPException(500, "Failed to update profile")
    return {"status": "ok", "display_name": body.display_name.strip()}


@router.post("/change-password")
def change_password(body: ChangePasswordRequest, request: Request):
    """Change password for the current user (requires current password)."""
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Not authenticated")
    user = get_user_by_id(int(user_data["sub"]))
    if not user:
        raise HTTPException(404, "User not found")
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    if len(body.new_password) < 8:
        raise HTTPException(400, "New password must be at least 8 characters")
    new_hash = hash_password(body.new_password)
    success = update_user_password_hash(user["id"], new_hash)
    if not success:
        raise HTTPException(500, "Failed to change password")
    logger.info(f"[Auth] Password changed for user {user['id']}")
    return {"status": "ok", "message": "Password changed successfully."}
