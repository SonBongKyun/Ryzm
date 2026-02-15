"""
Ryzm Terminal — Auth API Routes
Registration, login, profile, logout.
"""
import re

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from app.core.logger import logger
from app.core.config import RegisterRequest, LoginRequest
from app.core.auth import (
    hash_password, verify_password, create_token, get_current_user,
)
from app.core.database import (
    create_user, get_user_by_email, get_user_by_id,
    link_uid_to_user, update_user_login,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")


@router.post("/register")
def register(body: RegisterRequest, request: Request):
    """Register a new account with email + password."""
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

    # Link anonymous usage data to new account
    if anonymous_uid:
        link_uid_to_user(anonymous_uid, user_id)

    token = create_token(user_id, body.email, "free")
    resp = JSONResponse(content={
        "status": "registered",
        "user_id": user_id,
        "email": body.email,
        "tier": "free",
        "token": token,
    })
    resp.set_cookie("ryzm_token", token, max_age=86400 * 7, httponly=True, samesite="lax")
    logger.info(f"[Auth] User registered: {body.email}")
    return resp


@router.post("/login")
def login(body: LoginRequest):
    """Login with email + password → JWT token."""
    user = get_user_by_email(body.email)
    if not user:
        raise HTTPException(401, "Invalid credentials")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")

    update_user_login(user["id"])
    token = create_token(user["id"], user["email"], user["tier"])
    resp = JSONResponse(content={
        "status": "ok",
        "user_id": user["id"],
        "email": user["email"],
        "display_name": user["display_name"],
        "tier": user["tier"],
        "token": token,
    })
    resp.set_cookie("ryzm_token", token, max_age=86400 * 7, httponly=True, samesite="lax")
    logger.info(f"[Auth] Login: {body.email}")
    return resp


@router.get("/profile")
def get_profile(request: Request):
    """Get authenticated user profile."""
    user_data = get_current_user(request)
    if not user_data:
        raise HTTPException(401, "Not authenticated")
    user = get_user_by_id(int(user_data["sub"]))
    if not user:
        raise HTTPException(404, "User not found")
    return {
        "user_id": user["id"],
        "email": user["email"],
        "display_name": user["display_name"],
        "tier": user["tier"],
        "created_at": user["created_at_utc"],
    }


@router.post("/logout")
def logout():
    """Clear auth cookie."""
    resp = JSONResponse(content={"status": "logged_out"})
    resp.delete_cookie("ryzm_token")
    return resp
