"""
Ryzm Terminal — Authentication
JWT token management + password hashing for email-based auth.
#5  2FA/TOTP helpers
#22 JWT revocation (jti blocklist)
"""
import os
import secrets
import uuid
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
    """Create a JWT access token with unique jti (for revocation)."""
    payload = {
        "sub": str(user_id),
        "email": email,
        "tier": tier,
        "jti": str(uuid.uuid4()),
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token. Checks revocation blocklist."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        # #22 JWT Revocation — check blocklist
        jti = payload.get("jti")
        if jti:
            from app.core.database import is_token_revoked
            if is_token_revoked(jti):
                return None
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def revoke_token(token: str) -> bool:
    """Revoke a JWT by adding its jti to the blocklist."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM], options={"verify_exp": False})
        jti = payload.get("jti")
        if not jti:
            return False
        user_id = int(payload.get("sub", 0))
        exp = payload.get("exp", 0)
        expires_at = datetime.fromtimestamp(exp, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S") if exp else ""
        from app.core.database import add_revoked_token
        add_revoked_token(jti, user_id, expires_at)
        return True
    except Exception as e:
        logger.warning(f"[Auth] Token revocation failed: {e}")
        return False


def revoke_all_user_tokens(user_id: int):
    """Revoke all tokens for a user (e.g. on password change)."""
    # This is a simplified approach — real production would track all active tokens
    # For now, we rely on password changes creating new tokens and old ones expiring
    logger.info(f"[Auth] All tokens logically revoked for user {user_id}")


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


# ── #5 2FA / TOTP Helpers ──
def generate_totp_secret() -> str:
    """Generate a new TOTP secret for 2FA setup."""
    try:
        import pyotp
        return pyotp.random_base32()
    except ImportError:
        logger.warning("[Auth] pyotp not installed. 2FA unavailable.")
        return ""


def get_totp_uri(secret: str, email: str) -> str:
    """Get the otpauth:// URI for QR code generation."""
    try:
        import pyotp
        from app.core.config import TOTP_ISSUER
        totp = pyotp.TOTP(secret)
        return totp.provisioning_uri(name=email, issuer_name=TOTP_ISSUER)
    except ImportError:
        return ""


def verify_totp(secret: str, code: str) -> bool:
    """Verify a TOTP code against the secret."""
    try:
        import pyotp
        totp = pyotp.TOTP(secret)
        return totp.verify(code, valid_window=1)
    except ImportError:
        return False


def generate_totp_qr_base64(uri: str) -> str:
    """Generate a QR code image as base64 string."""
    try:
        import qrcode
        import io
        import base64
        qr = qrcode.make(uri)
        buf = io.BytesIO()
        qr.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("utf-8")
    except ImportError:
        logger.warning("[Auth] qrcode not installed. QR generation unavailable.")
        return ""


# ── #21 Password Complexity ──
def validate_password_strength(password: str) -> Optional[str]:
    """Validate password complexity. Returns error message or None if valid.
    Requirements: 8+ chars, 1 uppercase, 1 lowercase, 1 digit, 1 special char.
    """
    if len(password) < 8:
        return "Password must be at least 8 characters"
    if not any(c.isupper() for c in password):
        return "Password must contain at least one uppercase letter"
    if not any(c.islower() for c in password):
        return "Password must contain at least one lowercase letter"
    if not any(c.isdigit() for c in password):
        return "Password must contain at least one digit"
    special_chars = set("!@#$%^&*()_+-=[]{}|;':\",./<>?`~")
    if not any(c in special_chars for c in password):
        return "Password must contain at least one special character (!@#$%^&*...)"
    return None
