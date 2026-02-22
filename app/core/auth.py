"""
Ryzm Terminal — Authentication
JWT token management + password hashing for email-based auth.
"""
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional

import jwt
import bcrypt
from fastapi import Request

from app.core.logger import logger

# ── Config ──
JWT_SECRET = os.getenv("JWT_SECRET", "")
if not JWT_SECRET:
    _env = os.getenv("APP_ENV", "").lower()
    if _env == "production":
        raise RuntimeError(
            "FATAL: JWT_SECRET environment variable is required in production. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    # Dev fallback — NEVER use in production
    JWT_SECRET = "dev-only-insecure-secret-do-not-deploy"
    logger.warning("[Auth] ⚠️  Using insecure dev JWT_SECRET. Set JWT_SECRET env var for production.")

JWT_ALGORITHM = "HS256"
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "168"))  # 7 days


def hash_password(password: str) -> str:
    """Hash a password with bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its bcrypt hash."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_token(user_id: int, email: str, tier: str = "free") -> str:
    """Create a JWT access token."""
    payload = {
        "sub": str(user_id),
        "email": email,
        "tier": tier,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token. Returns payload dict or None."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_current_user(request: Request) -> Optional[dict]:
    """Extract user from Authorization header or ryzm_token cookie.
    Returns {"sub": user_id, "email": ..., "tier": ...} or None.
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return decode_token(auth[7:])
    token = request.cookies.get("ryzm_token")
    if token:
        return decode_token(token)
    return None


def generate_verification_token() -> str:
    """Generate a secure random token for email verification."""
    return secrets.token_urlsafe(32)


def generate_reset_token() -> str:
    """Generate a secure random token for password reset."""
    return secrets.token_urlsafe(32)


def get_reset_expiry(hours: int = 1) -> str:
    """Return UTC expiry timestamp string for reset tokens."""
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).strftime("%Y-%m-%d %H:%M:%S")
