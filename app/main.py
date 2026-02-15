"""
Ryzm Terminal — FastAPI Application Entry Point
Creates app, adds middleware, includes routers, mounts static files.
"""
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import ALLOWED_ORIGINS
from app.core.logger import logger
from app.routes.data_routes import router as data_router
from app.routes.ai_routes import router as ai_router
from app.routes.admin_routes import router as admin_router
from app.routes.user_routes import router as user_router
from app.routes.auth_routes import router as auth_router
from app.routes.payment_routes import router as payment_router
from app.background import startup_background_tasks

app = FastAPI(title="Ryzm Terminal API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "DELETE", "PUT"],
    allow_headers=["Content-Type", "X-Admin-Token"],
)

# Include routers
app.include_router(data_router)
app.include_router(ai_router)
app.include_router(admin_router)
app.include_router(user_router)
app.include_router(auth_router)
app.include_router(payment_router)


@app.on_event("startup")
def on_startup():
    startup_background_tasks()


# Static file mount (after API routes)
app.mount("/static", StaticFiles(directory="static"), name="static")
