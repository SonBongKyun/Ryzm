"""
Ryzm Terminal — Auth API Routes
Registration (with ToS + email verification), login, profile, logout,
forgot‑password, reset‑password.
#4  Google OAuth
#5  2FA/TOTP setup, verify, disable
#10 GDPR data export
#21 Password complexity validation
"""
import re

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import JSONResponse

from app.core.logger import logger
from app.core.config import RegisterRequest, LoginRequest, ForgotPasswordRequest, ResetPasswordRequest, UpdateProfileRequest, ChangePasswordRequest, DeleteAccountRequest, BASE_URL, ADMIN_EMAILS

# ── Beta Invite Code (optional gating) ──
import os
BETA_INVITE_CODE = os.getenv("BETA_INVITE_CODE", "")  # empty = open registration
from app.core.auth import (
    hash_password, verify_password, create_token, get_current_user,
    generate_verification_token, generate_reset_token, get_reset_expiry,
    validate_password_strength, revoke_token,
    generate_totp_secret, get_totp_uri, verify_totp, generate_totp_qr_base64,
)
from app.core.database import (
    create_user, get_user_by_email, get_user_by_id,
    link_uid_to_user, update_user_login, update_user_tos,
    set_email_verify_token, verify_email_token,
    set_password_reset_token, validate_reset_token, reset_password,
    update_user_display_name, update_user_password_hash,
    admin_delete_user, export_user_data,
    set_user_totp, get_user_totp, disable_user_totp,
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
    if not getattr(body, 'accept_tos', False):
        raise HTTPException(400, "Terms of Service acceptance is required.")
    # Beta invite code gate (if configured)
    if BETA_INVITE_CODE and body.invite_code.strip() != BETA_INVITE_CODE:
        raise HTTPException(403, "Invalid invite code. Ryzm is currently in closed beta.")
    if not _EMAIL_RE.match(body.email):
        raise HTTPException(400, "Invalid email format")
    # #21 Password complexity validation
    pw_error = validate_password_strength(body.password)
    if pw_error:
        raise HTTPException(400, pw_error)

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
    """Login with email + password → JWT token. Handles 2FA if enabled."""
    if not check_rate_limit(request.client.host, RATE_LIMIT_AUTH):
        raise HTTPException(429, "Too many attempts. Please wait a moment.")
    user = get_user_by_email(body.email)
    if not user:
        raise HTTPException(401, "Invalid credentials")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")

    # #5 2FA check
    totp_state = get_user_totp(user["id"])
    if totp_state["enabled"]:
        # Return 2FA required response (client must call /api/auth/2fa/verify-login)
        # Create a short-lived pre-auth token
        from app.core.auth import JWT_SECRET, JWT_ALGORITHM
        import jwt as jwt_lib
        from datetime import datetime, timezone, timedelta
        pre_token = jwt_lib.encode({
            "sub": str(user["id"]),
            "email": user["email"],
            "purpose": "2fa_pending",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
        }, JWT_SECRET, algorithm=JWT_ALGORITHM)
        return JSONResponse(content={
            "status": "2fa_required",
            "message": "Two-factor authentication required",
            "pre_token": pre_token,
        })

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
        # Token valid but user gone (DB reset / deleted) → treat as unauthenticated
        resp = JSONResponse(status_code=401, content={"detail": "Session expired"})
        resp.delete_cookie("ryzm_token")
        return resp
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
def logout(request: Request):
    """Clear auth cookie and revoke JWT (#22)."""
    # Revoke the current token
    token = request.cookies.get("ryzm_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if token:
        revoke_token(token)
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
    pw_error = validate_password_strength(body.new_password)
    if pw_error:
        raise HTTPException(400, pw_error)

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
    if not check_rate_limit(request.client.host, RATE_LIMIT_AUTH):
        raise HTTPException(429, "Too many requests. Please wait a moment.")
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
    if not check_rate_limit(request.client.host, RATE_LIMIT_AUTH):
        raise HTTPException(429, "Too many requests. Please wait a moment.")
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Not authenticated")
    user = get_user_by_id(int(user_data["sub"]))
    if not user:
        raise HTTPException(404, "User not found")
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    pw_error = validate_password_strength(body.new_password)
    if pw_error:
        raise HTTPException(400, pw_error)
    new_hash = hash_password(body.new_password)
    success = update_user_password_hash(user["id"], new_hash)
    if not success:
        raise HTTPException(500, "Failed to change password")
    logger.info(f"[Auth] Password changed for user {user['id']}")
    return {"status": "ok", "message": "Password changed successfully."}


@router.delete("/delete-account")
def delete_account(body: DeleteAccountRequest, request: Request, response: Response):
    """Permanently delete the current user's account and all associated data."""
    if not check_rate_limit(request.client.host, RATE_LIMIT_AUTH):
        raise HTTPException(429, "Too many requests. Please wait a moment.")
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Not authenticated")
    user = get_user_by_id(int(user_data["sub"]))
    if not user:
        raise HTTPException(404, "User not found")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(400, "Password is incorrect. Account deletion requires your current password.")

    # Cancel active Stripe subscription if any
    stripe_customer_id = user.get("stripe_customer_id")
    if stripe_customer_id:
        try:
            import stripe as stripe_lib
            subs = stripe_lib.Subscription.list(customer=stripe_customer_id, status="active", limit=10)
            for sub in subs.auto_paging_iter():
                stripe_lib.Subscription.cancel(sub.id)
                logger.info(f"[Auth] Cancelled Stripe subscription {sub.id} for user {user['id']}")
        except Exception as e:
            logger.warning(f"[Auth] Failed to cancel Stripe subscriptions for user {user['id']}: {e}")

    # Delete user and all related data
    success = admin_delete_user(user["id"])
    if not success:
        raise HTTPException(500, "Failed to delete account. Please contact support.")

    # Clear auth cookie
    response.delete_cookie("ryzm_token", path="/")
    logger.info(f"[Auth] Account deleted: user {user['id']} ({user.get('email', 'unknown')})")
    return JSONResponse(
        content={"status": "ok", "message": "Account permanently deleted."},
        headers=dict(response.headers),
    )


# ───────────────────────────────────────
# #5 Two-Factor Authentication (TOTP)
# ───────────────────────────────────────
@router.post("/2fa/setup")
def setup_2fa(request: Request):
    """Generate TOTP secret and QR code for 2FA setup."""
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Not authenticated")
    user = get_user_by_id(int(user_data["sub"]))
    if not user:
        raise HTTPException(404, "User not found")

    totp_state = get_user_totp(user["id"])
    if totp_state["enabled"]:
        raise HTTPException(400, "2FA is already enabled")

    secret = generate_totp_secret()
    if not secret:
        raise HTTPException(503, "2FA not available (pyotp not installed)")

    # Store secret (not yet enabled)
    set_user_totp(user["id"], secret, enabled=False)

    uri = get_totp_uri(secret, user["email"])
    qr_base64 = generate_totp_qr_base64(uri)

    return {
        "secret": secret,
        "qr_code": f"data:image/png;base64,{qr_base64}" if qr_base64 else "",
        "otpauth_uri": uri,
        "message": "Scan the QR code with your authenticator app, then verify with a code.",
    }


@router.post("/2fa/verify")
def verify_2fa_setup(request: Request):
    """Verify TOTP code to enable 2FA."""
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Not authenticated")
    user = get_user_by_id(int(user_data["sub"]))
    if not user:
        raise HTTPException(404, "User not found")

    import json
    try:
        body = json.loads(request._receive.__self__._body.decode() if hasattr(request, '_receive') else "{}")
    except Exception:
        body = {}

    # Try to get code from various sources
    code = body.get("code", "")
    if not code:
        raise HTTPException(400, "TOTP code required")

    totp_state = get_user_totp(user["id"])
    if not totp_state["secret"]:
        raise HTTPException(400, "Call /2fa/setup first")

    if not verify_totp(totp_state["secret"], code):
        raise HTTPException(400, "Invalid TOTP code")

    set_user_totp(user["id"], totp_state["secret"], enabled=True)
    logger.info(f"[Auth] 2FA enabled for user {user['id']}")
    return {"status": "ok", "message": "Two-factor authentication enabled!"}


@router.post("/2fa/verify-login")
def verify_2fa_login(request: Request):
    """Complete login after 2FA verification."""
    import json as json_lib
    try:
        body = json_lib.loads(request._receive.__self__._body.decode() if hasattr(request, '_receive') else "{}")
    except Exception:
        body = {}

    pre_token = body.get("pre_token", "")
    code = body.get("code", "")
    if not pre_token or not code:
        raise HTTPException(400, "pre_token and code required")

    # Verify the pre-auth token
    from app.core.auth import JWT_SECRET, JWT_ALGORITHM
    import jwt as jwt_lib
    try:
        payload = jwt_lib.decode(pre_token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("purpose") != "2fa_pending":
            raise HTTPException(400, "Invalid pre-auth token")
    except Exception:
        raise HTTPException(400, "Invalid or expired pre-auth token")

    user_id = int(payload["sub"])
    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(404, "User not found")

    totp_state = get_user_totp(user_id)
    if not verify_totp(totp_state["secret"], code):
        raise HTTPException(400, "Invalid TOTP code")

    update_user_login(user_id)
    is_admin = user["email"].lower() in ADMIN_EMAILS
    effective_tier = "pro" if is_admin else user["tier"]
    token = create_token(user_id, user["email"], effective_tier)
    resp = JSONResponse(content={
        "status": "ok",
        "user_id": user_id,
        "email": user["email"],
        "display_name": user["display_name"],
        "tier": effective_tier,
        "is_admin": is_admin,
        "token": token,
    })
    resp.set_cookie("ryzm_token", token, max_age=86400 * 7, httponly=True, samesite="lax",
                     secure=request.url.scheme == "https")
    logger.info(f"[Auth] 2FA login: {user['email']}")
    return resp


@router.post("/2fa/disable")
def disable_2fa(request: Request):
    """Disable 2FA for the current user (requires password)."""
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Not authenticated")
    user = get_user_by_id(int(user_data["sub"]))
    if not user:
        raise HTTPException(404, "User not found")

    import json as json_lib
    try:
        body = json_lib.loads(request._receive.__self__._body.decode() if hasattr(request, '_receive') else "{}")
    except Exception:
        body = {}

    password = body.get("password", "")
    if not password or not verify_password(password, user["password_hash"]):
        raise HTTPException(400, "Password required to disable 2FA")

    disable_user_totp(user["id"])
    logger.info(f"[Auth] 2FA disabled for user {user['id']}")
    return {"status": "ok", "message": "Two-factor authentication disabled."}


# ───────────────────────────────────────
# #10 GDPR Data Export
# ───────────────────────────────────────
@router.get("/export-data")
def gdpr_export_data(request: Request):
    """Export all user data in JSON format (GDPR Art. 20)."""
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Not authenticated")

    data = export_user_data(int(user_data["sub"]))
    logger.info(f"[Auth] GDPR data export for user {user_data['sub']}")
    return JSONResponse(content=data, headers={
        "Content-Disposition": f"attachment; filename=ryzm_data_export_{user_data['sub']}.json"
    })


# ───────────────────────────────────────
# #4 Google OAuth (optional — requires GOOGLE_CLIENT_ID)
# ───────────────────────────────────────
@router.get("/google")
def google_oauth_start(request: Request):
    """Redirect to Google OAuth consent screen."""
    from app.core.config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(503, "Google OAuth not configured")

    import urllib.parse
    redirect_uri = f"{BASE_URL}/api/auth/google/callback"
    params = urllib.parse.urlencode({
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent",
    })
    from fastapi.responses import RedirectResponse
    return RedirectResponse(f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/google/callback")
def google_oauth_callback(request: Request, code: str = ""):
    """Handle Google OAuth callback."""
    from app.core.config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
    if not code:
        raise HTTPException(400, "Missing authorization code")

    redirect_uri = f"{BASE_URL}/api/auth/google/callback"

    try:
        import httpx
        # Exchange code for tokens
        token_resp = httpx.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }, timeout=10)
        token_data = token_resp.json()

        if "error" in token_data:
            raise HTTPException(400, f"OAuth error: {token_data.get('error_description', token_data['error'])}")

        # Get user info
        access_token = token_data["access_token"]
        userinfo_resp = httpx.get("https://www.googleapis.com/oauth2/v2/userinfo",
                                   headers={"Authorization": f"Bearer {access_token}"}, timeout=10)
        userinfo = userinfo_resp.json()

        email = userinfo.get("email", "")
        if not email:
            raise HTTPException(400, "Could not get email from Google")

        # Check if user exists
        user = get_user_by_email(email)
        if not user:
            # Auto-register
            import secrets
            random_pw = secrets.token_hex(32)
            pw_hash = hash_password(random_pw)
            user_id = create_user(
                email=email,
                password_hash=pw_hash,
                display_name=userinfo.get("name", email.split("@")[0]),
            )
            if not user_id:
                raise HTTPException(500, "Failed to create account")
            user = get_user_by_id(user_id)

        is_admin = email.lower() in ADMIN_EMAILS
        effective_tier = "pro" if is_admin else (user["tier"] if user else "free")
        token = create_token(user["id"], email, effective_tier)

        update_user_login(user["id"])
        logger.info(f"[Auth] Google OAuth login: {email}")

        from fastapi.responses import RedirectResponse
        resp = RedirectResponse(f"{BASE_URL}/app?login=success")
        resp.set_cookie("ryzm_token", token, max_age=86400 * 7, httponly=True, samesite="lax",
                         secure=request.url.scheme == "https")
        return resp

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Auth] Google OAuth error: {e}")
        raise HTTPException(500, f"OAuth failed: {str(e)}")
