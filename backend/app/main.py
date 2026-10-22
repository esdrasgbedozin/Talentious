"""
Talentious API - Main application entry point.
"""

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from slowapi.errors import RateLimitExceeded

import uuid

from app.config import settings
from app.core.logging_config import configure_logging, request_id_var
from app.core.problem import (
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.core.rate_limit import limiter, rate_limit_handler
from app.routes import account, admin, auth, billing, profile, cv

# Logs structurés JSON dès l'import du module (uvicorn importe `app`).
configure_logging(settings.log_level)

# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    description="API for AI-powered CV generation and career management",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def no_store_cache(request, call_next):
    """API responses are dynamic — forbid browser/proxy caching.

    Without this, browsers cache GET responses (e.g. the job-status polling
    endpoint), so a client polling GET /cv/jobs/{id} keeps seeing the first
    'running' response and never observes 'succeeded'.
    """
    response = await call_next(request)
    response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.middleware("http")
async def request_id_middleware(request, call_next):
    """Corrélation des logs : pose un request_id (repris de l'en-tête entrant
    s'il existe, sinon généré) propagé à tous les logs de la requête, et renvoyé
    au client dans l'en-tête X-Request-ID."""
    rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    token = request_id_var.set(rid)
    try:
        response = await call_next(request)
        response.headers["X-Request-ID"] = rid
        return response
    finally:
        request_id_var.reset(token)


# Rate limiting (slowapi) — the limiter must be on app.state.
app.state.limiter = limiter

# RFC 7807 error responses (problem+json) for every error path.
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# Include routers
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(cv.router)  # Phase 3.5: CV Generation Orchestration
app.include_router(billing.router)  # M3: Stripe Checkout + webhook
app.include_router(account.router)  # RGPD Art. 17: account erasure
app.include_router(admin.router)  # M8-T02: vue admin (lecture seule)


@app.get("/")
def root():
    """Root endpoint with API information."""
    return {
        "message": "Welcome to Talentious API",
        "version": "0.1.0",
        "docs": "/docs",
        "redoc": "/redoc",
    }


@app.get("/health")
def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "healthy", "environment": settings.environment}
