"""
Ryzm Terminal — FastAPI Application Entry Point
Creates app, adds middleware, includes routers, mounts static files.
"""
import os
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Response
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import ALLOWED_ORIGINS, SMTP_HOST
from app.core.logger import logger
from app.core.security import check_rate_limit
from app.routes.data_routes import router as data_router
from app.routes.ai_routes import router as ai_router
from app.routes.admin_routes import router as admin_router
from app.routes.user_routes import router as user_router
from app.routes.auth_routes import router as auth_router
from app.routes.payment_routes import router as payment_router
from app.routes.journal_routes import router as journal_router
from app.routes.portfolio_routes import router as portfolio_router
from app.routes.sse_routes import router as sse_router
from app.background import startup_background_tasks
from app.services.briefing_service import setup_daily_scheduler

# ── Optional: Sentry error tracking ──
SENTRY_DSN = os.getenv("SENTRY_DSN", "")
if SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.asgi import SentryAsgiMiddleware
        sentry_sdk.init(dsn=SENTRY_DSN, traces_sample_rate=0.1, environment=os.getenv("APP_ENV", "production"))
        logger.info("[Sentry] Error tracking enabled")
    except ImportError:
        logger.warning("[Sentry] sentry-sdk not installed. pip install sentry-sdk to enable.")
    except Exception as e:
        logger.warning(f"[Sentry] Init failed: {e}")
else:
    _env = os.getenv("APP_ENV", "").lower()
    if _env == "production":
        logger.warning("[Sentry] ⚠️  SENTRY_DSN not set. Error tracking disabled in production.")

# ── SMTP check ──
if not SMTP_HOST and os.getenv("APP_ENV", "").lower() == "production":
    logger.warning("[Email] ⚠️  SMTP not configured in production. Emails will be silently skipped.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle hook (replaces deprecated on_event)."""
    startup_background_tasks()
    setup_daily_scheduler()
    yield
    # Shutdown logic (if needed) goes here


app = FastAPI(title="Ryzm Terminal API", lifespan=lifespan)


# ── Security Headers Middleware ──
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to every response."""
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        # ── Force no-cache on ALL HTML pages (prevent stale dashboard) ──
        _html_paths = {"/", "/app", "/features", "/pricing", "/about", "/verify-email", "/reset-password"}
        _path = request.url.path.rstrip("/") or "/"
        if _path in _html_paths:
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        # Always tag version
        response.headers["X-Ryzm-Version"] = "8.9"
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
        # NOTE: 'unsafe-eval' required by TradingView charting library (s3.tradingview.com)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://s3.tradingview.com https://cdn.jsdelivr.net https://unpkg.com https://html2canvas.hertzen.com; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://fonts.googleapis.com; "
            "img-src 'self' data: blob: https:; "
            "font-src 'self' https://cdn.jsdelivr.net https://fonts.gstatic.com https://fonts.googleapis.com; "
            "media-src 'self' https://assets.mixkit.co; "
            "connect-src 'self' "
                "https://api.binance.com https://fapi.binance.com https://dapi.binance.com "
                "https://api.coingecko.com https://pro-api.coingecko.com "
                "https://api.alternative.me "
                "https://min-api.cryptocompare.com "
                "https://mempool.space "
                "https://s3.tradingview.com "
                "https://html2canvas.hertzen.com "
                "https://unpkg.com "
                "wss://stream.binance.com:9443 wss://stream.binance.com:443 wss://stream.binance.com "
                "wss://fstream.binance.com wss://dstream.binance.com "
                "wss://ws-api.binance.com; "
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
app.include_router(portfolio_router)
app.include_router(sse_router)


# ── Global Exception Handler ──
@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    if request.url.path.startswith("/api/"):
        return JSONResponse(status_code=404, content={"error": "Not found"})
    return RedirectResponse("/")


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
    logger.error(f"[500] {request.method} {request.url.path}: {exc}")
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(f"[Unhandled] {request.method} {request.url.path}: {type(exc).__name__}: {exc}", exc_info=True)
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


# ── Client-side JS Error Collector (rate-limited) ──
@app.post("/api/client-error")
async def collect_client_error(request: Request):
    """Receive JS errors from browser and log them server-side."""
    ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(ip, "client_error"):
        return Response(status_code=429)
    try:
        body = await request.body()
        logger.error(f"[JS-ERROR] {body.decode('utf-8', errors='replace')[:2000]}")
    except Exception:
        pass
    return Response(status_code=204)


# ── Favicon shortcut (prevent 404) ──
_FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">⚡</text></svg>'

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(content=_FAVICON_SVG, media_type="image/svg+xml",
                    headers={"Cache-Control": "public, max-age=604800"})


@app.get("/robots.txt", include_in_schema=False)
async def robots_txt():
    from fastapi.responses import FileResponse
    return FileResponse("static/robots.txt", media_type="text/plain",
                        headers={"Cache-Control": "public, max-age=86400"})


@app.get("/sitemap.xml", include_in_schema=False)
async def sitemap_xml():
    from fastapi.responses import FileResponse
    return FileResponse("static/sitemap.xml", media_type="application/xml",
                        headers={"Cache-Control": "public, max-age=86400"})


# Static file mount (after API routes)
app.mount("/static", StaticFiles(directory="static"), name="static")
