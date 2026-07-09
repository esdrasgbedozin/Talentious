"""
Talentious API - Main application entry point.
"""

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.core.problem import (
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.routes import auth, billing, profile, cv

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

# RFC 7807 error responses (problem+json) for every error path.
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# Include routers
app.include_router(auth.router)
app.include_router(profile.router)
app.include_router(cv.router)  # Phase 3.5: CV Generation Orchestration
app.include_router(billing.router)  # M3: Stripe Checkout + webhook


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
