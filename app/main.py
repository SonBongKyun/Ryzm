"""
Ryzm Terminal — FastAPI Application Entry Point
Creates app, adds middleware, includes routers, mounts static files.
"""
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import ALLOWED_ORIGINS
from app.core.logger import logger
from app.routes.data_routes import router as data_router
from app.routes.ai_routes import router as ai_router
from app.routes.admin_routes import router as admin_router
from app.routes.user_routes import router as user_router
from app.routes.auth_routes import router as auth_router
from app.routes.payment_routes import router as payment_router
from app.routes.journal_routes import router as journal_router
from app.background import startup_background_tasks


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle hook (replaces deprecated on_event)."""
    startup_background_tasks()
    yield
    # Shutdown logic (if needed) goes here


app = FastAPI(title="Ryzm Terminal API", lifespan=lifespan)


# ── Security Headers Middleware ──
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to every response."""
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"
        # Prevent MIME-type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        # XSS Protection (legacy browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Referrer Policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Permissions Policy (disable unused browser features)
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(self)"
        # Content Security Policy
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://s3.tradingview.com https://cdn.jsdelivr.net https://unpkg.com https://html2canvas.hertzen.com; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com; "
            "img-src 'self' data: blob: https:; "
            "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com; "
            "connect-src 'self' https://api.binance.com https://fapi.binance.com https://api.coingecko.com https://api.alternative.me https://s3.tradingview.com wss://stream.binance.com:9443 wss://stream.binance.com:443 wss://stream.binance.com wss://fstream.binance.com https://html2canvas.hertzen.com; "
            "frame-src https://s3.tradingview.com https://www.tradingview.com https://js.stripe.com; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        )
        # HSTS (enforce HTTPS — only effective over HTTPS, harmless over HTTP)
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app.add_middleware(SecurityHeadersMiddleware)


# ── Anonymous UID Middleware ──
class UIDMiddleware(BaseHTTPMiddleware):
    """Auto-assign ryzm_uid cookie on first visit (all requests)."""
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        if not request.cookies.get("ryzm_uid"):
            uid = str(uuid.uuid4())
            _secure = request.url.scheme == "https"
            response.set_cookie(
                "ryzm_uid", uid,
                max_age=86400 * 365, httponly=True, samesite="lax", secure=_secure,
            )
        return response


app.add_middleware(UIDMiddleware)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "PUT"],
    allow_headers=["Content-Type", "X-Admin-Token", "Authorization"],
)

# Include routers
app.include_router(data_router)
app.include_router(ai_router)
app.include_router(admin_router)
app.include_router(user_router)
app.include_router(auth_router)
app.include_router(payment_router)
app.include_router(journal_router)


# Static file mount (after API routes)
app.mount("/static", StaticFiles(directory="static"), name="static")
